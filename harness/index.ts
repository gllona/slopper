import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileScene, type CompileResult } from './compile.ts';
import { lintRender, lintSvg, type LintLimits, type LintReport } from './lint.ts';
import { renderAll, type RenderOptions, type RenderOutput } from './render.ts';
import { sanitizeAndOptimize } from './sanitize.ts';

export { compileScene, SceneError } from './compile.ts';
export { sanitizeSvg, sanitizeAndOptimize } from './sanitize.ts';

export interface BuildResult {
  compiled: CompileResult;
  svg: string;
  lint: LintReport;
  render: RenderOutput | null;
}

/**
 * The full harness step used by the Art loop and the CLI:
 * compile → sanitize (+optimize) → lint (static) → render → lint (render).
 * Rendering is skipped when static lint already failed (the Art stage must fix it first).
 */
export async function buildScene(
  scene: unknown,
  limits: LintLimits & { rawSvgMaxBytes?: number; maxRawElements?: number; filmstripFrames?: number },
  texts: Pick<RenderOptions, 'motto' | 'phrase' | 'number' | 'date'> = {},
): Promise<BuildResult> {
  const compiled = compileScene(scene, {
    artboard: limits.artboard,
    safeArea: limits.safeArea,
    rawSvgMaxBytes: limits.rawSvgMaxBytes,
    maxRawElements: limits.maxRawElements,
  });
  const { svg, removed } = sanitizeAndOptimize(compiled.svg);
  let lint = lintSvg(compiled, svg, removed, limits);
  if (!lint.ok) return { compiled, svg, lint, render: null };
  const render = await renderAll(svg, {
    size: limits.artboard,
    duration: compiled.duration,
    filmstripFrames: limits.filmstripFrames,
    style: compiled.style,
    ...texts,
  });
  lint = lintRender(lint, compiled, render, limits);
  return { compiled, svg, lint, render };
}

/** Write slopper.svg, still.png, filmstrip.png (if animated), og.png, and lint.json into a folder. */
export function writeBuild(outDir: string, result: BuildResult): string[] {
  mkdirSync(outDir, { recursive: true });
  const written: string[] = [];
  const put = (name: string, data: string | Buffer) => {
    writeFileSync(join(outDir, name), data);
    written.push(join(outDir, name));
  };
  put('slopper.svg', result.svg);
  put('lint.json', JSON.stringify(result.lint, null, 2) + '\n');
  if (result.render) {
    put('still.png', result.render.still);
    put('still.jpg', result.render.stillJpg);
    put('og.png', result.render.og);
    if (result.render.filmstrip) put('filmstrip.png', result.render.filmstrip);
  }
  return written;
}
