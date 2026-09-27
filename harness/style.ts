import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { BACKGROUND_TYPES, PALETTE_TOKENS, TokenSchema, type Token } from '../pipeline/schemas/scene.ts';
import { FONTS, type FontKey } from './fonts.ts';

/** Semantic drawing roles. Components draw with roles; style cards decide what a role looks like. */
export const ROLES = ['body', 'body-alt', 'accent', 'accent-2', 'ink', 'paper', 'line', 'thin', 'shade', 'glow', 'text'] as const;
export type Role = (typeof ROLES)[number];

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be #RRGGBB');

const RoleSpec = z.object({
  fill: z.union([TokenSchema, z.literal('none')]),
  stroke: z.union([TokenSchema, z.literal('none')]),
  /** Stroke width relative to the card's stroke width. */
  width: z.number().positive().max(3).default(1),
  opacity: z.number().min(0).max(1).optional(),
});

export const StyleCardSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  version: z.number().int().min(1),
  name: z.string(),
  description: z.string(),
  mood: z.array(z.string()).min(1),
  palette: z.object(Object.fromEntries(PALETTE_TOKENS.map((t) => [t, Hex])) as Record<Token, typeof Hex>),
  stroke: z.object({
    width: z.number().positive().max(20),
    linecap: z.enum(['round', 'square', 'butt']),
    linejoin: z.enum(['round', 'miter', 'bevel']),
  }),
  corner: z.number().min(0).max(60),
  blend: z.enum(['normal', 'multiply']),
  texture: z.enum(['none', 'grain']),
  shadow: z.enum(['none', 'soft', 'hard']),
  font: z.enum(Object.keys(FONTS) as [FontKey, ...FontKey[]]),
  background: z.object({
    type: z.enum(BACKGROUND_TYPES),
    horizon: z.number().min(0.3).max(0.9).optional(),
    color: TokenSchema,
    color2: TokenSchema,
  }),
  roles: z.object(Object.fromEntries(ROLES.map((r) => [r, RoleSpec])) as Record<Role, typeof RoleSpec>),
});

export type StyleCard = z.infer<typeof StyleCardSchema>;

const STYLES_DIR = fileURLToPath(new URL('./styles/', import.meta.url));

export function listStyles(): string[] {
  return readdirSync(STYLES_DIR)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => f.replace(/\.yaml$/, ''))
    .sort();
}

const cache = new Map<string, StyleCard>();

export function loadStyle(id: string): StyleCard {
  const hit = cache.get(id);
  if (hit) return hit;
  const file = `${STYLES_DIR}${id}.yaml`;
  if (!/^[a-z0-9-]+$/.test(id) || !existsSync(file)) {
    throw new Error(`Unknown style card "${id}". Available: ${listStyles().join(', ')}`);
  }
  const card = StyleCardSchema.parse(parseYaml(readFileSync(file, 'utf8')));
  if (card.id !== id) throw new Error(`Style card ${file} declares id "${card.id}"`);
  cache.set(id, card);
  return card;
}

export function color(style: StyleCard, token: Token): string {
  return style.palette[token];
}

/** CSS for palette variables and role classes (`.r-body`, `.r-line`, …). */
export function styleCss(style: StyleCard): string {
  const vars = PALETTE_TOKENS.map((t) => `--${t}:${style.palette[t]}`).join(';');
  const rules = ROLES.map((role) => {
    const r = style.roles[role];
    const decl = [
      `fill:${r.fill === 'none' ? 'none' : style.palette[r.fill]}`,
      `stroke:${r.stroke === 'none' ? 'none' : style.palette[r.stroke]}`,
    ];
    if (r.stroke !== 'none') decl.push(`stroke-width:${round(style.stroke.width * r.width)}`);
    if (r.opacity !== undefined) decl.push(`opacity:${r.opacity}`);
    if (style.blend === 'multiply' && r.fill !== 'none' && r.fill !== 'paper' && r.fill !== 'bg') decl.push('mix-blend-mode:multiply');
    return `.r-${role}{${decl.join(';')}}`;
  });
  const base = `svg{${vars}}.el *{stroke-linecap:${style.stroke.linecap};stroke-linejoin:${style.stroke.linejoin}}`;
  const shadow =
    style.shadow === 'none' ? '' : `.el>.anim{filter:url(#${style.shadow === 'soft' ? 'shadow-soft' : 'shadow-hard'})}`;
  const textVariants = `.t-accent{fill:${style.palette.accent1};stroke:none}.t-paper{fill:${style.palette.paper};stroke:none}`;
  return base + rules.join('') + textVariants + shadow;
}

/** <defs> content required by the style (filters, patterns). Only local references are used. */
export function styleDefs(style: StyleCard): string {
  const defs: string[] = [];
  if (style.texture === 'grain') {
    // Paper grain: noise in a small tile, posterized to 3 alpha levels. Tiling and posterizing keep
    // the rendered PNG around 150 KB instead of ~2 MB (random noise does not compress).
    const T = GRAIN_TILE;
    defs.push(
      `<filter id="grain" x="0" y="0" width="${T}" height="${T}" filterUnits="userSpaceOnUse">` +
        '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" stitchTiles="stitch"/>' +
        `<feColorMatrix type="matrix" values="${grainMatrix(style.palette.ink)}"/>` +
        '<feComponentTransfer><feFuncA type="discrete" tableValues="0 0.45 0.9"/></feComponentTransfer>' +
        '</filter>' +
        `<pattern id="grain-tile" width="${T}" height="${T}" patternUnits="userSpaceOnUse"><rect width="${T}" height="${T}" filter="url(#grain)"/></pattern>`,
    );
  }
  if (style.shadow === 'soft') {
    defs.push(
      `<filter id="shadow-soft" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="${style.palette.ink}" flood-opacity="0.28"/></filter>`,
    );
  }
  if (style.shadow === 'hard') {
    defs.push(
      `<filter id="shadow-hard" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="8" dy="8" stdDeviation="0" flood-color="${style.palette.ink}" flood-opacity="0.9"/></filter>`,
    );
  }
  return defs.join('');
}

export const GRAIN_TILE = 216;

export function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Color matrix that turns turbulence into sparse specks of the ink color. */
function grainMatrix(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => round(parseInt(hex.slice(i, i + 2), 16) / 255, 3));
  return `0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  0 0 0 -2.2 1.25`;
}
