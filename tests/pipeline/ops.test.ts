import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decide, eligiblePrs, type PrInfo } from '../../pipeline/ops/eligibility.ts';
import { verifyFolder } from '../../pipeline/ops/verify.ts';
import { runDay } from '../../pipeline/run.ts';

const window = { vetoMode: 'window' as const, publishHourUTC: 19, vetoMinMinutes: 60 };
const ciOk = [{ name: 'ci', conclusion: 'SUCCESS' }];
const pr = (over: Partial<Omit<PrInfo, 'labels'>> & { labels?: string[] } = {}): PrInfo => ({
  number: over.number ?? 1,
  headRefName: over.headRefName ?? 'slopper/2026-09-26',
  createdAt: over.createdAt ?? '2026-09-27T15:40:00Z',
  labels: (over.labels ?? ['slopper', 'fresh']).map((name) => ({ name })),
  statusCheckRollup: over.statusCheckRollup ?? ciOk,
});
const at = (iso: string) => new Date(iso);

describe('publish eligibility (window mode, deadline 19:00 UTC = 14:00 in UTC-5)', () => {
  it('waits until the deadline on the day the PR was opened', () => {
    expect(decide(pr(), window, at('2026-09-27T18:59:00Z'))).toMatchObject({ eligible: false, reason: expect.stringMatching(/veto window open/) });
    expect(decide(pr(), window, at('2026-09-27T19:05:00Z'))).toMatchObject({ eligible: true, date: '2026-09-26' });
  });
  it('a late PR still gets the minimum review time', () => {
    const late = pr({ createdAt: '2026-09-27T18:40:00Z' });
    expect(decide(late, window, at('2026-09-27T19:05:00Z')).eligible).toBe(false);
    expect(decide(late, window, at('2026-09-27T19:45:00Z')).eligible).toBe(true);
  });
  it('approved publishes early; veto and dry-run never publish', () => {
    expect(decide(pr({ labels: ['slopper', 'approved'] }), window, at('2026-09-27T16:00:00Z')).eligible).toBe(true);
    expect(decide(pr({ labels: ['slopper', 'approved', 'veto'] }), window, at('2026-09-28T00:00:00Z')).eligible).toBe(false);
    expect(decide(pr({ labels: ['slopper', 'dry-run', 'approved'] }), window, at('2026-09-28T00:00:00Z')).eligible).toBe(false);
  });
  it('cop-hold and critic-fail need approved + override', () => {
    const late = at('2026-09-28T00:00:00Z');
    expect(decide(pr({ labels: ['slopper', 'cop-hold'] }), window, late).eligible).toBe(false);
    expect(decide(pr({ labels: ['slopper', 'cop-hold', 'approved'] }), window, late).eligible).toBe(false);
    expect(decide(pr({ labels: ['slopper', 'cop-hold', 'approved', 'override'] }), window, late).eligible).toBe(true);
    expect(decide(pr({ labels: ['slopper', 'critic-fail', 'approved', 'override'] }), window, late).eligible).toBe(true);
  });
  it('requires a passing ci check', () => {
    const late = at('2026-09-28T00:00:00Z');
    expect(decide(pr({ statusCheckRollup: [] }), window, late).reason).toMatch(/CI/);
    expect(decide(pr({ statusCheckRollup: [{ name: 'ci', conclusion: 'FAILURE' }] }), window, late).eligible).toBe(false);
    expect(decide(pr({ statusCheckRollup: [{ name: 'ci', status: 'IN_PROGRESS', conclusion: null }] }), window, late).eligible).toBe(false);
  });
  it('approve and off modes', () => {
    const now = at('2026-09-27T16:00:00Z');
    expect(decide(pr(), { ...window, vetoMode: 'approve' }, at('2026-09-29T00:00:00Z')).eligible).toBe(false);
    expect(decide(pr({ labels: ['slopper', 'approved'] }), { ...window, vetoMode: 'approve' }, now).eligible).toBe(true);
    expect(decide(pr(), { ...window, vetoMode: 'off' }, now).eligible).toBe(true);
  });
  it('publishes one attempt per date: an approved one wins, then the newest (decision 47)', () => {
    const late = at('2026-10-09T00:00:00Z');
    const prs = [
      pr({ number: 33, headRefName: 'slopper/2026-10-07', labels: ['slopper', 'approved'] }),
      pr({ number: 35, headRefName: 'slopper/2026-10-07-3' }),
      pr({ number: 40, headRefName: 'slopper/2026-10-08-2' }),
      pr({ number: 41, headRefName: 'slopper/2026-10-08-3' }),
    ];
    const { eligible, all } = eligiblePrs(prs, window, late);
    expect(eligible.map((d) => d.number)).toEqual([33, 41]);
    expect(all.find((d) => d.number === 35)!.reason).toMatch(/\(#33\) is published instead/);
    expect(all.find((d) => d.number === 40)!.reason).toMatch(/\(#41\) is published instead/);
  });

  it('ignores non-slopper PRs and orders eligible ones by date', () => {
    const late = at('2026-09-29T00:00:00Z');
    const { eligible } = eligiblePrs(
      [pr({ number: 3, headRefName: 'slopper/2026-09-27' }), pr({ number: 2, headRefName: 'feat/x', labels: ['slopper'] }), pr({ number: 1 })],
      window,
      late,
    );
    expect(eligible.map((d) => d.number)).toEqual([1, 3]);
  });
});

describe('verify slopper folders', () => {
  it('accepts a pipeline-made folder and rejects tampering', async () => {
    const out = mkdtempSync(join(tmpdir(), 'slopper-verify-'));
    process.env.SLOPPER_CLAUDE_BIN = resolve('tests/fixtures/fake-claude.mjs');
    try {
      const r = await runDay({ date: '2026-09-26', fromStage: 'fetch', out, replay: 'tests/fixtures/fetch/2026-09-26', waitOnLimit: false });
      expect(verifyFolder(r.dir)).toEqual([]);

      const bad = join(out, 'bad', '2026', '09', '26');
      cpSync(r.dir, bad, { recursive: true });
      writeFileSync(join(bad, 'slopper.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      writeFileSync(join(bad, 'notes.sh'), 'curl evil');
      writeFileSync(join(bad, 'still.png'), 'not a png');
      const problems = verifyFolder(bad).join('\n');
      expect(problems).toMatch(/unexpected file "notes.sh"/);

      rmSync(join(bad, 'notes.sh'));
      const again = verifyFolder(bad).join('\n');
      expect(again).toMatch(/sanitizer re-check/);
      expect(again).toMatch(/still.png is not a PNG/);

      // archived curate.json from before decision 45 (plain-text cast) stays valid
      const legacy = join(out, 'legacy', '2026', '09', '26');
      cpSync(r.dir, legacy, { recursive: true });
      const cur = JSON.parse(readFileSync(join(legacy, 'curate.json'), 'utf8'));
      cur.brief.cast = ['a robot in a suit', 'a pledge document'];
      writeFileSync(join(legacy, 'curate.json'), JSON.stringify(cur));
      expect(verifyFolder(legacy)).toEqual([]);

      const wrongDate = join(out, 'x', '2026', '09', '25');
      cpSync(r.dir, wrongDate, { recursive: true });
      expect(verifyFolder(wrongDate).join()).toMatch(/does not match the folder/);
    } finally {
      delete process.env.SLOPPER_CLAUDE_BIN;
      rmSync(out, { recursive: true, force: true });
    }
  }, 120_000);
});
