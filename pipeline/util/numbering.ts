import { daysBetween, type IsoDate } from './dates.ts';

/**
 * Slopper number = days since LAUNCH_DATE + 1 (DESIGN decision 20).
 * Computed once at generation and stored in day.json; gaps never renumber later sloppers.
 * Before launch (or with no launch date configured) there is no number: returns null.
 */
export function slopperNumber(date: IsoDate, launchDate: IsoDate | undefined): number | null {
  if (!launchDate) return null;
  const n = daysBetween(launchDate, date) + 1;
  return n >= 1 ? n : null;
}
