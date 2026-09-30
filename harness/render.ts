import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { PNG } from 'pngjs';
import sharp from 'sharp';
import { fontFile, type FontKey } from './fonts.ts';
import type { Box } from './layout.ts';
import type { StyleCard } from './style.ts';

/**
 * Rendering with Playwright + Chromium (DESIGN §9.8). The SVG is inlined in a page so the
 * compiler's CSS animations can be paused and seeked exactly with document.getAnimations().
 *
 * Set SLOPPER_CDP_URL (e.g. http://127.0.0.1:9333) to render with an already running Chrome
 * instead of launching Playwright's bundled Chromium.
 */

export async function withBrowser<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
  const cdp = process.env.SLOPPER_CDP_URL;
  const browser = cdp ? await chromium.connectOverCDP(cdp) : await chromium.launch();
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

async function svgPage(browser: Browser, svg: string, size: number): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' });
  await page.setContent(
    `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:#fff;overflow:hidden}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svg}</body></html>`,
    { waitUntil: 'load' },
  );
  return page;
}

/** Pause every animation and move the timeline to `ms`. Ambient loops are held at their start. */
async function seek(page: Page, ms: number): Promise<void> {
  await page.evaluate((t) => {
    for (const a of document.getAnimations()) {
      a.pause();
      const name = (a as CSSAnimation).animationName ?? '';
      a.currentTime = name.startsWith('amb-') ? 0 : t;
    }
  }, ms);
  // let style and layout settle
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
}

export interface FrameMetrics {
  /** Rendered element boxes (artboard px), by element id, at the measured time. */
  boxes: Record<string, Box>;
}

export interface RenderOutput {
  still: Buffer;
  filmstrip: Buffer | null;
  og: Buffer;
  metrics: FrameMetrics;
  /** Luminance analysis for lint. */
  stillStdDev: number;
  flashes: FlashReport | null;
}

export interface FlashReport {
  /** Maximum number of flashes in any one-second window, in any screen region. */
  maxPerSecond: number;
  where?: string;
}

export interface RenderOptions {
  size?: number;
  duration: number | null;
  filmstripFrames?: number;
  style: StyleCard;
  /** Texts for og.png; placeholders are used when omitted (fixtures). */
  motto?: string;
  phrase?: string;
  number?: number | null;
  date?: string;
}

export async function renderAll(svg: string, opts: RenderOptions): Promise<RenderOutput> {
  const size = opts.size ?? 1080;
  return withBrowser(async (browser) => {
    const page = await svgPage(browser, svg, size);
    const endMs = (opts.duration ?? 0) * 1000;
    await seek(page, endMs);
    const still = await page.screenshot({ type: 'png' });
    const metrics = await measure(page);
    let filmstrip: Buffer | null = null;
    let flashes: FlashReport | null = null;
    if (opts.duration) {
      const n = opts.filmstripFrames ?? 6;
      const frames: { t: number; png: Buffer }[] = [];
      for (let i = 0; i < n; i++) {
        const t = (opts.duration * i) / (n - 1);
        await seek(page, t * 1000);
        frames.push({ t, png: await page.screenshot({ type: 'png' }) });
      }
      filmstrip = await composeFilmstrip(browser, frames, opts.style);
      flashes = await analyzeFlashes(browser, svg, opts.duration);
    }
    await page.close();
    const og = await composeOg(browser, still, opts);
    return {
      still: await compressPng(still),
      filmstrip: filmstrip && (await compressPng(filmstrip)),
      og: await compressPng(og),
      metrics,
      stillStdDev: luminanceStdDev(still),
      flashes,
    };
  });
}

async function measure(page: Page): Promise<FrameMetrics> {
  const boxes = await page.evaluate(() => {
    const out: Record<string, { x: number; y: number; w: number; h: number }> = {};
    const svg = document.querySelector('svg')!;
    const k = svg.viewBox.baseVal.width / svg.getBoundingClientRect().width;
    const origin = svg.getBoundingClientRect();
    for (const el of Array.from(document.querySelectorAll<SVGGElement>('[data-el]'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      out[el.dataset.el!] = { x: (r.x - origin.x) * k, y: (r.y - origin.y) * k, w: r.width * k, h: r.height * k };
    }
    return out;
  });
  return { boxes };
}

/** Palette PNG (256 colors, no dithering): the art is flat, so this is visually lossless and ~10× smaller. */
export async function compressPng(png: Buffer): Promise<Buffer> {
  return sharp(png).png({ palette: true, colors: 256, dither: 0, effort: 10, compressionLevel: 9 }).toBuffer();
}

// ---------- composites ----------

function dataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString('base64')}`;
}

function fontFace(family: string, key: FontKey, weight: number): string {
  const b64 = readFileSync(fontFile(key)).toString('base64');
  return `@font-face{font-family:'${family}';src:url(data:font/woff;base64,${b64}) format('woff');font-weight:${weight}}`;
}

async function composeFilmstrip(browser: Browser, frames: { t: number; png: Buffer }[], style: StyleCard): Promise<Buffer> {
  const cols = 3;
  const cell = 480;
  const rows = Math.ceil(frames.length / cols);
  const w = cols * cell + (cols + 1) * 16;
  const h = rows * (cell + 44) + (rows + 1) * 16;
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const cells = frames
    .map(
      (f, i) =>
        `<figure><img src="${dataUrl(f.png)}"><figcaption>${i + 1} · ${f.t.toFixed(1)} s${i === frames.length - 1 ? ' · final' : ''}</figcaption></figure>`,
    )
    .join('');
  await page.setContent(
    `<!doctype html><html><head><style>${fontFace('Label', 'atkinson-hyperlegible-next-700', 700)}
    body{margin:0;background:#222;display:grid;grid-template-columns:repeat(${cols},${cell}px);gap:16px;padding:16px;font:700 22px Label,sans-serif;color:#eee}
    figure{margin:0}img{display:block;width:${cell}px;height:${cell}px;outline:2px solid ${style.palette.ink}}figcaption{height:28px;margin-top:10px}</style></head><body>${cells}</body></html>`,
    { waitUntil: 'load' },
  );
  const png = await page.screenshot({ type: 'png' });
  await page.close();
  return png;
}

async function composeOg(browser: Browser, still: Buffer, opts: RenderOptions): Promise<Buffer> {
  const p = opts.style.palette;
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const motto = escapeHtml(opts.motto ?? 'Slopper');
  const phrase = escapeHtml(opts.phrase ?? 'A daily piece of slop-art about the state of AI, made by AI.');
  const meta = escapeHtml([opts.number ? `#${opts.number}` : null, opts.date ?? null].filter(Boolean).join(' · '));
  await page.setContent(
    `<!doctype html><html><head><style>
    ${fontFace('Display', 'bricolage-grotesque-800', 800)}${fontFace('Text', 'atkinson-hyperlegible-next-500', 500)}${fontFace('Text', 'atkinson-hyperlegible-next-700', 700)}
    html,body{margin:0;width:1200px;height:630px;overflow:hidden}
    body{display:flex;align-items:center;gap:48px;padding:0 56px 0 45px;box-sizing:border-box;background:${p.paper};color:${p.ink};font-family:Text,sans-serif}
    img{width:540px;height:540px;flex:none;border-radius:6px;box-shadow:0 2px 0 ${p.ink}22}
    .t{display:flex;flex-direction:column;gap:22px;min-width:0}
    .w{font:800 30px Display,sans-serif;letter-spacing:-.5px;opacity:.8}
    h1{margin:0;font:800 60px/1.02 Display,sans-serif;letter-spacing:-1.5px}
    p{margin:0;font:500 28px/1.35 Text,sans-serif}
    .m{font:700 20px Text,sans-serif;opacity:.7}
    </style></head><body><img src="${dataUrl(still)}"><div class="t"><div class="w">Slopper</div><h1>${motto}</h1><p>${phrase}</p><div class="m">${meta || 'slopper.logicos.org'}</div></div></body></html>`,
    { waitUntil: 'load' },
  );
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: 'png' });
  await page.close();
  return png;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- analysis ----------

function relLum(r: number, g: number, b: number): number {
  const c = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

/** Standard deviation of relative luminance over the image (near 0 = blank). */
export function luminanceStdDev(png: Buffer): number {
  const img = PNG.sync.read(png);
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let i = 0; i < img.data.length; i += 4 * 7) {
    const l = relLum(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!);
    sum += l;
    sum2 += l * l;
    n++;
  }
  const mean = sum / n;
  return Math.sqrt(Math.max(0, sum2 / n - mean * mean));
}

/**
 * WCAG 2.3.1-style check: sample every 100 ms, split the frame into a 4×4 grid, and count
 * opposing luminance changes of ≥ 10% (with the darker state below 0.8) per region.
 * A flash is a pair of opposing changes; more than 3 flashes in any 1 s window fails.
 */
async function analyzeFlashes(browser: Browser, svg: string, duration: number): Promise<FlashReport> {
  const small = 216;
  const page = await browser.newPage({ viewport: { width: small, height: small }, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><html><head><style>html,body{margin:0;overflow:hidden}svg{display:block;width:${small}px;height:${small}px}</style></head><body>${svg}</body></html>`,
  );
  const G = 4;
  const series: number[][] = Array.from({ length: G * G }, () => []);
  const steps = Math.round(duration * 10);
  for (let s = 0; s <= steps; s++) {
    await seek(page, s * 100);
    const img = PNG.sync.read(await page.screenshot({ type: 'png' }));
    const cell = small / G;
    const acc = new Array(G * G).fill(0);
    const cnt = new Array(G * G).fill(0);
    for (let y = 0; y < small; y += 2) {
      for (let x = 0; x < small; x += 2) {
        const i = (y * small + x) * 4;
        const k = Math.floor(y / cell) * G + Math.floor(x / cell);
        acc[k] += relLum(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!);
        cnt[k]++;
      }
    }
    for (let k = 0; k < G * G; k++) series[k]!.push(acc[k] / cnt[k]);
  }
  await page.close();
  let max = 0;
  let where: string | undefined;
  for (const [k, lum] of series.entries()) {
    // transitions: indices where the luminance changes significantly, with direction
    const trans: { i: number; dir: number }[] = [];
    let ref = lum[0]!;
    for (let i = 1; i < lum.length; i++) {
      const a = ref;
      const b = lum[i]!;
      if (Math.abs(b - a) >= 0.1 && Math.min(a, b) < 0.8) {
        const dir = Math.sign(b - a);
        if (!trans.length || trans.at(-1)!.dir !== dir) trans.push({ i, dir });
        ref = b;
      } else if ((b - a) * (trans.at(-1)?.dir ?? 0) > 0) {
        ref = b; // continuing in the same direction
      }
    }
    for (let s = 0; s < trans.length; s++) {
      const within = trans.filter((t) => t.i >= trans[s]!.i && t.i < trans[s]!.i + 10).length;
      const flashesInWindow = Math.floor(within / 2);
      if (flashesInWindow > max) {
        max = flashesInWindow;
        where = `region ${k % G},${Math.floor(k / G)} (4×4 grid)`;
      }
    }
  }
  return { maxPerSecond: max, where };
}
