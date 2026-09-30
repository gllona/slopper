/**
 * slopper-clock: a Cloudflare Worker whose only job is to start the GitHub workflows on time
 * (DESIGN §16, decision 39). GitHub's own cron started runs up to 7 hours late; Cloudflare cron triggers fire on
 * the minute. The Worker has no fetch handler and no route: it cannot be called, it only calls out.
 *
 * Secret: GITHUB_TOKEN — a fine-grained token for gllona/slopper with "Actions: Read and write" only.
 */

export interface Env {
  GITHUB_TOKEN: string;
  REPO: string;
}

interface Job {
  workflow: string;
  inputs?: Record<string, string>;
}

/** Cron expression (as configured in wrangler.toml) → workflow to dispatch. All times UTC. */
export const SCHEDULE: Record<string, Job> = {
  '7 11 * * *': { workflow: 'generate.yml', inputs: { scheduled: 'true' } }, // 06:07 in UTC-5
  '7 13 * * *': { workflow: 'generate.yml', inputs: { scheduled: 'true' } }, // backup: skips if a PR exists
  '5 * * * *': { workflow: 'publish.yml' }, // hourly; the 19:05 run publishes right after the deadline
};

export async function dispatch(cron: string, env: Env, fetchImpl: typeof fetch = fetch): Promise<string> {
  const job = SCHEDULE[cron];
  if (!job) throw new Error(`No job for cron "${cron}"`);
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
