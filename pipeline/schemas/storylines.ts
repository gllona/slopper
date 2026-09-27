import { z } from 'zod';
import { DimensionSchema, IsoDateSchema } from './common.ts';

export const StorylineSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'kebab-case id'),
  title: z.string().min(1).max(120),
  dimensions: z.array(DimensionSchema).min(1),
  firstSeen: IsoDateSchema,
  lastSeen: IsoDateSchema,
  daysActive: z.number().int().min(1),
  heat: z.number().min(0).max(1),
  status: z.enum(['active', 'dormant']),
  sloppers: z.array(IsoDateSchema),
  motifs: z.array(z.string().max(80)).default([]),
});

export const StorylinesFileSchema = z.object({
  version: z.literal(1),
  storylines: z.array(StorylineSchema),
});

export type Storyline = z.infer<typeof StorylineSchema>;
export type StorylinesFile = z.infer<typeof StorylinesFileSchema>;
