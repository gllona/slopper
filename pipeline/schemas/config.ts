import { z } from 'zod';

/** Non-secret tunables (slopper.config.json). Defaults here are the "code default" layer. */
export const TunablesSchema = z.object({
  generateHourUTC: z.number().int().min(0).max(23).default(15),
  maxArtIterations: z.number().int().min(1).max(10).default(3),
  copRetries: z.number().int().min(0).max(3).default(1),
  relevanceThreshold: z.number().min(0).max(27).default(8),
  maxContinuationDays: z.number().int().min(0).default(3),
  balanceBonus: z.number().min(0).default(3),
  heatDecay: z.number().gt(0).lt(1).default(0.7),
  noveltyWindowDays: z.number().int().min(0).default(14),
  artboard: z.number().int().positive().default(1080),
  safeArea: z.number().int().min(0).default(60),
  svgMaxKB: z.number().positive().default(150),
  rawSvgMaxBytes: z.number().int().positive().default(8192),
  maxRawElements: z.number().int().min(0).default(3),
  maxWordsInArt: z.number().int().min(0).default(6),
  animation: z
    .object({
      minSec: z.number().positive().default(3),
      maxSec: z.number().positive().default(9),
      filmstripFrames: z.number().int().min(2).max(12).default(6),
    })
    .prefault({}),
  critic: z
    .object({
      passAverage: z.number().min(1).max(5).default(3.5),
      minScore: z.number().min(1).max(5).default(2),
    })
    .prefault({}),
  sources: z
    .object({
      perSourceCap: z.number().int().positive().default(40),
      snippetMaxChars: z.number().int().positive().default(300),
      /** Hacker News (Algolia) search queries. */
      hnQueries: z.array(z.string().min(1)).default(['AI']),
      /** Minimum HN points for a story to be kept. */
      hnMinPoints: z.number().int().min(0).default(20),
      /** GDELT DOC 2.0 queries (one request each, ≥ 5 s apart). */
      gdeltQueries: z.array(z.string().min(1)).default(['"artificial intelligence"']),
      /** Publisher RSS/Atom feeds. `filter: true` keeps only items matching the AI keyword pattern. */
      feeds: z
        .array(z.object({ name: z.string().min(1), url: z.url({ protocol: /^https$/ }), filter: z.boolean().default(false) }))
        .default([]),
      /** arXiv categories for rss.arxiv.org. */
      arxivCategories: z.array(z.string().regex(/^[a-z-]+\.[A-Z]{2}$/)).default(['cs.AI']),
    })
    .prefault({}),
});

/** Deployment/runtime settings that come from GitHub repository variables or .env. */
export const RuntimeSchema = z.object({
  vetoMode: z.enum(['off', 'window', 'approve']).default('window'),
  /** window mode: publish at/after this UTC hour on the PR's creation day (19 = 14:00 in UTC-5). */
  publishHourUTC: z.number().int().min(0).max(23).default(19),
  /** window mode: minimum PR age before publishing. */
  vetoMinMinutes: z.number().int().min(0).default(60),
  dryRun: z.boolean().default(true),
  siteUrl: z.url().default('https://slopper.logicos.org'),
  launchDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  cloudflareAccountId: z.string().optional(),
});

export const ConfigSchema = TunablesSchema.extend(RuntimeSchema.shape);

export type Tunables = z.infer<typeof TunablesSchema>;
export type Config = z.infer<typeof ConfigSchema>;
