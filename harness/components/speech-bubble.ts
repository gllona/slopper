import { z } from 'zod';
import { textPath, wrapText } from '../fonts.ts';
import { circle, ellipse, n, path, poly, roundRectPath, type ComponentDef } from './types.ts';

const Props = z
  .object({
    text: z.string().trim().min(1).max(40),
    kind: z.enum(['speech', 'thought', 'shout']).default('speech'),
    tail: z.enum(['bottom-left', 'bottom', 'bottom-right', 'left', 'right', 'none']).default('bottom-left'),
    size: z.enum(['sm', 'md', 'lg']).default('md'),
  })
  .strict();
type Props = z.infer<typeof Props>;

/** A speech, thought, or shout bubble with short text (counts against the word limit). Floating. */
export const speechBubble: ComponentDef<Props> = {
  name: 'speech-bubble',
  doc: 'Speech/thought/shout bubble with short text (counts against the 6-word limit). props: text, kind (speech|thought|shout), tail (bottom-left|bottom|bottom-right|left|right|none; the tail points at the speaker), size (sm 34px|md 44px|lg 58px). Tip: attachTo the speaker with side "top".',
  grounded: false,
  props: Props,
  render(p, ctx) {
    const size = { sm: 34, md: 44, lg: 58 }[p.size];
    const lines = wrapText(p.text, ctx.style.font, size, 380);
    const lh = size * 1.12;
    const widths = lines.map((l) => textPath(l, ctx.style.font, size).width);
    const tw = Math.max(...widths);
    const th = size * 0.72 + lh * (lines.length - 1);
    const padX = size * 0.75;
    const padY = size * 0.6;
    const w = tw + 2 * padX;
    const h = th + 2 * padY;
    const x = -w / 2;
    const y = -h / 2;
    const out: string[] = [];

    const tailLen = 54;
    const tailPts = tailPoints(p.tail, w, h, tailLen);
    const body = p.kind === 'shout' ? shoutPath(w, h) : roundRectPath(x, y, w, h, p.kind === 'thought' ? h / 2 : Math.min(28, h / 3));

    if (p.kind === 'thought') {
      // the trail of small circles instead of a tail
      if (tailPts) {
        const a = tailPts[0]!;
        const tip = tailPts[1]!;
        const mid: [number, number] = [(a[0] + tip[0]) / 2, (a[1] + tip[1]) / 2];
        out.push(circle(mid[0], mid[1], 13, 'paper'), circle(tip[0], tip[1], 8, 'paper'));
      }
      out.push(ellipse(0, 0, w / 2 + 8, h / 2 + 6, 'paper'));
    } else {
      if (tailPts) out.push(path(poly(tailPts), 'paper'));
      out.push(path(body, 'paper'));
      // cover the bubble outline where the tail joins
      if (tailPts) out.push(path(poly(tailPts), 'paper', { style: 'stroke:none' }));
    }

    lines.forEach((l, i) => {
      const t = textPath(l, ctx.style.font, size);
      const tx = -t.width / 2;
      const ty = -th / 2 + size * 0.72 + i * lh;
      out.push(`<path class="r-text" d="${t.d}" transform="translate(${n(tx)} ${n(ty)})"/>`);
    });

    const ext = tailPts ? tailLen + 6 : 6;
    const box = {
      x: x - (p.tail === 'left' ? ext : 6) - (p.kind === 'shout' ? 18 : 0),
      y: y - 6 - (p.kind === 'shout' ? 18 : 0),
      w: w + 12 + (p.tail === 'left' || p.tail === 'right' ? ext : 0) + (p.kind === 'shout' ? 36 : 0),
      h: h + 12 + (p.tail.startsWith('bottom') ? ext : 0) + (p.kind === 'shout' ? 36 : 0),
    };
    return { svg: out.join(''), box, words: p.text.split(/\s+/).filter(Boolean).length };
  },
};

function tailPoints(tail: Props['tail'], w: number, h: number, len: number): [number, number][] | null {
  const hw = w / 2;
  const hh = h / 2;
  const inset = 4; // start inside the bubble so the fill covers the join
  switch (tail) {
    case 'none':
      return null;
    case 'bottom-left':
      return [[-hw * 0.45, hh - inset], [-hw * 0.6, hh + len], [-hw * 0.15, hh - inset]];
    case 'bottom':
      return [[-22, hh - inset], [0, hh + len], [22, hh - inset]];
    case 'bottom-right':
      return [[hw * 0.15, hh - inset], [hw * 0.6, hh + len], [hw * 0.45, hh - inset]];
    case 'left':
      return [[-hw + inset, -18], [-hw - len, 10], [-hw + inset, 18]];
    case 'right':
      return [[hw - inset, -18], [hw + len, 10], [hw - inset, 18]];
  }
}

function shoutPath(w: number, h: number): string {
  const pts: [number, number][] = [];
  const spikes = 18;
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const out = i % 2 === 0 ? 1.18 : 1;
    pts.push([(Math.cos(a) * (w / 2) * out) / 0.96, (Math.sin(a) * (h / 2) * out) / 0.9]);
  }
  return poly(pts);
}
