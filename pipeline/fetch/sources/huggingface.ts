import type { RawItem, Source } from '../types.ts';

const RECENT_MS = 3 * 86_400_000;
const MAX_MODELS = 8;

/**
 * Hugging Face: Daily Papers for the date (research the community upvoted), plus trending models
 * created in the last two weeks — only when fetching a recent date, since "trending" means now.
 */
export const huggingface: Source = {
  name: 'huggingface',
  slack: { beforeDays: 14 },
  async fetch({ date, window, http, log, now }) {
    const out: RawItem[] = [];
    const papers = JSON.parse((await http.get(`https://huggingface.co/api/daily_papers?date=${date}&limit=100`)).body) as Paper[];
    for (const p of papers) {
      const paper = p.paper;
      if (!paper?.id || !paper.title) continue;
      out.push({
        url: `https://huggingface.co/papers/${paper.id}`,
        title: paper.title,
        snippet: paper.summary,
        publishedAt: paper.submittedOnDailyAt ?? `${date}T12:00:00.000Z`,
        score: paper.upvotes,
        publisher: 'Hugging Face Daily Papers',
      });
    }
    if (now.getTime() - window.to.getTime() < RECENT_MS) {
      const models = JSON.parse((await http.get(`https://huggingface.co/api/models?sort=trendingScore&limit=${MAX_MODELS}`)).body) as Model[];
      for (const m of models) {
        if (!m.id || !m.createdAt) continue;
        out.push({
          url: `https://huggingface.co/${m.id}`,
          title: `Trending open model: ${m.id}`,
          snippet: [m.pipeline_tag && `Task: ${m.pipeline_tag}.`, `${m.likes ?? 0} likes, ${m.downloads ?? 0} downloads.`].filter(Boolean).join(' '),
          publishedAt: m.createdAt,
          score: m.trendingScore,
          publisher: 'Hugging Face',
        });
      }
    } else {
      log.debug('skipping trending models for a past date');
    }
    return out.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  },
};

interface Paper {
  paper?: { id?: string; title?: string; summary?: string; upvotes?: number; submittedOnDailyAt?: string };
}
interface Model {
  id?: string;
  createdAt?: string;
  likes?: number;
  downloads?: number;
  trendingScore?: number;
  pipeline_tag?: string;
}
