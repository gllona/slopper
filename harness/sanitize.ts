import { optimize, type CustomPlugin } from 'svgo';

/**
 * Allowlist SVG sanitizer (DESIGN §9.7). Everything not explicitly allowed is removed, and every
 * removal is reported, so lint can fail on unexpected removals. Then a conservative SVGO pass.
 *
 * Threat model: the scene (and any raw SVG in it) is written by an AI that read untrusted internet
 * text. The output must not be able to run script, load anything external, or escape the image.
 */

const ELEMENTS = new Set([
  'svg', 'g', 'defs', 'title', 'desc', 'style',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan',
  'linearGradient', 'radialGradient', 'stop', 'pattern', 'clipPath', 'mask', 'symbol', 'use', 'marker',
  'filter', 'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feDisplacementMap',
  'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feMerge',
  'feMergeNode', 'feMorphology', 'feOffset', 'feTurbulence',
]);

const ATTRIBUTES = new Set([
  'id', 'class', 'style', 'transform', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
  'fx', 'fy', 'fr', 'width', 'height', 'points', 'pathLength', 'viewBox', 'preserveAspectRatio',
  'xmlns', 'xmlns:xlink', 'version', 'role', 'aria-label', 'aria-hidden', 'focusable',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity',
  'clip-path', 'clip-rule', 'mask', 'filter', 'vector-effect', 'paint-order', 'visibility', 'display',
  'color', 'mix-blend-mode', 'isolation',
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline',
  'letter-spacing', 'word-spacing', 'dx', 'dy',
  'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'spreadMethod',
  'patternUnits', 'patternContentUnits', 'patternTransform', 'clipPathUnits', 'maskUnits',
  'maskContentUnits', 'filterUnits', 'primitiveUnits', 'markerWidth', 'markerHeight', 'refX', 'refY',
  'orient', 'markerUnits', 'marker-start', 'marker-mid', 'marker-end',
  'in', 'in2', 'result', 'stdDeviation', 'baseFrequency', 'numOctaves', 'seed', 'stitchTiles', 'type',
  'values', 'mode', 'operator', 'k1', 'k2', 'k3', 'k4', 'flood-color', 'flood-opacity', 'tableValues',
  'slope', 'intercept', 'amplitude', 'exponent', 'scale', 'xChannelSelector', 'yChannelSelector',
  'radius', 'href', 'xlink:href',
]);

/** data-* attributes the harness itself emits. */
const DATA_ATTRIBUTES = new Set(['data-el', 'data-part', 'data-harness', 'data-style']);

/** Attributes whose value may reference something: only same-document `url(#id)` is allowed. */
const URL_VALUE = /url\s*\(/i;
const LOCAL_URL = /^\s*url\(\s*(['"]?)#[A-Za-z][\w.-]*\1\s*\)\s*$/;

export interface SanitizeResult {
  svg: string;
  removed: string[];
}

/** Check a CSS text (a <style> body or a style attribute). Returns the reason it is unsafe, or null. */
export function unsafeCss(css: string): string | null {
  if (css.includes('\\')) return 'backslash escape in CSS';
  if (/<\/?[a-z!]/i.test(css)) return 'markup in CSS';
  if (/@(?!keyframes\b|media\b|-webkit-keyframes\b)[a-z-]+/i.test(css)) return 'disallowed at-rule';
  if (/expression\s*\(|javascript:|behavior\s*:|-moz-binding|image-set\s*\(|image\s*\(|src\s*\(/i.test(css))
    return 'script-like or resource-loading CSS';
  const urls = css.match(/url\s*\([^)]*\)/gi) ?? [];
  if (urls.some((u) => !LOCAL_URL.test(u))) return 'non-local url() in CSS';
  if (URL_VALUE.test(css.replace(/url\s*\([^)]*\)/gi, ''))) return 'malformed url() in CSS';
  const media = css.match(/@media[^{]*/gi) ?? [];
  if (media.some((m) => !/^@media\s*\(\s*prefers-reduced-motion\s*:\s*(reduce|no-preference)\s*\)\s*$/i.test(m.trim())))
    return 'only @media (prefers-reduced-motion) is allowed';
  return null;
}

type XastNode = {
  type: string;
  name?: string;
  value?: string;
  attributes?: Record<string, string>;
  children?: XastNode[];
};

function sanitizerPlugin(removed: string[]): CustomPlugin {
  return {
    name: 'slopperSanitize',
    fn: () => ({
      doctype: {
        enter: (node, parent) => {
          removed.push('doctype');
          detach(node as XastNode, parent as XastNode);
        },
      },
      instruction: {
        enter: (node, parent) => {
          if ((node as XastNode).name !== 'xml') removed.push(`processing instruction <?${(node as XastNode).name}?>`);
          detach(node as XastNode, parent as XastNode);
        },
      },
      comment: {
        enter: (node, parent) => detach(node as XastNode, parent as XastNode),
      },
      element: {
        enter: (node, parent) => {
          const el = node as XastNode;
          const name = el.name!;
          if (!ELEMENTS.has(name)) {
            removed.push(`element <${name}>`);
            detach(el, parent as XastNode);
            return;
          }
          if (name === 'style') {
            const css = (el.children ?? []).map((c) => c.value ?? '').join('');
            const why = unsafeCss(css) ?? ((el.children ?? []).some((c) => c.type !== 'text' && c.type !== 'cdata') ? 'non-text content' : null);
            if (why) {
              removed.push(`<style>: ${why}`);
              detach(el, parent as XastNode);
              return;
            }
          }
          const attrs = el.attributes ?? {};
          for (const [key, value] of Object.entries(attrs)) {
            const allowed = ATTRIBUTES.has(key) || DATA_ATTRIBUTES.has(key);
            let why: string | null = allowed ? null : 'not allowed';
            if (!why && (key === 'href' || key === 'xlink:href') && !/^#[A-Za-z][\w.-]*$/.test(value.trim())) why = 'non-local reference';
            if (!why && key === 'style') why = unsafeCss(value);
            if (!why && URL_VALUE.test(value) && key !== 'style' && !LOCAL_URL.test(value)) why = 'non-local url()';
            if (!why && /javascript:|data:/i.test(value) && key !== 'd') why = 'script or data URL';
            if (why) {
              removed.push(`attribute ${key} on <${name}> (${why})`);
              delete attrs[key];
            }
          }
        },
      },
    }),
  };
}

function detach(node: XastNode, parent: XastNode): void {
  parent.children = (parent.children ?? []).filter((c) => c !== node);
}

/** Sanitize a full SVG document. Throws if the input cannot be parsed. */
export function sanitizeSvg(svg: string): SanitizeResult {
  const removed: string[] = [];
  const clean = optimize(svg, {
    multipass: false,
    plugins: [sanitizerPlugin(removed)],
    js2svg: { pretty: false },
  }).data;
  if (!/^<svg[\s>]/.test(clean.trim())) throw new Error('Sanitized document has no <svg> root');
  return { svg: clean, removed };
}

/**
 * Conservative optimization: numbers and paths only. Structure, ids, classes, and CSS are kept,
 * because animation targets ids and the style relies on classes.
 */
export function optimizeSvg(svg: string): string {
  return optimize(svg, {
    multipass: false,
    floatPrecision: 1,
    js2svg: { pretty: false },
    // convertPathData is deliberately not used: it corrupted multi-subpath glyph outlines in tests,
    // and the harness already emits paths rounded to 0.1 px.
    plugins: ['removeComments', 'removeMetadata', 'cleanupNumericValues', 'removeEmptyContainers'],
  }).data;
}

/** Sanitize, then optimize, then sanitize again (optimization must never reintroduce anything). */
export function sanitizeAndOptimize(svg: string): SanitizeResult {
  const first = sanitizeSvg(svg);
  const optimized = optimizeSvg(first.svg);
  const second = sanitizeSvg(optimized);
  return { svg: second.svg, removed: [...first.removed, ...second.removed] };
}
