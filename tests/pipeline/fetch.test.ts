import { describe, expect, it } from 'vitest';
import { parseFeed } from '../../pipeline/fetch/feed.ts';
import { compactBody, HttpError, LiveHttp, ReplayHttp, RobotsDisallowedError, type HttpClient } from '../../pipeline/fetch/http.ts';
import { FetchFailedError, runFetch } from '../../pipeline/fetch/index.ts';
import { AI_PATTERN, canonicalUrl, decodeEntities, dedupe, isoDate, plainText, redactUrlSecrets, safeUrl, truncate } from '../../pipeline/fetch/normalize.ts';
import { isAllowed, parseRobots } from '../../pipeline/fetch/robots.ts';
import { gdelt } from '../../pipeline/fetch/sources/gdelt.ts';
import type { Source } from '../../pipeline/fetch/types.ts';
import { DigestSchema, type DigestItem } from '../../pipeline/schemas/digest.ts';
import { loadConfig } from '../../pipeline/util/config.ts';
import { logger } from '../../pipeline/util/log.ts';

const config = loadConfig({ env: {} });

describe('robots.txt', () => {
  const google = 'User-agent: *\nDisallow: /\nAllow: /$\nAllow: /topics/\n\nUser-agent: ClaudeBot\nDisallow: /';
  it('applies the * group when no group names us', () => {
    const r = parseRobots(google);
    expect(isAllowed(r, '/rss/search?q=AI')).toBe(false);
    expect(isAllowed(r, '/topics/abc')).toBe(true);
    expect(isAllowed(r, '/')).toBe(true);
  });
  it('prefers a group that names SlopperBot', () => {
    const r = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: SlopperBot\nAllow: /feed\nDisallow: /private');
    expect(isAllowed(r, '/feed.xml')).toBe(true);
    expect(isAllowed(r, '/private/x')).toBe(false);
    expect(isAllowed(r, '/other')).toBe(true);
  });
  it('uses longest match, wildcards, $, and grouped user-agents', () => {
    const r = parseRobots('User-agent: a\nUser-agent: *\nDisallow: /*.jpg$\nDisallow: /r/\nAllow: /r/ok\nDisallow:\n');
    expect(isAllowed(r, '/img/x.jpg')).toBe(false);
    expect(isAllowed(r, '/img/x.jpg?v=1')).toBe(true);
    expect(isAllowed(r, '/r/secret')).toBe(false);
    expect(isAllowed(r, '/r/ok/1')).toBe(true);
  });
  it('an empty file allows everything', () => {
    expect(isAllowed(parseRobots(''), '/anything')).toBe(true);
  });
});

describe('normalize', () => {
  it('turns markup into plain, safe text', () => {
    expect(plainText('<p>Hello <b>world</b> &amp;amp; &#8220;AI&#8221;</p>')).toBe('Hello world & “AI”');
    expect(plainText('<![CDATA[<script>alert(1)</script>Safe]]>')).toBe('Safe');
    expect(plainText('a\u0000b‮c  d')).toBe('abc d');
    expect(decodeEntities('&lt;x&gt; &#x1F600; &bogus;')).toBe('<x> 😀 &bogus;');
  });
  it('truncates at word boundaries', () => {
    expect(truncate('one two three four', 12)).toBe('one two…');
    expect(truncate('short', 12)).toBe('short');
  });
  it('canonicalizes URLs for de-duplication', () => {
    expect(canonicalUrl('http://www.Example.com/a/?utm_source=x&b=2&a=1#frag')).toBe('https://example.com/a/?a=1&b=2');
    expect(canonicalUrl('https://example.com/a/')).toBe('https://example.com/a');
  });
  it('never stores credential or gift-access parameters', () => {
    expect(safeUrl('https://news.example/a?accessToken=eyJabc.def&id=7&sharetype=gift&st=x#top')).toBe('https://news.example/a?id=7');
    const body = '<a href="https://b.example/x?accessToken=eyJhbGciOi.x.y&amp;token=1732-a&amp;page=2">';
    const red = redactUrlSecrets(body);
    expect(red).not.toMatch(/eyJhbGciOi|1732-a/);
    expect(red).toContain('page=2');
  });
  it('parses feed and GDELT dates', () => {
    expect(isoDate('Sat, 26 Sep 2026 23:20:01 -0400')).toBe('2026-09-27T03:20:01.000Z');
    expect(isoDate('20260926T101500Z')).toBe('2026-09-26T10:15:00.000Z');
    expect(isoDate('not a date')).toBeNull();
  });
  it('removes URL duplicates and near-duplicate titles, keeping the best score', () => {
    const item = (id: string, url: string, title: string, score?: number): DigestItem => ({ id, source: 'feeds', url, title, snippet: '', publishedAt: '2026-09-26T10:00:00.000Z', lang: 'en', score });
    const { items, removed } = dedupe([
      item('a', 'https://x.com/story', 'Big lab pauses training of its most capable models'),
      item('b', 'https://www.x.com/story?utm_source=hn', 'Other title', 99),
      item('c', 'https://y.com/other', 'Big lab pauses training of its most capable models - The Paper'),
      item('d', 'https://z.com/n', 'A completely different headline about schools'),
    ]);
    expect(items.map((i) => i.id)).toEqual(['a', 'd']);
    expect(removed).toBe(2);
    expect(items[0]!.score).toBe(99);
  });
  it('AI keyword filter', () => {
    expect(AI_PATTERN.test('New AI rules for schools')).toBe(true);
    expect(AI_PATTERN.test('Data centres use more water')).toBe(true);
    expect(AI_PATTERN.test('Brazil bans online betting')).toBe(false);
    expect(AI_PATTERN.test('Said the travel agents')).toBe(false);
  });
});

describe('feeds', () => {
  it('parses RSS, Atom, and RDF', () => {
    const rss = parseFeed('<rss><channel><item><title>T1</title><link>https://a.com/1</link><description>&lt;p&gt;D&lt;/p&gt;</description><pubDate>Sat, 26 Sep 2026 10:00:00 GMT</pubDate><category>cs.CY</category></item></channel></rss>');
    expect(rss[0]).toMatchObject({ title: 'T1', link: 'https://a.com/1', summary: '<p>D</p>', categories: ['cs.CY'] });
    const atom = parseFeed('<feed><entry><title type="html">T2</title><link rel="alternate" href="https://b.com/2"/><summary>S</summary><published>2026-09-26T12:00:00Z</published></entry></feed>');
    expect(atom[0]).toMatchObject({ title: 'T2', link: 'https://b.com/2', summary: 'S', date: '2026-09-26T12:00:00Z' });
    const rdf = parseFeed('<rdf:RDF><item><title>T3</title><link>https://c.com/3</link><dc:date>2026-09-26</dc:date></item></rdf:RDF>');
    expect(rdf[0]!.title).toBe('T3');
  });
  it('refuses entity declarations and non-feeds', () => {
    expect(() => parseFeed('<!DOCTYPE x [<!ENTITY a "b">]><rss><channel/></rss>')).toThrow(/entities/);
    expect(() => parseFeed('<html><body>hi</body></html>')).toThrow(/Not an RSS/);
  });
  it('compactBody drops full article text from recorded fixtures', () => {
    const body = `<rss><channel><item><title>T</title><description>${'x'.repeat(2000)}</description><content:encoded><![CDATA[FULL ARTICLE]]></content:encoded></item></channel></rss>`;
    const out = compactBody(body);
    expect(out).not.toContain('FULL ARTICLE');
    expect(out.length).toBeLessThan(800);
    expect(parseFeed(out)[0]!.title).toBe('T');
  });
});

/** A fetch() stand-in: routes by URL, records calls. */
function fakeFetch(routes: Record<string, (() => Response) | Response[]>) {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    const r = routes[url];
    if (!r) return new Response('not found', { status: 404 });
    if (Array.isArray(r)) return r.shift() ?? new Response('gone', { status: 410 });
    return r();
  }) as typeof fetch;
  return { impl, calls };
}

describe('LiveHttp (politeness)', () => {
  it('checks robots.txt before fetching and refuses disallowed URLs', async () => {
    const f = fakeFetch({ 'https://a.com/robots.txt': () => new Response('User-agent: *\nDisallow: /rss/') });
    const http = new LiveHttp({ fetchImpl: f.impl, sleep: async () => {} });
    await expect(http.get('https://a.com/rss/search?q=AI')).rejects.toBeInstanceOf(RobotsDisallowedError);
    expect(f.calls).toEqual(['https://a.com/robots.txt']);
  });
  it('treats a missing robots.txt as allow-all and a failing one as disallow-all', async () => {
    const f = fakeFetch({
      'https://ok.com/feed': () => new Response('<rss/>'),
      'https://down.com/robots.txt': () => new Response('oops', { status: 503 }),
    });
    const http = new LiveHttp({ fetchImpl: f.impl, sleep: async () => {} });
    expect((await http.get('https://ok.com/feed')).body).toBe('<rss/>');
    await expect(http.get('https://down.com/feed')).rejects.toBeInstanceOf(RobotsDisallowedError);
  });
  it('retries 429 respecting Retry-After, then gives up with HttpError', async () => {
    const waits: number[] = [];
    const f = fakeFetch({
      'https://api.com/robots.txt': () => new Response('', { status: 404 }),
      'https://api.com/x': [new Response('slow down', { status: 429, headers: { 'retry-after': '7' } }), new Response('ok')],
      'https://api.com/y': [new Response('no', { status: 500 }), new Response('no', { status: 500 })],
    });
    const http = new LiveHttp({ fetchImpl: f.impl, sleep: async (ms) => void waits.push(ms), defaultIntervalMs: 0 });
    expect((await http.get('https://api.com/x')).body).toBe('ok');
    expect(waits).toContain(7000);
    await expect(http.get('https://api.com/y')).rejects.toBeInstanceOf(HttpError);
  });
  it('spaces requests to the same host', async () => {
    const waits: number[] = [];
    const f = fakeFetch({ 'https://api.gdeltproject.org/a': () => new Response('{}'), 'https://api.gdeltproject.org/b': () => new Response('{}') });
    const http = new LiveHttp({ fetchImpl: f.impl, sleep: async (ms) => void waits.push(ms) });
    await http.get('https://api.gdeltproject.org/a');
    await http.get('https://api.gdeltproject.org/b');
    expect(Math.max(...waits)).toBeGreaterThan(10_000);
  });
  it('caps response size', async () => {
    const f = fakeFetch({ 'https://big.com/x': () => new Response('x'.repeat(2000)) });
    const http = new LiveHttp({ fetchImpl: f.impl, sleep: async () => {}, maxBytes: 1000 });
    await expect(http.get('https://big.com/x')).rejects.toThrow(/larger than/);
  });
  it('sends the SlopperBot user agent', async () => {
    let ua = '';
    const impl = (async (_u: unknown, init?: RequestInit) => {
      ua = new Headers(init?.headers).get('user-agent') ?? '';
      return new Response('', { status: 404 });
    }) as typeof fetch;
    await new LiveHttp({ fetchImpl: impl, sleep: async () => {} }).get('https://ua.com/x').catch(() => {});
    expect(ua).toBe('SlopperBot/1.0 (+https://slopper.logicos.org/about/)');
  });
});

describe('sources', () => {
  const ctx = (http: HttpClient) => ({
    date: '2026-09-26',
    window: { from: new Date('2026-09-26T00:00:00Z'), to: new Date('2026-09-27T00:00:00Z') },
    config,
    http,
    log: logger('test'),
    now: new Date('2026-09-27T15:00:00Z'),
  });
  it('GDELT parses articles and treats plain-text answers as errors', async () => {
    const http: HttpClient = {
      get: async (url) => ({
        url,
        status: 200,
        contentType: 'application/json',
        body: url.includes('jobs')
          ? 'Your search contained a keyword that was too short.'
          : JSON.stringify({ articles: [{ url: 'https://news.example/a', title: 'AI and water', seendate: '20260926T101500Z', domain: 'news.example', language: 'Spanish' }] }),
      }),
    };
    const items = await gdelt.fetch(ctx(http));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ lang: 'es', publisher: 'news.example' });
  });
});

describe('runFetch', () => {
  it('replays a recorded day into a valid digest', async () => {
    const digest = await runFetch({ date: '2026-09-26', config, http: new ReplayHttp('tests/fixtures/fetch/2026-09-26'), now: new Date('2026-09-27T15:00:00Z') });
    expect(DigestSchema.safeParse(digest).success).toBe(true);
    const report = Object.fromEntries(digest.sources.map((s) => [s.source, s]));
    expect(report.gdelt!.ok).toBe(false); // it answered 429 while recording
    expect(report.hackernews!.count).toBeGreaterThan(5);
    expect(report.feeds!.count).toBeGreaterThan(3);
    expect(digest.items.length).toBeGreaterThan(20);
    const urls = digest.items.map((i) => canonicalUrl(i.url));
    expect(new Set(urls).size).toBe(urls.length);
    for (const i of digest.items) {
      expect(i.snippet.length).toBeLessThanOrEqual(config.sources.snippetMaxChars);
      expect(i.title).not.toMatch(/<[a-z]/i);
      const t = Date.parse(i.publishedAt);
      if (i.source === 'feeds' || i.source === 'techmeme' || i.source === 'hackernews') {
        expect(t).toBeGreaterThanOrEqual(Date.parse('2026-09-26T00:00:00Z'));
        expect(t).toBeLessThan(Date.parse('2026-09-27T00:00:00Z'));
      }
      if (i.source === 'techmeme') expect(AI_PATTERN.test(`${i.title} ${i.snippet}`)).toBe(true);
    }
  });

  const fake = (name: Source['name'], fail: boolean): Source => ({
    name,
    fetch: async () => {
      if (fail) throw new Error('down');
      return [{ url: `https://${name}.example/1`, title: `${name} story about AI`, publishedAt: '2026-09-26T12:00:00Z' }];
    },
  });
  const names = ['hackernews', 'huggingface', 'arxiv', 'feeds', 'gdelt', 'techmeme'] as const;

  it('tolerates up to half of the sources failing', async () => {
    const d = await runFetch({ date: '2026-09-26', config, http: new ReplayHttp('/nonexistent'), sources: names.map((n, i) => fake(n, i < 3)) });
    expect(d.sources.filter((s) => !s.ok)).toHaveLength(3);
    expect(d.items).toHaveLength(3);
  });

  it('stops when more than half fail, still returning the partial digest', async () => {
    const run = runFetch({ date: '2026-09-26', config, http: new ReplayHttp('/nonexistent'), sources: names.map((n, i) => fake(n, i < 4)) });
    await expect(run).rejects.toBeInstanceOf(FetchFailedError);
    await run.catch((e: FetchFailedError) => expect(e.digest.items).toHaveLength(2));
  });

  it('drops items outside the window and without dates or valid URLs', async () => {
    const src: Source = {
      name: 'feeds',
      fetch: async () => [
        { url: 'https://a.example/in', title: 'In the window', publishedAt: '2026-09-26T23:59:59Z' },
        { url: 'https://a.example/late', title: 'Next day', publishedAt: '2026-09-27T00:00:00Z' },
        { url: 'https://a.example/nodate', title: 'No date', publishedAt: null },
        { url: 'javascript:alert(1)', title: 'Bad URL', publishedAt: '2026-09-26T10:00:00Z' },
      ],
    };
    const d = await runFetch({ date: '2026-09-26', config, http: new ReplayHttp('/nonexistent'), sources: [src] });
    expect(d.items.map((i) => i.title)).toEqual(['In the window']);
  });
});
