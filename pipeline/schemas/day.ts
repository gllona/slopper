import { z } from 'zod';
import { DimensionSchema, IsoDateSchema, IsoDateTimeSchema, SourceNameSchema } from './common.ts';

/** Motto: 2–5 words, title case, no final punctuation (DESIGN §8.1). */
export const MottoSchema = z
  .string()
  .trim()
  .refine((s) => {
    const n = s.split(/\s+/).filter(Boolean).length;
    return n >= 2 && n <= 5;
  }, 'Motto must have 2–5 words')
  .refine((s) => !/[.!?,;:]$/.test(s), 'Motto must not end with punctuation');

/** Phrase: 1–2 sentences, at most 30 words (DESIGN §8.2). */
export const PhraseSchema = z
  .string()
  .trim()
  .min(1)
  .refine((s) => s.split(/\s+/).filter(Boolean).length <= 30, 'Phrase must have at most 30 words');

const Score03 = z.number().int().min(0).max(3);
const Mood = z.number().int().min(-2).max(2);

export const TopStorySchema = z.object({
  title: z.string().min(1).max(200),
  itemIds: z.array(z.string()).min(1),
  dimensions: z.array(DimensionSchema).min(1),
  novelty: Score03,
  magnitude: Score03,
  breadth: Score03,
  storyline: z.string().optional(),
});

/** Who appears in the art and what kind of actor it is (casting rule, DESIGN decision 45). */
export const CAST_KINDS = ['person', 'institution', 'ai', 'object'] as const;
export const CastMemberSchema = z.object({
  who: z.string().min(1).max(100).describe('e.g. "a tired nurse in scrubs", "a chatbot", "a datacenter"'),
  kind: z.enum(CAST_KINDS).describe('person = any human (worker, researcher, official, user); institution = a company, government, or court; ai = an AI system, model, agent, or robot; object = a thing'),
});
export type CastMember = z.infer<typeof CastMemberSchema>;

export const BriefSchema = z.object({
  concept: z.string().min(1).max(300),
  metaphor: z.string().min(1).max(300),
  /** Plain strings in sloppers made before decision 45; cast members with a kind since then. */
  cast: z.array(z.union([z.string().max(80), CastMemberSchema])).max(8),
  style: z.string().regex(/^[a-z0-9-]+$/),
  composition: z.string().max(600),
  artType: z.enum(['static', 'animated']),
  beats: z.array(z.string().max(200)).max(6).optional(),
  alt: z.string().min(10).max(400),
});

export const DaySourceSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  url: z.url({ protocol: /^https?$/ }),
  source: SourceNameSchema,
  publisher: z.string().max(120).optional(),
  publishedAt: IsoDateTimeSchema,
});

export const VersionsSchema = z.object({
  harness: z.string(),
  prompts: z.string(),
  ontology: z.string(),
  rubricArt: z.string(),
  rubricCop: z.string(),
  styleCard: z.string().optional(),
});

export const DaySchema = z
  .object({
    date: IsoDateSchema,
    /** days since LAUNCH_DATE + 1; null before launch (dry-run calibration). */
    number: z.number().int().min(1).nullable(),
    mode: z.enum(['fresh', 'continuation']),
    continuesFrom: IsoDateSchema.optional(),
    motto: MottoSchema,
    phrase: PhraseSchema,
    phraseAlternatives: z.array(PhraseSchema).max(5).default([]),
    alt: z.string().min(10).max(400),
    artType: z.enum(['static', 'animated']),
    style: z.string(),
    dimensions: z.partialRecord(DimensionSchema, Score03).default({}),
    mood: z.object({ hype_doom: Mood, calm_frantic: Mood }),
    storylines: z.array(z.string()).default([]),
    topStories: z.array(TopStorySchema).default([]),
    brief: BriefSchema.optional(),
    sources: z.array(DaySourceSchema).default([]),
    critic: z.object({ passed: z.boolean(), average: z.number(), iterations: z.number().int().min(1) }).optional(),
    cop: z.object({ verdict: z.enum(['pass', 'revise', 'hold']) }).optional(),
    versions: VersionsSchema,
    generatedAt: IsoDateTimeSchema,
  })
  .refine((d) => d.mode === 'fresh' || d.continuesFrom !== undefined, {
    message: 'Continuation days need "continuesFrom"',
    path: ['continuesFrom'],
  });

export type TopStory = z.infer<typeof TopStorySchema>;
export type Brief = z.infer<typeof BriefSchema>;
export type Day = z.infer<typeof DaySchema>;

/** relevance = novelty × magnitude × breadth (0–27), DESIGN §6.2. */
export function storyRelevance(s: Pick<TopStory, 'novelty' | 'magnitude' | 'breadth'>): number {
  return s.novelty * s.magnitude * s.breadth;
}
