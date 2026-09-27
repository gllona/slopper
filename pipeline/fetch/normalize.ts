import { createHash } from 'node:crypto';
import type { DigestItem } from '../schemas/digest.ts';

/**
 * Normalization and de-duplication for fetched items (DESIGN §5 stage 1). All text from the
 * internet is untrusted: it is reduced to plain text, stripped of control characters, and cut short.
 */

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', copy: '©', reg: '®', trade: '™',
  eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ',
  ccedil: 'ç', uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß', euro: '€', pound: '£', middot: '·', bull: '•',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** HTML/markup → one line of plain text. Entities are decoded twice (feeds often double-encode). */
export function plainText(s: string | undefined | null): string {
  if (!s) return '';
  let t = String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ');
  t = decodeEntities(t).replace(/<[^>]*>/g, ' ');
  t = decodeEntities(t).replace(/<[^>]*>/g, ' ');
  return t
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cut at a word boundary and add an ellipsis. */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,.;:–—-]+$/, '')}…`;
}

const TRACKING = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|source|cmp|taid|smid|ncid|ocid|guccounter)$/i;

/** Canonical URL for de-duplication: https, lowercase host without www, no tracking params or fragment. */
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.protocol = 'https:';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    let s = u.toString();
    if (u.pathname !== '/' && s.endsWith('/') && !u.search) s = s.slice(0, -1);
    return s;
  } catch {
    return raw;
  }
}

/** Query parameters that carry credentials or paywall gift access: never stored or committed. */
export const SENSITIVE_PARAM = /(token|key|sig|signature|auth|session|secret|password|gift|share_?type|^st$|^sid$)/i;

/** The URL we store: same page, without credential-like query parameters or fragments. */
export function safeUrl(raw: string): string {
  const u = new URL(raw);
  for (const k of [...u.searchParams.keys()]) if (SENSITIVE_PARAM.test(k)) u.searchParams.delete(k);
  u.hash = '';
  return u.toString();
}

/** Redact credential-like query values inside any text (used for recorded fixtures). */
export function redactUrlSecrets(text: string): string {
  return text.replace(/([?&;]|&amp;)([A-Za-z_]*(?:token|sig|signature|key|auth|session|secret|gift)[A-Za-z_]*)=[^&"'\s<]+/gi, '$1$2=REDACTED');
}

export function itemId(source: string, url: string): string {
  return `${source}:${createHash('sha256').update(canonicalUrl(url)).digest('hex').slice(0, 12)}`;
}

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are', 'at', 'by', 'from', 'as', 'its', 'it', 'this', 'that', 'how', 'why', 'what']);

/** Word set of a title (lowercase, no punctuation, no stop words, no " - Publisher" suffix). */
export function titleTokens(title: string): Set<string> {
  const t = title
    .toLowerCase()
    .replace(/\s+[-–—|]\s+[^-–—|]{2,40}$/, '') // "Headline - Publisher"
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ');
  return new Set(t.split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

export const NEAR_DUPLICATE = 0.75;

/**
 * Remove duplicates: same canonical URL, or near-identical titles (Jaccard ≥ 0.75 on title words).
 * Items are expected in priority order; the first occurrence is kept (with the best score seen).
 */
export function dedupe(items: DigestItem[]): { items: DigestItem[]; removed: number } {
  const byUrl = new Map<string, DigestItem>();
  const kept: { item: DigestItem; tokens: Set<string> }[] = [];
  let removed = 0;
  for (const item of items) {
    const key = canonicalUrl(item.url);
    const tokens = titleTokens(item.title);
    const same = byUrl.get(key) ?? kept.find((k) => tokens.size >= 3 && jaccard(k.tokens, tokens) >= NEAR_DUPLICATE)?.item;
    if (same) {
      removed++;
      if (item.score !== undefined && (same.score === undefined || item.score > same.score)) same.score = item.score;
      continue;
    }
    byUrl.set(key, item);
    kept.push({ item, tokens });
  }
  return { items: kept.map((k) => k.item), removed };
}

/** Parse a date from feeds/APIs into ISO 8601 (UTC). Returns null when it cannot be parsed. */
export function isoDate(v: string | number | undefined | null): string | null {
  if (v === undefined || v === null || v === '') return null;
  // GDELT: 20260926T101500Z
  const g = typeof v === 'string' ? /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(v) : null;
  const d = g ? new Date(`${g[1]}-${g[2]}-${g[3]}T${g[4]}:${g[5]}:${g[6]}Z`) : new Date(typeof v === 'number' ? v * 1000 : v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Loose "is this about AI?" test for general feeds (BBC tech, Rest of World). */
export const AI_PATTERN = /\b(A\.?I\.?|artificial intelligence|machine learning|deep learning|LLMs?|large language models?|chat ?bots?|generative|neural net(work)?s?|robots?|robotics|automation|algorithms?|deepfakes?|data ?cent(er|re)s?|GPUs?|AGI|copilots?|ChatGPT|OpenAI|Anthropic|Claude|Gemini|DeepMind|Nvidia|Mistral|Llama)\b/i;
