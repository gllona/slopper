import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileScene, SceneError } from '../../harness/compile.ts';
import { COMPONENTS } from '../../harness/components/index.ts';
import { listStyles } from '../../harness/style.ts';

const base = { harness: '0.2', style: 'riso-duotone', alt: 'A test scene with a robot.' };

function issues(scene: unknown): string[] {
  try {
    compileScene(scene);
  } catch (e) {
    if (e instanceof SceneError) return e.issues;
    throw e;
  }
  return [];
}

describe('compile', () => {
  it('compiles every fixture', () => {
    const dir = 'harness/fixtures';
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const r = compileScene(JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));
      expect(r.svg.startsWith('<svg')).toBe(true);
      expect(r.svg).toContain('viewBox="0 0 1080 1080"');
    }
  });

  it('renders every component with default props in every style', () => {
    for (const style of listStyles()) {
      for (const name of Object.keys(COMPONENTS)) {
        if (name === 'raw') continue;
        const props = name === 'label' || name === 'speech-bubble' ? { text: 'Hi' } : {};
        const r = compileScene({ ...base, style, elements: [{ id: 'x', component: name, at: 'center', props }] });
        expect(r.svg, `${name} in ${style}`).toContain('data-el="x"');
      }
    }
  });

  it('collects all problems at once, with actionable messages', () => {
    const found = issues({
      ...base,
      elements: [
        { id: 'a', component: 'unicorn', at: 'center' },
        { id: 'b', component: 'robot', at: 'center', props: { mood: 'furious', hat: true } },
      ],
    });
    expect(found.join('\n')).toMatch(/unknown component "unicorn".*Available: robot/);
    expect(found.join('\n')).toMatch(/elements\.1 \(b\)\.props\.mood/);
    expect(found.join('\n')).toMatch(/hat/);
  });

  it('rejects unknown styles and bad anchors', () => {
    expect(issues({ ...base, style: 'vaporwave', elements: [{ id: 'a', component: 'robot', at: 'center' }] })[0]).toMatch(/Unknown style card/);
    expect(issues({ ...base, elements: [{ id: 'a', component: 'robot', at: 'middle' }] }).length).toBeGreaterThan(0);
  });

  it('validates animation beats', () => {
    const scene = (beats: unknown[]) => ({
      ...base,
      elements: [
        { id: 'bot', component: 'robot', at: 'center' },
        { id: 'm', component: 'meter', at: 'top-right' },
      ],
      animation: { durationSec: 4, beats },
    });
    expect(issues(scene([{ t: 0, target: 'bot', action: 'moonwalk' }]))[0]).toMatch(/unknown action.*wave/);
    expect(issues(scene([{ t: 3.5, target: 'bot', action: 'walk-in' }]))[0]).toMatch(/after durationSec/);
    expect(issues(scene([{ t: 0, target: 'bot', action: 'bounce' }, { t: 0.2, target: 'bot', action: 'jump' }]))[0]).toMatch(/overlaps/);
    expect(issues(scene([{ t: 0, target: 'bot', action: 'set', props: { arms: 'up' } }]))[0]).toMatch(/not settable: arms/);
    expect(issues(scene([{ t: 0, target: 'm', action: 'set', props: { level: 2 } }]))[0]).toMatch(/invalid props/);
    expect(issues(scene([{ t: 0, target: 'm', action: 'set', props: { level: 0.9 } }]))).toEqual([]);
  });

  it('writes the final state as static CSS (reduced motion and stills show the last frame)', () => {
    const r = compileScene({
      ...base,
      elements: [
        { id: 'bot', component: 'robot', at: 'center' },
        { id: 'm', component: 'meter', at: 'top-right', props: { level: 0.1 } },
      ],
      animation: {
        durationSec: 4,
        beats: [
          { t: 0, target: 'bot', action: 'faint' },
          { t: 1, target: 'm', action: 'set', props: { level: 0.9 } },
          { t: 1, target: 'bot', action: 'set', props: { mood: 'exhausted' } },
        ],
      },
    });
    expect(r.svg).toContain('#a-bot{rotate:84deg}');
    expect(r.svg).toContain('#p-m--level{scale:1 0.9}');
    expect(r.svg).toMatch(/#p-bot--face-exhausted\{[^}]*\}/);
    expect(r.svg).toContain('#p-bot--face-neutral{opacity:0}');
    expect(r.svg).toContain('@media (prefers-reduced-motion:reduce)');
    expect(r.duration).toBe(4);
  });

  it('attaches elements to their parents', () => {
    const r = compileScene({
      ...base,
      elements: [
        { id: 'bot', component: 'robot', at: 'bottom-center' },
        { id: 'say', component: 'speech-bubble', attachTo: 'bot', side: 'top', props: { text: 'Hello' } },
      ],
    });
    expect(r.nudges).toEqual([]);
    const bot = r.elements.find((e) => e.id === 'bot')!.box;
    const say = r.elements.find((e) => e.id === 'say')!.box;
    expect(say.y + say.h).toBeLessThanOrEqual(bot.y);
  });

  it('nudges text back into the safe area and shapes back into the artboard', () => {
    const r = compileScene({
      ...base,
      elements: [
        { id: 'tag', component: 'label', at: { x: 0.99, y: 0.5 }, props: { text: 'Far right' } },
        { id: 'dc', component: 'datacenter', at: { x: 0.01, y: 0.8 } },
        { id: 'bot', component: 'robot', at: { x: 0.5, y: 0.99 } },
      ],
    });
    const tag = r.elements.find((e) => e.id === 'tag')!.box;
    expect(tag.x + tag.w).toBeLessThanOrEqual(1020.5);
    expect(r.elements.find((e) => e.id === 'dc')!.box.x).toBeGreaterThanOrEqual(-0.5);
    expect(r.nudges.join()).toMatch(/"tag" \(label\) was moved -\d+ px, 0 px to stay inside the safe area/);
    expect(r.nudges.join()).toMatch(/"dc"/);
    expect(r.nudges.join()).not.toMatch(/"bot"/); // grounded: may extend below the bottom edge
  });

  it('accounts for rotation when nudging', () => {
    const svg = '<rect class="r-ink" width="300" height="60"/>';
    const r = compileScene({ ...base, elements: [{ id: 'g', component: 'raw', at: { x: 0.2, y: 0.05 }, rotate: -35, props: { width: 300, height: 60 }, svg }] });
    const b = r.elements[0]!.box;
    expect(b.y).toBeGreaterThanOrEqual(-0.5); // the rotated shape stays inside the artboard
    expect(r.nudges.join()).toMatch(/"g"/);
  });

  it('rejects attachment cycles', () => {
    expect(
      issues({
        ...base,
        elements: [
          { id: 'a', component: 'robot', attachTo: 'b' },
          { id: 'b', component: 'robot', attachTo: 'a' },
        ],
      }).join(),
    ).toMatch(/cycle/);
  });

  it('counts words drawn in the art', () => {
    const r = compileScene({
      ...base,
      elements: [
        { id: 'l', component: 'label', at: 'top-center', props: { text: 'Day four' } },
        { id: 's', component: 'speech-bubble', at: 'center', props: { text: 'Is it useful?' } },
      ],
    });
    expect(r.words).toBe(5);
  });

  describe('raw elements', () => {
    const raw = (svg: string, id = 'r') => ({ id, component: 'raw', at: 'center', props: { width: 100, height: 100 }, svg });
    it('namespaces ids and references', () => {
      const r = compileScene({ ...base, elements: [raw('<defs><linearGradient id="g"/></defs><rect class="r-body" width="10" height="10" fill="url(#g)"/>')] });
      expect(r.svg).toContain('id="raw-r-g"');
      expect(r.svg).toContain('url(#raw-r-g)');
    });
    it('rejects text, styles, scripts, and oversize fragments', () => {
      expect(issues({ ...base, elements: [raw('<text>hi</text>')] })[0]).toMatch(/label component/);
      expect(issues({ ...base, elements: [raw('<style>*{}</style>')] })[0]).toMatch(/<style>/);
      expect(issues({ ...base, elements: [raw('<rect onclick="x" width="1" height="1"/>')] })[0]).toMatch(/unsafe/);
      // malformed XML is feedback for the Art stage, never a crash
      expect(issues({ ...base, elements: [raw('<g><rect width="1" height="1"/></svg>')] })[0]).toMatch(/not well-formed/);
      expect(issues({ ...base, elements: [raw('<path d="M0 0"')] })[0]).toMatch(/not well-formed/);
      expect(issues({ ...base, elements: [raw(`<path d="${'M0 0L1 1'.repeat(2000)}"/>`)] })[0]).toMatch(/larger than/);
    });
    it('limits the number of raw elements', () => {
      const els = [0, 1, 2, 3].map((i) => raw('<rect class="r-body" width="10" height="10"/>', `r${i}`));
      expect(issues({ ...base, elements: els })[0]).toMatch(/at most 3 raw/);
    });
  });
});

describe('generated docs', () => {
  it('docs/HARNESS.md is up to date (run: npm run harness:docs)', async () => {
    const { harnessDocs } = await import('../../harness/docs.ts');
    expect(readFileSync('docs/HARNESS.md', 'utf8')).toBe(harnessDocs());
  });
});
