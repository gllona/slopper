import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { esc, failureMessage, localTime, prMessage, publicUrl, publishedMessage, send, type PrInfo } from '../../pipeline/ops/notify.ts';
import { DaySchema } from '../../pipeline/schemas/day.ts';

const day = DaySchema.parse({
  date: '2026-09-26',
  number: null,
  mode: 'fresh',
  motto: 'Out Of The Sandbox',
  phrase: 'A lab paused its <strongest> models & friends.',
  alt: 'A robot steps out of a sandbox.',
  artType: 'static',
  style: 'blueprint',
  mood: { hype_doom: 0, calm_frantic: 0 },
  versions: { harness: '0.2.0', prompts: '1', ontology: '1', rubricArt: '1', rubricCop: '1' },
  generatedAt: '2026-09-27T15:10:00Z',
});
const info = (over: Partial<PrInfo> = {}): PrInfo => ({
  day,
  criticPassed: true,
  criticAverage: 3.86,
  iterations: 3,
  copVerdict: 'pass',
  copFindings: 2,
  labels: ['slopper', 'fresh'],
  prUrl: 'https://github.com/gllona/slopper/pull/6',
  imageUrl: 'https://github.com/gllona/slopper/raw/slopper/2026-09-26/sloppers/2026/09/26/still.png',
  vetoMode: 'window',
  publishHourUTC: 19,
  offset: -5,
  siteUrl: 'https://slopper.logicos.org',
  ...over,
});

describe('telegram messages', () => {
  it('the title leads with the publication date', () => {
    expect(prMessage(info()).text.split('\n')[0]).toBe('🎨 <b>Slopper — 27 Sept 2026 — Out Of The Sandbox (news of 26 Sept)</b>');
  });
  it('escapes AI-written text for HTML mode', () => {
    expect(esc('<b>&')).toBe('&lt;b&gt;&amp;');
    const m = prMessage(info());
    expect(m.text).toContain('&lt;strongest&gt; models &amp; friends');
    expect(m.text).not.toContain('<strongest>');
  });
  it('shows the veto deadline in local time, and link buttons to the PR and image', () => {
    expect(localTime(19, -5)).toBe('14:00 (UTC−5)');
    expect(localTime(2, -5)).toBe('21:00 (UTC−5)');
    const m = prMessage(info());
    expect(m.text).toContain('Publishes after <b>14:00 (UTC−5)</b>');
    expect(m.text).toContain('Critic: ✅ 3.86 (3 tries) · Cop: ✅ pass (2 notes)');
    expect(m.buttons?.map((b) => b.text)).toEqual(['Open PR', 'Image']);
    expect(m.photoUrl).toMatch(/still\.png$/);
  });
  it('includes the public link to share (not for dry runs)', () => {
    expect(prMessage(info()).text).toContain('🔗 https://slopper.logicos.org/2026/09/27/');
    expect(prMessage(info({ labels: ['slopper', 'dry-run'] })).text).not.toContain('🔗');
  });
  it('says clearly when it will not publish by itself', () => {
    expect(prMessage(info({ labels: ['slopper', 'dry-run'] })).text).toContain('Dry run');
    expect(prMessage(info({ labels: ['slopper', 'cop-hold'] })).text).toContain('Blocked');
    expect(prMessage(info({ vetoMode: 'approve' })).text).toContain('only after you add <b>approved</b>');
  });
  it('keeps captions within Telegram limits', () => {
    const long = prMessage(info({ labels: Array.from({ length: 400 }, (_, i) => `label-${i}`) }));
    expect(long.text.length).toBeLessThanOrEqual(1024);
  });
  it('published and failure messages', () => {
    // public URLs carry the publication date: the news date + 1 day (decision 43)
    expect(publishedMessage(['2026-09-30'], 'https://slopper.logicos.org/').buttons?.[0]).toEqual({ text: 'Open 2026-10-01', url: 'https://slopper.logicos.org/2026/10/01/' });
    expect(publicUrl('https://slopper.logicos.org', '2026-12-31')).toBe('https://slopper.logicos.org/2027/01/01/');
    expect(failureMessage('generate', 'https://x/run', '2026-09-26').text).toContain('generate failed');
  });
});

describe('telegram send', () => {
  it('sends a photo with the caption and buttons', async () => {
    const calls: { url: string; body: any }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response('{"ok":true}');
    }) as unknown as typeof fetch;
    await send(prMessage(info()), 'TOKEN123', '42', f);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toMatch(/\/botTOKEN123\/sendPhoto$/);
    expect(calls[0]!.body).toMatchObject({ chat_id: '42', parse_mode: 'HTML' });
    expect(calls[0]!.body.reply_markup.inline_keyboard[0][0]).toEqual({ text: 'Open PR', url: 'https://github.com/gllona/slopper/pull/6' });
  });
  it('falls back to a text message and never prints the token', async () => {
    const methods: string[] = [];
    const f = (async (url: string) => {
      methods.push(url.split('/').pop()!);
      return new Response('Bad Request: wrong file identifier/HTTP URL specified TOKEN123', { status: 400 });
    }) as unknown as typeof fetch;
    const err = await send(prMessage(info()), 'TOKEN123', '42', f).catch((e: Error) => e);
    expect(methods).toEqual(['sendPhoto', 'sendMessage']);
    expect(String(err)).not.toContain('TOKEN123');
    expect(String(err)).toContain('***');
  });
  it('retries once after a network error', async () => {
    let n = 0;
    const f = (async () => {
      if (++n === 1) throw new TypeError('fetch failed');
      return new Response('{"ok":true}');
    }) as unknown as typeof fetch;
    await send(prMessage(info()), 'T', '42', f, 0);
    expect(n).toBe(2);
  });
  it('the CLI skips quietly when Telegram is not configured', () => {
    const out = execFileSync('npx', ['tsx', 'pipeline/ops/notify.ts', 'failure', '--workflow', 'x'], {
      env: { ...process.env, TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '' },
      encoding: 'utf8',
    });
    expect(out).toContain('not configured');
  });
});
