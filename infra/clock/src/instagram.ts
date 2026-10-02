import { telegram } from './telegram.ts';

/**
 * Posts each newly published slopper to Instagram (DESIGN decision 44). Runs every 15 minutes:
 *   1. read https://slopper.logicos.org/latest.json (written by the site build);
 *   2. if its publication date is newer than KV `ig:last`, create a media container (square still.jpg + caption
 *      + alt text), wait until Instagram has processed it, publish it, remember it, and tell Gorka on Telegram;
 *   3. once a week, refresh the 60-day Instagram token and keep it in KV (no manual renewal).
 * API: "Instagram API with Instagram Login" (graph.instagram.com), app in Development mode, account as Instagram Tester.
 */

export interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface IgEnv {
  IG_ACCESS_TOKEN: string;
  IG_USER_ID: string;
  SITE_URL: string;
  STATE: KV;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

export interface Latest {
  number: number | null;
  publishedOn: string;
  url: string;
  imageJpg: string | null;
  alt: string;
  motto: string;
  caption: string;
}

const API = 'https://graph.instagram.com';
const DAY = 86_400_000;
const REFRESH_EVERY = 7 * DAY;
const MAX_TRIES = 3;

export interface TickOptions {
  fetchImpl?: typeof fetch;
  now?: Date;
  sleep?: (ms: number) => Promise<void>;
}

export async function instagramTick(env: IgEnv, opts: TickOptions = {}): Promise<string> {
  const f = opts.fetchImpl ?? fetch;
  const now = opts.now ?? new Date();
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const alert = (text: string) => telegram(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, text, f);

  let token = (await env.STATE.get('ig:token')) ?? env.IG_ACCESS_TOKEN;
  if (!token || !env.IG_USER_ID) return 'Instagram not configured';
  token = await maybeRefresh(env, token, now, f, alert);

  const res = await f(`${env.SITE_URL.replace(/\/$/, '')}/latest.json`, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) return `latest.json answered ${res.status}`;
  const latest = ((await res.json()) as { latest: Latest | null }).latest;
  if (!latest?.imageJpg) return 'nothing to post';

  const last = await env.STATE.get('ig:last');
  if (last && last >= latest.publishedOn) return `already posted ${latest.publishedOn}`;
  const triesKey = `ig:tries:${latest.publishedOn}`;
  const tries = Number((await env.STATE.get(triesKey)) ?? 0);
  if (tries >= MAX_TRIES) return `gave up on ${latest.publishedOn} after ${tries} tries`;

  try {
    const permalink = await post(env.IG_USER_ID, token, latest, f, sleep);
    await env.STATE.put('ig:last', latest.publishedOn);
    await alert(`📸 On Instagram: Slopper${latest.number ? ` #${latest.number}` : ''} — ${latest.motto}\n${permalink}`);
    return `posted ${latest.publishedOn}: ${permalink}`;
  } catch (e) {
    const msg = redact(redact((e as Error).message, token), env.IG_ACCESS_TOKEN); // current and original token
    await env.STATE.put(triesKey, String(tries + 1));
    await alert(`⚠️ Instagram post failed (try ${tries + 1}/${MAX_TRIES}) for ${latest.publishedOn}: ${msg}${tries + 1 < MAX_TRIES ? '\nRetrying in 15 minutes.' : '\nGiving up for this slopper.'}`);
    return `failed: ${msg}`;
  }
}

/** Container → wait until FINISHED → publish → permalink. */
async function post(userId: string, token: string, l: Latest, f: typeof fetch, sleep: (ms: number) => Promise<void>): Promise<string> {
  const create = (withAlt: boolean) =>
    call(f, 'POST', `/${userId}/media`, token, { image_url: l.imageJpg!, caption: l.caption, ...(withAlt ? { alt_text: l.alt } : {}) });
  let container: { id?: string };
  try {
    container = await create(true);
  } catch (e) {
    if (!/alt_text/i.test((e as Error).message)) throw e;
    container = await create(false); // older API versions do not know alt_text
  }
  if (!container.id) throw new Error('no container id');
  for (let i = 0; i < 20; i++) {
    const s = (await call(f, 'GET', `/${container.id}`, token, { fields: 'status_code' })) as { status_code?: string };
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`container ${s.status_code}`);
    if (i === 19) throw new Error('container not ready after 60 s');
    await sleep(3000);
  }
  const published = (await call(f, 'POST', `/${userId}/media_publish`, token, { creation_id: container.id })) as { id?: string };
  if (!published.id) throw new Error('publish returned no media id');
  const media = (await call(f, 'GET', `/${published.id}`, token, { fields: 'permalink' })) as { permalink?: string };
  return media.permalink ?? `media ${published.id}`;
}

async function maybeRefresh(env: IgEnv, token: string, now: Date, f: typeof fetch, alert: (t: string) => Promise<void>): Promise<string> {
  const at = Number((await env.STATE.get('ig:refreshedAt')) ?? 0);
  if (now.getTime() - at < REFRESH_EVERY) return token;
  try {
    const r = (await call(f, 'GET', '/refresh_access_token', token, { grant_type: 'ig_refresh_token' })) as { access_token?: string };
    if (!r.access_token) throw new Error('no access_token in refresh answer');
    await env.STATE.put('ig:token', r.access_token);
    await env.STATE.put('ig:refreshedAt', String(now.getTime()));
    return r.access_token;
  } catch (e) {
    // try again in about a day (a brand-new token cannot be refreshed in its first 24 h)
    await env.STATE.put('ig:refreshedAt', String(now.getTime() - REFRESH_EVERY + DAY));
    if (at) await alert(`⚠️ Instagram token refresh failed: ${redact(redact((e as Error).message, token), env.IG_ACCESS_TOKEN)}`);
    return token;
  }
}

async function call(f: typeof fetch, method: 'GET' | 'POST', path: string, token: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ ...params, access_token: token });
  const res = method === 'GET' ? await f(`${API}${path}?${q}`) : await f(`${API}${path}`, { method: 'POST', body: q });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string; code?: number } };
  if (!res.ok || body.error) throw new Error(`Instagram ${path.split('?')[0]} ${res.status}: ${body.error?.message ?? 'unknown error'}`);
  return body;
}

export function redact(s: string, token: string): string {
  return token ? s.split(token).join('***') : s;
}
