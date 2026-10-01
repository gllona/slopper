import { join, relative } from 'node:path';
import { loadConfig } from '../pipeline/util/config.ts';
import { byMonth, loadSloppers, PUBLIC_FILES, siteMode } from './lib/sloppers.ts';

/**
 * Eleventy config (DESIGN §12). Run through tsx (see package.json scripts).
 * Output: dist/. No client framework; the only script is assets/js/replay.js.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function (eleventyConfig: any) {
  const config = loadConfig({ loadDotEnv: true });
  const mode = siteMode();
  const sloppers = loadSloppers(mode);
  const siteUrl = config.siteUrl.replace(/\/$/, '');

  eleventyConfig.addGlobalData('sloppers', sloppers);
  eleventyConfig.addGlobalData('latest', sloppers[0] ?? null);
  eleventyConfig.addGlobalData('months', byMonth(sloppers));
  eleventyConfig.addGlobalData('site', {
    url: siteUrl,
    name: 'Slopper',
    description: 'A small piece of AI-made slop-art every day about the state of AI.',
    contact: 'slopper@lab14.chat',
    repo: 'https://github.com/gllona/slopper',
    mode,
    buildTime: new Date().toISOString(),
  });

  // Public art files next to each day page (DESIGN §12.7): only slopper.svg, still.png, og.png.
  for (const s of sloppers) {
    for (const f of PUBLIC_FILES) {
      if (s.files[f]) eleventyConfig.addPassthroughCopy({ [relative(process.cwd(), join(s.dir, f))]: `${s.path}/${f}` });
    }
  }
  eleventyConfig.addPassthroughCopy({ 'site/assets': 'assets' });
  eleventyConfig.addPassthroughCopy({ 'site/static': '/' });

  eleventyConfig.addFilter('absolute', (path: string) => `${siteUrl}${path.startsWith('/') ? '' : '/'}${path}`);
  eleventyConfig.addFilter('json', (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c'));
  eleventyConfig.addFilter('hostname', (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  });
  eleventyConfig.addFilter('slopperTitle', (s: { number: number | null; motto: string; publishedOn: string }) =>
    `Slopper${s.number ? ` #${s.number}` : ''} — ${s.motto} — ${s.publishedOn}`,
  );
  eleventyConfig.addFilter('sourceName', (source: string) => SOURCE_NAMES[source] ?? source);

  eleventyConfig.setServerOptions({ port: 8080, showAllHosts: false });

  return {
    dir: { input: 'site/src', includes: '_includes', output: process.env.SLOPPER_SITE_OUT ?? 'dist' },
    templateFormats: ['njk', 'md'],
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk',
  };
}

const SOURCE_NAMES: Record<string, string> = {
  hackernews: 'Hacker News',
  huggingface: 'Hugging Face',
  arxiv: 'arXiv',
  feeds: 'publisher feed',
  gdelt: 'GDELT',
  techmeme: 'Techmeme',
};
