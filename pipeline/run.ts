import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { buildScene } from '../harness/index.ts';
import { loadStyle } from '../harness/style.ts';
import { ClaudeError, ClaudeLimitError, fileVersion } from './claude.ts';
import { FetchFailedError, runFetch } from './fetch/index.ts';
import { LiveHttp, ReplayHttp } from './fetch/http.ts';
import { CopFileSchema, type CopFile, type CopVerdict } from './schemas/cop.ts';
import { CriticFileSchema, evaluateScores, type CriticFile } from './schemas/critic.ts';
import { CurateOutputSchema, type CurateOutput } from './schemas/curate.ts';
import { DigestSchema, type Digest } from './schemas/digest.ts';
import { SceneSchema } from './schemas/scene.ts';
import { ArtFailedError, runArt, type ArtAttempt } from './stages/art.ts';
import { runCop } from './stages/cop.ts';
import { KNOWLEDGE, runCurate } from './stages/curate.ts';
import { prLabels, prTitle, writePackage } from './stages/package.ts';
import { updateStorylines } from './storylines.ts';
import { dayDir, recentDays, storylinesBefore } from './util/archive.ts';
import { loadConfig } from './util/config.ts';
import { assertIsoDate, publicationDate, slopperDateFor } from './util/dates.ts';
import { logger } from './util/log.ts';
import { slopperNumber } from './util/numbering.ts';

/**
 * The daily pipeline (DESIGN §5):
 *   npm run day -- [--date YYYY-MM-DD] [--from-stage fetch|curate|art|cop] [--replay dir] [--no-wait] [--out dir]
 * Writes everything into <out>/YYYY/MM/DD/ (default out: sloppers). No git, no deploy: in CI the non-AI
 * `open-pr` job commits the folder (M6). Exit code 0 when a slopper was produced (even with critic-fail or
 * cop-hold, which only change the PR labels), 1 on pipeline failure.
 */

const STAGES = ['fetch', 'curate', 'art', 'cop'] as const;
type Stage = (typeof STAGES)[number];

export class PipelineError extends Error {}

export interface RunOptions {
  date: string;
  fromStage: Stage;
  out: string;
  replay?: string;
  /** Wait and retry once when Claude's usage limit is reached (DESIGN §20). */
  waitOnLimit: boolean;
  limitWaitMs?: number;
}

export interface RunResult {
  dir: string;
  title: string;
  labels: string[];
}

export async function runDay(opts: RunOptions): Promise<RunResult> {
  const log = logger('day');
  const config = loadConfig({ loadDotEnv: true });
  const dir = dayDir(opts.out, opts.date);
  mkdirSync(dir, { recursive: true });
  const from = STAGES.indexOf(opts.fromStage);
  const number = slopperNumber(opts.date, config.launchDate);
  const recent = recentDays(opts.out, opts.date, config.noveltyWindowDays);
  const read = <T>(name: string, parse: (v: unknown) => T): T => {
    const f = join(dir, name);
    if (!existsSync(f)) throw new PipelineError(`--from-stage ${opts.fromStage} needs ${f} (run the earlier stages first)`);
    return parse(JSON.parse(readFileSync(f, 'utf8')));
  };
  const save = (name: string, v: unknown) => writeFileSync(join(dir, name), typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v, null, 2) + '\n');
  const withLimitRetry = async <T>(what: string, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof ClaudeLimitError) || !opts.waitOnLimit) throw e;
      const wait = opts.limitWaitMs ?? 15 * 60_000;
      log.warn(`${what}: Claude usage limit; retrying once in ${Math.round(wait / 60_000)} min`);
      await new Promise((r) => setTimeout(r, wait));
      return fn();
    }
  };

  // 1. fetch
  let digest: Digest;
  if (from <= 0) {
    const http = opts.replay ? new ReplayHttp(opts.replay) : new LiveHttp();
    try {
      digest = await runFetch({ date: opts.date, config, http });
    } catch (e) {
      if (e instanceof FetchFailedError) save('digest.json', e.digest);
      throw e;
    }
    save('digest.json', digest);
  } else {
    digest = read('digest.json', (v) => DigestSchema.parse(v));
  }

  // 2. curate
  const storylinesPrev = storylinesBefore(opts.out, opts.date, KNOWLEDGE.storylines);
  let curate: CurateOutput =
    from <= 1
      ? await withLimitRetry('curate', () => runCurate({ date: opts.date, digest, recent, storylines: storylinesPrev, config }))
      : read('curate.json', (v) => CurateOutputSchema.parse(v));
  if (from <= 1) save('curate.json', curate);

  // 3. art loop
  let art: ArtAttempt;
  let critic: CriticFile;
  const saveArt = (a: ArtAttempt, c: CriticFile) => {
    save('scene.json', a.scene);
    save('slopper.svg', a.build.svg);
    save('still.png', a.build.render!.still);
    save('og.png', a.build.render!.og);
    if (a.build.render!.filmstrip) save('filmstrip.png', a.build.render!.filmstrip);
    save('critic.json', c);
  };
  const artInput = { date: opts.date, number, recent, archiveRoot: opts.out, config };
  if (from <= 2) {
    const out = await withLimitRetry('art', () => runArt({ ...artInput, curate }));
    art = out.best;
    critic = out.critic;
    saveArt(art, critic);
  } else {
    const scene = read('scene.json', (v) => SceneSchema.parse(v));
    critic = read('critic.json', (v) => CriticFileSchema.parse(v));
    const build = await buildScene(scene, { ...config, filmstripFrames: config.animation.filmstripFrames }, { motto: curate.motto, phrase: curate.phrase, number, date: publicationDate(opts.date) });
    const best = critic.iterations.find((i) => i.iteration === critic.bestIteration);
    art = { iteration: critic.bestIteration, scene, build, review: best?.review, average: best?.review ? evaluateScores(best.review.scores, config.critic).average : undefined, passed: critic.passed };
  }

  // 4. cop (with one revision round: the stage the Cop names redoes its work)
  const rounds: CopVerdict[] = [];
  for (let round = 0; ; round++) {
    const verdict = await withLimitRetry('cop', () => runCop({ curate, scene: art.scene, digest, still: art.build.render!.still, filmstrip: art.build.render!.filmstrip }));
    rounds.push(verdict);
    if (verdict.verdict !== 'revise' || round >= config.copRetries) break;
    const notes = verdict.findings.filter((f) => f.severity !== 'low').map((f) => `${f.check}: ${f.evidence} → ${f.suggestion}`);
    let sameIdea = true;
    if (verdict.findings.some((f) => f.stage === 'curate')) {
      log.info('Cop asked Curate to revise');
      const before = curate;
      curate = await withLimitRetry('curate', () => runCurate({ date: opts.date, digest, recent, storylines: storylinesPrev, config, revisionNotes: notes, previous: before }));
      save('curate.json', curate);
      sameIdea = sameVisualIdea(before, curate);
    } else {
      log.info('Cop asked Art to revise');
    }
    // Revise the existing image unless Curate changed the idea itself (keeps a drawing that already passed).
    const startFrom = sameIdea ? art : undefined;
    log.info(startFrom ? 'Art revises the current image' : 'The idea changed: Art starts from scratch');
    const out = await withLimitRetry('art', () => runArt({ ...artInput, curate, copNotes: notes, startFrom }));
    art = out.best;
    critic = out.critic;
    saveArt(art, critic);
  }
  const cop: CopFile = CopFileSchema.parse({ verdict: rounds.at(-1)!.verdict, rounds });

  // 5. package
  const storylines = updateStorylines(storylinesPrev, opts.date, curate, config.heatDecay);
  const prompt = (name: string) => fileVersion(readFileSync(`prompts/${name}.md`, 'utf8'));
  const day = writePackage(
    {
      dir,
      date: opts.date,
      number,
      curate,
      art,
      critic,
      cop,
      digest,
      storylines,
      continuesFrom: recent[0]?.date,
      versions: {
        harness: '',
        prompts: ['curate', 'art', 'critic', 'cop'].map(prompt).join('.'),
        ontology: fileVersion(readFileSync(KNOWLEDGE.ontology, 'utf8')),
        rubricArt: fileVersion(readFileSync(KNOWLEDGE.rubricArt, 'utf8')),
        rubricCop: fileVersion(readFileSync(KNOWLEDGE.rubricCop, 'utf8')),
        styleCard: String(loadStyle(art.scene.style).version),
      },
    },
    config.dryRun,
  );
  const labels = prLabels(day, config.dryRun);
  log.info(`${prTitle(day)} [${labels.join(', ')}] → ${dir}`);
  return { dir, title: prTitle(day), labels };
}

/** Whether a Curate revision kept the visual idea (so the image can be revised instead of redrawn). */
export function sameVisualIdea(a: CurateOutput, b: CurateOutput): boolean {
  const idea = (c: CurateOutput) => JSON.stringify([c.brief.concept, c.brief.metaphor, c.brief.cast, c.brief.style, c.brief.artType]);
  return idea(a) === idea(b);
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      date: { type: 'string' },
      'from-stage': { type: 'string', default: 'fetch' },
      out: { type: 'string', default: 'sloppers' },
      replay: { type: 'string' },
      'no-wait': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: true },
    },
  });
  const fromStage = values['from-stage'] as Stage;
  if (!STAGES.includes(fromStage)) {
    console.error(`--from-stage must be one of ${STAGES.join(', ')}`);
    return 2;
  }
  const date = assertIsoDate(values.date ?? slopperDateFor());
  const t0 = Date.now();
  try {
    const r = await runDay({ date, fromStage, out: values.out!, replay: values.replay, waitOnLimit: !values['no-wait'] });
    console.log(`\n${r.title}\n  labels: ${r.labels.join(', ')}\n  folder: ${r.dir}\n  time:   ${Math.round((Date.now() - t0) / 1000)} s`);
    return 0;
  } catch (e) {
    const known = e instanceof PipelineError || e instanceof FetchFailedError || e instanceof ClaudeError || e instanceof ArtFailedError;
    console.error(`\nPIPELINE FAILED (${date}): ${(e as Error).message}`);
    if (!known) console.error((e as Error).stack);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main();
