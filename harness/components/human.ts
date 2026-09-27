import { z } from 'zod';
import { faceStates, faces, MoodSchema } from './face.ts';
import { circle, group, line, path, rect, roundRectPath, type ComponentDef } from './types.ts';

const Props = z
  .object({
    mood: MoodSchema.default('neutral'),
    pose: z.enum(['stand', 'cheer', 'point', 'shrug', 'sit']).default('stand'),
    color: z.enum(['body', 'accent']).default('accent'),
    kind: z.enum(['adult', 'child']).default('adult'),
    holds: z.enum(['none', 'phone', 'laptop', 'book', 'coffee', 'sign']).default('none'),
  })
  .strict();
type Props = z.infer<typeof Props>;

/**
 * A generic person: round head, simple body. Never a likeness of a real person (DESIGN §9.4).
 * About 200×420 px at scale 1 (a child is 75%). Grounded.
 */
export const human: ComponentDef<Props> = {
  name: 'human',
  doc: 'Generic person (never a real likeness), ~200×420 px (child 75%). props: mood (happy|neutral|worried|exhausted|proud|surprised|sad), pose (stand|cheer|point|shrug|sit), color (accent|body), kind (adult|child), holds (none|phone|laptop|book|coffee|sign). actions: wave.',
  grounded: true,
  props: Props,
  settable: ['mood'],
  render(p, ctx) {
    const k = p.kind === 'child' ? 0.75 : 1;
    const sit = p.pose === 'sit';
    const hip = sit ? -120 : -150;
    const shoulder = hip - 150;
    const headY = shoulder - 64;
    const parts: string[] = [];

    // stool when sitting
    if (sit) {
      parts.push(rect(-70, hip + 8, 120, 18, 'body-alt', 6));
      parts.push(line(-50, hip + 26, -58, 0, 'line'));
      parts.push(line(30, hip + 26, 38, 0, 'line'));
    }
    // legs
    if (sit) {
      parts.push(path(`M-34 ${hip}h84v34h-84z`, 'ink'));
      parts.push(rect(20, hip + 10, 30, hip * -1 - 10, 'ink', 12));
      parts.push(path(roundRectPath(16, -20, 64, 20, 10), 'ink'));
    } else {
      parts.push(rect(-44, hip, 36, -hip - 8, 'ink', 14));
      parts.push(rect(8, hip, 36, -hip - 8, 'ink', 14));
      parts.push(path(roundRectPath(-62, -20, 58, 20, 10), 'ink'));
      parts.push(path(roundRectPath(4, -20, 58, 20, 10), 'ink'));
    }

    const armAngles: Record<Props['pose'], [number, number]> = {
      stand: [8, 8],
      sit: [20, 20],
      cheer: [150, 150],
      point: [8, 90],
      shrug: [55, 55],
    };
    const [al, ar] = armAngles[p.pose];
    const arm = (side: -1 | 1, angle: number) =>
      group(
        group([rect(-15, 0, 30, 130, p.color, 15), circle(0, 138, 16, 'body-alt')], { id: ctx.part(side === 1 ? 'arm-r' : 'arm-l') }),
        { transform: `translate(${side * 66} ${shoulder + 16}) rotate(${-side * angle})` },
      );
    const raised = p.pose === 'cheer' || p.pose === 'shrug';

    const torso = path(
      `M${-70} ${shoulder + 24}Q${-70} ${shoulder} ${-46} ${shoulder}H46Q70 ${shoulder} 70 ${shoulder + 24}L78 ${hip + 12}Q78 ${hip + 22} 66 ${hip + 22}H-66Q-78 ${hip + 22} -78 ${hip + 12}Z`,
      p.color,
    );
    const neck = rect(-16, shoulder - 18, 32, 24, 'body-alt', 6);
    const head = circle(0, headY, 58, 'body-alt') + faces(0, headY + 4, 86, ctx, p.mood);
    const hair = path(`M-58 ${headY - 4}Q-56 ${headY - 66} 0 ${headY - 62}Q56 ${headY - 66} 58 ${headY - 4}Q30 ${headY - 34} -58 ${headY - 4}Z`, 'ink');

    let item = '';
    const hx = 66 + 60;
    const hy = hip - 10;
    switch (p.holds) {
      case 'phone':
        item = path(roundRectPath(hx - 20, hy - 60, 40, 70, 8), 'ink') + rect(hx - 13, hy - 52, 26, 48, 'glow', 4);
        break;
      case 'laptop':
        item = path(`M-80 ${hip - 60}h160l-18 -86h-124z`, 'body-alt') + rect(-96, hip - 64, 192, 14, 'ink', 6);
        break;
      case 'book':
        item = path(`M-60 ${hip - 92}l60 14l60 -14v84l-60 14l-60 -14z`, 'paper') + line(0, hip - 78, 0, hip + 6, 'line');
        break;
      case 'coffee':
        item = path(`M${hx - 24} ${hy - 50}h48l-6 60h-36z`, 'paper') + path(`M${hx + 22} ${hy - 36}q20 4 14 24q-4 8 -16 6`, 'line');
        break;
      case 'sign':
        item = rect(hx - 6, shoulder - 150, 12, 260, 'body-alt', 4) + rect(hx - 90, shoulder - 170, 180, 110, 'paper', 10);
        break;
    }

    const arms = arm(-1, al) + arm(1, ar);
    const front = p.holds === 'laptop' || p.holds === 'book';
    parts.push(...(raised ? [torso, neck, hair, head, arms] : [arms, torso, neck, hair, head]));
    if (item) parts.push(front ? item : item);

    const top = headY - 70 - (p.holds === 'sign' ? 110 : 0) - (p.pose === 'cheer' ? 30 : 0);
    const reach = p.pose === 'point' ? 230 : p.holds === 'sign' ? 160 : p.pose === 'shrug' ? 190 : 120;
    return {
      svg: k === 1 ? parts.join('') : group(parts, { transform: `scale(${k})` }),
      box: { x: -reach * k, y: top * k, w: reach * 2 * k, h: -top * k },
      partOrigins: { 'arm-r': '50% 6%', 'arm-l': '50% 6%' },
    };
  },
  states: (p, ctx) => faceStates(p.mood, ctx),
  actions: {
    wave: {
      doc: 'waves the right arm three times',
      dur: 1.2,
      oscillate: 3,
      tracks: () => [{ part: 'arm-r', from: { rotate: 0 }, to: { rotate: -30 } }],
    },
  },
};
