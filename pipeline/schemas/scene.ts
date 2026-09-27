import { z } from 'zod';

/**
 * scene.json — the declarative art description written by the Art stage (DESIGN §9.3).
 * This schema checks the *structure*; the harness additionally validates each
 * component's props and actions against its own definition (harness/components).
 */

export const HARNESS_VERSION = '0.2.0';

/** Named layout anchors (DESIGN §9.2). Resolved to points by harness/layout.ts. */
export const ANCHORS = [
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center',
  'center-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
  'left-third',
  'center-third',
  'right-third',
  'ground',
  'sky',
] as const;
export const AnchorSchema = z.enum(ANCHORS);
export type Anchor = z.infer<typeof AnchorSchema>;

/** Normalized point: 0..1 across the artboard. An alternative to named anchors. */
export const PointSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });

export const ATTACH_SIDES = ['top', 'bottom', 'left', 'right', 'center'] as const;

export const PALETTE_TOKENS = ['bg', 'ink', 'accent1', 'accent2', 'paper'] as const;
export const TokenSchema = z.enum(PALETTE_TOKENS);
export type Token = z.infer<typeof TokenSchema>;

const IdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/, 'lowercase id: letters, digits, dashes (max 32)');

export const ElementSchema = z
  .object({
    id: IdSchema,
    component: z.string().min(1),
    at: z.union([AnchorSchema, PointSchema]).optional(),
    attachTo: IdSchema.optional(),
    side: z.enum(ATTACH_SIDES).optional(),
    /** Small pixel nudge after placement: [dx, dy]. (An array, not a tuple: the Claude CLI and API disagree on tuple syntax.) */
    offset: z.array(z.number().min(-540).max(540)).length(2).optional(),
    scale: z.number().min(0.1).max(4).default(1),
    rotate: z.number().min(-180).max(180).optional(),
    flip: z.boolean().optional(),
    opacity: z.number().min(0).max(1).optional(),
    props: z.record(z.string(), z.unknown()).default({}),
    /** Only for component "raw": an SVG fragment, sanitized and size-limited. */
    svg: z.string().optional(),
  })
  .refine((e) => e.at !== undefined || e.attachTo !== undefined, { message: 'Element needs "at" or "attachTo"' })
  .refine((e) => (e.component === 'raw') === (e.svg !== undefined), {
    message: '"svg" is required for component "raw" and not allowed otherwise',
  });

export const BACKGROUND_TYPES = ['solid', 'sky-ground', 'split', 'rays', 'grid'] as const;

export const BackgroundSchema = z.object({
  /** Omitted → the style card's default background. */
  type: z.enum(BACKGROUND_TYPES).optional(),
  /** Horizon (sky-ground, split) as a fraction of the height. */
  horizon: z.number().min(0.3).max(0.9).optional(),
  /** Token for the main fill; the style card decides when omitted. */
  color: TokenSchema.optional(),
  color2: TokenSchema.optional(),
});

export const EASES = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'bounce'] as const;
export const FROM_SIDES = ['left', 'right', 'top', 'bottom'] as const;

export const BeatSchema = z.object({
  t: z.number().min(0),
  target: IdSchema,
  action: z.string().min(1),
  /** Seconds; each action has a sensible default. */
  dur: z.number().positive().max(9).optional(),
  from: z.enum(FROM_SIDES).optional(),
  props: z.record(z.string(), z.unknown()).optional(),
  ease: z.enum(EASES).optional(),
});

export const AMBIENT_ACTIONS = ['blink', 'pulse', 'sway'] as const;

export const AnimationSchema = z.object({
  durationSec: z.number().positive(),
  beats: z.array(BeatSchema).min(1).max(24),
  holdSec: z.number().min(0).max(10).default(2),
  /** At most one subtle looping element (DESIGN §9.6). */
  ambient: z.object({ target: IdSchema, action: z.enum(AMBIENT_ACTIONS) }).optional(),
});

export const SceneSchema = z
  .object({
    harness: z.string().regex(/^\d+\.\d+(\.\d+)?$/),
    style: z.string().regex(/^[a-z0-9-]+$/),
    background: BackgroundSchema.prefault({}),
    elements: z.array(ElementSchema).min(1).max(40),
    animation: AnimationSchema.optional(),
    alt: z.string().min(10).max(400),
  })
  .superRefine((scene, ctx) => {
    const ids = new Set<string>();
    for (const [i, el] of scene.elements.entries()) {
      if (ids.has(el.id)) ctx.addIssue({ code: 'custom', path: ['elements', i, 'id'], message: `Duplicate id "${el.id}"` });
      ids.add(el.id);
    }
    for (const [i, el] of scene.elements.entries()) {
      if (el.attachTo && !ids.has(el.attachTo))
        ctx.addIssue({ code: 'custom', path: ['elements', i, 'attachTo'], message: `Unknown element "${el.attachTo}"` });
      if (el.attachTo === el.id)
        ctx.addIssue({ code: 'custom', path: ['elements', i, 'attachTo'], message: 'An element cannot attach to itself' });
    }
    for (const [i, b] of scene.animation?.beats.entries() ?? []) {
      if (!ids.has(b.target))
        ctx.addIssue({ code: 'custom', path: ['animation', 'beats', i, 'target'], message: `Unknown element "${b.target}"` });
    }
    const amb = scene.animation?.ambient;
    if (amb && !ids.has(amb.target))
      ctx.addIssue({ code: 'custom', path: ['animation', 'ambient', 'target'], message: `Unknown element "${amb.target}"` });
  });

export type SceneElement = z.infer<typeof ElementSchema>;
export type Beat = z.infer<typeof BeatSchema>;
export type Animation = z.infer<typeof AnimationSchema>;
export type Background = z.infer<typeof BackgroundSchema>;
export type Scene = z.infer<typeof SceneSchema>;
