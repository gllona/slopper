import { formatLong } from '../util/dates.ts';

/**
 * The Instagram caption for a published slopper (DESIGN decision 44). Built at site-build time from texts that
 * already passed the Cop: nothing new is generated. Instagram limits: 2200 characters, 30 hashtags.
 */
export const CAPTION_MAX = 2200;
export const HASHTAGS_MAX = 30;

export interface CaptionInput {
  motto: string;
  phrase: string;
  number: number | null;
  /** Publication date (YYYY-MM-DD). */
  publishedOn: string;
  siteHost: string;
  hashtags: string[];
}

export function instagramCaption(c: CaptionInput): string {
  const tags = [...new Set(c.hashtags.map((h) => h.replace(/^#/, '').replace(/[^\p{L}\p{N}_]/gu, '')).filter(Boolean))]
    .slice(0, HASHTAGS_MAX)
    .map((h) => `#${h}`);
  const lines = [
    c.motto,
    '',
    c.phrase,
    '',
    `Slopper${c.number ? ` #${c.number}` : ''} · ${formatLong(c.publishedOn)} · slop-art made by AI`,
    `A new one every day at ${c.siteHost} (link in bio)`,
    '',
    tags.join(' '),
  ];
  const text = lines.join('\n').trim();
  return text.length <= CAPTION_MAX ? text : text.slice(0, CAPTION_MAX - 1) + '…';
}
