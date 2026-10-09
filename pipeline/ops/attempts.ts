import { readFileSync } from 'node:fs';

/**
 * Daily slopper branches, one per attempt (DESIGN decision 47): `slopper/2026-10-07` for the first attempt,
 * `slopper/2026-10-07-2`, `-3`, … for regenerations. Branches of unpublished attempts are kept, so any attempt
 * can be reopened and published later.
 *
 *   … | npm run -s attempt -- next 2026-10-07     → "slopper/2026-10-07-3 3"   (stdin: existing branch names)
 *   npm run -s attempt -- date slopper/2026-10-07-3 → "2026-10-07"
 */

const BRANCH = /^slopper\/(\d{4}-\d{2}-\d{2})(?:-(\d+))?$/;

export function parseSlopperBranch(ref: string): { date: string; attempt: number } | null {
  const m = BRANCH.exec(ref.trim().replace(/^refs\/heads\//, ''));
  return m ? { date: m[1]!, attempt: m[2] ? Number(m[2]) : 1 } : null;
}

export function branchFor(date: string, attempt: number): string {
  return attempt <= 1 ? `slopper/${date}` : `slopper/${date}-${attempt}`;
}

/** The next free attempt for a date, given every branch name ever used (existing branches and PR heads). */
export function nextAttempt(date: string, used: string[]): { branch: string; attempt: number } {
  const attempts = used.map(parseSlopperBranch).filter((b) => b?.date === date).map((b) => b!.attempt);
  const attempt = attempts.length ? Math.max(...attempts) + 1 : 1;
  return { branch: branchFor(date, attempt), attempt };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'next' && arg) {
    const used = readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
    const n = nextAttempt(arg, used);
    console.log(`${n.branch} ${n.attempt}`);
  } else if (cmd === 'date' && arg) {
    const p = parseSlopperBranch(arg);
    if (!p) {
      console.error(`not a slopper branch: ${arg}`);
      process.exitCode = 1;
    } else console.log(p.date);
  } else {
    console.error('usage: attempt next <date> < branch-names | attempt date <branch>');
    process.exitCode = 2;
  }
}
