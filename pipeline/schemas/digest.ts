import { z } from 'zod';
import { IsoDateSchema, IsoDateTimeSchema, SourceNameSchema } from './common.ts';

export const DigestItemSchema = z.object({
  id: z.string().min(1),
  source: SourceNameSchema,
  url: z.url({ protocol: /^https?$/ }),
  title: z.string().min(1).max(500),
  snippet: z.string().max(400).default(''),
  publishedAt: IsoDateTimeSchema,
  score: z.number().optional(),
  /** Original publisher or site (e.g. "MIT Technology Review", "arxiv.org"). */
  publisher: z.string().max(120).optional(),
  lang: z.string().min(2).max(8).default('en'),
});

export const SourceReportSchema = z.object({
  source: SourceNameSchema,
  ok: z.boolean(),
  count: z.number().int().min(0),
  error: z.string().optional(),
});

export const DigestSchema = z.object({
  date: IsoDateSchema,
  fetchedAt: IsoDateTimeSchema,
  sources: z.array(SourceReportSchema),
  items: z.array(DigestItemSchema),
});

export type DigestItem = z.infer<typeof DigestItemSchema>;
export type Digest = z.infer<typeof DigestSchema>;
