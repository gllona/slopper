import { z } from 'zod';
import { circle, group, line, n, path, poly, rect, type ChannelState, type ComponentDef } from './types.ts';

const Props = z
  .object({
    type: z.enum(['line', 'bar']).default('line'),
    values: z.array(z.number().min(0).max(1)).min(2).max(10).default([0.2, 0.35, 0.3, 0.55, 0.9]),
    highlight: z.enum(['none', 'last', 'max']).default('last'),
    arrow: z.boolean().default(true),
    frame: z.boolean().default(true),
  })
  .strict();
type Props = z.infer<typeof Props>;

const W = 420;
const H = 300;
const PAD = 40;

/** A simple chart on a board. Floating, 420×300 px. Values are 0..1. */
export const chart: ComponentDef<Props> = {
  name: 'chart',
  doc: 'Simple chart on a board, 420×300 px. props: type (line|bar), values (2–10 numbers 0..1), highlight (none|last|max), arrow (bool, line only), frame (bool). actions: draw (line draws itself). "set" can change bar values.',
  grounded: false,
  props: Props,
  settable: ['values'],
  render(p, ctx) {
    const x0 = -W / 2 + PAD;
    const y0 = H / 2 - PAD;
    const cw = W - 2 * PAD;
    const ch = H - 2 * PAD - 10;
    const out: string[] = [];
    if (p.frame) out.push(rect(-W / 2, -H / 2, W, H, 'body-alt', ctx.style.corner));
    for (let i = 1; i <= 3; i++) out.push(line(x0, y0 - (ch * i) / 3, x0 + cw, y0 - (ch * i) / 3, 'thin'));
    out.push(line(x0, y0 - ch - 6, x0, y0, 'line') + line(x0, y0, x0 + cw, y0, 'line'));
    const hi = p.highlight === 'last' ? p.values.length - 1 : p.highlight === 'max' ? p.values.indexOf(Math.max(...p.values)) : -1;

    if (p.type === 'bar') {
      const slot = cw / p.values.length;
      const bw = slot * 0.62;
      p.values.forEach((_, i) => {
        const x = x0 + slot * i + (slot - bw) / 2;
        // bars are drawn full height; their height comes from the part's scale (so "set" can animate it)
        out.push(group(rect(x, y0 - ch, bw, ch, i === hi ? 'accent' : 'body', 4), { id: ctx.part(`bar-${i}`) }));
      });
    } else {
      const pts: [number, number][] = p.values.map((v, i) => [x0 + 12 + ((cw - 24) * i) / (p.values.length - 1), y0 - v * ch]);
      out.push(`<path id="${ctx.part('line')}" class="r-line" d="${poly(pts, false)}" pathLength="1" style="stroke-width:${n(ctx.stroke * 1.4)}"/>`);
      const dots = pts.map(([x, y], i) => circle(x, y, i === hi ? 13 : 8, i === hi ? 'accent' : 'ink'));
      out.push(group(dots, { id: ctx.part('dots') }));
      if (p.arrow && pts.length >= 2) {
        const [xa, ya] = pts.at(-2)!;
        const [xb, yb] = pts.at(-1)!;
        const a = Math.atan2(yb - ya, xb - xa);
        const L = 34;
        const tip: [number, number] = [xb + Math.cos(a) * 30, yb + Math.sin(a) * 30];
        const left: [number, number] = [tip[0] - Math.cos(a - 0.5) * L, tip[1] - Math.sin(a - 0.5) * L];
        const right: [number, number] = [tip[0] - Math.cos(a + 0.5) * L, tip[1] - Math.sin(a + 0.5) * L];
        out.push(group(path(poly([left, tip, right]), 'accent'), { id: ctx.part('arrow') }));
      }
    }
    return {
      svg: out.join(''),
      box: { x: -W / 2 - 10, y: -H / 2 - 30, w: W + 50, h: H + 30 },
      partOrigins: Object.fromEntries(p.values.map((_, i) => [`bar-${i}`, '50% 100%'])),
    };
  },
  states(p) {
    if (p.type !== 'bar') return {};
    const out: Record<string, ChannelState> = {};
    p.values.forEach((v, i) => (out[`bar-${i}`] = { scale: [1, Math.max(0.02, v)] }));
    return out;
  },
  actions: {
    draw: {
      doc: 'the line draws itself from left to right, then the dots and arrow appear',
      dur: 1.6,
      tracks: () => [
        { part: 'line', from: { draw: 0 }, to: { draw: 1 } },
        { part: 'dots', from: { opacity: 0 }, to: { opacity: 1 } },
        { part: 'arrow', from: { opacity: 0 }, to: { opacity: 1 } },
      ],
    },
  },
};
