import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../util/log.ts';
import { redactUrlSecrets } from './normalize.ts';
import { isAllowed, parseRobots, type RobotsRules } from './robots.ts';

/**
 * HTTP for the fetch stage (DESIGN §7): a clear User-Agent, robots.txt checked for every URL,
 * per-host rate limits, retries with backoff on 429/5xx, timeouts, and a response size cap.
 * `RecordingHttp` / `ReplayHttp` save and replay responses so tests never touch the network.
 */

export const USER_AGENT = 'SlopperBot/1.0 (+https://slopper.logicos.org/about/)';

export interface HttpResponse {
  url: string;
  status: number;
  contentType: string;
  body: string;
}

export interface HttpClient {
  get(url: string): Promise<HttpResponse>;
}

export class RobotsDisallowedError extends Error {
  constructor(public url: string) {
    super(`robots.txt disallows ${url}`);
  }
}

export class HttpError extends Error {
  constructor(
    public url: string,
    public status: number,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

export interface LiveHttpOptions {
  userAgent?: string;
  timeoutMs?: number;
  maxBytes?: number;
  retries?: number;
  /** Per-host request timeout overrides (slow APIs). */
  timeoutsMs?: Record<string, number>;
  /** Minimum milliseconds between requests to the same host. */
  minIntervalMs?: Record<string, number>;
  defaultIntervalMs?: number;
  /** For tests: replace the global fetch and the clock. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_INTERVALS: Record<string, number> = {
  'api.gdeltproject.org': 12_000, // asks for ≥ 5 s; it still answers 429 at 6 s, so be generous
  'rss.arxiv.org': 3_000,
  'export.arxiv.org': 3_000,
};

const DEFAULT_TIMEOUTS: Record<string, number> = {
  'api.gdeltproject.org': 90_000, // GDELT often takes 10–60 s to answer
};

export class LiveHttp implements HttpClient {
  private robots = new Map<string, Promise<RobotsRules>>();
  private nextSlot = new Map<string, number>();
  private readonly log = logger('http');
  private readonly o: Required<Omit<LiveHttpOptions, 'fetchImpl' | 'sleep'>> & Pick<LiveHttpOptions, 'fetchImpl' | 'sleep'>;

  constructor(opts: LiveHttpOptions = {}) {
    this.o = {
      userAgent: opts.userAgent ?? USER_AGENT,
      timeoutMs: opts.timeoutMs ?? 20_000,
      maxBytes: opts.maxBytes ?? 5_000_000,
      retries: opts.retries ?? 1,
      timeoutsMs: { ...DEFAULT_TIMEOUTS, ...opts.timeoutsMs },
      minIntervalMs: { ...DEFAULT_INTERVALS, ...opts.minIntervalMs },
      defaultIntervalMs: opts.defaultIntervalMs ?? 1_000,
      fetchImpl: opts.fetchImpl,
      sleep: opts.sleep,
    };
  }

  private get fetchFn(): typeof fetch {
    return this.o.fetchImpl ?? fetch;
  }

  private sleep(ms: number): Promise<void> {
    return this.o.sleep ? this.o.sleep(ms) : new Promise((r) => setTimeout(r, ms));
  }

  /** Wait for this host's next free slot (requests to one host are spaced out). */
  private async throttle(host: string): Promise<void> {
    const gap = this.o.minIntervalMs[host] ?? this.o.defaultIntervalMs;
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot.get(host) ?? 0);
    this.nextSlot.set(host, slot + gap);
    if (slot > now) await this.sleep(slot - now);
  }

  private rulesFor(url: URL): Promise<RobotsRules> {
    let p = this.robots.get(url.host);
    if (!p) {
      p = (async () => {
        for (let attempt = 0; attempt <= 1; attempt++) {
          try {
            await this.throttle(url.host);
            const res = await this.fetchFn(`${url.origin}/robots.txt`, {
              headers: { 'user-agent': this.o.userAgent },
              signal: AbortSignal.timeout(this.o.timeoutsMs[url.host] ?? this.o.timeoutMs),
              redirect: 'follow',
            });
            // RFC 9309: 4xx → no restrictions; 5xx → assume complete disallow.
            if (res.status >= 400 && res.status < 500) return { rules: [] };
            if (!res.ok) return { rules: [{ allow: false, pattern: '/' }] };
            return parseRobots(await res.text());
          } catch (e) {
            this.log.warn(`robots.txt unreachable for ${url.host}${attempt ? '' : ', retrying'}`, describeError(e));
            if (!attempt) await this.sleep(5_000);
          }
        }
        return { rules: [{ allow: false, pattern: '/' }] }; // unreachable → do not crawl
      })();
      this.robots.set(url.host, p);
    }
    return p;
  }

  async get(raw: string): Promise<HttpResponse> {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`Unsupported URL ${raw}`);
    if (!isAllowed(await this.rulesFor(url), url.pathname + url.search)) throw new RobotsDisallowedError(raw);

    for (let attempt = 0; ; attempt++) {
      await this.throttle(url.host);
      let res: Response;
      try {
        res = await this.fetchFn(url, {
          headers: { 'user-agent': this.o.userAgent, accept: 'application/json, application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' },
          signal: AbortSignal.timeout(this.o.timeoutsMs[url.host] ?? this.o.timeoutMs),
          redirect: 'follow',
        });
      } catch (e) {
        if (attempt < this.o.retries) {
          this.log.warn(`network error, retrying: ${raw}`, describeError(e));
          await this.sleep(backoff(attempt));
          continue;
        }
        throw e;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < this.o.retries) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 60_000) : backoff(attempt);
        this.log.warn(`HTTP ${res.status}, retrying in ${Math.round(wait / 1000)} s: ${raw}`);
        await res.body?.cancel();
        await this.sleep(wait);
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel();
        throw new HttpError(raw, res.status);
      }
      const body = await readCapped(res, this.o.maxBytes);
      return { url: raw, status: res.status, contentType: res.headers.get('content-type') ?? '', body };
    }
  }
}

/** "fetch failed" hides the real reason; include the cause (ECONNRESET, ETIMEDOUT, …). */
export function describeError(e: unknown): string {
  const err = e as Error & { cause?: { code?: string; message?: string } };
  const cause = err.cause ? ` (${[err.cause.code, err.cause.message].filter(Boolean).join(': ')})` : '';
  return `${err.name === 'TimeoutError' ? 'timeout' : err.message}${cause}`;
}

function backoff(attempt: number): number {
  return 15_000 * 2 ** attempt; // 15 s, 30 s
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Response larger than ${maxBytes} bytes: ${res.url}`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// ---------- record / replay (tests) ----------

function keyFor(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

interface Recorded {
  url: string;
  status: number;
  contentType: string;
  body?: string;
  error?: string;
}

/** Wraps a client and saves every response (or error) to `dir/<hash>.json`. */
export class RecordingHttp implements HttpClient {
  constructor(
    private inner: HttpClient,
    private dir: string,
  ) {
    mkdirSync(dir, { recursive: true });
  }

  async get(url: string): Promise<HttpResponse> {
    const file = join(this.dir, `${keyFor(url)}.json`);
    try {
      const res = await this.inner.get(url);
      writeFileSync(file, JSON.stringify({ url, status: res.status, contentType: res.contentType, body: compactBody(res.body) } satisfies Recorded) + '\n');
      return res;
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 0;
      writeFileSync(file, JSON.stringify({ url, status, contentType: '', error: (e as Error).message } satisfies Recorded) + '\n');
      throw e;
    }
  }
}

/** Serves responses recorded by RecordingHttp; unknown URLs fail loudly. */
export class ReplayHttp implements HttpClient {
  constructor(private dir: string) {}

  async get(url: string): Promise<HttpResponse> {
    const file = join(this.dir, `${keyFor(url)}.json`);
    if (!existsSync(file)) throw new Error(`No recorded response for ${url}`);
    const rec = JSON.parse(readFileSync(file, 'utf8')) as Recorded;
    if (rec.error !== undefined) throw rec.status ? new HttpError(url, rec.status) : new Error(rec.error);
    return { url, status: rec.status, contentType: rec.contentType, body: rec.body ?? '' };
  }
}

/**
 * Recorded fixtures are committed to the repo, and we never store full article text (DESIGN §7):
 * drop full-content fields and cut long descriptions/abstracts, keeping the structure intact.
 */
export function compactBody(body: string, max = 600): string {
  body = redactUrlSecrets(body);
  const cut = (t: string) => (t.length > max ? `${t.slice(0, max)}…` : t);
  if (body.trimStart().startsWith('<')) {
    return body
      .replace(/<content:encoded>[\s\S]*?<\/content:encoded>/g, '')
      .replace(/<content(\s[^>]*)?>[\s\S]*?<\/content>/g, '')
      .replace(/<(description|summary)(\s[^>]*)?>([\s\S]*?)<\/\1>/g, (_m, tag: string, attrs = '', inner: string) => {
        const cdata = /^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/.exec(inner);
        return cdata ? `<${tag}${attrs}><![CDATA[${cut(cdata[1]!)}]]></${tag}>` : `<${tag}${attrs}>${cut(inner).replace(/&[a-z#0-9]*…$/i, '…')}</${tag}>`;
      });
  }
  try {
    return JSON.stringify(JSON.parse(body), (key, v) => (typeof v === 'string' && ['summary', 'ai_summary', 'description', 'abstract'].includes(key) ? cut(v) : v));
  } catch {
    return body;
  }
}
