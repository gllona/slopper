import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CopFile } from '../schemas/cop.ts';
import type { CriticFile } from '../schemas/critic.ts';
import type { CurateOutput } from '../schemas/curate.ts';
import { DaySchema, type Day } from '../schemas/day.ts';
import type { Digest } from '../schemas/digest.ts';
import { HARNESS_VERSION } from '../schemas/scene.ts';
import type { StorylinesFile } from '../schemas/storylines.ts';
import type { ArtAttempt } from './art.ts';
import { slopperTitle } from '../util/dates.ts';

/** Stage 5 — Package (DESIGN §5): final day.json, critic.json, cop.json, storylines snapshot, PR body. */

export interface PackageInput {
  dir: string;
  date: string;
  number: number | null;
  curate: CurateOutput;
  art: ArtAttempt;
  critic: CriticFile;
  cop: CopFile;
  digest: Digest;
  storylines: StorylinesFile;
  continuesFrom?: string;
  versions: Day['versions'];
  now?: Date;
}

export function buildDay(p: PackageInput): Day {
  const byId = new Map(p.digest.items.map((i) => [i.id, i]));
  return DaySchema.parse({
    date: p.date,
    number: p.number,
    mode: p.curate.mode,
    continuesFrom: p.curate.mode === 'continuation' ? p.continuesFrom : undefined,
    motto: p.curate.motto,
    phrase: p.curate.phrase,
    phraseAlternatives: p.curate.phraseAlternatives,
    alt: p.art.scene.alt,
    artType: p.art.scene.animation ? 'animated' : 'static',
    style: p.art.scene.style,
    dimensions: p.curate.dimensions,
    mood: p.curate.mood,
    storylines: [...new Set(p.curate.topStories.map((s) => s.storyline))],
    topStories: p.curate.topStories,
    brief: p.curate.brief,
    sources: p.curate.sourceIds
      .map((id) => byId.get(id))
      .filter((i) => i !== undefined)
      .map((i) => ({ id: i.id, title: i.title, url: i.url, source: i.source, publisher: i.publisher, publishedAt: i.publishedAt })),
    critic: { passed: p.critic.passed, average: p.art.average ?? 0, iterations: p.critic.iterations.length },
    cop: { verdict: p.cop.verdict },
    versions: { ...p.versions, harness: HARNESS_VERSION },
    generatedAt: (p.now ?? new Date()).toISOString(),
  });
}

export function prLabels(day: Day, dryRun: boolean): string[] {
  const labels = ['slopper', day.mode];
  if (day.critic && !day.critic.passed) labels.push('critic-fail');
  if (day.cop && day.cop.verdict !== 'pass') labels.push('cop-hold');
  if (dryRun) labels.push('dry-run');
  return labels;
}

export function prTitle(day: Day): string {
  return slopperTitle(day.number, day.date, day.motto);
}

/** Markdown body for the daily PR (M6 opens it; locally it is just a readable summary). */
export function prBody(day: Day, critic: CriticFile, cop: CopFile, stillPath: string): string {
  const best = critic.iterations.find((i) => i.iteration === critic.bestIteration);
  const scores = best?.review ? Object.entries(best.review.scores).map(([k, v]) => `${k} ${v}`).join(' · ') : '—';
  return [
    `![${day.alt.replace(/[[\]]/g, '')}](${stillPath})`,
    '',
    `## ${day.motto}`,
    '',
    `> ${day.phrase}`,
    '',
    `**Mode:** ${day.mode}${day.continuesFrom ? ` (continues ${day.continuesFrom})` : ''} · **Style:** ${day.style} (${day.artType})`,
    '',
    `**Critic:** ${critic.passed ? '✅ passed' : '❌ did not pass'} — average ${day.critic?.average} after ${critic.iterations.length} iteration(s) — ${scores}`,
    best?.review ? `> ${best.review.verdict}` : '',
    '',
    `**Cop:** ${cop.verdict === 'pass' ? '✅ pass' : `⛔ ${cop.verdict}`}${cop.rounds.at(-1)?.findings.length ? '' : ' (no findings)'}`,
    ...(cop.rounds.at(-1)?.findings ?? []).map((f) => `- **${f.severity}** ${f.check}: ${f.evidence} → ${f.suggestion}`),
    '',
    '**Alternatives:**',
    ...day.phraseAlternatives.map((a) => `- ${a}`),
    '',
    '<details><summary>Sources</summary>',
    '',
    ...day.sources.map((s) => `- [${s.title.replace(/[[\]]/g, '')}](${s.url}) — ${s.publisher ?? s.source}`),
    '',
    '</details>',
    '',
    'Labels: add `approved` to publish now, `veto` to block, `regenerate` to try again.',
  ].join('\n');
}

export function writePackage(p: PackageInput, dryRun: boolean): Day {
  const day = buildDay(p);
  mkdirSync(p.dir, { recursive: true });
  const put = (name: string, v: unknown) => writeFileSync(join(p.dir, name), typeof v === 'string' ? v : JSON.stringify(v, null, 2) + '\n');
  put('day.json', day);
  put('critic.json', p.critic);
  put('cop.json', p.cop);
  put('storylines.json', p.storylines);
  put('pr.md', `# ${prTitle(day)}\n\nLabels: ${prLabels(day, dryRun).join(', ')}\n\n${prBody(day, p.critic, p.cop, 'still.png')}\n`);
  return day;
}
