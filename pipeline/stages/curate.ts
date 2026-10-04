import { readFileSync } from 'node:fs';
import { stringify as toYaml } from 'yaml';
import { listStyles, loadStyle } from '../../harness/style.ts';
import { callClaude, fillTemplate } from '../claude.ts';
import type { Config } from '../schemas/config.ts';
import { CurateOutputSchema, type CurateOutput } from '../schemas/curate.ts';
import { storyRelevance, type Day } from '../schemas/day.ts';
import type { Digest } from '../schemas/digest.ts';
import type { StorylinesFile } from '../schemas/storylines.ts';
import { modeContext, type ModeContext } from '../util/archive.ts';
import { logger } from '../util/log.ts';

/** Stage 2 — Curate (DESIGN §5, §6, §8): top stories, storylines, mode, motto, phrase, brief, sources. */

export interface CurateInput {
  date: string;
  digest: Digest;
  recent: Day[];
  storylines: StorylinesFile;
  config: Config;
  /** Notes from the Cop when it asked for a revision. */
  revisionNotes?: string[];
  /** The previous answer, when revising. */
  previous?: CurateOutput;
}

export const KNOWLEDGE = {
  ontology: 'knowledge/ontology.yaml',
  voice: 'knowledge/voice.md',
  lessons: 'knowledge/LESSONS.md',
  rubricArt: 'knowledge/rubric-art.md',
  rubricCop: 'knowledge/rubric-cop.md',
  storylines: 'knowledge/storylines.json',
};

/** The mode rule for today, in words for the prompt and as a function for the check (DESIGN §6.3, §6.4). */
export function modeRule(ctx: ModeContext, config: Config) {
  const base = config.relevanceThreshold;
  const bonus = ctx.dominantDimension ? config.balanceBonus : 0;
  const forcedFresh = ctx.continuationStreak >= config.maxContinuationDays || !ctx.previous;
  const threshold = (dims: string[]) => (ctx.dominantDimension && !dims.includes(ctx.dominantDimension) ? base - bonus : base);
  const lines = [
    `   - A story's relevance is novelty × magnitude × breadth (0–27).`,
    `   - **fresh** when at least one top story reaches the threshold of ${base}` +
      (ctx.dominantDimension ? `, or ${base - bonus} for stories that are not about "${ctx.dominantDimension}" (that dimension led the last 3 days: balance rule)` : '') +
      `; otherwise **continuation**.`,
  ];
  if (!ctx.previous) lines.push('   - There is no previous slopper yet, so today **must be fresh** (use the most relevant story even if it is small).');
  else if (forcedFresh)
    lines.push(`   - There have been ${ctx.continuationStreak} continuation days in a row (the maximum is ${config.maxContinuationDays}), so today **must be fresh**, using the most relevant story even if it is below the threshold.`);
  else
    lines.push(
      `   - On a continuation day the slopper continues or references the previous one (${ctx.previous.date}: "${ctx.previous.motto}" — "${ctx.previous.phrase}"): same cast, a follow-up moment, or a callback.`,
    );
  const expected = (out: CurateOutput): 'fresh' | 'continuation' => {
    if (forcedFresh) return 'fresh';
    return out.topStories.some((s) => storyRelevance(s) >= threshold(s.dimensions)) ? 'fresh' : 'continuation';
  };
  return { text: lines.join('\n'), expected, forcedFresh };
}

export function stylesSummary(recent: Day[]): string {
  const lines = ['# Style cards', ''];
  for (const id of listStyles()) {
    const s = loadStyle(id);
    lines.push(`## ${s.id} — ${s.name}`, '', s.description, '', `Mood: ${s.mood.join(', ')}`, '');
  }
  lines.push('# Recently used', '', ...recent.slice(0, 7).map((d) => `- ${d.date}: ${d.style} (${d.artType})`));
  return lines.join('\n');
}

export async function runCurate(input: CurateInput): Promise<CurateOutput> {
  const log = logger('curate');
  const ctx = modeContext(input.recent, input.date);
  const rule = modeRule(ctx, input.config);
  const styles = listStyles();
  const yesterdayStyle = input.recent[0]?.date && ctx.previous ? ctx.previous.style : null;
  const itemIds = new Set(input.digest.items.map((i) => i.id));
  const storylineIds = new Set(input.storylines.storylines.map((s) => s.id));

  let prompt = fillTemplate(readFileSync('prompts/curate.md', 'utf8'), {
    date: input.date,
    modeRules: rule.text,
    styleRule: yesterdayStyle ? `choose a different card than yesterday's "${yesterdayStyle}"` : 'any card',
  });
  if (input.revisionNotes?.length) {
    prompt += `\n\n## Revision requested by the legal reviewer\n\nYour previous answer is in \`previous.json\`. Keep what is fine and fix these problems:\n${input.revisionNotes.map((n) => `- ${n}`).join('\n')}\n`;
  }

  const recentForPrompt = input.recent.map((d) => ({
    date: d.date,
    mode: d.mode,
    motto: d.motto,
    phrase: d.phrase,
    style: d.style,
    storylines: d.storylines,
    dimensions: d.dimensions,
    brief: d.brief ? { concept: d.brief.concept, cast: d.brief.cast } : undefined,
  }));

  const { value } = await callClaude({
    stage: 'curate',
    prompt,
    schema: CurateOutputSchema,
    timeoutMs: 15 * 60_000,
    files: [
      { name: 'digest.json', content: JSON.stringify({ date: input.digest.date, items: input.digest.items }, null, 1) },
      { name: 'recent-days.json', content: JSON.stringify(recentForPrompt, null, 1) },
      { name: 'storylines.json', content: JSON.stringify(input.storylines, null, 1) },
      { name: 'ontology.yaml', path: KNOWLEDGE.ontology },
      { name: 'voice.md', path: KNOWLEDGE.voice },
      { name: 'LESSONS.md', path: KNOWLEDGE.lessons },
      { name: 'styles.md', content: stylesSummary(input.recent) },
      ...(input.previous ? [{ name: 'previous.json', content: JSON.stringify(input.previous, null, 1) }] : []),
    ],
    check: (out) => {
      const problems: string[] = [];
      const newIds = new Set(out.newStorylines.map((s) => s.id));
      for (const [i, s] of out.topStories.entries()) {
        for (const id of s.itemIds) if (!itemIds.has(id)) problems.push(`topStories.${i}.itemIds: "${id}" is not an item id in digest.json`);
        if (!storylineIds.has(s.storyline) && !newIds.has(s.storyline))
          problems.push(`topStories.${i}.storyline: "${s.storyline}" is neither in storylines.json nor in newStorylines`);
      }
      for (const id of out.sourceIds) if (!itemIds.has(id)) problems.push(`sourceIds: "${id}" is not an item id in digest.json`);
      if (out.topStories.length === 0 && (out.mode === 'fresh' || !ctx.previous)) problems.push('topStories: a fresh day needs at least one top story');
      if (out.sourceIds.length === 0 && out.mode === 'fresh') problems.push('sourceIds: a fresh day needs at least one source');
      const expected = rule.expected(out);
      if (out.mode !== expected) {
        const rels = out.topStories.map((s) => `${s.title}: ${storyRelevance(s)}`).join('; ');
        problems.push(`mode: by the rules and your own scores the day is "${expected}", not "${out.mode}" (relevance: ${rels || 'no stories'}). Change the mode (and the texts) or correct the scores honestly.`);
      }
      if (!styles.includes(out.brief.style)) problems.push(`brief.style: "${out.brief.style}" is not one of ${styles.join(', ')}`);
      if (yesterdayStyle && out.brief.style === yesterdayStyle && styles.length > 1) problems.push(`brief.style: yesterday used "${yesterdayStyle}"; choose another card`);
      if (out.brief.artType === 'animated' && (out.brief.beats?.length ?? 0) < 2) problems.push('brief.beats: an animated brief needs 2–4 story beats');
      problems.push(...castingProblems(out.brief.cast));
      return problems;
    },
  });
  log.info(`${value.mode}: "${value.motto}" — ${value.phrase}`);
  return value;
}

/** For debugging and PR bodies. */
export function curateSummary(out: CurateOutput): string {
  return toYaml({ mode: out.mode, motto: out.motto, phrase: out.phrase, style: out.brief.style, artType: out.brief.artType });
}

const ROBOT_WORDS = /\b(robots?|android|bots?|automaton|cyborg)\b/i;

/** Casting rule (decision 45): a person or institution must not be described as a robot. */
export function castingProblems(cast: { who: string; kind: string }[]): string[] {
  return cast
    .map((c, i) =>
      (c.kind === 'person' || c.kind === 'institution') && ROBOT_WORDS.test(c.who)
        ? `brief.cast.${i}: "${c.who}" is a ${c.kind} but described as a robot. People are drawn as humans and institutions as buildings or the people who run them; a robot is only for an AI system (or when the joke is explicitly that AI replaced them, then use kind "ai" and say so in the concept).`
        : null,
    )
    .filter((p): p is string => p !== null);
}
