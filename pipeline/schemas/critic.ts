import { z } from 'zod';

const Score = z.number().int().min(1).max(5);

export const CRITERIA = ['clarity', 'coherence', 'composition', 'style', 'narrative', 'polish', 'novelty', 'kindness'] as const;

export const CriticScoresSchema = z.object({
  clarity: Score,
  coherence: Score,
  composition: Score,
  style: Score,
  /** Animated sloppers only. */
  narrative: Score.optional(),
  polish: Score,
  novelty: Score,
  kindness: Score,
});

/** What the Critic returns for one iteration. */
export const CriticReviewSchema = z.object({
  scores: CriticScoresSchema,
  verdict: z.string().min(1).max(400),
  revisionNotes: z.array(z.string().max(300)).max(10),
});

/** critic.json: all iterations plus the outcome. */
export const CriticFileSchema = z.object({
  passed: z.boolean(),
  bestIteration: z.number().int().min(1),
  iterations: z.array(
    z.object({
      iteration: z.number().int().min(1),
      lint: z.object({ ok: z.boolean(), errors: z.array(z.string()), warnings: z.array(z.string()) }),
      review: CriticReviewSchema.optional(),
      average: z.number().optional(),
      passed: z.boolean(),
    }),
  ),
});

export type CriticScores = z.infer<typeof CriticScoresSchema>;
export type CriticReview = z.infer<typeof CriticReviewSchema>;
export type CriticFile = z.infer<typeof CriticFileSchema>;

/** Pass rule (DESIGN §10): average ≥ passAverage and no criterion below minScore. */
export function evaluateScores(scores: CriticScores, rule: { passAverage: number; minScore: number }) {
  const values = Object.values(scores).filter((v): v is number => typeof v === 'number');
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const passed = average >= rule.passAverage && values.every((v) => v >= rule.minScore);
  return { average: Math.round(average * 100) / 100, passed };
}
