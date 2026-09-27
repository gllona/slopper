import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { sanitizeSvg } from '../../harness/sanitize.ts';
import { CopFileSchema } from '../schemas/cop.ts';
import { CriticFileSchema } from '../schemas/critic.ts';
import { CurateOutputSchema } from '../schemas/curate.ts';
import { DaySchema } from '../schemas/day.ts';
import { DigestSchema } from '../schemas/digest.ts';
import { SceneSchema } from '../schemas/scene.ts';
import { StorylinesFileSchema } from '../schemas/storylines.ts';
import { loadConfig } from '../util/config.ts';
import { datePath } from '../util/dates.ts';
import { slopperNumber } from '../util/numbering.ts';

/**
 * Re-validates slopper folders without trusting the AI job that produced them (DESIGN §16.1 open-pr, §16.3 CI):
 * schemas, SVG sanitizer re-check, allowed file names, size limits, date/number consistency.
 *   npm run verify:sloppers [-- sloppers/2026/09/26 …]   (default: every folder under sloppers/)
 */

const REQUIRED = ['day.json', 'digest.json', 'scene.json', 'slopper.svg', 'still.png', 'og.png', 'critic.json', 'cop.json'];
const OPTIONAL = ['filmstrip.png', 'curate.json', 'storylines.json', 'pr.md'];
const MAX_PNG = 2_000_000;
const MAX_JSON = 1_000_000;

export function verifyFolder(dir: string): string[] {
  const config = loadConfig({ env: process.env });
  const problems: string[] = [];
  const p = (m: string) => problems.push(`${relative(process.cwd(), dir)}: ${m}`);
  const files = readdirSync(dir);
  for (const f of files) if (!REQUIRED.includes(f) && !OPTIONAL.includes(f)) p(`unexpected file "${f}"`);
  for (const f of REQUIRED) if (!files.includes(f)) p(`missing ${f}`);
  if (problems.length) return problems;

  const json = (name: string) => {
    const f = join(dir, name);
    if (statSync(f).size > MAX_JSON) p(`${name} is larger than ${MAX_JSON} bytes`);
    return JSON.parse(readFileSync(f, 'utf8'));
  };
  const check = (name: string, schema: { safeParse(v: unknown): { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }) => {
    if (!existsSync(join(dir, name))) return null;
    const r = schema.safeParse(json(name));
    if (!r.success) p(`${name}: ${r.error!.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    return r.success ? json(name) : null;
  };
  const day = check('day.json', DaySchema);
  check('digest.json', DigestSchema);
  check('scene.json', SceneSchema);
  check('critic.json', CriticFileSchema);
  check('cop.json', CopFileSchema);
  check('curate.json', CurateOutputSchema);
  check('storylines.json', StorylinesFileSchema);

  if (day) {
    if (!dir.replace(/\\/g, '/').replace(/\/$/, '').endsWith(datePath(day.date))) p(`day.json date ${day.date} does not match the folder`);
    if (config.launchDate && day.number !== slopperNumber(day.date, config.launchDate)) p(`number ${day.number} does not match LAUNCH_DATE ${config.launchDate}`);
  }

  const svg = readFileSync(join(dir, 'slopper.svg'), 'utf8');
  if (Buffer.byteLength(svg) > config.svgMaxKB * 1024) p(`slopper.svg is larger than ${config.svgMaxKB} KB`);
  try {
    const { removed } = sanitizeSvg(svg);
    if (removed.length) p(`slopper.svg fails the sanitizer re-check: ${removed.join('; ')}`);
  } catch (e) {
    p(`slopper.svg does not parse: ${(e as Error).message}`);
  }
  for (const f of files.filter((x) => x.endsWith('.png'))) {
    const buf = readFileSync(join(dir, f));
    if (buf.length > MAX_PNG) p(`${f} is larger than ${MAX_PNG} bytes`);
    if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') p(`${f} is not a PNG`);
  }
  return problems;
}

export function allFolders(root = 'sloppers'): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const y of readdirSync(root).filter((d) => /^\d{4}$/.test(d)))
    for (const m of readdirSync(join(root, y)).filter((d) => /^\d{2}$/.test(d)))
      for (const d of readdirSync(join(root, y, m)).filter((x) => /^\d{2}$/.test(x))) out.push(join(root, y, m, d));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dirs = process.argv.slice(2).length ? process.argv.slice(2) : allFolders();
  const problems = dirs.flatMap((d) => verifyFolder(d));
  for (const pr of problems) console.error(`✗ ${pr}`);
  console.log(`${dirs.length} slopper folder(s) checked, ${problems.length} problem(s)`);
  process.exitCode = problems.length ? 1 : 0;
}
