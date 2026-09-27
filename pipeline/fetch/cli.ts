import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from '../util/config.ts';
import { assertIsoDate, datePath, slopperDateFor } from '../util/dates.ts';
import { LiveHttp, RecordingHttp, ReplayHttp, type HttpClient } from './http.ts';
import { FetchFailedError, runFetch } from './index.ts';

/**
 * npm run fetch -- [--date YYYY-MM-DD] [--out path] [--record dir | --replay dir]
 * Default date: yesterday (UTC). Default output: sloppers/YYYY/MM/DD/digest.json.
 * Exit code 1 when more than half of the sources failed (DESIGN §20).
 */
const { values } = parseArgs({
  options: { date: { type: 'string' }, out: { type: 'string' }, record: { type: 'string' }, replay: { type: 'string' } },
});
const date = assertIsoDate(values.date ?? slopperDateFor());
const config = loadConfig({ loadDotEnv: true });
let http: HttpClient = values.replay ? new ReplayHttp(values.replay) : new LiveHttp();
if (values.record) http = new RecordingHttp(http, values.record);
const out = values.out ?? join('sloppers', datePath(date), 'digest.json');

const write = (digest: unknown) => {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(digest, null, 2) + '\n');
};

try {
  const t0 = performance.now();
  const digest = await runFetch({ date, config, http });
  write(digest);
  for (const s of digest.sources) console.log(`  ${s.ok ? 'ok  ' : 'FAIL'} ${s.source.padEnd(12)} ${String(s.count).padStart(3)}${s.error ? `  ${s.error}` : ''}`);
  console.log(`${digest.items.length} items for ${date} in ${Math.round((performance.now() - t0) / 1000)} s → ${out}`);
} catch (e) {
  if (e instanceof FetchFailedError) {
    write(e.digest);
    console.error(`FETCH FAILED: ${e.message}`);
    process.exitCode = 1;
  } else {
    throw e;
  }
}
