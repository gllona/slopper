import { readFileSync } from 'node:fs';
import { callClaude, fillTemplate } from '../claude.ts';
import { CopVerdictSchema, type CopVerdict } from '../schemas/cop.ts';
import type { CurateOutput } from '../schemas/curate.ts';
import type { Digest } from '../schemas/digest.ts';
import type { Scene } from '../schemas/scene.ts';
import { logger } from '../util/log.ts';
import { KNOWLEDGE } from './curate.ts';

/** Stage 4 — the Cop (DESIGN §11): legal-risk review of the final outputs, with a fresh context. */

export interface CopInput {
  curate: CurateOutput;
  scene: Scene;
  digest: Digest;
  still: Buffer;
  filmstrip: Buffer | null;
}

/** Every text drawn in the art (labels, speech bubbles), for the review. */
export function sceneTexts(scene: Scene): string[] {
  return scene.elements.map((e) => e.props?.text).filter((t): t is string => typeof t === 'string');
}

export async function runCop(input: CopInput): Promise<CopVerdict> {
  const byId = new Map(input.digest.items.map((i) => [i.id, i]));
  const sources = input.curate.sourceIds.map((id) => byId.get(id)).filter((i) => i !== undefined);
  const review = {
    motto: input.curate.motto,
    phrase: input.curate.phrase,
    alt: input.scene.alt,
    textsInArt: sceneTexts(input.scene),
    sources: sources.map((s) => ({ title: s.title, publisher: s.publisher, url: s.url, snippet: s.snippet, publishedAt: s.publishedAt })),
  };
  const prompt = fillTemplate(readFileSync('prompts/cop.md', 'utf8'), {
    filmstrip: input.filmstrip ? '- `filmstrip.png` — frames of the animation.\n' : '',
  });
  const { value } = await callClaude({
    stage: 'cop',
    prompt,
    schema: CopVerdictSchema,
    timeoutMs: 8 * 60_000,
    files: [
      { name: 'rubric-cop.md', path: KNOWLEDGE.rubricCop },
      { name: 'review.json', content: JSON.stringify(review, null, 1) },
      { name: 'still.png', content: input.still },
      ...(input.filmstrip ? [{ name: 'filmstrip.png', content: input.filmstrip }] : []),
      { name: 'LESSONS.md', path: KNOWLEDGE.lessons },
    ],
    check: (v) => {
      const serious = v.findings.filter((f) => f.severity !== 'low');
      if (v.verdict === 'pass' && serious.length) return ['verdict: "pass" is not allowed with medium or high findings; use "revise" or "hold"'];
      if (v.verdict === 'revise' && !serious.some((f) => f.stage)) return ['findings: a "revise" verdict needs findings with a stage (curate or art) to fix'];
      return [];
    },
  });
  logger('cop').info(`${value.verdict} (${value.findings.length} findings)`);
  return value;
}
