import { z } from 'zod';
import { faceStates, faces, MoodSchema } from './face.ts';
import { circle, group, line, rect, roundRectPath, path, type ComponentDef } from './types.ts';

const Props = z
  .object({
    mood: MoodSchema.default('neutral'),
    arms: z.enum(['down', 'up', 'out']).default('down'),
    color: z.enum(['body', 'accent']).default('body'),
    antenna: z.boolean().default(true),
  })
  .strict();
type Props = z.infer<typeof Props>;

/** A friendly box robot, about 220×450 px at scale 1. Standing on the ground (origin bottom-center). */
export const robot: ComponentDef<Props> = {
  name: 'robot',
  doc: 'Friendly box robot with a screen face, ~220×450 px. props: mood (happy|neutral|worried|exhausted|proud|surprised|sad), arms (down|up|out), color (body|accent), antenna (bool). actions: wave.',
  grounded: true,
  props: Props,
  settable: ['mood'],
  render(p, ctx) {
    const s = ctx.stroke;
    const armAngle = { down: 0, up: 160, out: 75 }[p.arms];
    const arm = (side: -1 | 1) =>
      group(
        group([rect(-16, 0, 32, 120, 'body-alt', 16), circle(0, 132, 22, p.color === 'accent' ? 'body' : 'accent')], {
          id: ctx.part(side === 1 ? 'arm-r' : 'arm-l'),
        }),
        { transform: `translate(${side * 104} -238) rotate(${-side * armAngle})` },
      );
    const legs =
      rect(-62, -96, 40, 90, 'body-alt', 12) +
      rect(22, -96, 40, 90, 'body-alt', 12) +
      path(roundRectPath(-80, -22, 70, 22, 11), 'ink') +
      path(roundRectPath(10, -22, 70, 22, 11), 'ink');
    const torso =
      rect(-92, -262, 184, 172, p.color, 22) +
      rect(-56, -226, 112, 70, 'paper', 12) +
      circle(-30, -191, 10, 'accent') +
      circle(0, -191, 10, 'accent-2') +
      circle(30, -191, 10, 'ink') +
      line(-50, -128, 50, -128, 'thin');
    const neck = rect(-22, -284, 44, 26, 'body-alt', 6);
    const head =
      rect(-86, -420, 172, 140, 'body-alt', 26) +
      rect(-66, -402, 132, 104, 'paper', 18) +
      faces(0, -350, 118, ctx, p.mood) +
      circle(-98, -350, 12, p.color) +
      circle(98, -350, 12, p.color);
    const antenna = p.antenna
      ? group([line(0, -420, 0, -466), circle(0, -474, 13, 'accent')], { id: ctx.part('antenna') })
      : '';
    // Arms behind the torso when down, in front when raised.
    const svg = p.arms === 'down' ? legs + arm(-1) + arm(1) + torso + neck + head + antenna : legs + torso + neck + head + antenna + arm(-1) + arm(1);
    const top = p.antenna ? -490 - s : -420 - s;
    const reach = { down: 130, up: 160, out: 256 }[p.arms];
    return {
      svg,
      box: { x: -reach, y: top, w: reach * 2, h: -top },
      partOrigins: { 'arm-r': '50% 6%', 'arm-l': '50% 6%', antenna: '50% 100%' },
    };
  },
  states: (p, ctx) => faceStates(p.mood, ctx),
  actions: {
    wave: {
      doc: 'waves the right arm three times',
      dur: 1.2,
      oscillate: 3,
      tracks: () => [{ part: 'arm-r', from: { rotate: 0 }, to: { rotate: -28 } }],
    },
  },
};
