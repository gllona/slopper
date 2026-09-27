import type { CompileResult } from './compile.ts';
import type { RenderOutput } from './render.ts';

/**
 * Deterministic lint (DESIGN §9.8). Errors send the scene straight back to the Art stage
 * (the Critic is skipped); warnings are passed to the Critic as context.
 */

export interface LintLimits {
  artboard: number;
  safeArea: number;
  svgMaxKB: number;
  maxWordsInArt: number;
  animation: { minSec: number; maxSec: number };
}

export interface LintReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    svgKB: number;
    words: number;
    colors: string[];
    duration: number | null;
    stillStdDev?: number;
    maxFlashesPerSecond?: number;
  };
}

/** Lint that needs only the compiled + sanitized SVG. */
export function lintSvg(compiled: CompileResult, sanitizedSvg: string, removed: string[], limits: LintLimits): LintReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (removed.length) errors.push(`sanitizer removed unexpected content: ${removed.join('; ')}`);

  const svgKB = Buffer.byteLength(sanitizedSvg, 'utf8') / 1024;
  if (svgKB > limits.svgMaxKB) errors.push(`SVG is ${svgKB.toFixed(1)} KB; the limit is ${limits.svgMaxKB} KB (simplify the scene)`);

  const palette = new Set(Object.values(compiled.style.palette).map((c) => c.toLowerCase()));
  const colors = usedColors(sanitizedSvg);
  const offPalette = colors.filter((c) => !palette.has(c));
  if (offPalette.length) errors.push(`colors outside the "${compiled.style.id}" palette: ${offPalette.join(', ')} (use role classes or palette colors)`);

  if (compiled.words > limits.maxWordsInArt) errors.push(`${compiled.words} words of text in the art; the limit is ${limits.maxWordsInArt} (the joke lives in the phrase)`);

  const d = compiled.duration;
  if (d !== null) {
    if (d < limits.animation.minSec || d > limits.animation.maxSec)
      errors.push(`animation lasts ${d}s; it must be between ${limits.animation.minSec}s and ${limits.animation.maxSec}s`);
    const anim = compiled.scene.animation!;
    const lastEnd = Math.max(...anim.beats.map((b) => b.t));
    if (d - lastEnd < Math.min(anim.holdSec, 1)) warnings.push(`the last beat starts at ${lastEnd}s: leave time to read the punchline before the end (${d}s)`);
  }

  for (const el of compiled.elements) {
    const b = el.box;
    const outside = b.x + b.w < 0 || b.y + b.h < 0 || b.x > limits.artboard || b.y > limits.artboard;
    if (outside) errors.push(`element "${el.id}" is placed completely outside the artboard`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: { svgKB: Math.round(svgKB * 10) / 10, words: compiled.words, colors, duration: d },
  };
}

/** Lint that needs the render (final-frame geometry, blank check, flashing). */
export function lintRender(report: LintReport, compiled: CompileResult, render: RenderOutput, limits: LintLimits): LintReport {
  const errors = [...report.errors];
  const warnings = [...report.warnings];
  const { artboard: A, safeArea: S } = limits;
  const tol = 2;

  for (const el of compiled.elements) {
    const b = render.metrics.boxes[el.id];
    if (!b) continue; // invisible at the end (e.g. faded out) — fine
    const clipped = b.x < -tol || b.y < -tol || b.x + b.w > A + tol || b.y + b.h > A + tol;
    const unsafe = b.x < S - tol || b.y < S - tol || b.x + b.w > A - S + tol || b.y + b.h > A - S + tol;
    const where = `x ${Math.round(b.x)}…${Math.round(b.x + b.w)}, y ${Math.round(b.y)}…${Math.round(b.y + b.h)}`;
    if (el.key && unsafe) errors.push(`"${el.id}" (${el.component}) must be inside the safe area ${S}…${A - S} px (now ${where})`);
    else if (clipped && !isGrounded(compiled, el.id, b, A)) errors.push(`"${el.id}" is cut off by the artboard edge in the final frame (${where})`);
    else if (unsafe) warnings.push(`"${el.id}" extends outside the safe area in the final frame (${where})`);
  }

  if (render.stillStdDev < 0.02) errors.push(`the final frame looks blank or nearly uniform (luminance std dev ${render.stillStdDev.toFixed(3)})`);

  const flashes = render.flashes?.maxPerSecond;
  if (flashes !== undefined && flashes > 3) errors.push(`flashing: ${flashes} flashes in one second at ${render.flashes?.where} (max 3; WCAG 2.3.1)`);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: { ...report.stats, stillStdDev: Math.round(render.stillStdDev * 1000) / 1000, maxFlashesPerSecond: flashes },
  };
}

/** Grounded elements may extend below the bottom edge only (they stand on the ground). */
function isGrounded(compiled: CompileResult, id: string, b: { x: number; y: number; w: number; h: number }, A: number): boolean {
  const el = compiled.scene.elements.find((e) => e.id === id);
  const sideOk = b.x >= -2 && b.x + b.w <= A + 2 && b.y >= -2;
  return !!el && sideOk && b.y + b.h > A;
}

/** All literal colors in the SVG (attributes and CSS), normalized to lowercase #rrggbb. */
export function usedColors(svg: string): string[] {
  const found = new Set<string>();
  for (const m of svg.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b(?![\w-])/g)) {
    const before = svg.slice(Math.max(0, m.index! - 5), m.index!);
    if (/url\($|href="$/.test(before)) continue; // references, not colors
    let hex = m[1]!.toLowerCase();
    if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
    found.add(`#${hex}`);
  }
  for (const m of svg.matchAll(/\b(?:fill|stroke|stop-color|flood-color|color)\s*[:=]\s*"?\s*(rgba?\([^)]*\)|hsla?\([^)]*\)|[a-z]+)/gi)) {
    const v = m[1]!.toLowerCase();
    if (['none', 'transparent', 'currentcolor', 'inherit', 'url'].includes(v)) continue;
    found.add(v);
  }
  return [...found].sort();
}
