import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toJpeg } from '../../harness/render.ts';
import { allFolders } from './verify.ts';

/**
 * npm run backfill:jpeg — create still.jpg (from still.png) for slopper folders made before still.jpg existed.
 * Idempotent: folders that already have still.jpg are skipped.
 */
let n = 0;
for (const dir of process.argv.slice(2).length ? process.argv.slice(2) : allFolders()) {
  const png = join(dir, 'still.png');
  const jpg = join(dir, 'still.jpg');
  if (!existsSync(png) || existsSync(jpg)) continue;
  writeFileSync(jpg, await toJpeg(readFileSync(png)));
  console.log(`wrote ${jpg}`);
  n++;
}
console.log(`${n} still.jpg file(s) created`);
