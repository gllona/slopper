import { z } from 'zod';
import { circle, ellipse, group, line, path, rect, type ComponentDef } from './types.ts';

const Props = z
  .object({
    racks: z.number().int().min(2).max(6).default(3),
    lights: z.enum(['on', 'busy', 'off']).default('on'),
    steam: z.boolean().default(false),
    fans: z.boolean().default(true),
  })
  .strict();
type Props = z.infer<typeof Props>;

const RACK_W = 78;
const HEIGHT = 330;

/** A datacenter building with server racks behind glass. Width grows with `racks`. Grounded. */
export const datacenter: ComponentDef<Props> = {
  name: 'datacenter',
  doc: 'Datacenter building with server racks, ~(racks×78+60)×330 px (+steam). props: racks (2–6), lights (on|busy|off), steam (bool), fans (bool). attach points: top (roof), right, left. parts: lights (use ambient "blink"), steam.',
  grounded: true,
  props: Props,
  render(p, ctx) {
    const w = p.racks * RACK_W + 60;
    const x0 = -w / 2;
    const parts: string[] = [];
    // building shell + roof band
    parts.push(rect(x0, -HEIGHT, w, HEIGHT, 'body', 10));
    parts.push(rect(x0 - 12, -HEIGHT - 26, w + 24, 34, 'body-alt', 8));
    // rack windows
    const lights: string[] = [];
    for (let i = 0; i < p.racks; i++) {
      const rx = x0 + 30 + i * RACK_W + 6;
      parts.push(rect(rx, -HEIGHT + 40, RACK_W - 12, HEIGHT - 80, 'paper', 6));
      for (let j = 0; j < 7; j++) {
        const ry = -HEIGHT + 56 + j * 30;
        parts.push(line(rx + 10, ry + 12, rx + RACK_W - 40, ry + 12, 'thin'));
        if (p.lights !== 'off') {
          const on = p.lights === 'on' || (i * 7 + j * 3) % 4 !== 0;
          if (on) lights.push(circle(rx + RACK_W - 26, ry + 12, 5.5, (i + j) % 3 === 0 ? 'accent' : 'ink'));
        }
      }
    }
    parts.push(group(lights, { id: ctx.part('lights') }));
    // door
    parts.push(rect(x0 + w - 50, -64, 30, 64, 'body-alt', 4));
    // roof fans
    if (p.fans) {
      for (const fx of [x0 + w * 0.3, x0 + w * 0.7]) {
        parts.push(rect(fx - 34, -HEIGHT - 58, 68, 32, 'body-alt', 6));
        parts.push(ellipse(fx, -HEIGHT - 58, 30, 8, 'line'));
      }
    }
    let top = -HEIGHT - (p.fans ? 66 : 30);
    if (p.steam) {
      const sx = x0 + w * 0.3;
      const puffs = [
        [0, -30, 30],
        [26, -70, 38],
        [-10, -118, 44],
        [30, -160, 34],
      ] as const;
      parts.push(
        group(
          puffs.map(([dx, dy, r]) => circle(sx + dx, -HEIGHT - 58 + dy, r, 'glow')),
          { id: ctx.part('steam') },
        ),
      );
      top = -HEIGHT - 58 - 160 - 34;
    }
    // ground shadow line
    parts.unshift(path(`M${x0 - 24} 0H${x0 + w + 24}`, 'line'));
    return {
      svg: parts.join(''),
      box: { x: x0 - 24, y: top, w: w + 48, h: -top },
      partOrigins: { steam: '50% 100%', lights: '50% 50%' },
    };
  },
};
