import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DaySchema, type Day } from '../schemas/day.ts';
import { StorylinesFileSchema, type StorylinesFile } from '../schemas/storylines.ts';
import { addDays, datePath, type IsoDate } from './dates.ts';

/** Reading earlier sloppers from the archive (sloppers/YYYY/MM/DD/). */

export function dayDir(root: string, date: IsoDate): string {
  return join(root, datePath(date));
}

/** day.json of the `n` days before `date` that exist on disk, newest first. */
export function recentDays(root: string, date: IsoDate, n: number): Day[] {
  const out: Day[] = [];
  for (let i = 1; i <= n; i++) {
    const f = join(dayDir(root, addDays(date, -i)), 'day.json');
    if (!existsSync(f)) continue;
    const parsed = DaySchema.safeParse(JSON.parse(readFileSync(f, 'utf8')));
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/**
 * Storylines before `date`: the snapshot saved with the most recent earlier slopper (each day folder keeps
 * `storylines.json` = the state after that day), or knowledge/storylines.json.
 */
export function storylinesBefore(root: string, date: IsoDate, knowledgeFile: string, lookbackDays = 14): StorylinesFile {
  for (let i = 1; i <= lookbackDays; i++) {
    const f = join(dayDir(root, addDays(date, -i)), 'storylines.json');
    if (existsSync(f)) return StorylinesFileSchema.parse(JSON.parse(readFileSync(f, 'utf8')));
  }
  return StorylinesFileSchema.parse(JSON.parse(readFileSync(knowledgeFile, 'utf8')));
}

/** The main dimension of a day (highest score; ties → ontology order). */
export function primaryDimension(day: Day): string | null {
  let best: [string, number] | null = null;
  for (const [k, v] of Object.entries(day.dimensions)) if (v !== undefined && (!best || v > best[1])) best = [k, v];
  return best && best[1] > 0 ? best[0] : null;
}

export interface ModeContext {
  /** Consecutive continuation days right before `date`. */
  continuationStreak: number;
  /** The previous day's slopper, when it exists (yesterday or earlier). */
  previous: Day | null;
  /** A dimension that was primary on each of the last 3 days (balance rule active), or null. */
  dominantDimension: string | null;
}

export function modeContext(recent: Day[], date: IsoDate): ModeContext {
  let streak = 0;
  let expected = addDays(date, -1);
  for (const d of recent) {
    if (d.date !== expected || d.mode !== 'continuation') break;
    streak++;
    expected = addDays(expected, -1);
  }
  const last3 = recent.slice(0, 3);
  const prim = last3.map(primaryDimension);
  const dominant = last3.length === 3 && prim[0] && prim.every((p) => p === prim[0]) ? prim[0]! : null;
  return { continuationStreak: streak, previous: recent[0] ?? null, dominantDimension: dominant };
}
