import { parseFeed } from '../feed.ts';
import { AI_PATTERN, plainText } from '../normalize.ts';
import type { RawItem, Source } from '../types.ts';

const PER_FEED = 12;

/**
 * Publisher RSS/Atom feeds (replaces Google News, which robots.txt disallows; DESIGN §7).
 * One broken feed is a warning; the source fails only when every feed fails.
 */
export const feeds: Source = {
  name: 'feeds',
  async fetch({ config, http, log }) {
    const out: RawItem[] = [];
    const errors: string[] = [];
    const list = config.sources.feeds;
    for (const f of list) {
      try {
        const entries = parseFeed((await http.get(f.url)).body);
        let n = 0;
        for (const e of entries) {
          if (f.filter && !AI_PATTERN.test(`${plainText(e.title)} ${plainText(e.summary)}`)) continue;
          out.push({ url: e.link, title: e.title, snippet: e.summary, publishedAt: e.date ?? null, publisher: f.name });
          if (++n >= PER_FEED) break;
        }
      } catch (e) {
        errors.push(`${f.name}: ${(e as Error).message}`);
        log.warn(`feed failed: ${f.name}`, (e as Error).message);
      }
    }
    if (list.length && errors.length === list.length) throw new Error(`all feeds failed (${errors.join('; ')})`);
    return out;
  },
};
