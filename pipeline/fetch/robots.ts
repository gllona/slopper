/**
 * Minimal robots.txt support (RFC 9309): group matching by user-agent product token,
 * longest-match Allow/Disallow with `*` and `$` wildcards. Used to respect every source's
 * robots.txt (DESIGN §7).
 */

export const BOT_TOKEN = 'SlopperBot';

interface Rule {
  allow: boolean;
  pattern: string;
}

export interface RobotsRules {
  rules: Rule[];
}

/** Parse robots.txt and return the rules that apply to `agent` (or to `*` when no group names it). */
export function parseRobots(text: string, agent: string = BOT_TOKEN): RobotsRules {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && current) {
      lastWasAgent = false;
      if (key === 'disallow' && value === '') continue; // empty disallow = allow all
      current.rules.push({ allow: key === 'allow', pattern: value });
    } else {
      lastWasAgent = false;
    }
  }
  const token = agent.toLowerCase();
  const named = groups.filter((g) => g.agents.some((a) => a !== '*' && token.startsWith(a)));
  const chosen = named.length ? named : groups.filter((g) => g.agents.includes('*'));
  return { rules: chosen.flatMap((g) => g.rules) };
}

function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/** Whether a path (+query) may be fetched. Longest matching rule wins; Allow wins ties. */
export function isAllowed(rules: RobotsRules, pathAndQuery: string): boolean {
  let best: Rule | null = null;
  for (const r of rules.rules) {
    if (!patternToRegex(r.pattern).test(pathAndQuery)) continue;
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}
