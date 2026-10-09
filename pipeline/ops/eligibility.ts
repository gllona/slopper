import { readFileSync } from 'node:fs';
import type { Config } from '../schemas/config.ts';
import { loadConfig } from '../util/config.ts';
import { parseSlopperBranch } from './attempts.ts';

/**
 * Which daily PRs may be published now (DESIGN §16.2, decision 29). Pure logic, fed by `gh pr list --json`.
 *   gh pr list --label slopper --state open --json number,headRefName,createdAt,labels,statusCheckRollup \
 *     | npm run -s eligible            → prints eligible PR numbers (oldest date first), reasons on stderr
 */

export interface PrInfo {
  number: number;
  headRefName: string;
  createdAt: string;
  labels: { name: string }[];
  statusCheckRollup?: { name?: string; context?: string; conclusion?: string | null; state?: string | null; status?: string }[];
}

export interface Decision {
  number: number;
  date: string | null;
  /** 1 for slopper/<date>, n for slopper/<date>-n (decision 47). */
  attempt: number;
  approved: boolean;
  eligible: boolean;
  reason: string;
}

type Rules = Pick<Config, 'vetoMode' | 'publishHourUTC' | 'vetoMinMinutes'>;

export function ciPassed(pr: PrInfo): boolean {
  const checks = pr.statusCheckRollup ?? [];
  const ci = checks.filter((c) => (c.name ?? c.context) === 'ci');
  if (!ci.length) return false;
  const ok = (c: (typeof checks)[number]) => (c.conclusion ?? c.state ?? '').toUpperCase() === 'SUCCESS';
  return ci.every(ok) && checks.every((c) => ok(c) || ['SKIPPED', 'NEUTRAL'].includes((c.conclusion ?? '').toUpperCase()));
}

export function decide(pr: PrInfo, rules: Rules, now: Date): Decision {
  const labels = new Set(pr.labels.map((l) => l.name));
  const branch = parseSlopperBranch(pr.headRefName);
  const date = branch?.date ?? null;
  const attempt = branch?.attempt ?? 1;
  const approved = labels.has('approved');
  const no = (reason: string): Decision => ({ number: pr.number, date, attempt, approved, eligible: false, reason });
  const yes = (reason: string): Decision => ({ number: pr.number, date, attempt, approved, eligible: true, reason });
  if (!labels.has('slopper') || !date) return no('not a daily slopper PR');
  if (labels.has('veto')) return no('vetoed');
  if (labels.has('dry-run')) return no('dry-run PR (pre-launch)');
  const override = approved && labels.has('override');
  if (labels.has('cop-hold') && !override) return no('cop-hold (needs approved + override)');
  if (labels.has('critic-fail') && !override) return no('critic-fail (needs approved + override)');
  if (!ciPassed(pr)) return no('CI has not passed');
  if (rules.vetoMode === 'off') return yes('veto mode off');
  if (rules.vetoMode === 'approve') return approved ? yes('approved') : no('waiting for the approved label');
  if (approved) return yes('approved early');
  const created = new Date(pr.createdAt);
  const deadline = new Date(Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate(), rules.publishHourUTC));
  const minAge = rules.vetoMinMinutes * 60_000;
  if (now < deadline) return no(`veto window open until ${deadline.toISOString()}`);
  if (now.getTime() - created.getTime() < minAge) return no(`PR younger than ${rules.vetoMinMinutes} minutes`);
  return yes('veto window closed');
}

/**
 * At most one slopper per date: if several attempts for a date are eligible, an approved one wins, then the
 * newest attempt; the others wait (the publisher closes them after merging the winner, keeping their branches).
 */
export function eligiblePrs(prs: PrInfo[], rules: Rules, now: Date): { eligible: Decision[]; all: Decision[] } {
  const all = prs.map((p) => decide(p, rules, now)).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.attempt - b.attempt);
  const winner = new Map<string, Decision>();
  for (const d of all.filter((x) => x.eligible && x.date)) {
    const w = winner.get(d.date!);
    if (!w || (d.approved && !w.approved) || (d.approved === w.approved && d.attempt > w.attempt)) winner.set(d.date!, d);
  }
  for (const d of all) {
    const w = d.date ? winner.get(d.date) : undefined;
    if (d.eligible && w && w !== d) {
      d.eligible = false;
      d.reason = `another attempt for ${d.date} (#${w.number}) is published instead`;
    }
  }
  return { eligible: all.filter((d) => d.eligible), all };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const prs = JSON.parse(readFileSync(0, 'utf8')) as PrInfo[];
  const config = loadConfig({ env: process.env });
  const { eligible, all } = eligiblePrs(prs, config, new Date());
  for (const d of all) console.error(`#${d.number} ${d.date ?? '?'}: ${d.eligible ? 'ELIGIBLE' : 'skip'} (${d.reason})`);
  console.log(eligible.map((d) => d.number).join(' '));
}
