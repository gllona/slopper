import { readFileSync } from 'node:fs';
import type { Config } from '../schemas/config.ts';
import { loadConfig } from '../util/config.ts';

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
  const date = /^slopper\/(\d{4}-\d{2}-\d{2})$/.exec(pr.headRefName)?.[1] ?? null;
  const no = (reason: string): Decision => ({ number: pr.number, date, eligible: false, reason });
  if (!labels.has('slopper') || !date) return no('not a daily slopper PR');
  if (labels.has('veto')) return no('vetoed');
  if (labels.has('dry-run')) return no('dry-run PR (pre-launch)');
  const approved = labels.has('approved');
  const override = approved && labels.has('override');
  if (labels.has('cop-hold') && !override) return no('cop-hold (needs approved + override)');
  if (labels.has('critic-fail') && !override) return no('critic-fail (needs approved + override)');
  if (!ciPassed(pr)) return no('CI has not passed');
  if (rules.vetoMode === 'off') return { number: pr.number, date, eligible: true, reason: 'veto mode off' };
  if (rules.vetoMode === 'approve') return approved ? { number: pr.number, date, eligible: true, reason: 'approved' } : no('waiting for the approved label');
  if (approved) return { number: pr.number, date, eligible: true, reason: 'approved early' };
  const created = new Date(pr.createdAt);
  const deadline = new Date(Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate(), rules.publishHourUTC));
  const minAge = rules.vetoMinMinutes * 60_000;
  if (now < deadline) return no(`veto window open until ${deadline.toISOString()}`);
  if (now.getTime() - created.getTime() < minAge) return no(`PR younger than ${rules.vetoMinMinutes} minutes`);
  return { number: pr.number, date, eligible: true, reason: 'veto window closed' };
}

export function eligiblePrs(prs: PrInfo[], rules: Rules, now: Date): { eligible: Decision[]; all: Decision[] } {
  const all = prs.map((p) => decide(p, rules, now)).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  return { eligible: all.filter((d) => d.eligible), all };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const prs = JSON.parse(readFileSync(0, 'utf8')) as PrInfo[];
  const config = loadConfig({ env: process.env });
  const { eligible, all } = eligiblePrs(prs, config, new Date());
  for (const d of all) console.error(`#${d.number} ${d.date ?? '?'}: ${d.eligible ? 'ELIGIBLE' : 'skip'} (${d.reason})`);
  console.log(eligible.map((d) => d.number).join(' '));
}
