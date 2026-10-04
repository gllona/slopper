import { z } from 'zod';
import type { ComponentDef } from './types.ts';

const Props = z
  .object({
    width: z.number().min(4).max(1080),
    height: z.number().min(4).max(1080),
  })
  .strict();
type Props = z.infer<typeof Props>;

/**
 * Escape hatch (DESIGN §9.3): a one-off SVG fragment drawn in a local box 0..width × 0..height,
 * placed with its center on the anchor. The fragment is sanitized; ids are namespaced by the
 * compiler; it should use role classes (r-body, r-line, …) or palette colors only.
 * The fragment itself is passed in by the compiler via `rawSvg`.
 */
export const raw: ComponentDef<Props & { rawSvg?: string }> = {
  name: 'raw',
  doc: 'Escape hatch: "svg" is an SVG fragment in a local 0..width×0..height box (props: width, height), centered on the anchor. Use role classes (r-body, r-body-alt, r-accent, r-accent-2, r-ink, r-paper, r-line, r-thin, r-shade, r-glow) instead of colors. No <text>, <style>, or scripts. Max 12 KB, max 5 per scene. Use it freely for props (a gavel, a box of files, a badge): improvised props keep every slopper different.',
  grounded: false,
  props: Props as z.ZodType<Props & { rawSvg?: string }>,
  render(p) {
    return {
      svg: `<g transform="translate(${-p.width / 2} ${-p.height / 2})">${p.rawSvg ?? ''}</g>`,
      box: { x: -p.width / 2, y: -p.height / 2, w: p.width, h: p.height },
    };
  },
};
