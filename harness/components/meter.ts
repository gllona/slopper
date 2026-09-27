import { z } from 'zod';
import { circle, group, line, rect, type ChannelState, type ComponentDef } from './types.ts';

const Props = z
  .object({
    level: z.number().min(0).max(1).default(0.5),
    kind: z.enum(['tank', 'bar', 'thermometer']).default('tank'),
    color: z.enum(['accent', 'body']).default('accent'),
  })
  .strict();
type Props = z.infer<typeof Props>;

/** A gauge (tank, horizontal bar, or thermometer). Floating. "set" animates the level. */
export const meter: ComponentDef<Props> = {
  name: 'meter',
  doc: 'Gauge whose level can rise or fall: tank (110×280 px), bar (320×70 px), thermometer (90×300 px). props: level (0..1), kind (tank|bar|thermometer), color (accent|body). Use "set" with {level} to animate.',
  grounded: false,
  props: Props,
  settable: ['level'],
  render(p, ctx) {
    const out: string[] = [];
    if (p.kind === 'bar') {
      const w = 320;
      const h = 70;
      out.push(rect(-w / 2, -h / 2, w, h, 'body-alt', h / 2));
      out.push(group(rect(-w / 2 + 12, -h / 2 + 12, w - 24, h - 24, p.color, (h - 24) / 2), { id: ctx.part('level') }));
      out.push(rect(-w / 2, -h / 2, w, h, 'line', h / 2));
      return { svg: out.join(''), box: { x: -w / 2 - 6, y: -h / 2 - 6, w: w + 12, h: h + 12 }, partOrigins: { level: '0% 50%' } };
    }
    if (p.kind === 'thermometer') {
      const w = 56;
      const h = 230;
      out.push(rect(-w / 2, -h / 2 - 20, w, h, 'body-alt', w / 2));
      out.push(circle(0, h / 2 + 10, 44, p.color));
      out.push(group(rect(-14, -h / 2 - 6, 28, h, p.color, 14), { id: ctx.part('level') }));
      for (let i = 0; i < 5; i++) out.push(line(w / 2 - 14, -h / 2 + 10 + i * 40, w / 2 - 2, -h / 2 + 10 + i * 40, 'thin'));
      return { svg: out.join(''), box: { x: -50, y: -h / 2 - 26, w: 100, h: h + 26 + 60 }, partOrigins: { level: '50% 100%' } };
    }
    const w = 110;
    const h = 280;
    out.push(rect(-w / 2, -h / 2, w, h, 'body-alt', 18));
    out.push(group(rect(-w / 2 + 12, -h / 2 + 12, w - 24, h - 24, p.color, 10), { id: ctx.part('level') }));
    for (let i = 1; i < 5; i++) out.push(line(w / 2 - 30, -h / 2 + (h * i) / 5, w / 2 - 8, -h / 2 + (h * i) / 5, 'line'));
    out.push(rect(-w / 2, -h / 2, w, h, 'line', 18));
    return { svg: out.join(''), box: { x: -w / 2 - 6, y: -h / 2 - 6, w: w + 12, h: h + 12 }, partOrigins: { level: '50% 100%' } };
  },
  states(p): Record<string, ChannelState> {
    const v = Math.max(0.001, p.level);
    return { level: { scale: p.kind === 'bar' ? [v, 1] : [1, v] } };
  },
};
