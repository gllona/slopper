import { describe, expect, it } from 'vitest';
import { compileScene } from '../../harness/compile.ts';
import { lintSvg, usedColors } from '../../harness/lint.ts';
import { sanitizeAndOptimize } from '../../harness/sanitize.ts';

const limits = { artboard: 1080, safeArea: 60, svgMaxKB: 150, maxWordsInArt: 6, animation: { minSec: 3, maxSec: 9 } };
const base = { harness: '0.2', style: 'riso-duotone', alt: 'A test scene with a robot.' };

function lint(scene: unknown) {
  const c = compileScene(scene);
  const s = sanitizeAndOptimize(c.svg);
  return lintSvg(c, s.svg, s.removed, limits);
}

describe('lint (static)', () => {
  it('passes a clean scene', () => {
    const r = lint({ ...base, elements: [{ id: 'bot', component: 'robot', at: 'center' }] });
    expect(r.errors).toEqual([]);
    expect(r.stats.colors.length).toBeLessThanOrEqual(5);
  });

  it('flags colors outside the palette', () => {
    const r = lint({
      ...base,
      elements: [{ id: 'r', component: 'raw', at: 'center', props: { width: 10, height: 10 }, svg: '<rect width="10" height="10" fill="#ff0000"/>' }],
    });
    expect(r.errors.join()).toMatch(/outside the "riso-duotone" palette: #ff0000/);
  });

  it('flags too many words', () => {
    const r = lint({ ...base, elements: [{ id: 'l', component: 'label', at: 'center', props: { text: 'one two three four five six seven' } }] });
    expect(r.errors.join()).toMatch(/7 words/);
  });

  it('flags animation length out of bounds', () => {
    const r = lint({
      ...base,
      elements: [{ id: 'bot', component: 'robot', at: 'center' }],
      animation: { durationSec: 2, beats: [{ t: 0, target: 'bot', action: 'bounce' }] },
    });
    expect(r.errors.join()).toMatch(/between 3s and 9s/);
  });

  it('usedColors reads attributes and CSS, ignoring url(#id) references', () => {
    expect(usedColors('<rect fill="#ABC" style="stroke:#112233"/><g filter="url(#abc123)"/><style>.a{fill:red}</style>')).toEqual(['#112233', '#aabbcc', 'red']);
  });
});
