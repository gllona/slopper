import { parseFeed } from '../feed.ts';
import { AI_PATTERN, plainText } from '../normalize.ts';
import type { Source } from '../types.ts';

/** Techmeme's RSS feed: curated tech/industry headlines (recent items only), filtered to AI-related ones. */
export const techmeme: Source = {
  name: 'techmeme',
  async fetch({ http }) {
    const entries = parseFeed((await http.get('https://www.techmeme.com/feed.xml')).body);
    return entries.filter((e) => AI_PATTERN.test(`${plainText(e.title)} ${plainText(e.summary)}`)).map((e) => ({
      url: e.link,
      title: e.title,
      snippet: e.summary,
      publishedAt: e.date ?? null,
      publisher: 'Techmeme',
    }));
  },
};
