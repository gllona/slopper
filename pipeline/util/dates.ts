/**
 * UTC-only date helpers. A "date" is always an ISO calendar day string: YYYY-MM-DD.
 * Never use local time anywhere in Slopper (DESIGN §5, decision 6).
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export type IsoDate = string;

export function isIsoDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return toIsoDate(d) === s;
}

export function assertIsoDate(s: string): IsoDate {
  if (!isIsoDate(s)) throw new Error(`Invalid date "${s}" (expected YYYY-MM-DD)`);
  return s;
}

export function toIsoDate(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

/** Midnight UTC at the start of the given day. */
export function startOfDay(date: IsoDate): Date {
  assertIsoDate(date);
  return new Date(`${date}T00:00:00.000Z`);
}

export function addDays(date: IsoDate, n: number): IsoDate {
  return toIsoDate(new Date(startOfDay(date).getTime() + n * DAY_MS));
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
}

/** The fetch window for a slopper date: [date 00:00 UTC, date+1 00:00 UTC). */
export function dayWindow(date: IsoDate): { from: Date; to: Date } {
  return { from: startOfDay(date), to: startOfDay(addDays(date, 1)) };
}

/** The slopper date for a generation run at `now`: the previous UTC day. */
export function slopperDateFor(now: Date = new Date()): IsoDate {
  return addDays(toIsoDate(now), -1);
}

/** "2026/09/27" — the folder / URL path segment for a date. */
export function datePath(date: IsoDate): string {
  assertIsoDate(date);
  return date.replaceAll('-', '/');
}

/**
 * The day a slopper is published: the day after the news day it covers (generated and published on D+1;
 * the 19:00 UTC deadline is the same calendar day in UTC and in UTC-5). Public URLs and the dates visitors
 * read use this day (DESIGN decision 43); the archive folder, day.json, and branches keep the news day.
 */
export function publicationDate(newsDate: IsoDate): IsoDate {
  return addDays(newsDate, 1);
}

/** "27 September 2026" — the human format used on the site. */
export function formatLong(date: IsoDate): string {
  return startOfDay(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
