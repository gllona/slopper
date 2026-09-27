import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from '../pipeline/util/config.ts';
import { SceneError } from './compile.ts';
import { buildScene, writeBuild } from './index.ts';
import { withBrowser } from './render.ts';

/**
 * npm run harness:render -- <scene.json> [--out dir] [--motto "…"] [--phrase "…"]
 * Compile + sanitize + render + lint one scene. Exit code 1 on scene or lint errors.
 */
async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { out: { type: 'string' }, motto: { type: 'string' }, phrase: { type: 'string' } },
  });
  const [command, ...files] = positionals;
  if (command === 'fixtures') {
    const dir = 'harness/fixtures';
    const all = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
    let failed = 0;
    for (const f of all) failed += await renderOne(join(dir, f), undefined, {});
    await contactSheet(all.map((f) => join('.out', basename(f, '.json'), 'still.png')).filter((p) => existsSync(p)), '.out/contact-sheet.png');
    console.log(`\n${all.length - failed}/${all.length} fixtures OK → .out/contact-sheet.png`);
    return failed ? 1 : 0;
  }
  if (command !== 'render' || files.length !== 1) {
    console.error('usage: npm run harness:render -- <scene.json> [--out dir] [--motto text] [--phrase text]\n       npm run harness:fixtures');
    return 2;
  }
  return renderOne(files[0]!, values.out, values);
}

async function renderOne(file: string, outDir: string | undefined, values: { motto?: string; phrase?: string }): Promise<number> {
  const config = loadConfig({ loadDotEnv: true });
  const out = outDir ?? join('.out', basename(file, '.json'));
  const scene = JSON.parse(readFileSync(file, 'utf8'));
  try {
    const t0 = performance.now();
    const result = await buildScene(scene, { ...config, filmstripFrames: config.animation.filmstripFrames }, { motto: values.motto, phrase: values.phrase });
    const files = writeBuild(out, result);
    const { lint } = result;
    console.log(`${lint.ok ? 'OK' : 'LINT FAILED'}  ${file}  (${Math.round(performance.now() - t0)} ms)`);
    console.log(`  svg ${lint.stats.svgKB} KB · words ${lint.stats.words} · ${lint.stats.duration ? `animated ${lint.stats.duration}s` : 'static'} · colors ${lint.stats.colors.length}`);
    for (const e of lint.errors) console.log(`  ERROR ${e}`);
    for (const w of lint.warnings) console.log(`  warn  ${w}`);
    for (const f of files) console.log(`  → ${f}`);
    return lint.ok ? 0 : 1;
  } catch (e) {
    if (e instanceof SceneError) {
      console.log(`SCENE INVALID  ${file}`);
      for (const i of e.issues) console.log(`  - ${i}`);
      return 1;
    }
    throw e;
  }
}

/** A grid of stills, for reviewing many scenes at once. */
async function contactSheet(stills: string[], out: string): Promise<void> {
  if (!stills.length) return;
  const cell = 360;
  const cols = Math.min(4, stills.length);
  const rows = Math.ceil(stills.length / cols);
  const imgs = stills
    .map((p) => `<figure><img src="data:image/png;base64,${readFileSync(p).toString('base64')}"><figcaption>${basename(join(p, '..'))}</figcaption></figure>`)
    .join('');
  const png = await withBrowser(async (browser) => {
    const page = await browser.newPage({ viewport: { width: cols * (cell + 12) + 12, height: rows * (cell + 40) + 12 } });
    await page.setContent(
      `<body style="margin:0;padding:6px;background:#222;display:grid;grid-template-columns:repeat(${cols},${cell}px);gap:12px;font:14px monospace;color:#ddd"><style>figure{margin:0}img{width:${cell}px;height:${cell}px;display:block}</style>${imgs}</body>`,
    );
    return page.screenshot({ type: 'png', fullPage: true });
  });
  writeFileSync(out, png);
}

process.exitCode = await main();
