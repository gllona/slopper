import { HARNESS_VERSION, SceneSchema, type Scene, type SceneElement } from '../pipeline/schemas/scene.ts';
import { AnimationError, compileAnimation, staticDecls, type AnimTarget } from './animate.ts';
import { renderBackground } from './background.ts';
import { COMPONENTS } from './components/index.ts';
import type { ChannelState, ComponentDef, Rendered } from './components/types.ts';
import { attachOrigin, groundY, resolveAt, scaleBox, translateBox, type Artboard, type Box, type Point } from './layout.ts';
import { sanitizeSvg } from './sanitize.ts';
import { loadStyle, round, styleCss, styleDefs, type StyleCard } from './style.ts';

/**
 * scene.json → SVG (DESIGN §9). Validates the scene structure, each component's props, and the
 * animation; collects *all* problems into one SceneError so the Art stage can fix them at once.
 */

export interface CompileOptions {
  artboard?: number;
  safeArea?: number;
  rawSvgMaxBytes?: number;
  maxRawElements?: number;
}

export interface PlacedElement {
  id: string;
  component: string;
  /** Approximate box in artboard coordinates (from component geometry; lint uses the rendered one). */
  box: Box;
  /** Labels and speech bubbles must stay inside the safe area. */
  key: boolean;
}

export interface CompileResult {
  svg: string;
  scene: Scene;
  style: StyleCard;
  /** Words of text drawn in the art. */
  words: number;
  elements: PlacedElement[];
  /** Animation duration in seconds; null for static scenes. */
  duration: number | null;
}

export class SceneError extends Error {
  constructor(public issues: string[]) {
    super(`Invalid scene:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
  }
}

const KEY_COMPONENTS = new Set(['label', 'speech-bubble']);

export function compileScene(input: unknown, opts: CompileOptions = {}): CompileResult {
  const board: Artboard = { size: opts.artboard ?? 1080, safe: opts.safeArea ?? 60 };
  const issues: string[] = [];

  const parsed = SceneSchema.safeParse(input);
  if (!parsed.success) {
    throw new SceneError(parsed.error.issues.map((i) => `${i.path.join('.') || '(scene)'}: ${i.message}`));
  }
  const scene = parsed.data;

  let style: StyleCard;
  try {
    style = loadStyle(scene.style);
  } catch (e) {
    throw new SceneError([`style: ${(e as Error).message}`]);
  }
  if (major(scene.harness) !== major(HARNESS_VERSION) || minor(scene.harness) > minor(HARNESS_VERSION)) {
    issues.push(`harness: scene targets ${scene.harness}, this harness is ${HARNESS_VERSION}`);
  }

  const raws = scene.elements.filter((e) => e.component === 'raw');
  if (raws.length > (opts.maxRawElements ?? 3)) issues.push(`elements: at most ${opts.maxRawElements ?? 3} raw elements per scene (found ${raws.length})`);

  // values each prop takes during the scene (initial + `set` beats), for multi-state parts like faces
  const usedValues = new Map<string, Map<string, Set<unknown>>>();
  for (const el of scene.elements) {
    const m = new Map<string, Set<unknown>>();
    for (const [k, v] of Object.entries(el.props)) m.set(k, new Set([v]));
    usedValues.set(el.id, m);
  }
  for (const b of scene.animation?.beats ?? []) {
    if (b.action !== 'set' || !b.props) continue;
    const m = usedValues.get(b.target)!;
    for (const [k, v] of Object.entries(b.props)) m.set(k, (m.get(k) ?? new Set()).add(v));
  }

  // validate component + props, render in local coordinates
  interface Prepared {
    el: SceneElement;
    def: ComponentDef<any>;
    props: Record<string, unknown>;
    rendered: Rendered;
    parts: Set<string>;
    used(prop: string): Set<unknown>;
  }
  const prepared = new Map<string, Prepared>();
  for (const [i, el] of scene.elements.entries()) {
    const def = COMPONENTS[el.component];
    if (!def) {
      issues.push(`elements.${i} (${el.id}): unknown component "${el.component}". Available: ${Object.keys(COMPONENTS).join(', ')}`);
      continue;
    }
    const pr = def.props.safeParse(el.props);
    if (!pr.success) {
      issues.push(...pr.error.issues.map((x) => `elements.${i} (${el.id}).props${x.path.length ? '.' + x.path.join('.') : ''}: ${x.message}`));
      continue;
    }
    const props = pr.data as Record<string, unknown>;
    if (el.component === 'raw') {
      const rawIssue = checkRaw(el, opts.rawSvgMaxBytes ?? 8192);
      if (rawIssue) {
        issues.push(`elements.${i} (${el.id}).svg: ${rawIssue}`);
        continue;
      }
      props.rawSvg = namespaceIds(el.svg!, el.id);
    }
    const parts = new Set<string>();
    const values = usedValues.get(el.id)!;
    const ctx = {
      style,
      stroke: style.stroke.width,
      part: (name: string) => {
        parts.add(name);
        return partId(el.id, name);
      },
      used: (prop: string) => {
        const set = new Set(values.get(prop) ?? []);
        if (props[prop] !== undefined) set.add(props[prop]);
        return set;
      },
    };
    try {
      prepared.set(el.id, { el, def, props, rendered: def.render(props as never, ctx), parts, used: ctx.used });
    } catch (e) {
      issues.push(`elements.${i} (${el.id}): ${(e as Error).message}`);
    }
  }
  if (issues.length) throw new SceneError(issues);

  // layout: anchors and attachments (parents first, cycles rejected)
  const background = {
    ...scene.background,
    type: scene.background.type ?? style.background.type,
    horizon: scene.background.horizon ?? style.background.horizon,
  };
  const ground = groundY(board, background, style.background.horizon);
  const origins = new Map<string, Point>();
  const boxes = new Map<string, Box>();
  const placing = new Set<string>();
  const place = (id: string): void => {
    if (origins.has(id)) return;
    if (placing.has(id)) {
      issues.push(`elements (${id}): attachTo forms a cycle`);
      return;
    }
    placing.add(id);
    const { el, rendered } = prepared.get(id)!;
    const s = el.scale;
    const local = flipBox(scaleBox(rendered.box, s), el.flip);
    let origin: Point;
    if (el.attachTo) {
      place(el.attachTo);
      const parentBox = boxes.get(el.attachTo);
      if (!parentBox) return;
      const o = attachOrigin(parentBox, local, el.side ?? 'top');
      origin = o;
    } else {
      origin = resolveAt(el.at!, board, ground);
    }
    if (el.offset) origin = { x: origin.x + el.offset[0]!, y: origin.y + el.offset[1]! };
    origins.set(id, origin);
    boxes.set(id, translateBox(local, origin));
    placing.delete(id);
  };
  for (const id of prepared.keys()) place(id);
  if (issues.length) throw new SceneError(issues);

  // animation
  let animCss = '';
  let finals = new Map<string, ChannelState>();
  if (scene.animation) {
    const targets = new Map<string, AnimTarget>();
    for (const [id, p] of prepared) {
      targets.set(id, {
        id,
        def: p.def,
        props: p.props,
        scale: p.el.scale,
        flip: p.el.flip ?? false,
        origin: origins.get(id)!,
        boxArt: boxes.get(id)!,
        domId: animId(id),
        partId: (name) => partId(id, name),
        parts: p.parts,
        used: p.used,
      });
    }
    try {
      const compiled = compileAnimation(scene.animation, targets, board, (to) => {
        if (typeof to === 'string' || (typeof to === 'object' && to !== null)) {
          try {
            return resolveAt(to as never, board, ground);
          } catch {
            return null;
          }
        }
        return null;
      });
      animCss = compiled.css;
      finals = compiled.finals;
    } catch (e) {
      if (e instanceof AnimationError) throw new SceneError(e.issues.map((x) => `animation: ${x}`));
      throw e;
    }
  }

  // static CSS: part origins, final states of parts implied by props, final animation values
  const staticCss: string[] = [];
  for (const [id, p] of prepared) {
    staticCss.push(`#${animId(id)}{transform-box:fill-box;transform-origin:${p.def.grounded ? '50% 100%' : '50% 50%'}}`);
    for (const part of p.parts) {
      const origin = p.rendered.partOrigins?.[part] ?? '50% 50%';
      staticCss.push(`#${partId(id, part)}{transform-box:fill-box;transform-origin:${origin}}`);
    }
    // states for the final props (after all `set` beats)
    const finalProps = { ...p.props };
    for (const b of scene.animation?.beats ?? []) if (b.target === id && b.action === 'set') Object.assign(finalProps, b.props);
    const st = p.def.states?.(finalProps as never, p) ?? {};
    for (const [part, state] of Object.entries(st)) {
      const domId = partId(id, part);
      const merged = { ...state, ...finals.get(domId) };
      finals.delete(domId);
      const decl = staticDecls(merged);
      if (decl) staticCss.push(`#${domId}{${decl}}`);
      if (merged.draw !== undefined) staticCss.push(`#${domId}{stroke-dasharray:1}`);
    }
  }
  for (const [domId, state] of finals) {
    const decl = staticDecls(state);
    if (decl) staticCss.push(`#${domId}{${decl}}`);
    if (state.draw !== undefined) staticCss.push(`#${domId}{stroke-dasharray:1}`);
  }

  // assemble
  const bg = renderBackground(background, style, board.size, ground);
  const body: string[] = [];
  let words = 0;
  const placed: PlacedElement[] = [];
  for (const [id, p] of prepared) {
    const o = origins.get(id)!;
    const s = p.el.scale;
    const sx = p.el.flip ? -s : s;
    const tf = [`translate(${round(o.x)} ${round(o.y)})`, p.el.rotate ? `rotate(${p.el.rotate})` : '', sx !== 1 || s !== 1 ? `scale(${round(sx, 3)} ${round(s, 3)})` : '']
      .filter(Boolean)
      .join(' ');
    const opacity = p.el.opacity !== undefined ? ` opacity="${p.el.opacity}"` : '';
    body.push(`<g class="el" data-el="${id}" transform="${tf}"${opacity}><g id="${animId(id)}" class="anim">${p.rendered.svg}</g></g>`);
    words += p.rendered.words ?? 0;
    placed.push({ id, component: p.el.component, box: boxes.get(id)!, key: KEY_COMPONENTS.has(p.el.component) });
  }
  const texture = style.texture === 'grain' ? `<rect width="${board.size}" height="${board.size}" fill="url(#grain-tile)" opacity="0.45" style="mix-blend-mode:multiply" aria-hidden="true"/>` : '';

  const css = styleCss(style) + staticCss.join('') + animCss;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${board.size} ${board.size}" width="${board.size}" height="${board.size}" role="img" aria-label="${escapeAttr(scene.alt)}" data-harness="${HARNESS_VERSION}" data-style="${style.id}">` +
    `<title>${escapeText(scene.alt)}</title>` +
    `<defs>${styleDefs(style)}${bg.defs}</defs>` +
    `<style>${css}</style>` +
    `<g id="background">${bg.svg}</g>` +
    body.join('') +
    texture +
    `</svg>`;

  return { svg, scene, style, words, elements: placed, duration: scene.animation?.durationSec ?? null };
}

export function animId(elementId: string): string {
  return `a-${elementId}`;
}

export function partId(elementId: string, part: string): string {
  return `p-${elementId}--${part}`;
}

function flipBox(b: Box, flip: boolean | undefined): Box {
  return flip ? { x: -(b.x + b.w), y: b.y, w: b.w, h: b.h } : b;
}

function checkRaw(el: SceneElement, maxBytes: number): string | null {
  const svg = el.svg ?? '';
  if (Buffer.byteLength(svg, 'utf8') > maxBytes) return `raw SVG is larger than ${maxBytes} bytes`;
  if (/<\s*(style|text|tspan|script|foreignObject)\b/i.test(svg)) return 'raw SVG must not contain <style>, <text>, <script>, or <foreignObject> (use a label component for text)';
  const { removed } = sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`);
  if (removed.length) return `unsafe or unsupported SVG: ${removed.join('; ')}`;
  return null;
}

/** Prefix ids inside a raw fragment so they cannot collide with (or target) harness ids. */
function namespaceIds(svg: string, elementId: string): string {
  const prefix = `raw-${elementId}-`;
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
  let out = svg;
  for (const id of ids) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out
      .replace(new RegExp(`(\\sid=")${esc}"`, 'g'), `$1${prefix}${id}"`)
      .replace(new RegExp(`url\\(#${esc}\\)`, 'g'), `url(#${prefix}${id})`)
      .replace(new RegExp(`(href=")#${esc}"`, 'g'), `$1#${prefix}${id}"`);
  }
  return out;
}

function major(v: string): number {
  return Number(v.split('.')[0]);
}
function minor(v: string): number {
  return Number(v.split('.')[1] ?? 0);
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
