import { z } from 'zod';
import { faceStates, faces, MOODS } from './face.ts';
import { circle, group, n, path, type ComponentDef } from './types.ts';

const Props = z
  .object({
    mood: z.enum(['none', ...MOODS]).default('none'),
    rain: z.boolean().default(false),
    dark: z.boolean().default(false),
    size: z.enum(['sm', 'md', 'lg']).default('md'),
  })
  .strict();
type Props = z.infer<typeof Props>;

const BUMPS: [number, number, number][] = [
  [-110, 10, 62],
  [-45, -34, 82],
  [45, -48, 92],
  [118, 4, 66],
];

/** A puffy cloud (weather, or "the cloud"). Floating, ~360×210 px at md. */
export const cloud: ComponentDef<Props> = {
  name: 'cloud',
  doc: 'Puffy cloud (weather or "the cloud"), ~360×210 px at md (sm 70%, lg 140%). props: mood (none|happy|neutral|worried|exhausted|proud|surprised|sad), rain (bool), dark (bool), size (sm|md|lg). parts: rain.',
  grounded: false,
  props: Props,
  settable: ['mood'],
  render(p, ctx) {
    const k = { sm: 0.7, md: 1, lg: 1.4 }[p.size];
    const role = p.dark ? 'body' : 'body-alt';
    const sw = ctx.stroke * 2;
    const base = `M-160 ${n(40)}Q-172 66 -140 70H140Q172 66 160 40Z`;
    // outline layer (thick strokes), then fill-only layer on top hides inner strokes → one clean silhouette
    const outline = BUMPS.map(([x, y, r]) => circle(x, y, r, role, { style: `stroke-width:${sw}` })).join('') + path(base, role, { style: `stroke-width:${sw}` });
    const fill = BUMPS.map(([x, y, r]) => circle(x, y, r, role, { style: 'stroke:none' })).join('') + path(`M-150 20H150V68H-150Z`, role, { style: 'stroke:none' });
    let svg = outline + fill;
    if (p.mood !== 'none') svg += faces(0, 4, 110, ctx, p.mood);
    let bottom = 72;
    if (p.rain) {
      const drops = [-110, -55, 0, 55, 110].map((x, i) =>
        path(`M${x} ${100 + (i % 2) * 26}q-10 18 0 26q10 -8 0 -26z`, 'accent'),
      );
      svg += group(drops, { id: ctx.part('rain') });
      bottom = 160;
    }
    return {
      svg: k === 1 ? svg : group(svg, { transform: `scale(${k})` }),
      box: { x: -178 * k, y: -148 * k, w: 356 * k, h: (bottom + 148) * k },
      partOrigins: { rain: '50% 0%' },
    };
  },
  states: (p, ctx) => (p.mood === 'none' ? {} : faceStates(p.mood, ctx)),
};
