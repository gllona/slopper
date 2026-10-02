import { instagramTick, type IgEnv } from './instagram.ts';

/**
 * slopper-clock: a Cloudflare Worker that (1) starts the GitHub workflows on time (DESIGN decision 39: GitHub's
 * own cron started runs up to 7 hours late) and (2) posts each published slopper to Instagram (decision 44).
 * No fetch handler and no route: it cannot be called, it only calls out.
 *
 * Secrets: GITHUB_TOKEN (fine-grained, Actions read/write on gllona/slopper only), IG_ACCESS_TOKEN (initial
 * Instagram token; refreshed copies live in KV), TELEGRAM_BOT_TOKEN.
 */

export interface Env extends IgEnv {
  GITHUB_TOKEN: string;
  REPO: string;
}

type Job = { workflow: string; inputs?: Record<string, string> } | { instagram: true };

/** Cron expression (as configured in wrangler.toml) → workflow to dispatch. All times UTC. */
export const SCHEDULE: Record<string, Job> = {
  '7 11 * * *': { workflow: 'generate.yml', inputs: { scheduled: 'true' } }, // 06:07 in UTC-5
  '7 13 * * *': { workflow: 'generate.yml', inputs: { scheduled: 'true' } }, // backup: skips if a PR exists
  '5 * * * *': { workflow: 'publish.yml' }, // hourly; the 19:05 run publishes right after the deadline
  '*/15 * * * *': { instagram: true }, // post the latest published slopper if it is new
};

export async function dispatch(cron: string, env: Env, fetchImpl: typeof fetch = fetch): Promise<string> {
  const job = SCHEDULE[cron];
  if (!job) throw new Error(`No job for cron "${cron}"`);
  if ('instagram' in job) return instagramTick(env, { fetchImpl });
  if (!/^[\w.-]+\/[\w.-]+$/.test(env.REPO)) throw new Error('REPO must be owner/name');
  const res = await fetchImpl(`https://api.github.com/repos/${env.REPO}/actions/workflows/${job.workflow}/dispatches`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'slopper-clock',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ref: 'main', ...(job.inputs ? { inputs: job.inputs } : {}) }),
  });
  if (res.status !== 204) throw new Error(`GitHub answered ${res.status} for ${job.workflow}: ${(await res.text()).slice(0, 300)}`);
  return `dispatched ${job.workflow}`;
}

export default {
  async scheduled(controller: { cron: string }, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<void> {
    ctx.waitUntil(
      dispatch(controller.cron, env).then(
        (msg) => console.log(`${controller.cron}: ${msg}`),
        (err: Error) => console.error(`${controller.cron}: ${err.message}`),
      ),
    );
  },
};
