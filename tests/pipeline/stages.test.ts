import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildArgs, callClaude, ClaudeError, ClaudeLimitError, cliJsonSchema, fileVersion, fillTemplate, parseJsonLoose } from '../../pipeline/claude.ts';
import { CurateOutputSchema } from '../../pipeline/schemas/curate.ts';
import { SceneSchema } from '../../pipeline/schemas/scene.ts';
import { runDay, sameVisualIdea } from '../../pipeline/run.ts';
import { CopFileSchema } from '../../pipeline/schemas/cop.ts';
import type { CurateOutput } from '../../pipeline/schemas/curate.ts';
import { DaySchema, type Day } from '../../pipeline/schemas/day.ts';
import { castingProblems, modeRule } from '../../pipeline/stages/curate.ts';
import { updateStorylines } from '../../pipeline/storylines.ts';
import { modeContext } from '../../pipeline/util/archive.ts';
import { loadConfig } from '../../pipeline/util/config.ts';
import { z } from 'zod';

const FAKE = resolve('tests/fixtures/fake-claude.mjs');
const REPLAY = 'tests/fixtures/fetch/2026-09-26';
const config = loadConfig({ env: {} });

let state: string;
beforeEach(() => {
  state = mkdtempSync(join(tmpdir(), 'fake-claude-'));
  process.env.SLOPPER_CLAUDE_BIN = FAKE;
  process.env.FAKE_CLAUDE_STATE = state;
  delete process.env.FAKE_CLAUDE;
});
afterEach(() => {
  delete process.env.SLOPPER_CLAUDE_BIN;
  delete process.env.FAKE_CLAUDE;
  rmSync(state, { recursive: true, force: true });
});

describe('claude wrapper', () => {
  it('uses the least-privilege flags and never pins a model', () => {
    const a = buildArgs('hi', {});
    for (const f of ['--restricted', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands']) expect(a).toContain(f);
    expect(a[a.indexOf('--tools') + 1]).toBe('Read');
    expect(a[a.indexOf('--permission-mode') + 1]).toBe('dontAsk');
    expect(a).not.toContain('--model');
    expect(a.join(' ')).not.toMatch(/bypassPermissions|Bash|Write|Edit|WebFetch/);
  });

  it('runs in a throwaway workspace with only the given files, then deletes it', async () => {
    const r = await callClaude({
      stage: 'critic',
      prompt: 'You are the **art critic** of Slopper.',
      schema: z.object({ scores: z.record(z.string(), z.number()), verdict: z.string(), revisionNotes: z.array(z.string()) }),
      files: [{ name: 'context.json', content: '{}' }],
    });
    expect(r.value.verdict).toBe('Clear and simple.');
    const call = JSON.parse(readFileSync(join(state, 'calls.log'), 'utf8').trim());
    expect(call.cwd).toMatch(/slopper-critic-/);
    expect(existsSync(call.cwd)).toBe(false);
  });

  it('reports usage limits as ClaudeLimitError', async () => {
    process.env.FAKE_CLAUDE = 'limit';
    await expect(callClaude({ stage: 'cop', prompt: 'You are the **Cop**', schema: z.object({}), files: [] })).rejects.toBeInstanceOf(ClaudeLimitError);
  });

  it('rejects unsafe workspace file names', async () => {
    await expect(callClaude({ stage: 'cop', prompt: 'x', schema: z.object({}), files: [{ name: '../escape.txt', content: 'x' }] })).rejects.toBeInstanceOf(ClaudeError);
  });

  it('JSON schemas for the CLI carry no $schema URI (the CLI rejects draft-2020-12)', () => {
    const j = cliJsonSchema(CurateOutputSchema);
    expect(j.$schema).toBeUndefined();
    expect(JSON.stringify(j)).not.toContain('2020-12');
    expect(j.type).toBe('object');
    // no tuples at all: the CLI rejects prefixItems (2020-12) and the API rejects draft-07 tuple "items: [...]"
    for (const s of [CurateOutputSchema, SceneSchema]) {
      const text = JSON.stringify(cliJsonSchema(s));
      expect(text).not.toContain('prefixItems');
      expect(text).not.toMatch(/"items":\[/);
    }
  });

  it('helpers: templates, versions, loose JSON', () => {
    expect(fillTemplate('<!-- version: 2 -->\nHello {{who}}', { who: 'you' })).toBe('Hello you');
    expect(() => fillTemplate('{{missing}}', {})).toThrow(/missing/);
    expect(fileVersion('<!-- version: 3 -->\n# x')).toBe('3');
    expect(fileVersion('version: 1\ndimensions: []')).toBe('1');
    expect(parseJsonLoose('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('no json')).toBeUndefined();
  });
});

const day = (date: string, mode: 'fresh' | 'continuation', dims: Day['dimensions'] = { capabilities: 3 }): Day =>
  DaySchema.parse({
    date,
    number: null,
    mode,
    continuesFrom: mode === 'continuation' ? '2026-09-01' : undefined,
    motto: 'Some Motto',
    phrase: 'Some phrase.',
    alt: 'Some alt text here.',
    artType: 'static',
    style: 'riso-duotone',
    dimensions: dims,
    mood: { hype_doom: 0, calm_frantic: 0 },
    versions: { harness: '0.2.0', prompts: '1', ontology: '1', rubricArt: '1', rubricCop: '1' },
    generatedAt: `${date}T15:30:00Z`,
  });

const story = (rel: [number, number, number], dims: CurateOutput['topStories'][0]['dimensions'] = ['capabilities']) => ({
  title: 't', itemIds: ['x'], dimensions: dims, novelty: rel[0], magnitude: rel[1], breadth: rel[2], storyline: 's',
});

describe('mode rules (DESIGN §6.3–6.4)', () => {
  it('fresh at or above the threshold, continuation below', () => {
    const r = modeRule(modeContext([day('2026-09-25', 'fresh')], '2026-09-26'), config);
    expect(r.expected({ topStories: [story([2, 2, 2])] } as CurateOutput)).toBe('fresh'); // 8
    expect(r.expected({ topStories: [story([1, 2, 3])] } as CurateOutput)).toBe('continuation'); // 6
  });
  it('forces fresh after maxContinuationDays and on the very first slopper', () => {
    const recent = [day('2026-09-25', 'continuation'), day('2026-09-24', 'continuation'), day('2026-09-23', 'continuation')];
    expect(modeRule(modeContext(recent, '2026-09-26'), config).expected({ topStories: [story([1, 1, 1])] } as CurateOutput)).toBe('fresh');
    expect(modeRule(modeContext([], '2026-09-26'), config).forcedFresh).toBe(true);
  });
  it('a gap in the dates breaks the continuation streak', () => {
    const recent = [day('2026-09-25', 'continuation'), day('2026-09-23', 'continuation'), day('2026-09-22', 'continuation')];
    expect(modeContext(recent, '2026-09-26').continuationStreak).toBe(1);
  });
  it('balance rule lowers the threshold for other dimensions after 3 days of the same one', () => {
    const recent = ['2026-09-25', '2026-09-24', '2026-09-23'].map((d) => day(d, 'fresh', { capabilities: 3, labor: 1 }));
    const ctx = modeContext(recent, '2026-09-26');
    expect(ctx.dominantDimension).toBe('capabilities');
    const r = modeRule(ctx, config);
    expect(r.expected({ topStories: [story([1, 2, 3], ['labor'])] } as CurateOutput)).toBe('fresh'); // 6 ≥ 8−3
    expect(r.expected({ topStories: [story([1, 2, 3], ['capabilities'])] } as CurateOutput)).toBe('continuation');
  });
});

describe('casting rule (decision 45)', () => {
  it('rejects people and institutions described as robots', () => {
    expect(castingProblems([{ who: 'a robot wearing a lab coat', kind: 'person' }])[0]).toMatch(/is a person but described as a robot/);
    expect(castingProblems([{ who: 'two robots in suits', kind: 'institution' }])).toHaveLength(1);
    expect(castingProblems([{ who: 'a robot hand crossing out a shift', kind: 'ai' }, { who: 'a tired nurse in scrubs', kind: 'person' }])).toEqual([]);
    expect(castingProblems([{ who: 'a robotics engineer', kind: 'person' }])).toEqual([]); // "robotics" is not a robot
  });
});

describe('Cop revisions', () => {
  it('keep the image when only the words change', () => {
    const brief = { concept: 'c', metaphor: 'm', cast: [{ who: 'a robot', kind: 'ai' }], style: 'blueprint', composition: 'x', artType: 'static', alt: 'A robot on a blueprint.' };
    const a = { motto: 'One Two', phrase: 'x', brief } as unknown as CurateOutput;
    expect(sameVisualIdea(a, { ...a, motto: 'Three Four', phrase: 'y', brief: { ...brief, alt: 'Another alt text here.' } } as CurateOutput)).toBe(true);
    expect(sameVisualIdea(a, { ...a, brief: { ...brief, concept: 'new idea' } } as CurateOutput)).toBe(false);
    expect(sameVisualIdea(a, { ...a, brief: { ...brief, style: 'riso-duotone' } } as CurateOutput)).toBe(false);
  });
});

describe('storylines (DESIGN §6.5)', () => {
  it('refreshes touched storylines, adds new ones, and cools the rest', () => {
    const prev = {
      version: 1 as const,
      storylines: [
        { id: 'water', title: 'Water', dimensions: ['planet' as const], firstSeen: '2026-09-20', lastSeen: '2026-09-24', daysActive: 3, heat: 1, status: 'active' as const, sloppers: [], motifs: [] },
        { id: 'old', title: 'Old', dimensions: ['law' as const], firstSeen: '2026-08-01', lastSeen: '2026-09-01', daysActive: 2, heat: 0.2, status: 'active' as const, sloppers: [], motifs: [] },
      ],
    };
    const curate = { topStories: [story([2, 2, 2], ['planet']), { ...story([3, 3, 3]), storyline: 'pause' }].map((s, i) => (i === 0 ? { ...s, storyline: 'water' } : s)), newStorylines: [{ id: 'pause', title: 'Pause', dimensions: ['safety'], motifs: ['stop sign'] }] } as unknown as CurateOutput;
    const next = updateStorylines(prev, '2026-09-26', curate, 0.7);
    const by = Object.fromEntries(next.storylines.map((s) => [s.id, s]));
    expect(by.water).toMatchObject({ lastSeen: '2026-09-26', daysActive: 4, heat: 1, sloppers: ['2026-09-26'] });
    expect(by.pause).toMatchObject({ firstSeen: '2026-09-26', daysActive: 1, heat: 1, motifs: ['stop sign'] });
    expect(by.old!.status).toBe('dormant');
  });
});

describe('npm run day (with a fake claude)', () => {
  const run = async (flags = '', from: 'fetch' | 'curate' | 'art' | 'cop' = 'fetch', out = mkdtempSync(join(tmpdir(), 'slopper-day-'))) => {
    if (flags) process.env.FAKE_CLAUDE = flags;
    const r = await runDay({ date: '2026-09-26', fromStage: from, out, replay: REPLAY, waitOnLimit: false });
    return { ...r, out };
  };

  it('produces a complete slopper folder', async () => {
    const r = await run();
    expect(r.labels).toEqual(['slopper', 'fresh', 'dry-run']);
    const files = readdirSync(r.dir).sort();
    expect(files).toEqual(['cop.json', 'critic.json', 'curate.json', 'day.json', 'digest.json', 'og.png', 'pr.md', 'scene.json', 'slopper.svg', 'still.jpg', 'still.png', 'storylines.json']);
    const d = DaySchema.parse(JSON.parse(readFileSync(join(r.dir, 'day.json'), 'utf8')));
    expect(d.sources.length).toBeGreaterThan(0);
    expect(d.versions.prompts).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(d.critic?.passed).toBe(true);
  }, 120_000);

  it('labels critic-fail after maxArtIterations and keeps the best attempt', async () => {
    const r = await run('critic-fail');
    expect(r.labels).toContain('critic-fail');
    const critic = JSON.parse(readFileSync(join(r.dir, 'critic.json'), 'utf8'));
    expect(critic.iterations).toHaveLength(config.maxArtIterations);
  }, 120_000);

  it('a Cop revision reruns Curate and Art, then passes', async () => {
    const r = await run('cop-revise');
    const cop = CopFileSchema.parse(JSON.parse(readFileSync(join(r.dir, 'cop.json'), 'utf8')));
    expect(cop.rounds.map((x) => x.verdict)).toEqual(['revise', 'pass']);
    expect(r.title).toContain('The Careful Pause');
    expect(r.labels).not.toContain('cop-hold');
  }, 120_000);

  it('a Cop hold is labeled cop-hold (never auto-published)', async () => {
    const r = await run('cop-hold');
    expect(r.labels).toContain('cop-hold');
  }, 120_000);

  it('can resume from a later stage', async () => {
    const first = await run();
    const again = await run('', 'cop', first.out);
    expect(again.dir).toBe(first.dir);
  }, 120_000);

  it('rejects art that draws the people of the cast as robots', async () => {
    await expect(run('cast-person')).rejects.toThrow(/casting: the brief has people \(a tired nurse\)/);
  }, 120_000);

  it('fails cleanly on a usage limit when not waiting', async () => {
    await expect(run('limit')).rejects.toBeInstanceOf(ClaudeLimitError);
  }, 60_000);
});
