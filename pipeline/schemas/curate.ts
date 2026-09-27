import { z } from 'zod';
import { DimensionSchema } from './common.ts';
import { BriefSchema, MottoSchema, PhraseSchema } from './day.ts';

const Score03 = z.number().int().min(0).max(3);
const Mood = z.number().int().min(-2).max(2);

/** What the Curate stage returns (DESIGN §5 stage 2). The code derives day.json from it. */
export const CurateOutputSchema = z.object({
  topStories: z
    .array(
      z.object({
        title: z.string().min(1).max(200).describe('Short neutral title of the story'),
        itemIds: z.array(z.string()).min(1).describe('Digest item ids that report this story'),
        dimensions: z.array(DimensionSchema).min(1),
        novelty: Score03,
        magnitude: Score03,
        breadth: Score03,
        storyline: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).describe('Existing storyline id, or the id of a new storyline'),
      }),
    )
    .max(6),
  newStorylines: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(40),
        title: z.string().min(1).max(120),
        dimensions: z.array(DimensionSchema).min(1),
        motifs: z.array(z.string().max(80)).max(3),
      }),
    )
    .max(6),
  mode: z.enum(['fresh', 'continuation']),
  modeReason: z.string().max(400).describe('One or two sentences: why this mode, per the rules'),
  motto: MottoSchema,
  phrase: PhraseSchema,
  phraseAlternatives: z.array(PhraseSchema).min(1).max(5),
  brief: BriefSchema,
  sourceIds: z.array(z.string()).max(8).describe('Digest item ids supporting the facts in the phrase and art'),
  dimensions: z.partialRecord(DimensionSchema, Score03),
  mood: z.object({ hype_doom: Mood, calm_frantic: Mood }),
});

export type CurateOutput = z.infer<typeof CurateOutputSchema>;
