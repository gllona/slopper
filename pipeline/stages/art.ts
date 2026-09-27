import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { harnessDocs } from '../../harness/docs.ts';
import { buildScene, type BuildResult } from '../../harness/index.ts';
import { compileScene, SceneError } from '../../harness/compile.ts';
import type { LintReport } from '../../harness/lint.ts';
import { callClaude, fillTemplate } from '../claude.ts';
import type { Config } from '../schemas/config.ts';
import { CriticReviewSchema, evaluateScores, type CriticFile, type CriticReview } from '../schemas/critic.ts';
import type { CurateOutput } from '../schemas/curate.ts';
import type { Day } from '../schemas/day.ts';
import { HARNESS_VERSION, SceneSchema, type Scene } from '../schemas/scene.ts';
import { dayDir } from '../util/archive.ts';
import { logger } from '../util/log.ts';
import { KNOWLEDGE } from './curate.ts';

/** Stage 3 — the art loop (DESIGN §5, §9, §10): Art → compile/sanitize/render/lint → Critic, repeated. */

export interface ArtInput {
  date: string;
  curate: CurateOutput;
  number: number | null;
  recent: Day[];
  archiveRoot: string;
  config: Config;
  /** Notes from the Cop when it asked the art to change. */
  copNotes?: string[];
}

export interface ArtAttempt {
  iteration: number;
  scene: Scene;
  build: BuildResult;
  review?: CriticReview;
  average?: number;
  passed: boolean;
}

export interface ArtOutput {
  best: ArtAttempt;
  critic: CriticFile;
}

export class ArtFailedError extends Error {}

export async function runArt(input: ArtInput): Promise<ArtOutput> {
  const log = logger('art');
  const { config, curate } = input;
  const limits = { ...config, filmstripFrames: config.animation.filmstripFrames };
  const attempts: ArtAttempt[] = [];
  const lintOnly: { iteration: number; lint: LintReport; scene: Scene }[] = [];
  const recentSheet = await recentContactSheet(input.recent, input.archiveRoot);
  const previous = input.recent[0];
  const previousDir = previous ? dayDir(input.archiveRoot, previous.date) : null;
  const continuation = curate.mode === 'continuation' && previousDir && existsSync(join(previousDir, 'scene.json'));

  let feedback: { scene: Scene; notes: string[]; lint?: string[] } | null = null;
  for (let iteration = 1; iteration <= config.maxArtIterations; iteration++) {
    const scene = await drawScene(input, feedback, continuation ? previousDir! : null);
    let build: BuildResult;
    try {
      build = await buildScene(scene, limits, { motto: curate.motto, phrase: curate.phrase, number: input.number, date: input.date });
    } catch (e) {
      if (!(e instanceof SceneError)) throw e;
      feedback = { scene, notes: [], lint: e.issues };
      log.warn(`iteration ${iteration}: scene invalid after compile`, e.issues);
      continue;
    }
    if (!build.lint.ok) {
      log.warn(`iteration ${iteration}: lint failed`, build.lint.errors);
      lintOnly.push({ iteration, lint: build.lint, scene });
      feedback = { scene, notes: [], lint: build.lint.errors };
      continue;
    }
    const review = await critique(input, scene, build, recentSheet);
    const { average, passed } = evaluateScores(review.scores, config.critic);
    attempts.push({ iteration, scene, build, review, average, passed });
    log.info(`iteration ${iteration}: critic ${average} ${passed ? 'PASS' : 'fail'} — ${review.verdict}`);
    if (passed) break;
    feedback = { scene, notes: review.revisionNotes, lint: build.lint.warnings };
  }

  if (!attempts.length) {
    throw new ArtFailedError(`No renderable scene after ${config.maxArtIterations} iterations: ${lintOnly.at(-1)?.lint.errors.join('; ') ?? 'invalid scenes'}`);
  }
  const best = attempts.find((a) => a.passed) ?? [...attempts].sort((a, b) => (b.average ?? 0) - (a.average ?? 0))[0]!;
  const critic: CriticFile = {
    passed: best.passed,
    bestIteration: best.iteration,
    iterations: [
      ...lintOnly.map((l) => ({ iteration: l.iteration, lint: { ok: false, errors: l.lint.errors, warnings: l.lint.warnings }, passed: false })),
      ...attempts.map((a) => ({
        iteration: a.iteration,
        lint: { ok: a.build.lint.ok, errors: a.build.lint.errors, warnings: a.build.lint.warnings },
        review: a.review,
        average: a.average,
        passed: a.passed,
      })),
    ].sort((a, b) => a.iteration - b.iteration),
  };
  return { best, critic };
}

async function drawScene(input: ArtInput, feedback: { scene: Scene; notes: string[]; lint?: string[] } | null, previousDir: string | null): Promise<Scene> {
  const { curate, config } = input;
  const style = curate.brief.style;
  const extra: string[] = [];
  const files: { name: string; path?: string; content?: string | Buffer }[] = [
    {
      name: 'brief.json',
      content: JSON.stringify({ date: input.date, mode: curate.mode, motto: curate.motto, phrase: curate.phrase, brief: curate.brief }, null, 1),
    },
    { name: 'HARNESS.md', content: harnessDocs() },
    { name: 'style.yaml', path: `harness/styles/${style}.yaml` },
    { name: 'LESSONS.md', path: KNOWLEDGE.lessons },
  ];
  if (previousDir) {
    files.push({ name: 'previous-scene.json', path: join(previousDir, 'scene.json') });
    extra.push('- `previous-scene.json` — yesterday\'s scene. This is a continuation day: reuse its cast and motifs for a follow-up moment.');
    if (existsSync(join(previousDir, 'still.png'))) {
      files.push({ name: 'previous-still.png', path: join(previousDir, 'still.png') });
      extra.push('- `previous-still.png` — yesterday\'s final frame.');
    }
  }
  let revision = '';
  if (feedback) {
    files.push({ name: 'attempt.json', content: JSON.stringify(feedback.scene, null, 1) });
    extra.push('- `attempt.json` — your previous attempt, which must be improved.');
    revision =
      '\n## Revise your previous attempt\n\n' +
      (feedback.lint?.length ? `The harness rejected it or found problems:\n${feedback.lint.map((l) => `- ${l}`).join('\n')}\n\n` : '') +
      (feedback.notes.length ? `The critic's notes (most important first):\n${feedback.notes.map((n) => `- ${n}`).join('\n')}\n\n` : '');
  }
  if (input.copNotes?.length) revision += `\n## Legal review asked for changes\n\n${input.copNotes.map((n) => `- ${n}`).join('\n')}\n`;

  const prompt = fillTemplate(readFileSync('prompts/art.md', 'utf8'), {
    date: input.date,
    style,
    harnessVersion: HARNESS_VERSION,
    extraFiles: extra.length ? extra.join('\n') + '\n' : '',
    revision,
  });
  const { value } = await callClaude({
    stage: 'art',
    prompt,
    schema: SceneSchema,
    timeoutMs: 10 * 60_000,
    files: files.map((f) => (f.path ? { name: f.name, path: f.path } : { name: f.name, content: f.content! })),
    check: (scene) => {
      const problems: string[] = [];
      if (scene.style !== style) problems.push(`style: must be "${style}" (the brief's choice)`);
      if (Boolean(scene.animation) !== (curate.brief.artType === 'animated')) problems.push(`animation: the brief asks for a ${curate.brief.artType} slopper`);
      try {
        compileScene(scene, { artboard: config.artboard, safeArea: config.safeArea, rawSvgMaxBytes: config.rawSvgMaxBytes, maxRawElements: config.maxRawElements });
      } catch (e) {
        if (e instanceof SceneError) problems.push(...e.issues);
        else throw e;
      }
      return problems;
    },
  });
  return value;
}

async function critique(input: ArtInput, scene: Scene, build: BuildResult, recentSheet: Buffer | null): Promise<CriticReview> {
  const animated = Boolean(scene.animation);
  const files = [
    { name: 'rubric-art.md', path: KNOWLEDGE.rubricArt },
    { name: 'still.png', content: build.render!.still },
    ...(build.render!.filmstrip ? [{ name: 'filmstrip.png', content: build.render!.filmstrip }] : []),
    {
      name: 'context.json',
      content: JSON.stringify({ motto: input.curate.motto, phrase: input.curate.phrase, brief: input.curate.brief, scene, lintWarnings: build.lint.warnings }, null, 1),
    },
    { name: 'LESSONS.md', path: KNOWLEDGE.lessons },
    ...(recentSheet ? [{ name: 'recent.png', content: recentSheet }] : []),
  ];
  const prompt = fillTemplate(readFileSync('prompts/critic.md', 'utf8'), {
    filmstrip: animated ? '- `filmstrip.png` — 6 frames of the animation, left to right, top to bottom, with timestamps.\n' : '',
    recent: recentSheet ? '- `recent.png` — the most recent sloppers (for the novelty criterion).\n' : '',
    narrativeRule: animated ? 'include "narrative": this one is animated' : 'omit "narrative": this one is static',
  });
  const { value } = await callClaude({
    stage: 'critic',
    prompt,
    schema: CriticReviewSchema,
    timeoutMs: 8 * 60_000,
    files,
    check: (r) => {
      if (animated && r.scores.narrative === undefined) return ['scores.narrative: required for an animated slopper'];
      if (!animated && r.scores.narrative !== undefined) return ['scores.narrative: omit it for a static slopper'];
      return [];
    },
  });
  return value;
}

/** One image with the recent stills (newest first), so the Critic can judge novelty cheaply. */
export async function recentContactSheet(recent: Day[], root: string): Promise<Buffer | null> {
  const stills = recent.map((d) => join(dayDir(root, d.date), 'still.png')).filter((p) => existsSync(p)).slice(0, 12);
  if (!stills.length) return null;
  const cell = 256;
  const cols = Math.min(4, stills.length);
  const rows = Math.ceil(stills.length / cols);
  const tiles = await Promise.all(stills.map((p) => sharp(p).resize(cell, cell).png().toBuffer()));
  return sharp({ create: { width: cols * cell, height: rows * cell, channels: 3, background: '#ffffff' } })
    .composite(tiles.map((input, i) => ({ input, left: (i % cols) * cell, top: Math.floor(i / cols) * cell })))
    .png()
    .toBuffer();
}
