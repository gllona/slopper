import { describe, expect, it } from 'vitest';
import { instagramTick, redact, type IgEnv } from '../../infra/clock/src/instagram.ts';
import { instagramCaption } from '../../pipeline/ops/caption.ts';

const latest = {
  number: 1,
  date: '2026-09-30',
  publishedOn: '2026-10-01',
  url: 'https://slopper.logicos.org/2026/10/01/',
  imageJpg: 'https://slopper.logicos.org/2026/10/01/still.jpg',
  alt: 'Two robots link pinky fingers.',
  motto: 'Self-Policing Season',
  phrase: 'x',
  caption: 'Self-Policing Season\n\nx',
};

function setup(opts: { statuses?: string[]; failCreate?: string; refreshFail?: boolean; latestBody?: unknown } = {}) {
  const kv = new Map<string, string>();
  const calls: { method: string; url: string; body: URLSearchParams | null }[] = [];
  const telegrams: string[] = [];
  const statuses = [...(opts.statuses ?? ['IN_PROGRESS', 'FINISHED'])];
  const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
  const fetchImpl = (async (input: string, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body instanceof URLSearchParams ? init.body : null;
    calls.push({ method: init?.method ?? 'GET', url, body });
    if (url.includes('api.telegram.org')) {
      telegrams.push(JSON.parse(String(init!.body)).text);
      return json({ ok: true });
    }
    if (url.endsWith('/latest.json')) return json(opts.latestBody ?? { version: 1, latest });
    if (url.includes('/refresh_access_token')) return opts.refreshFail ? json({ error: { message: 'Session invalid' } }, 400) : json({ access_token: 'IGAA_new', expires_in: 5184000 });
    if (url.endsWith('/17841424224659685/media') && init?.method === 'POST') {
      if (opts.failCreate) return json({ error: { message: opts.failCreate } }, 400);
      return json({ id: 'container1' });
    }
    if (url.includes('/container1?')) return json({ status_code: statuses.shift() ?? 'FINISHED' });
    if (url.endsWith('/media_publish')) return json({ id: 'media9' });
    if (url.includes('/media9?')) return json({ permalink: 'https://www.instagram.com/p/ABC/' });
    return json({ error: { message: `unexpected ${url}` } }, 404);
  }) as unknown as typeof fetch;
  const env: IgEnv = {
    IG_ACCESS_TOKEN: 'IGAA_secret_token',
    IG_USER_ID: '17841424224659685',
    SITE_URL: 'https://slopper.logicos.org',
    TELEGRAM_BOT_TOKEN: 'tg',
    TELEGRAM_CHAT_ID: '42',
    STATE: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => void kv.set(k, v) },
  };
  const run = (now = new Date('2026-10-01T19:20:00Z')) => instagramTick(env, { fetchImpl, now, sleep: async () => {} });
  return { kv, calls, telegrams, run, env };
}

describe('Instagram poster (slopper-clock)', () => {
  it('posts a new slopper once: container with JPEG, caption, alt → wait → publish → remember → Telegram', async () => {
    const t = setup();
    expect(await t.run()).toBe('posted 2026-10-01: https://www.instagram.com/p/ABC/');
    const create = t.calls.find((c) => c.url.endsWith('/media') && c.method === 'POST')!;
    expect(create.body!.get('image_url')).toBe(latest.imageJpg);
    expect(create.body!.get('caption')).toBe(latest.caption);
    expect(create.body!.get('alt_text')).toBe(latest.alt);
    expect(t.calls.filter((c) => c.url.includes('/container1?'))).toHaveLength(2); // waited for FINISHED
    expect(t.kv.get('ig:last')).toBe('2026-10-01');
    expect(t.telegrams.at(-1)).toBe('📸 On Instagram: Slopper #1 — Self-Policing Season\nhttps://www.instagram.com/p/ABC/');
    expect(await t.run()).toBe('already posted 2026-10-01');
  });

  it('retries a failed post at most 3 times, alerting each time, without leaking the token', async () => {
    const t = setup({ failCreate: 'Invalid parameter for IGAA_secret_token' });
    for (let i = 0; i < 3; i++) expect(await t.run()).toMatch(/^failed/);
    expect(await t.run()).toBe('gave up on 2026-10-01 after 3 tries');
    expect(t.telegrams).toHaveLength(3);
    expect(t.telegrams.join()).not.toContain('IGAA_secret_token');
    expect(t.telegrams[2]).toContain('Giving up');
    expect(t.kv.get('ig:last')).toBeUndefined();
  });

  it('falls back to a post without alt text if the API does not know alt_text', async () => {
    let n = 0;
    const t = setup();
    const env = { ...t.env };
    const base = (await import('../../infra/clock/src/instagram.ts')).instagramTick;
    // first create fails mentioning alt_text, second succeeds
    const r = await base(env, {
      now: new Date('2026-10-01T19:20:00Z'),
      sleep: async () => {},
      fetchImpl: (async (input: string, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/media') && init?.method === 'POST' && n++ === 0)
          return new Response(JSON.stringify({ error: { message: '(#100) Param alt_text is not supported' } }), { status: 400 });
        if (url.endsWith('/media') && init?.method === 'POST') return new Response(JSON.stringify({ id: 'container1' }));
        if (url.endsWith('/latest.json')) return new Response(JSON.stringify({ latest }));
        if (url.includes('/refresh_access_token')) return new Response(JSON.stringify({ access_token: 'x' }));
        if (url.includes('/container1?')) return new Response(JSON.stringify({ status_code: 'FINISHED' }));
        if (url.endsWith('/media_publish')) return new Response(JSON.stringify({ id: 'media9' }));
        if (url.includes('/media9?')) return new Response(JSON.stringify({ permalink: 'https://www.instagram.com/p/X/' }));
        return new Response('{}');
      }) as unknown as typeof fetch,
    });
    expect(r).toMatch(/^posted/);
    expect(n).toBe(2);
  });

  it('a container in ERROR fails the try', async () => {
    const t = setup({ statuses: ['ERROR'] });
    expect(await t.run()).toMatch(/container ERROR/);
  });

  it('refreshes the token weekly and stores it in KV', async () => {
    const t = setup();
    await t.run(new Date('2026-10-01T19:20:00Z'));
    expect(t.kv.get('ig:token')).toBe('IGAA_new');
    const refreshes = () => t.calls.filter((c) => c.url.includes('refresh_access_token')).length;
    await t.run(new Date('2026-10-03T00:00:00Z'));
    expect(refreshes()).toBe(1); // not again within a week
    await t.run(new Date('2026-10-09T00:00:00Z'));
    expect(refreshes()).toBe(2);
    // later Instagram calls use the refreshed token
    const lastApi = t.calls.filter((c) => c.url.includes('graph.instagram.com')).at(-1)!;
    expect(lastApi.url).toContain('access_token=IGAA_new');
  });

  it('a failed refresh keeps the old token and tries again in about a day', async () => {
    const t = setup({ refreshFail: true });
    expect(await t.run()).toMatch(/^posted/); // posting still works with the original token
    expect(t.kv.get('ig:token')).toBeUndefined();
    const at = Number(t.kv.get('ig:refreshedAt'));
    expect(new Date('2026-10-01T19:20:00Z').getTime() - at).toBe(6 * 86_400_000);
  });

  it('does nothing when there is nothing new or no JPEG', async () => {
    expect(await setup({ latestBody: { latest: null } }).run()).toBe('nothing to post');
    expect(await setup({ latestBody: { latest: { ...latest, imageJpg: null } } }).run()).toBe('nothing to post');
  });

  it('redact removes the token everywhere', () => {
    expect(redact('a TOKEN b TOKEN', 'TOKEN')).toBe('a *** b ***');
  });
});

describe('Instagram caption', () => {
  it('motto, phrase, credit line, link hint, hashtags (deduplicated, max 30)', () => {
    const c = instagramCaption({
      motto: 'Self-Policing Season',
      phrase: 'The AI companies promised to police themselves.',
      number: 1,
      publishedOn: '2026-10-01',
      siteHost: 'slopper.logicos.org',
      hashtags: ['slopper', '#slopper', 'slop art', ...Array.from({ length: 40 }, (_, i) => `t${i}`)],
    });
    expect(c.split('\n').slice(0, 6)).toEqual([
      'Self-Policing Season',
      '',
      'The AI companies promised to police themselves.',
      '',
      'Slopper #1 · 1 October 2026 · slop-art made by AI',
      'A new one every day at slopper.logicos.org (link in bio)',
    ]);
    const tags = c.split('\n').at(-1)!.split(' ');
    expect(tags.length).toBe(30);
    expect(tags[0]).toBe('#slopper');
    expect(tags[1]).toBe('#slopart');
    expect(c.length).toBeLessThanOrEqual(2200);
  });
});
