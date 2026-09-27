import { parseFeed } from '../feed.ts';
import type { RawItem, Source } from '../types.ts';

/**
 * arXiv via rss.arxiv.org (the API host disallows bots in robots.txt, DESIGN §7). The feed lists the
 * latest announcement only; papers are announced the day after submission, hence `afterDays`.
 * Society-related papers (cs.CY) come first; only "new" announcements are kept (no replacements).
 */
export const arxiv: Source = {
  name: 'arxiv',
  slack: { afterDays: 1 },
  async fetch({ config, http }) {
    const cats = config.sources.arxivCategories;
    const res = await http.get(`https://rss.arxiv.org/rss/${cats.join('+')}`);
    const items: (RawItem & { society: boolean })[] = [];
    for (const e of parseFeed(res.body)) {
      if (!/Announce Type:\s*(new|cross)\b/i.test(e.summary)) continue;
      items.push({
        url: e.link,
        title: e.title,
        snippet: e.summary.replace(/^.*?Abstract:\s*/is, ''),
        publishedAt: e.date ?? null,
        publisher: 'arXiv',
        society: e.categories.includes('cs.CY'),
      });
    }
    return items.sort((a, b) => Number(b.society) - Number(a.society)).map(({ society: _, ...rest }) => rest);
  },
};
