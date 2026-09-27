import { describe, expect, it } from 'vitest';
import { DaySchema, MottoSchema, PhraseSchema, SceneSchema, evaluateScores, storyRelevance } from '../../pipeline/schemas/index.ts';

const day = {
  date: '2026-09-27',
  number: null,
  mode: 'fresh',
  motto: 'The Thirsty Cloud',
  phrase: 'Today the datacenter used more water than the town. The town was asked to be patient.',
  alt: 'A datacenter drinks from a tiny town water tower.',
  artType: 'static',
  style: 'riso-duotone',
  mood: { hype_doom: -1, calm_frantic: 0 },
  versions: { harness: '0.2.0', prompts: '1', ontology: '1', rubricArt: '1', rubricCop: '1' },
  generatedAt: '2026-09-28T06:14:03Z',
};

describe('day schema', () => {
  it('accepts a minimal valid day', () => {
    expect(DaySchema.parse(day).sources).toEqual([]);
  });
  it('requires continuesFrom on continuation days', () => {
    expect(DaySchema.safeParse({ ...day, mode: 'continuation' }).success).toBe(false);
    expect(DaySchema.safeParse({ ...day, mode: 'continuation', continuesFrom: '2026-09-26' }).success).toBe(true);
  });
  it('enforces motto and phrase rules', () => {
    expect(MottoSchema.safeParse('Quiet Day').success).toBe(true);
    expect(MottoSchema.safeParse('Quiet').success).toBe(false);
    expect(MottoSchema.safeParse('Quiet Day.').success).toBe(false);
    expect(MottoSchema.safeParse('One Two Three Four Five Six').success).toBe(false);
    expect(PhraseSchema.safeParse(Array(31).fill('word').join(' ')).success).toBe(false);
  });
});

describe('scene schema', () => {
  const scene = {
    harness: '0.2',
    style: 'riso-duotone',
    elements: [
      { id: 'bot', component: 'robot', at: 'left-third' },
      { id: 'tag', component: 'label', attachTo: 'bot', props: { text: 'Day 4' } },
    ],
    alt: 'A robot with a small label above it.',
  };
  it('accepts a valid scene and applies defaults', () => {
    const s = SceneSchema.parse(scene);
    expect(s.elements[0]!.scale).toBe(1);
    expect(s.background.type).toBeUndefined(); // style card default
  });
  it('rejects duplicate ids, unknown references, and misplaced raw svg', () => {
    const dup = { ...scene, elements: [scene.elements[0], scene.elements[0]] };
    expect(SceneSchema.safeParse(dup).success).toBe(false);
    const badRef = { ...scene, elements: [{ id: 'a', component: 'label', attachTo: 'nobody' }] };
    expect(SceneSchema.safeParse(badRef).success).toBe(false);
    const raw = { ...scene, elements: [{ id: 'a', component: 'raw', at: 'center' }] };
    expect(SceneSchema.safeParse(raw).success).toBe(false);
    const beat = { ...scene, animation: { durationSec: 4, beats: [{ t: 0, target: 'ghost', action: 'fade-in' }] } };
    expect(SceneSchema.safeParse(beat).success).toBe(false);
  });
});

describe('scoring helpers', () => {
  it('relevance is the product of the three scores', () => {
    expect(storyRelevance({ novelty: 2, magnitude: 2, breadth: 2 })).toBe(8);
  });
  it('critic pass rule', () => {
    const base = { clarity: 4, coherence: 4, composition: 4, style: 4, polish: 4, novelty: 3, kindness: 5 };
    expect(evaluateScores(base, { passAverage: 3.5, minScore: 2 }).passed).toBe(true);
    expect(evaluateScores({ ...base, clarity: 1 }, { passAverage: 3.5, minScore: 2 }).passed).toBe(false);
  });
});
