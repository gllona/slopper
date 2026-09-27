import { z } from 'zod';

export const COP_CHECKS = [
  'defamation',
  'real-people',
  'trademarks',
  'copyright',
  'privacy',
  'hate-harassment',
  'dangerous-advice',
  'sensitive-events',
] as const;

export const CopFindingSchema = z.object({
  check: z.enum(COP_CHECKS),
  severity: z.enum(['low', 'medium', 'high']),
  evidence: z.string().min(1).max(500),
  suggestion: z.string().max(500),
  /** Which stage must redo work on `revise`. */
  stage: z.enum(['curate', 'art']).optional(),
});

export const CopVerdictSchema = z.object({
  verdict: z.enum(['pass', 'revise', 'hold']),
  findings: z.array(CopFindingSchema),
});

/** cop.json: every review round (the audit trail) plus the final verdict. */
export const CopFileSchema = z.object({
  verdict: z.enum(['pass', 'revise', 'hold']),
  rounds: z.array(CopVerdictSchema).min(1),
});

export type CopVerdict = z.infer<typeof CopVerdictSchema>;
export type CopFile = z.infer<typeof CopFileSchema>;
