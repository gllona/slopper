import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildScene, writeBuild } from '../../harness/index.ts';
import { HARNESS_VERSION } from '../../pipeline/schemas/scene.ts';
import { DaySchema } from '../../pipeline/schemas/day.ts';
import { datePath } from '../../pipeline/util/dates.ts';
import { loadConfig } from '../../pipeline/util/config.ts';
import { slopperNumber } from '../../pipeline/util/numbering.ts';

/**
 * npm run preview:fixtures — renders the harness fixtures into a sample archive under
 * .out/site-fixtures/sloppers/, so the site can be previewed (and deployed to a preview URL)
 * before any real slopper exists. Output is git-ignored.
 */
const OUT = '.out/site-fixtures/sloppers';
const spec = JSON.parse(readFileSync('site/fixtures/sloppers.json', 'utf8')) as {
  launchDate: string;
  days: Array<Record<string, any> & { date: string; scene: string }>;
};
const config = loadConfig({ loadDotEnv: true });

for (const d of spec.days) {
  const scene = JSON.parse(readFileSync(`harness/fixtures/${d.scene}.json`, 'utf8'));
  const number = slopperNumber(d.date, spec.launchDate);
  const result = await buildScene(scene, { ...config, filmstripFrames: config.animation.filmstripFrames }, { motto: d.motto, phrase: d.phrase, number, date: d.date });
  if (!result.lint.ok) throw new Error(`${d.scene}: ${result.lint.errors.join('; ')}`);
  const dir = join(OUT, datePath(d.date));
  mkdirSync(dir, { recursive: true });
  writeBuild(dir, result);
  writeFileSync(join(dir, 'scene.json'), JSON.stringify(scene, null, 2) + '\n');
  const day = DaySchema.parse({
    date: d.date,
    number,
    mode: d.mode,
    continuesFrom: d.continuesFrom,
    motto: d.motto,
    phrase: d.phrase,
    alt: scene.alt,
    artType: scene.animation ? 'animated' : 'static',
    style: scene.style,
    dimensions: d.dimensions,
    mood: d.mood,
    sources: [1, 2].map((i) => ({
      title: `Example headline ${i} for "${d.motto}" (sample data, not real news)`,
      url: `https://example.com/slopper-sample/${d.date}/${i}`,
      source: i === 1 ? 'feeds' : 'hackernews',
      publisher: i === 1 ? 'Example Publisher' : undefined,
      publishedAt: `${d.date}T0${i + 7}:00:00Z`,
    })),
    versions: { harness: HARNESS_VERSION, prompts: '0', ontology: '0', rubricArt: '0', rubricCop: '0', styleCard: '1' },
    generatedAt: `${d.date}T06:10:00Z`,
  });
  writeFileSync(join(dir, 'day.json'), JSON.stringify(day, null, 2) + '\n');
  console.log(`${d.date}  #${number}  ${d.motto}  (${scene.style}, ${day.artType})`);
}
