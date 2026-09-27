import { z } from 'zod';
import { circle, group, n, path, type ChannelState, type RenderCtx } from './types.ts';

export const MOODS = ['happy', 'neutral', 'worried', 'exhausted', 'proud', 'surprised', 'sad'] as const;
export const MoodSchema = z.enum(MOODS);
export type Mood = z.infer<typeof MoodSchema>;

/**
 * A simple, readable face centered at (cx, cy); `u` is the face width.
 * Every mood used in the scene is drawn in its own part (`face-<mood>`), and only the
 * current one is visible, so a `set` beat can switch moods.
 */
export function faces(cx: number, cy: number, u: number, ctx: RenderCtx, fallback: Mood): string {
  const used = [...ctx.used('mood')].filter((m): m is Mood => MoodSchema.safeParse(m).success);
  const moods = used.length ? used : [fallback];
  return moods.map((m) => group(face(m, cx, cy, u), { id: ctx.part(`face-${m}`) })).join('');
}

export function faceStates(mood: Mood, ctx: { used(prop: string): Set<unknown> }): Record<string, ChannelState> {
  const out: Record<string, ChannelState> = {};
  for (const m of ctx.used('mood')) if (typeof m === 'string') out[`face-${m}`] = { opacity: m === mood ? 1 : 0 };
  return out;
}

function face(mood: Mood, cx: number, cy: number, u: number): string {
  const ex = u * 0.22; // eye x offset
  const ey = cy - u * 0.08; // eye y
  const er = u * 0.07; // eye radius
  const my = cy + u * 0.2; // mouth y
  const mw = u * 0.22; // mouth half width
  const eyeDots = circle(cx - ex, ey, er, 'ink') + circle(cx + ex, ey, er, 'ink');
  const arc = (x: number, y: number, w: number, bend: number) => `M${n(x - w)} ${n(y)}Q${n(x)} ${n(y + bend)} ${n(x + w)} ${n(y)}`;
  switch (mood) {
    case 'happy':
      return (
        path(arc(cx - ex, ey + er * 0.6, er * 1.3, -er * 2.4), 'line') +
        path(arc(cx + ex, ey + er * 0.6, er * 1.3, -er * 2.4), 'line') +
        path(arc(cx, my - u * 0.04, mw, u * 0.2), 'line')
      );
    case 'proud':
      return (
        path(arc(cx - ex, ey, er * 1.3, -er * 2), 'line') +
        path(arc(cx + ex, ey, er * 1.3, -er * 2), 'line') +
        path(`M${n(cx - mw * 1.2)} ${n(my - u * 0.06)}Q${n(cx)} ${n(my + u * 0.24)} ${n(cx + mw * 1.2)} ${n(my - u * 0.06)}Z`, 'ink') +
        circle(cx - ex * 1.55, my - u * 0.05, er * 1.2, 'glow') +
        circle(cx + ex * 1.55, my - u * 0.05, er * 1.2, 'glow')
      );
    case 'neutral':
      return eyeDots + path(`M${n(cx - mw * 0.8)} ${n(my)}H${n(cx + mw * 0.8)}`, 'line');
    case 'worried':
      return (
        eyeDots +
        path(`M${n(cx - ex - er * 1.6)} ${n(ey - er * 2.2)}L${n(cx - ex + er * 1.4)} ${n(ey - er * 3.2)}`, 'line') +
        path(`M${n(cx + ex + er * 1.6)} ${n(ey - er * 2.2)}L${n(cx + ex - er * 1.4)} ${n(ey - er * 3.2)}`, 'line') +
        path(
          `M${n(cx - mw)} ${n(my)}q${n(mw / 4)} ${n(-u * 0.05)} ${n(mw / 2)} 0t${n(mw / 2)} 0t${n(mw / 2)} 0t${n(mw / 2)} 0`,
          'line',
        )
      );
    case 'exhausted':
      return (
        path(`M${n(cx - ex - er * 1.4)} ${n(ey)}H${n(cx - ex + er * 1.4)}`, 'line') +
        path(`M${n(cx + ex - er * 1.4)} ${n(ey)}H${n(cx + ex + er * 1.4)}`, 'line') +
        path(arc(cx - ex, ey + er * 0.2, er * 1.2, er * 1.6), 'ink') +
        path(arc(cx + ex, ey + er * 0.2, er * 1.2, er * 1.6), 'ink') +
        path(arc(cx, my + u * 0.04, mw * 0.8, -u * 0.1), 'line') +
        path(
          `M${n(cx + u * 0.4)} ${n(cy - u * 0.3)}q${n(u * 0.07)} ${n(u * 0.12)} 0 ${n(u * 0.16)}q${n(-u * 0.07)} ${n(-u * 0.04)} 0 ${n(-u * 0.16)}Z`,
          'accent-2',
        )
      );
    case 'surprised':
      return (
        circle(cx - ex, ey, er * 1.6, 'paper') +
        circle(cx + ex, ey, er * 1.6, 'paper') +
        circle(cx - ex, ey, er * 0.7, 'ink') +
        circle(cx + ex, ey, er * 0.7, 'ink') +
        circle(cx, my + u * 0.02, u * 0.08, 'ink')
      );
    case 'sad':
      return eyeDots + path(arc(cx, my + u * 0.05, mw * 0.9, -u * 0.14), 'line');
  }
}
