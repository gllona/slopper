import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { compileScene } from '../../harness/compile.ts';
import { sanitizeAndOptimize } from '../../harness/sanitize.ts';
import { loadSloppers } from '../../site/lib/sloppers.ts';

/** A tiny archive with two sloppers (SVG only, no PNGs) in a temp dir. */
function makeArchive(): string {
  const root = mkdtempSync(join(tmpdir(), 'slopper-site-'));
  const days = [
    { date: '2026-09-21', mode: 'fresh', motto: 'Benchmark Season', scene: 'benchmark-season' },
    { date: '2026-09-22', mode: 'continuation', continuesFrom: '2026-09-21', motto: 'Still Benchmarking', scene: 'quiet-day' },
  ];
  for (const d of days) {
    const dir = join(root, d.date.replaceAll('-', '/'));
    mkdirSync(dir, { recursive: true });
    const scene = JSON.parse(readFileSync(`harness/fixtures/${d.scene}.json`, 'utf8'));
    writeFileSync(join(dir, 'slopper.svg'), sanitizeAndOptimize(compileScene(scene).svg).svg);
    writeFileSync(join(dir, 'digest.json'), '{}');
    writeFileSync(
      join(dir, 'day.json'),
      JSON.stringify({
        date: d.date,
        number: d.date === '2026-09-21' ? 1 : 2,
        mode: d.mode,
        continuesFrom: d.continuesFrom,
        motto: d.motto,
        phrase: 'The new model is 3% smarter & 40% more "confident".',
        alt: scene.alt,
        artType: scene.animation ? 'animated' : 'static',
        style: scene.style,
        mood: { hype_doom: 0, calm_frantic: 0 },
        sources: [{ title: 'A <b>headline</b>', url: 'https://example.com/a', source: 'hackernews', publishedAt: `${d.date}T08:00:00Z` }],
        versions: { harness: '0.2.0', prompts: '0', ontology: '0', rubricArt: '0', rubricCop: '0' },
        generatedAt: `${d.date}T06:10:00Z`,
      }),
    );
  }
  return root;
}

describe('site data', () => {
  it('links neighbours and continuations, newest first', () => {
    const list = loadSloppers('all', makeArchive());
    expect(list.map((s) => s.date)).toEqual(['2026-09-22', '2026-09-21']);
    expect(list[0]!.prev?.date).toBe('2026-09-22');
    expect(list[0]!.url).toBe('/2026/09/23/'); // news of 09-22, published 09-23
    expect(list[0]!.continues).toEqual({ url: '/2026/09/22/', number: 1, date: '2026-09-22' });
    expect(list[1]!.next?.date).toBe('2026-09-23');
    expect(list[0]!.animated).toBe(true);
  });

  it('build mode publishes only folders tracked by git', () => {
    // a temp archive is not tracked by this repository's git → nothing is published
    expect(loadSloppers('build', makeArchive())).toEqual([]);
  });

  it('dev mode marks untracked folders as drafts', () => {
    const list = loadSloppers('dev', makeArchive());
    expect(list.every((s) => s.draft)).toBe(true);
  });
});

describe('site build', () => {
  let out: string;
  beforeAll(() => {
    const archive = makeArchive();
    out = mkdtempSync(join(tmpdir(), 'slopper-dist-'));
    execFileSync('npx', ['tsx', 'node_modules/@11ty/eleventy/cmd.cjs', '--config=site/eleventy.config.ts', '--quiet'], {
      env: { ...process.env, SLOPPER_ARCHIVE: archive, SLOPPER_SITE_MODE: 'all', SLOPPER_SITE_OUT: out, SITE_URL: 'https://slopper.logicos.org' },
      stdio: 'pipe',
    });
  }, 120_000);

  const read = (p: string) => readFileSync(join(out, p), 'utf8');

  it('writes every page and machine-readable file', () => {
    for (const f of ['index.html', '2026/09/22/index.html', '2026/09/23/index.html', 'archive/index.html', 'about/index.html', '404.html', 'feed.xml', 'sitemap.xml', 'robots.txt', '_headers', '_redirects', 'favicon.svg', 'assets/css/site.css', 'assets/js/replay.js']) {
      expect(existsSync(join(out, f)), f).toBe(true);
    }
  });

  it('copies only public files into dated folders (named by publication date)', () => {
    expect(existsSync(join(out, '2026/09/22/slopper.svg'))).toBe(true);
    expect(existsSync(join(out, '2026/09/22/digest.json'))).toBe(false);
    expect(existsSync(join(out, '2026/09/22/day.json'))).toBe(false);
    expect(existsSync(join(out, '2026/09/21/index.html'))).toBe(false);
  });

  it('day pages have SEO metadata and escaped text', () => {
    const html = read('2026/09/23/index.html');
    expect(html).toContain('<title>Slopper #2 — Still Benchmarking — 2026-09-23</title>');
    expect(html).toContain('<link rel="canonical" href="https://slopper.logicos.org/2026/09/23/">');
    expect(html).toContain('<time datetime="2026-09-23">23 September 2026</time>');
    expect(html).toContain('News of 22 September 2026');
    expect(html).toContain('&amp; 40% more &quot;confident&quot;');
    expect(html).toContain('A &lt;b&gt;headline&lt;/b&gt;');
    expect(html).toContain('Continues from #1');
    expect(html).toContain('<details class="sources">');
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1]!);
    expect(ld['@type']).toBe('CreativeWork');
    expect(ld.license).toBe('https://creativecommons.org/licenses/by/4.0/');
  });

  it('is compatible with the strict CSP: no inline styles or inline scripts', () => {
    for (const f of ['index.html', '2026/09/22/index.html', 'archive/index.html', 'about/index.html']) {
      const html = read(f);
      expect(html, f).not.toMatch(/\sstyle="/);
      expect(html, f).not.toMatch(/<style/);
      const scripts = [...html.matchAll(/<script([^>]*)>/g)].map((m) => m[1]!);
      expect(scripts.every((a) => a.includes('src="/assets/') || a.includes('application/ld+json')), f).toBe(true);
    }
  });

  it('home shows the latest slopper; /today redirects to it', () => {
    expect(read('index.html')).toContain('Still Benchmarking');
    expect(read('_redirects')).toContain('/today/ /2026/09/23/ 302');
  });

  it('headers keep the pages.dev copy out of search engines', () => {
    expect(read('_headers')).toMatch(/https:\/\/slopper-coh\.pages\.dev\/\*\n  X-Robots-Tag: noindex/);
  });

  it('feed and sitemap list every slopper with absolute URLs', () => {
    expect(read('feed.xml')).toContain('<id>https://slopper.logicos.org/2026/09/22/</id>');
    expect(read('sitemap.xml')).toContain('<loc>https://slopper.logicos.org/2026/09/23/</loc>');
    expect(read('robots.txt')).toContain('Sitemap: https://slopper.logicos.org/sitemap.xml');
  });
});
