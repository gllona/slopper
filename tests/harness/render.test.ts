import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { buildScene } from '../../harness/index.ts';

const limits = { artboard: 1080, safeArea: 60, svgMaxKB: 150, maxWordsInArt: 6, animation: { minSec: 3, maxSec: 9 }, filmstripFrames: 6 };
const size = (png: Buffer) => {
  const p = PNG.sync.read(png);
  return [p.width, p.height];
};

describe('render (Playwright)', () => {
  it('renders a static fixture: still 1080², og 1200×630, no filmstrip', async () => {
    const r = await buildScene(JSON.parse(readFileSync('harness/fixtures/benchmark-season.json', 'utf8')), limits, { motto: 'Benchmark Season', phrase: 'Test.' });
    expect(r.lint.errors).toEqual([]);
    expect(size(r.render!.still)).toEqual([1080, 1080]);
    expect(size(r.render!.og)).toEqual([1200, 630]);
    expect(r.render!.filmstrip).toBeNull();
  });

  it('renders an animated fixture with a filmstrip and no flashing', async () => {
    const r = await buildScene(JSON.parse(readFileSync('harness/fixtures/quiet-day.json', 'utf8')), limits);
    expect(r.lint.errors).toEqual([]);
    expect(r.render!.filmstrip).not.toBeNull();
    expect(r.render!.flashes!.maxPerSecond).toBeLessThanOrEqual(3);
  });

  it('detects flashing (WCAG 2.3.1)', async () => {
    const beats = [];
    for (let i = 0; i < 10; i++) beats.push({ t: 0.5 + i * 0.2, target: 'box', action: 'disappear' }, { t: 0.6 + i * 0.2, target: 'box', action: 'appear' });
    const r = await buildScene(
      {
        harness: '0.2',
        style: 'riso-duotone',
        elements: [{ id: 'box', component: 'raw', at: 'center', props: { width: 900, height: 900 }, svg: '<rect class="r-ink" width="900" height="900"/>' }],
        animation: { durationSec: 4, beats },
        alt: 'A big square that flashes quickly.',
      },
      limits,
    );
    expect(r.lint.errors.join()).toMatch(/flashing/);
  });

  it('catches elements cut off by the artboard edge', async () => {
    const r = await buildScene(
      { harness: '0.2', style: 'blueprint', elements: [{ id: 'dc', component: 'datacenter', at: { x: 0.02, y: 0.5 }, scale: 1.5 }], alt: 'A datacenter half outside the picture.' },
      limits,
    );
    expect(r.lint.errors.join()).toMatch(/"dc" is cut off/);
  });
});
