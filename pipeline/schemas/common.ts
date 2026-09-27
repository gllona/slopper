import { z } from 'zod';
import { isIsoDate } from '../util/dates.ts';

export const IsoDateSchema = z.string().refine(isIsoDate, 'Expected a UTC date YYYY-MM-DD');
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

export const DIMENSIONS = [
  'capabilities',
  'industry',
  'labor',
  'policy',
  'law',
  'safety',
  'society',
  'education',
  'planet',
  'science',
] as const;
export const DimensionSchema = z.enum(DIMENSIONS);
export type Dimension = z.infer<typeof DimensionSchema>;

export const SOURCE_NAMES = ['hackernews', 'huggingface', 'arxiv', 'googlenews', 'gdelt', 'techmeme', 'reddit'] as const;
export const SourceNameSchema = z.enum(SOURCE_NAMES);
export type SourceName = z.infer<typeof SourceNameSchema>;
