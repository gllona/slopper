import type { RawItem, Source } from '../types.ts';

/** Hacker News via the Algolia search API: stories matching AI queries, created in the window. */
export const hackernews: Source = {
  name: 'hackernews',
  async fetch({ window, config, http }) {
    const from = Math.floor(window.from.getTime() / 1000);
    const to = Math.floor(window.to.getTime() / 1000);
    const out: RawItem[] = [];
    for (const query of config.sources.hnQueries) {
      const url = new URL('https://hn.algolia.com/api/v1/search');
      url.searchParams.set('query', query);
      url.searchParams.set('tags', 'story');
      url.searchParams.set('numericFilters', `created_at_i>=${from},created_at_i<${to},points>=${config.sources.hnMinPoints}`);
      url.searchParams.set('hitsPerPage', '50');
      const res = JSON.parse((await http.get(url.toString())).body) as { hits?: Hit[] };
      for (const h of res.hits ?? []) {
        if (!h.title) continue;
        const discussion = `https://news.ycombinator.com/item?id=${h.objectID}`;
        out.push({
          url: h.url || discussion,
          title: h.title,
          snippet: `${h.points ?? 0} points and ${h.num_comments ?? 0} comments on Hacker News (${discussion}).`,
          publishedAt: h.created_at ?? null,
          score: h.points,
          publisher: h.url ? safeHost(h.url) : 'news.ycombinator.com',
        });
      }
    }
    return out.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  },
};

interface Hit {
  objectID: string;
  title?: string;
  url?: string;
  points?: number;
  num_comments?: number;
  created_at?: string;
}

function safeHost(u: string): string | undefined {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}
