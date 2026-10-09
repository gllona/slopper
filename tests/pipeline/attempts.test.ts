import { describe, expect, it } from 'vitest';
import { branchFor, nextAttempt, parseSlopperBranch } from '../../pipeline/ops/attempts.ts';

describe('attempt branches (decision 47)', () => {
  it('parses first attempts, later attempts, and rejects other branches', () => {
    expect(parseSlopperBranch('slopper/2026-10-07')).toEqual({ date: '2026-10-07', attempt: 1 });
    expect(parseSlopperBranch('slopper/2026-10-07-3')).toEqual({ date: '2026-10-07', attempt: 3 });
    expect(parseSlopperBranch('refs/heads/slopper/2026-10-07-2')).toEqual({ date: '2026-10-07', attempt: 2 });
    expect(parseSlopperBranch('feat/keep-attempts')).toBeNull();
    expect(parseSlopperBranch('slopper/2026-10-07-x')).toBeNull();
  });
  it('the first attempt keeps the plain name', () => {
    expect(nextAttempt('2026-10-09', ['slopper/2026-10-08', 'main'])).toEqual({ branch: 'slopper/2026-10-09', attempt: 1 });
  });
  it('the next attempt follows the highest number ever used for that date (including old PR heads)', () => {
    const used = ['slopper/2026-10-07', 'slopper/2026-10-07', 'slopper/2026-10-07-2', 'slopper/2026-10-07-4', 'slopper/2026-10-06-9'];
    expect(nextAttempt('2026-10-07', used)).toEqual({ branch: 'slopper/2026-10-07-5', attempt: 5 });
    expect(branchFor('2026-10-07', 1)).toBe('slopper/2026-10-07');
  });
});
