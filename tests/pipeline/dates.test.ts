import { describe, expect, it } from 'vitest';
import { addDays, datePath, dayWindow, daysBetween, formatLong, isIsoDate, slopperDateFor } from '../../pipeline/util/dates.ts';
import { slopperNumber } from '../../pipeline/util/numbering.ts';

describe('dates (UTC only)', () => {
  it('validates ISO dates strictly', () => {
    expect(isIsoDate('2026-09-27')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-9-27')).toBe(false);
  });
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });
  it('computes the fetch window', () => {
    const w = dayWindow('2026-09-27');
    expect(w.from.toISOString()).toBe('2026-09-27T00:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-09-28T00:00:00.000Z');
  });
  it('the slopper date is the previous UTC day', () => {
    expect(slopperDateFor(new Date('2026-09-28T06:00:00Z'))).toBe('2026-09-27');
    expect(slopperDateFor(new Date('2026-09-28T00:00:01Z'))).toBe('2026-09-27');
  });
  it('formats paths and long dates', () => {
    expect(datePath('2026-09-07')).toBe('2026/09/07');
    expect(formatLong('2026-09-27')).toBe('27 September 2026');
    expect(daysBetween('2026-09-01', '2026-10-01')).toBe(30);
  });
});

describe('numbering', () => {
  it('is days since launch + 1, and null before launch', () => {
    expect(slopperNumber('2026-10-15', '2026-10-15')).toBe(1);
    expect(slopperNumber('2026-11-25', '2026-10-15')).toBe(42);
    expect(slopperNumber('2026-10-14', '2026-10-15')).toBeNull();
    expect(slopperNumber('2026-10-14', undefined)).toBeNull();
  });
});
