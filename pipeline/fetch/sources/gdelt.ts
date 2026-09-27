import type { RawItem, Source } from '../types.ts';

const LANG: Record<string, string> = {
  english: 'en', spanish: 'es', french: 'fr', german: 'de', portuguese: 'pt', italian: 'it', chinese: 'zh',
  japanese: 'ja', korean: 'ko', russian: 'ru', arabic: 'ar', hindi: 'hi', turkish: 'tr', dutch: 'nl',
  indonesian: 'id', polish: 'pl', ukrainian: 'uk', vietnamese: 'vi', persian: 'fa', swedish: 'sv',
};

/**
 * GDELT DOC 2.0: global, multilingual news (config queries; keep them few and broad). GDELT allows one
 * request every 5 seconds and rate-limits shared IPs aggressively, so it is best-effort: the pipeline
 * tolerates its failure. It answers some errors as plain text with HTTP 200 (e.g. "keyword too short").
 */
export const gdelt: Source = {
  name: 'gdelt',
  async fetch({ date, config, http, log }) {
    const day = date.replaceAll('-', '');
    const out: RawItem[] = [];
    let failures = 0;
    for (const query of config.sources.gdeltQueries) {
      const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
      url.searchParams.set('query', query);
      url.searchParams.set('mode', 'ArtList');
      url.searchParams.set('format', 'json');
      url.searchParams.set('maxrecords', '75');
      url.searchParams.set('sort', 'HybridRel');
      url.searchParams.set('startdatetime', `${day}000000`);
      url.searchParams.set('enddatetime', `${day}235959`);
      try {
        const body = (await http.get(url.toString())).body.trim();
        if (!body.startsWith('{')) throw new Error(`GDELT: ${body.slice(0, 120)}`);
        const res = JSON.parse(body) as { articles?: Article[] };
        for (const a of res.articles ?? []) {
          if (!a.url || !a.title) continue;
          out.push({
            url: a.url,
            title: a.title,
            publishedAt: a.seendate ?? null,
            lang: LANG[(a.language ?? '').toLowerCase()] ?? 'und',
            publisher: a.domain,
          });
        }
      } catch (e) {
        failures++;
        log.warn(`GDELT query failed: ${query}`, (e as Error).message);
      }
    }
    if (failures === config.sources.gdeltQueries.length) throw new Error('all GDELT queries failed');
    return out;
  },
};

interface Article {
  url?: string;
  title?: string;
  seendate?: string;
  domain?: string;
  language?: string;
}
