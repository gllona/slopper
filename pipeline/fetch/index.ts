import { DigestSchema, type Digest, type DigestItem } from '../schemas/digest.ts';
import type { Config } from '../schemas/config.ts';
import { dayWindow } from '../util/dates.ts';
import { logger } from '../util/log.ts';
import type { HttpClient } from './http.ts';
import { canonicalUrl, dedupe, isoDate, itemId, plainText, safeUrl, truncate } from './normalize.ts';
import { arxiv } from './sources/arxiv.ts';
import { feeds } from './sources/feeds.ts';
import { gdelt } from './sources/gdelt.ts';
import { hackernews } from './sources/hackernews.ts';
import { huggingface } from './sources/huggingface.ts';
import { techmeme } from './sources/techmeme.ts';
import type { RawItem, Source } from './types.ts';

/**
 * Stage 1 — Fetch (DESIGN §5, §7): deterministic, no AI. Runs every source, normalizes items,
 * keeps those in the day window, caps each source, removes duplicates, and returns digest.json.
 * Order matters for de-duplication: earlier sources win (edited news before aggregators).
 */
export const SOURCES: Source[] = [feeds, techmeme, hackernews, gdelt, huggingface, arxiv];

const DAY_MS = 86_400_000;
const TITLE_MAX = 300;

export class FetchFailedError extends Error {
  constructor(
    message: string,
    public digest: Digest,
  ) {
    super(message);
  }
}

export interface FetchOptions {
  date: string;
  config: Config;
  http: HttpClient;
  sources?: Source[];
  now?: Date;
}

export async function runFetch(opts: FetchOptions): Promise<Digest> {
  const log = logger('fetch');
  const window = dayWindow(opts.date);
  const sources = opts.sources ?? SOURCES;
  const { perSourceCap, snippetMaxChars } = opts.config.sources;

  const now = opts.now ?? new Date();
  const results = await Promise.allSettled(
    sources.map((s) => s.fetch({ date: opts.date, window, config: opts.config, http: opts.http, log: logger(`fetch:${s.name}`), now })),
  );

  const reports: Digest['sources'] = [];
  const all: DigestItem[] = [];
  for (const [i, r] of results.entries()) {
    const source = sources[i]!;
    if (r.status === 'rejected') {
      const error = (r.reason as Error)?.message ?? String(r.reason);
      log.warn(`${source.name} failed`, error);
      reports.push({ source: source.name, ok: false, count: 0, error: truncate(error, 300) });
      continue;
    }
    const from = window.from.getTime() - (source.slack?.beforeDays ?? 0) * DAY_MS;
    const to = window.to.getTime() + (source.slack?.afterDays ?? 0) * DAY_MS;
    const items: DigestItem[] = [];
    const seen = new Set<string>();
    for (const raw of r.value) {
      const item = normalize(source.name, raw, snippetMaxChars);
      if (!item) continue;
      const t = Date.parse(item.publishedAt);
      if (t < from || t >= to) continue;
      const key = canonicalUrl(item.url);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
      if (items.length >= perSourceCap) break;
    }
    reports.push({ source: source.name, ok: true, count: items.length });
    all.push(...items);
  }

  const { items, removed } = dedupe(all);
  log.info(`${items.length} items (${removed} duplicates removed) from ${reports.filter((r) => r.ok).length}/${sources.length} sources`);
  const digest = DigestSchema.parse({ date: opts.date, fetchedAt: now.toISOString(), sources: reports, items });

  const failed = reports.filter((r) => !r.ok).length;
  if (failed > sources.length / 2) {
    throw new FetchFailedError(`${failed} of ${sources.length} sources failed: ${reports.filter((r) => !r.ok).map((r) => `${r.source} (${r.error})`).join('; ')}`, digest);
  }
  return digest;
}

function normalize(source: Source['name'], raw: RawItem, snippetMax: number): DigestItem | null {
  const title = truncate(plainText(raw.title), TITLE_MAX);
  const publishedAt = isoDate(raw.publishedAt);
  let url: URL;
  try {
    url = new URL(raw.url.trim());
  } catch {
    return null;
  }
  if (!title || !publishedAt || (url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return null;
  const snippet = truncate(plainText(raw.snippet), snippetMax);
  const stored = safeUrl(url.toString());
  return {
    id: itemId(source, stored),
    source,
    url: stored,
    title,
    snippet: snippet === title ? '' : snippet,
    publishedAt,
    ...(raw.score !== undefined && Number.isFinite(raw.score) ? { score: raw.score } : {}),
    lang: raw.lang ?? 'en',
    ...(raw.publisher ? { publisher: truncate(plainText(raw.publisher), 120) } : {}),
  };
}
