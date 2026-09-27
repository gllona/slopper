import { z } from 'zod';
import { faceStates, faces, MOODS } from './face.ts';
import { circle, group, line, type ComponentDef } from './types.ts';

const Props = z
  .object({
    mood: z.enum(['none', ...MOODS]).default('none'),
    rays: z.boolean().default(true),
    kind: z.enum(['sun', 'moon']).default('sun'),
  })
  .strict();
type Props = z.infer<typeof Props>;

/** Sun (or moon). Floating, ~300×300 px with rays. Rays are a part (ambient "pulse" or "spin" fit well). */
export const sun: ComponentDef<Props> = {
  name: 'sun',
  doc: 'Sun or moon, ~300×300 px with rays. props: mood (none|happy|…), rays (bool), kind (sun|moon). parts: rays.',
  grounded: false,
  props: Props,
  settable: ['mood'],
  render(p, ctx) {
    const R = 92;
    let svg = '';
    if (p.rays && p.kind === 'sun') {
      const rays: string[] = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        rays.push(line(Math.cos(a) * (R + 24), Math.sin(a) * (R + 24), Math.cos(a) * (R + 58), Math.sin(a) * (R + 58), 'line'));
      }
      svg += group(rays, { id: ctx.part('rays') });
    }
    if (p.kind === 'sun') {
      svg += circle(0, 0, R, 'accent');
    } else {
      svg += circle(0, 0, R, 'body-alt') + circle(-30, -24, 16, 'shade') + circle(24, 30, 22, 'shade') + circle(36, -30, 10, 'shade');
    }
    if (p.mood !== 'none') svg += faces(0, 6, 120, ctx, p.mood);
    const e = p.rays && p.kind === 'sun' ? R + 62 : R + 6;
    return { svg, box: { x: -e, y: -e, w: 2 * e, h: 2 * e }, partOrigins: { rays: '50% 50%' } };
  },
  states: (p, ctx) => (p.mood === 'none' ? {} : faceStates(p.mood, ctx)),
};
