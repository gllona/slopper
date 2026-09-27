import type { z } from 'zod';
import type { Box } from '../layout.ts';
import type { Role, StyleCard } from '../style.ts';

/**
 * A component is a parameterized drawing (DESIGN §9.4): (props, style, box) → SVG group.
 * Components draw in local coordinates around an origin:
 *   - grounded components: origin at bottom-center (they stand on the ground line);
 *   - floating components: origin at their center.
 * They use style roles (`r-body`, `r-line`, …) only — never literal colors.
 */

/** Animatable state of one part (or of the whole element). Final values are also the static CSS. */
export interface ChannelState {
  opacity?: number;
  translate?: [number, number];
  rotate?: number;
  scale?: [number, number];
  /** Fraction of a stroke drawn (0..1); only on parts drawn with pathLength="1". */
  draw?: number;
}

export interface RenderCtx {
  style: StyleCard;
  /** Stroke width of the style card. */
  stroke: number;
  /** DOM id for a named part of this element (for animation). */
  part(name: string): string;
  /** All values a prop takes during the scene (initial props + `set` beats), e.g. every mood used. */
  used(prop: string): Set<unknown>;
}

export interface Rendered {
  svg: string;
  /** Local bounding box at scale 1 (relative to the origin). */
  box: Box;
  /** Number of words of text drawn (counted against maxWordsInArt). */
  words?: number;
  /** CSS transform-origin for animatable parts, e.g. { 'arm-r': '50% 8%' }. */
  partOrigins?: Record<string, string>;
}

export interface PartTrack {
  part: string;
  from: ChannelState;
  to: ChannelState;
}

export interface ComponentAction<P> {
  doc: string;
  /** Default duration in seconds. */
  dur: number;
  /** Go from → to → from this many times (ends at `from`); otherwise a one-way change. */
  oscillate?: number;
  tracks(props: P): PartTrack[];
}

export interface ComponentDef<P = Record<string, unknown>> {
  name: string;
  /** One-line description for the Art prompt. */
  doc: string;
  grounded: boolean;
  props: z.ZodType<P>;
  /** Props that may change over time with a `set` beat. */
  settable?: readonly string[];
  render(props: P, ctx: RenderCtx): Rendered;
  /** Part states implied by props (used for `set` beats and for the static final frame). */
  states?(props: P, ctx: Pick<RenderCtx, 'used'>): Record<string, ChannelState>;
  /** Component-specific actions (e.g. robot `wave`), as part tracks. */
  actions?: Record<string, ComponentAction<P>>;
}

// ---------- tiny SVG builders (roles only, numbers rounded) ----------

export const n = (v: number): string => String(Math.round(v * 10) / 10);

function attrs(extra?: Record<string, string | number | undefined>): string {
  if (!extra) return '';
  return Object.entries(extra)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${typeof v === 'number' ? n(v) : v}"`)
    .join('');
}

export function cls(role: Role): string {
  return `r-${role}`;
}

export function rect(x: number, y: number, w: number, h: number, role: Role, rx = 0, extra?: Record<string, string | number | undefined>): string {
  return `<rect class="${cls(role)}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${rx ? ` rx="${n(rx)}"` : ''}${attrs(extra)}/>`;
}

export function circle(cx: number, cy: number, r: number, role: Role, extra?: Record<string, string | number | undefined>): string {
  return `<circle class="${cls(role)}" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"${attrs(extra)}/>`;
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, role: Role, extra?: Record<string, string | number | undefined>): string {
  return `<ellipse class="${cls(role)}" cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}"${attrs(extra)}/>`;
}

export function path(d: string, role: Role, extra?: Record<string, string | number | undefined>): string {
  return `<path class="${cls(role)}" d="${d}"${attrs(extra)}/>`;
}

export function line(x1: number, y1: number, x2: number, y2: number, role: Role = 'line', extra?: Record<string, string | number | undefined>): string {
  return `<path class="${cls(role)}" d="M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}"${attrs(extra)}/>`;
}

export function group(children: string | string[], extra?: Record<string, string | number | undefined>): string {
  return `<g${attrs(extra)}>${Array.isArray(children) ? children.join('') : children}</g>`;
}

/** Path data for a polygon/polyline through points. */
export function poly(points: [number, number][], close = true): string {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join('') + (close ? 'Z' : '');
}

/** Rounded-corner rectangle as a path (so it can be combined or clipped). */
export function roundRectPath(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.min(r, w / 2, h / 2);
  return (
    `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}V${n(y + h - r)}` +
    `A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}` +
    `V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`
  );
}
