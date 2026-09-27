import { z } from 'zod';
import { textPath } from '../fonts.ts';
import { group, n, path, rect, roundRectPath, type ComponentDef } from './types.ts';

export const LABEL_SIZES = { sm: 34, md: 46, lg: 68, xl: 104 } as const;

const Props = z
  .object({
    text: z.string().trim().min(1).max(40),
    size: z.enum(['sm', 'md', 'lg', 'xl']).default('md'),
    kind: z.enum(['plain', 'tag', 'sign']).default('plain'),
    color: z.enum(['text', 'accent', 'paper']).default('text'),
  })
  .strict();
type Props = z.infer<typeof Props>;

/** A short text label, drawn as paths in the style card's font. Centered on its origin. */
export const label: ComponentDef<Props> = {
  name: 'label',
  doc: 'Short text label (counts against the 6-word limit). props: text, size (sm 34px|md 46px|lg 68px|xl 104px), kind (plain|tag = pill|sign = board on a post, grounded look), color (text|accent|paper).',
  grounded: false,
  props: Props,
  render(p, ctx) {
    const size = LABEL_SIZES[p.size];
    const t = textPath(p.text, ctx.style.font, size, size * 0.02);
    const capH = size * 0.7;
    // center the text box (baseline-to-cap height) on the origin
    const tx = -t.width / 2;
    const ty = capH / 2;
    const textClass = p.kind === 'plain' && p.color !== 'text' ? `t-${p.color}` : 'r-text';
    const glyphs = `<path class="${textClass}" d="${t.d}" transform="translate(${n(tx)} ${n(ty)})"/>`;
    const words = p.text.split(/\s+/).filter(Boolean).length;
    if (p.kind === 'plain') {
      return { svg: glyphs, box: { x: tx, y: -capH / 2, w: t.width, h: capH + size * 0.25 }, words };
    }
    const padX = size * 0.55;
    const padY = size * 0.42;
    const bw = t.width + padX * 2;
    const bh = capH + padY * 2;
    const bgRole = p.color === 'accent' ? 'accent' : p.color === 'paper' ? 'paper' : 'body-alt';
    if (p.kind === 'tag') {
      return {
        svg: path(roundRectPath(-bw / 2, -bh / 2, bw, bh, bh / 2), bgRole) + glyphs,
        box: { x: -bw / 2, y: -bh / 2, w: bw, h: bh },
        words,
      };
    }
    // sign: board on a post; the post extends below
    const post = size * 2.2;
    return {
      svg: group([rect(-8, bh / 2 - 4, 16, post, 'body-alt', 4), path(roundRectPath(-bw / 2, -bh / 2, bw, bh, 10), bgRole), glyphs]),
      box: { x: -bw / 2, y: -bh / 2, w: bw, h: bh + post },
      words,
    };
  },
};
