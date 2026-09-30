import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import worker, { dispatch, SCHEDULE } from '../../infra/clock/src/index.ts';

const env = { GITHUB_TOKEN: 'ghs_test', REPO: 'gllona/slopper' };

describe('slopper-clock worker', () => {
  it('every cron in wrangler.toml has a job, and every job has a cron', () => {
    const toml = readFileSync('infra/clock/wrangler.toml', 'utf8');
    const crons = JSON.parse(/crons = (\[.*\])/.exec(toml)![1]!) as string[];
    expect(crons.sort()).toEqual(Object.keys(SCHEDULE).sort());
    expect(toml).toMatch(/workers_dev = false/);
    expect(toml).not.toMatch(/^routes?\s*=/m);
  });

  it('dispatches generate as a scheduled run on main', async () => {
    let req: { url: string; init: RequestInit } | null = null;
    const f = (async (url: string, init: RequestInit) => {
      req = { url, init };
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    await dispatch('7 11 * * *', env, f);
    expect(req!.url).toBe('https://api.github.com/repos/gllona/slopper/actions/workflows/generate.yml/dispatches');
    expect(JSON.parse(String(req!.init.body))).toEqual({ ref: 'main', inputs: { scheduled: 'true' } });
    expect(new Headers(req!.init.headers).get('authorization')).toBe('Bearer ghs_test');
  });

  it('dispatches publish hourly without inputs', async () => {
    let body = '';
    const f = (async (_u: string, init: RequestInit) => ((body = String(init.body)), new Response(null, { status: 204 }))) as unknown as typeof fetch;
    await dispatch('5 * * * *', env, f);
    expect(JSON.parse(body)).toEqual({ ref: 'main' });
  });

  it('reports GitHub errors and unknown crons', async () => {
    const f = (async () => new Response('Bad credentials', { status: 401 })) as unknown as typeof fetch;
    await expect(dispatch('7 11 * * *', env, f)).rejects.toThrow(/401/);
    await expect(dispatch('0 0 * * *', env, f)).rejects.toThrow(/No job/);
  });

  it('has no fetch handler (it cannot be called from outside)', () => {
    expect(Object.keys(worker)).toEqual(['scheduled']);
  });
});
