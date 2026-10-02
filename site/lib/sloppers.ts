import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { DaySchema, type Day } from '../../pipeline/schemas/day.ts';
import { datePath, formatLong, publicationDate } from '../../pipeline/util/dates.ts';

/**
 * Loads sloppers for the site (DESIGN §12.7).
 *
 * Modes (SLOPPER_SITE_MODE):
 *   - "build" (default): only folders tracked by git are published — "published" means committed on main.
 *   - "dev": every folder; untracked ones get a "draft" badge.
 *   - "all": every folder, none marked as draft (fixture previews).
 * The archive directory is SLOPPER_ARCHIVE (default: sloppers/).
 */

export type SiteMode = 'build' | 'dev' | 'all';

/** Public files copied next to each day page. Everything else stays in the repo only. */
export const PUBLIC_FILES = ['slopper.svg', 'still.png', 'still.jpg', 'og.png'] as const;

export interface SiteSlopper extends Day {
  /** Publication date (news date + 1), used in public URLs and shown to visitors: "2026-10-01". */
  publishedOn: string;
  /** "2026/10/01" — public path (publication date). */
  path: string;
  /** "/2026/10/01/" */
  url: string;
  /** Folder on disk (named by the news date). */
  dir: string;
  /** "1 October 2026" (publication date). */
  dateLong: string;
  /** "30 September 2026" (the news day it is about). */
  newsDateLong: string;
  draft: boolean;
  animated: boolean;
  files: Record<(typeof PUBLIC_FILES)[number], boolean>;
  continues?: { url: string; number: number | null; date: string };
  prev?: { url: string; date: string };
  next?: { url: string; date: string };
}

export function siteMode(): SiteMode {
  const m = process.env.SLOPPER_SITE_MODE ?? 'build';
  if (m !== 'build' && m !== 'dev' && m !== 'all') throw new Error(`SLOPPER_SITE_MODE must be build, dev, or all (got "${m}")`);
  return m;
}

export function archiveDir(): string {
  return resolve(process.env.SLOPPER_ARCHIVE ?? 'sloppers');
}

/** day.json files tracked by git under the archive (repo-relative paths). */
function trackedDayFiles(root: string): Set<string> {
  try {
    const out = execFileSync('git', ['ls-files', '-z', '--', root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return new Set(out.split('\0').filter((f) => f.endsWith('day.json')).map((f) => resolve(f)));
  } catch {
    return new Set();
  }
}

function findDayFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const y of readdirSync(root).filter((d) => /^\d{4}$/.test(d)))
    for (const m of readdirSync(join(root, y)).filter((d) => /^\d{2}$/.test(d)))
      for (const d of readdirSync(join(root, y, m)).filter((x) => /^\d{2}$/.test(x))) {
        const f = join(root, y, m, d, 'day.json');
        if (existsSync(f)) out.push(f);
      }
  return out;
}

export function loadSloppers(mode: SiteMode = siteMode(), root: string = archiveDir()): SiteSlopper[] {
  const tracked = mode === 'build' ? trackedDayFiles(root) : new Set<string>();
  const list: SiteSlopper[] = [];
  for (const file of findDayFiles(root)) {
    const isTracked = tracked.has(resolve(file));
    if (mode === 'build' && !isTracked) continue;
    const parsed = DaySchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    if (!parsed.success) {
      throw new Error(`Invalid ${relative(process.cwd(), file)}:\n${parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
    }
    const day = parsed.data;
    const dir = join(file, '..');
    if (relative(root, dir) !== datePath(day.date)) throw new Error(`${relative(process.cwd(), file)} declares date ${day.date}`);
    const publishedOn = publicationDate(day.date);
    const path = datePath(publishedOn);
    const files = Object.fromEntries(PUBLIC_FILES.map((f) => [f, existsSync(join(dir, f))])) as SiteSlopper['files'];
    if (!files['slopper.svg']) throw new Error(`${relative(process.cwd(), dir)} has no slopper.svg`);
    list.push({
      ...day,
      publishedOn,
      path,
      url: `/${path}/`,
      dir,
      dateLong: formatLong(publishedOn),
      newsDateLong: formatLong(day.date),
      draft: mode === 'dev' && !isTrackedInDev(file),
      animated: day.artType === 'animated',
      files,
    });
  }
  // newest first
  list.sort((a, b) => b.date.localeCompare(a.date));
  const byDate = new Map(list.map((s) => [s.date, s]));
  list.forEach((s, i) => {
    const newer = list[i - 1];
    const older = list[i + 1];
    if (older) s.prev = { url: older.url, date: older.publishedOn };
    if (newer) s.next = { url: newer.url, date: newer.publishedOn };
    const from = s.continuesFrom ? byDate.get(s.continuesFrom) : undefined;
    if (from) s.continues = { url: from.url, number: from.number, date: from.publishedOn };
  });
  return list;
}

let devTracked: Set<string> | null = null;
function isTrackedInDev(file: string): boolean {
  devTracked ??= trackedDayFiles(archiveDir());
  return devTracked.has(resolve(file));
}

/** Group by month for the archive page, newest month first. */
export function byMonth(list: SiteSlopper[]): { key: string; label: string; items: SiteSlopper[] }[] {
  const groups = new Map<string, SiteSlopper[]>();
  for (const s of list) {
    const key = s.publishedOn.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups].map(([key, items]) => ({
    key,
    label: new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    items,
  }));
}
