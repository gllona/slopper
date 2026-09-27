import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import opentype, { type Font, type Glyph, type PathCommand } from 'opentype.js';

/**
 * Fonts for text inside the art. Labels are converted to paths at compile time, so the SVG
 * never loads a font (an SVG inside <img> cannot fetch fonts anyway) and renders identically
 * everywhere.
 */
export const FONTS = {
  'bricolage-grotesque-800': 'bricolage-grotesque-latin-800-normal.woff',
  'bricolage-grotesque-600': 'bricolage-grotesque-latin-600-normal.woff',
  'ibm-plex-mono-700': 'ibm-plex-mono-latin-700-normal.woff',
  'ibm-plex-mono-500': 'ibm-plex-mono-latin-500-normal.woff',
  'atkinson-hyperlegible-next-700': 'atkinson-hyperlegible-next-latin-700-normal.woff',
  'atkinson-hyperlegible-next-500': 'atkinson-hyperlegible-next-latin-500-normal.woff',
} as const;
export type FontKey = keyof typeof FONTS;

const cache = new Map<FontKey, Font>();

export function fontFile(key: FontKey): string {
  return fileURLToPath(new URL(`./fonts/${FONTS[key]}`, import.meta.url));
}

export function loadFont(key: FontKey): Font {
  let f = cache.get(key);
  if (!f) {
    const buf = readFileSync(fontFile(key));
    f = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    cache.set(key, f);
  }
  return f;
}

export interface TextShape {
  d: string;
  width: number;
  /** Cap-height-ish ascent and descent in px for the given size. */
  ascent: number;
  descent: number;
}

/**
 * Lay out one line of text as a single SVG path, left edge at x=0, baseline at y=0.
 * Simple Latin layout: glyph advances + kerning (no shaping; enough for short labels).
 */
export function textPath(text: string, key: FontKey, size: number, tracking = 0): TextShape {
  const font = loadFont(key);
  const s = size / font.unitsPerEm;
  let x = 0;
  let d = '';
  let prev: Glyph | null = null;
  for (const ch of text) {
    const g = font.charToGlyph(ch);
    if (prev) x += font.getKerningValue(prev, g) * s;
    d += pathData(g.getPath(x, 0, size).commands);
    x += (g.advanceWidth ?? 0) * s + tracking;
    prev = g;
  }
  if (text.length > 0) x -= tracking;
  return { d, width: x, ascent: font.ascender * s * 0.72, descent: -font.descender * s * 0.4 };
}

/** Greedy word wrap into lines no wider than maxWidth. */
export function wrapText(text: string, key: FontKey, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (line && textPath(candidate, key, size).width > maxWidth) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Our own path serializer: opentype.js's toPathData() emits "NaN" for some coordinates,
 * which makes browsers stop drawing the rest of the path.
 */
function pathData(commands: PathCommand[]): string {
  const f = (v: number | undefined): string => {
    if (v === undefined || !Number.isFinite(v)) throw new Error('Invalid glyph coordinate');
    return String(Math.round(v * 10) / 10);
  };
  let d = '';
  for (const c of commands) {
    switch (c.type) {
      case 'M':
      case 'L':
        d += `${c.type}${f(c.x)} ${f(c.y)}`;
        break;
      case 'Q':
        d += `Q${f(c.x1)} ${f(c.y1)} ${f(c.x)} ${f(c.y)}`;
        break;
      case 'C':
        d += `C${f(c.x1)} ${f(c.y1)} ${f(c.x2)} ${f(c.y2)} ${f(c.x)} ${f(c.y)}`;
        break;
      case 'Z':
        d += 'Z';
        break;
    }
  }
  return d;
}
