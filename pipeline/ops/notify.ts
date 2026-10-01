import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { CopFileSchema } from '../schemas/cop.ts';
import { CriticFileSchema } from '../schemas/critic.ts';
import { DaySchema, type Day } from '../schemas/day.ts';
import { datePath, publicationDate } from '../util/dates.ts';

/**
 * Telegram notifications (outbound only: no endpoint, no webhook). Gorka taps a link button to open the PR in
 * GitHub Mobile and labels it there (`approved` or `veto`).
 *
 *   npm run -s notify -- pr --dir sloppers/2026/09/26 --pr-url … --image-url …
 *   npm run -s notify -- published --dates "2026-09-26 2026-09-27"
 *   npm run -s notify -- failure --workflow generate --run-url … [--date 2026-09-26]
 *
 * Needs TELEGRAM_BOT_TOKEN (secret) and TELEGRAM_CHAT_ID (variable); without them it does nothing.
 * REVIEWER_UTC_OFFSET (hours, default -5) is only used to show the deadline in Gorka's local time.
 */

export interface Button {
  text: string;
  url: string;
}

export interface TelegramMessage {
  text: string;
  photoUrl?: string;
  buttons?: Button[];
}

/** Telegram HTML parse mode: only &, <, > need escaping. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const CAPTION_MAX = 1024;
const TEXT_MAX = 4096;

function fit(text: string, max: number): string {
  if (text.length <= max) return text;
  // cut on a line boundary so no HTML tag is left open (each line closes its own tags)
  const lines = text.split('\n');
  while (lines.join('\n').length > max - 2 && lines.length > 1) lines.pop();
  return `${lines.join('\n')}\n…`;
}

export function localTime(hourUTC: number, offset: number): string {
  const h = (((hourUTC + offset) % 24) + 24) % 24;
  const sign = offset >= 0 ? '+' : '−';
  return `${String(h).padStart(2, '0')}:00 (UTC${sign}${Math.abs(offset)})`;
}

export interface PrInfo {
  day: Day;
  criticPassed: boolean;
  criticAverage: number;
  iterations: number;
  copVerdict: string;
  copFindings: number;
  labels: string[];
  prUrl: string;
  imageUrl: string;
  vetoMode: string;
  publishHourUTC: number;
  offset: number;
  siteUrl: string;
}

/** The public page of a slopper: its publication date (news date + 1), DESIGN decision 43. */
export function publicUrl(siteUrl: string, newsDate: string): string {
  return `${siteUrl.replace(/\/$/, '')}/${datePath(publicationDate(newsDate))}/`;
}

export function prMessage(p: PrInfo): TelegramMessage {
  const d = p.day;
  const title = `Slopper${d.number ? ` #${d.number}` : ''} — ${d.date}`;
  const dry = p.labels.includes('dry-run');
  const blocked = p.labels.includes('cop-hold') || p.labels.includes('critic-fail');
  let when: string;
  if (dry) when = '🧪 Dry run: it will not be published.';
  else if (blocked) when = '⛔ Blocked: publishes only with <b>approved</b> + <b>override</b>.';
  else if (p.vetoMode === 'approve') when = '✋ Publishes only after you add <b>approved</b>.';
  else if (p.vetoMode === 'off') when = '🚀 Publishes at the next hourly run.';
  else when = `⏰ Publishes after <b>${localTime(p.publishHourUTC, p.offset)}</b> unless you add <b>veto</b>. Add <b>approved</b> to publish now.`;
  const lines = [
    `🎨 <b>${esc(title)}</b>`,
    `<b>${esc(d.motto)}</b>`,
    `<i>${esc(d.phrase)}</i>`,
    '',
    `${d.mode === 'fresh' ? 'Fresh' : 'Continuation'} · ${esc(d.style)} · ${d.artType}`,
    `Critic: ${p.criticPassed ? '✅' : '❌'} ${p.criticAverage} (${p.iterations} ${p.iterations === 1 ? 'try' : 'tries'}) · Cop: ${p.copVerdict === 'pass' ? '✅ pass' : `⛔ ${esc(p.copVerdict)}`}${p.copFindings ? ` (${p.copFindings} note${p.copFindings === 1 ? '' : 's'})` : ''}`,
    `Labels: ${esc(p.labels.join(', '))}`,
    '',
    when,
    dry ? '' : `🔗 ${esc(publicUrl(p.siteUrl, d.date))}`,
  ].filter((l, i, a) => l !== '' || a[i + 1] !== undefined);
  return {
    text: fit(lines.join('\n'), CAPTION_MAX),
    photoUrl: p.imageUrl,
    buttons: [
      { text: 'Open PR', url: p.prUrl },
      { text: 'Image', url: p.imageUrl },
    ],
  };
}

export function publishedMessage(newsDates: string[], siteUrl: string): TelegramMessage {
  const links = newsDates.map((d) => publicUrl(siteUrl, d));
  return {
    text: `✅ <b>Published</b>\n${links.map((l) => esc(l)).join('\n')}`,
    buttons: links.slice(0, 3).map((url, i) => ({ text: `Open ${publicationDate(newsDates[i]!)}`, url })),
  };
}

export function failureMessage(workflow: string, runUrl: string, date?: string): TelegramMessage {
  return {
    text: `⚠️ <b>Slopper ${esc(workflow)} failed</b>${date ? ` (${esc(date)})` : ''}\nA pipeline-failure issue was opened or updated.`,
    buttons: [{ text: 'Open logs', url: runUrl }],
  };
}

/** Send through the Bot API. Falls back to a text message when the photo cannot be sent. */
export async function send(msg: TelegramMessage, token: string, chatId: string, fetchImpl: typeof fetch = fetch, retryDelayMs = 3_000): Promise<void> {
  const call = (method: string, body: object) =>
    fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  // One retry on a network error (connections to Telegram occasionally time out).
  const api = async (method: string, body: object): Promise<Response> => {
    try {
      return await call(method, body);
    } catch {
      await new Promise((r) => setTimeout(r, retryDelayMs));
      return call(method, body);
    }
  };
  const reply_markup = msg.buttons?.length ? { inline_keyboard: [msg.buttons.map((b) => ({ text: b.text, url: b.url }))] } : undefined;
  if (msg.photoUrl) {
    const r = await api('sendPhoto', { chat_id: chatId, photo: msg.photoUrl, caption: fit(msg.text, CAPTION_MAX), parse_mode: 'HTML', reply_markup });
    if (r.ok) return;
    console.error(`Telegram sendPhoto failed (${r.status}): ${redact(await r.text(), token)}; sending text instead`);
  }
  const r = await api('sendMessage', { chat_id: chatId, text: fit(msg.text, TEXT_MAX), parse_mode: 'HTML', reply_markup, link_preview_options: { is_disabled: true } });
  if (!r.ok) throw new Error(`Telegram sendMessage failed (${r.status}): ${redact(await r.text(), token)}`);
}

function redact(s: string, token: string): string {
  return token ? s.replaceAll(token, '***') : s;
}

function readPrInfo(dir: string, prUrl: string, imageUrl: string): PrInfo {
  const json = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const day = DaySchema.parse(json('day.json'));
  const critic = CriticFileSchema.parse(json('critic.json'));
  const cop = CopFileSchema.parse(json('cop.json'));
  const labelsLine = readFileSync(join(dir, 'pr.md'), 'utf8').match(/^Labels: (.*)$/m)?.[1] ?? '';
  return {
    day,
    criticPassed: critic.passed,
    criticAverage: day.critic?.average ?? 0,
    iterations: critic.iterations.length,
    copVerdict: cop.verdict,
    copFindings: cop.rounds.at(-1)?.findings.length ?? 0,
    labels: labelsLine.split(',').map((l) => l.trim()).filter(Boolean),
    prUrl,
    imageUrl,
    vetoMode: process.env.VETO_MODE || 'window',
    publishHourUTC: Number(process.env.PUBLISH_HOUR_UTC || 19),
    offset: Number(process.env.REVIEWER_UTC_OFFSET || -5),
    siteUrl: process.env.SITE_URL || 'https://slopper.logicos.org',
  };
}

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      dir: { type: 'string' },
      'pr-url': { type: 'string' },
      'image-url': { type: 'string' },
      dates: { type: 'string' },
      workflow: { type: 'string' },
      'run-url': { type: 'string' },
      date: { type: 'string' },
    },
  });
  const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const chatId = process.env.TELEGRAM_CHAT_ID ?? '';
  if (!token || !chatId) {
    console.log('Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID): skipping notification');
    return 0;
  }
  let msg: TelegramMessage;
  switch (positionals[0]) {
    case 'pr':
      msg = prMessage(readPrInfo(values.dir!, values['pr-url']!, values['image-url']!));
      break;
    case 'published':
      msg = publishedMessage((values.dates ?? '').split(/\s+/).filter(Boolean), process.env.SITE_URL || 'https://slopper.logicos.org');
      break;
    case 'failure':
      msg = failureMessage(values.workflow ?? 'pipeline', values['run-url'] ?? '', values.date);
      break;
    default:
      console.error('usage: notify pr|published|failure …');
      return 2;
  }
  await send(msg, token, chatId);
  console.log('Telegram notification sent');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main();
