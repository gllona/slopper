import type { Animation, Beat } from '../pipeline/schemas/scene.ts';
import type { Box, Point } from './layout.ts';
import type { ChannelState, ComponentDef, PartTrack } from './components/types.ts';
import { round } from './style.ts';

/**
 * Story beats → CSS keyframes inside the SVG (DESIGN §9.6).
 *
 * Model: every animated DOM node (an element's `.anim` group, or a component part) has
 * independent channels — translate, rotate, scale, opacity, draw — each compiled to its own
 * @keyframes over the whole timeline (0 → durationSec). Easing is sampled in JS, so all
 * keyframes are linear and deterministic. The *static* CSS of every node is its final value:
 * with animations disabled (reduced motion, or the still render) the SVG shows the last frame.
 */

export type Channel = keyof ChannelState;
type Value = number | [number, number];

export interface AnimTarget {
  id: string;
  def: ComponentDef<any>;
  /** Initial props (validated). */
  props: Record<string, unknown>;
  scale: number;
  flip: boolean;
  /** Placement origin and box in artboard coordinates. */
  origin: Point;
  boxArt: Box;
  domId: string;
  partId(name: string): string;
  /** Names of parts the component actually rendered. */
  parts: Set<string>;
  used(prop: string): Set<unknown>;
}

export const GENERIC_ACTIONS: Record<string, { doc: string; dur: number }> = {
  'walk-in': { doc: 'enters from a side (from: left|right) with a walking bob', dur: 1.6 },
  'slide-in': { doc: 'slides in from a side (from: left|right|top|bottom)', dur: 1.0 },
  'walk-out': { doc: 'walks out to a side (from: left|right = exit side)', dur: 1.6 },
  'slide-out': { doc: 'slides out to a side (from: left|right|top|bottom = exit side)', dur: 1.0 },
  'fade-in': { doc: 'fades in', dur: 0.8 },
  'fade-out': { doc: 'fades out', dur: 0.8 },
  appear: { doc: 'appears instantly', dur: 0.05 },
  disappear: { doc: 'disappears instantly', dur: 0.05 },
  pop: { doc: 'pops in with a small overshoot (great for bubbles and labels)', dur: 0.5 },
  grow: { doc: 'grows from nothing (from its base if grounded)', dur: 1.0 },
  shrink: { doc: 'shrinks to nothing', dur: 0.8 },
  bounce: { doc: 'jumps up and down twice, then rests', dur: 0.9 },
  jump: { doc: 'one big jump', dur: 0.7 },
  shake: { doc: 'shakes (nervous, broken, or angry)', dur: 0.8 },
  faint: { doc: 'falls over sideways and stays down', dur: 0.9 },
  tilt: { doc: 'tilts to props.angle degrees (default -12) and stays', dur: 0.6 },
  spin: { doc: 'turns around once', dur: 1.2 },
  float: { doc: 'floats up and down gently, then rests', dur: 2.0 },
  move: { doc: 'moves to props.to (an anchor name or {x,y} 0..1)', dur: 1.2 },
  set: { doc: 'changes settable props over dur (e.g. meter level, mood)', dur: 0.8 },
};

export const AMBIENT = {
  blink: { period: 1.6, keyframes: '0%,100%{opacity:1}50%{opacity:.35}' },
  pulse: { period: 1.8, keyframes: '0%,100%{scale:1 1}50%{scale:1.06 1.06}' },
  sway: { period: 2.4, keyframes: '0%,100%{rotate:0deg}25%{rotate:3deg}75%{rotate:-3deg}' },
} as const;

/** Parts that ambient motion prefers over the whole element, by component. */
const AMBIENT_PART_PREFERENCE = ['lights', 'antenna', 'rays', 'steam'];

const EASES: Record<string, (t: number) => number> = {
  linear: (t) => t,
  ease: (t) => cubic(0.25, 0.1, 0.25, 1, t),
  'ease-in': (t) => cubic(0.42, 0, 1, 1, t),
  'ease-out': (t) => cubic(0, 0, 0.58, 1, t),
  'ease-in-out': (t) => cubic(0.42, 0, 0.58, 1, t),
  back: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  bounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

/** CSS cubic-bezier(x1,y1,x2,y2) evaluated at x = t (Newton + bisection). */
function cubic(x1: number, y1: number, x2: number, y2: number, t: number): number {
  const bez = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  let lo = 0;
  let hi = 1;
  let s = t;
  for (let i = 0; i < 30; i++) {
    const x = bez(x1, x2, s);
    if (Math.abs(x - t) < 1e-5) break;
    if (x < t) lo = s;
    else hi = s;
    s = (lo + hi) / 2;
  }
  return bez(y1, y2, s);
}

interface Segment {
  t0: number;
  t1: number;
  from: Value;
  to: Value;
  ease: (t: number) => number;
  /** 0 = one way; n = from→to→from n times (ends at from). */
  osc: number;
  /** Extra vertical bob for walking (translate only). */
  bob?: number;
  /** Symmetric wiggle around `from` with this amplitude, `osc` times (ends at `from`). */
  wiggle?: number;
  beat: string;
}

export const IDENTITY: Required<Omit<ChannelState, 'draw'>> & { draw: number } = {
  opacity: 1,
  translate: [0, 0],
  rotate: 0,
  scale: [1, 1],
  draw: 1,
};

export class AnimationError extends Error {
  constructor(public issues: string[]) {
    super(issues.join('\n'));
  }
}

export interface CompiledAnimation {
  css: string;
  duration: number;
  /** Final (static) state per DOM id, merged into the static CSS by the compiler. */
  finals: Map<string, ChannelState>;
}

/** Compile the scene animation. `resolveMove` turns a `move` target into an artboard point. */
export function compileAnimation(
  anim: Animation,
  targets: Map<string, AnimTarget>,
  board: { size: number },
  resolveMove: (to: unknown) => Point | null,
): CompiledAnimation {
  const issues: string[] = [];
  const T = anim.durationSec;
  const tracks = new Map<string, Segment[]>(); // key: domId|channel
  const current = new Map<string, Value>(); // running value per key while walking beats in time order
  const initial = new Map<string, Value>(); // value at t=0 per key (for keys whose first segment defines it)
  const partStatesInit = new Map<string, ChannelState>();
  const propsNow = new Map<string, Record<string, unknown>>();

  for (const t of targets.values()) {
    propsNow.set(t.id, { ...t.props });
    const st = t.def.states?.(t.props as never, t) ?? {};
    for (const [part, state] of Object.entries(st)) partStatesInit.set(t.partId(part), state);
  }

  const get = (domId: string, ch: Channel): Value => {
    const key = `${domId}|${ch}`;
    if (current.has(key)) return current.get(key)!;
    const init = partStatesInit.get(domId)?.[ch];
    return (init as Value | undefined) ?? (IDENTITY[ch] as Value);
  };

  const push = (domId: string, ch: Channel, seg: Omit<Segment, 'beat'>, beat: string) => {
    const key = `${domId}|${ch}`;
    const list = tracks.get(key) ?? [];
    const last = list.at(-1);
    if (last && seg.t0 < last.t1 - 1e-6) {
      issues.push(`${beat}: overlaps "${last.beat}" on the same target and channel (${ch}). Start it at t ≥ ${round(last.t1, 2)}.`);
      return;
    }
    if (seg.t1 > T + 1e-6) issues.push(`${beat}: ends at ${round(seg.t1, 2)}s, after durationSec ${T}s.`);
    if (!list.length) initial.set(key, seg.from);
    list.push({ ...seg, beat });
    tracks.set(key, list);
    current.set(key, seg.osc ? seg.from : seg.to);
  };

  const beats = [...anim.beats].map((b, i) => ({ b, i })).sort((a, z) => a.b.t - z.b.t || a.i - z.i);
  for (const { b, i } of beats) {
    const target = targets.get(b.target)!;
    const label = `beat ${i} (${b.action} on "${b.target}" at ${b.t}s)`;
    const compAction = target.def.actions?.[b.action];
    const generic = GENERIC_ACTIONS[b.action];
    if (!compAction && !generic) {
      const own = Object.keys(target.def.actions ?? {});
      issues.push(`${label}: unknown action. Generic: ${Object.keys(GENERIC_ACTIONS).join(', ')}${own.length ? `; ${target.def.name}: ${own.join(', ')}` : ''}.`);
      continue;
    }
    const dur = b.dur ?? compAction?.dur ?? generic!.dur;
    const t0 = b.t;
    const t1 = b.t + dur;
    const ease = EASES[b.ease ?? ''] ?? EASES['ease-in-out']!;
    const el = target.domId;

    if (compAction) {
      for (const tr of compAction.tracks(propsNow.get(target.id) as never)) {
        pushPartTrack(target.partId(tr.part), tr, compAction.oscillate ?? 0);
      }
      continue;
    }

    // Distances are in artboard px; the .anim group lives inside the scaled placement group.
    const k = 1 / target.scale;
    const fx = target.flip ? -1 : 1;
    const off = (side: string | undefined, dirDefault: string): [number, number] => {
      const s = side ?? dirDefault;
      const b = target.boxArt;
      const dist = {
        left: -(b.x + b.w) - 40,
        right: board.size - b.x + 40,
        top: -(b.y + b.h) - 40,
        bottom: board.size - b.y + 40,
      }[s as 'left' | 'right' | 'top' | 'bottom'];
      const horizontal = s === 'left' || s === 'right';
      return horizontal ? [dist * k * fx, 0] : [0, dist * k];
    };
    const tr0 = get(el, 'translate') as [number, number];
    const add = (a: [number, number], d: [number, number]): [number, number] => [a[0] + d[0], a[1] + d[1]];

    switch (b.action) {
      case 'walk-in':
        push(el, 'translate', { t0, t1, from: add(tr0, off(b.from, 'left')), to: tr0, ease: EASES['ease-out']!, osc: 0, bob: 14 * k }, label);
        break;
      case 'slide-in':
        push(el, 'translate', { t0, t1, from: add(tr0, off(b.from, 'left')), to: tr0, ease, osc: 0 }, label);
        break;
      case 'walk-out':
        push(el, 'translate', { t0, t1, from: tr0, to: add(tr0, off(b.from, 'right')), ease: EASES['ease-in']!, osc: 0, bob: 14 * k }, label);
        break;
      case 'slide-out':
        push(el, 'translate', { t0, t1, from: tr0, to: add(tr0, off(b.from, 'right')), ease, osc: 0 }, label);
        break;
      case 'fade-in':
        push(el, 'opacity', { t0, t1, from: 0, to: 1, ease, osc: 0 }, label);
        break;
      case 'fade-out':
        push(el, 'opacity', { t0, t1, from: get(el, 'opacity'), to: 0, ease, osc: 0 }, label);
        break;
      case 'appear':
        push(el, 'opacity', { t0, t1, from: 0, to: 1, ease: EASES.linear!, osc: 0 }, label);
        break;
      case 'disappear':
        push(el, 'opacity', { t0, t1, from: get(el, 'opacity'), to: 0, ease: EASES.linear!, osc: 0 }, label);
        break;
      case 'pop':
        push(el, 'scale', { t0, t1, from: [0, 0], to: get(el, 'scale'), ease: EASES.back!, osc: 0 }, label);
        break;
      case 'grow':
        push(el, 'scale', { t0, t1, from: [0.001, 0.001], to: get(el, 'scale'), ease: EASES['ease-out']!, osc: 0 }, label);
        break;
      case 'shrink':
        push(el, 'scale', { t0, t1, from: get(el, 'scale'), to: [0.001, 0.001], ease: EASES['ease-in']!, osc: 0 }, label);
        break;
      case 'bounce':
        push(el, 'translate', { t0, t1, from: tr0, to: add(tr0, [0, -50 * k]), ease: EASES['ease-out']!, osc: 2 }, label);
        break;
      case 'jump':
        push(el, 'translate', { t0, t1, from: tr0, to: add(tr0, [0, -120 * k]), ease: EASES['ease-out']!, osc: 1 }, label);
        break;
      case 'shake': {
        const r = get(el, 'rotate') as number;
        push(el, 'rotate', { t0, t1, from: r, to: r, ease: EASES.linear!, osc: 0, wiggle: 6 * fx }, label);
        break;
      }
      case 'faint': {
        const r = get(el, 'rotate') as number;
        const dir = b.from === 'left' ? -1 : 1;
        push(el, 'rotate', { t0, t1, from: r, to: r + 84 * dir * fx, ease: EASES.bounce!, osc: 0 }, label);
        break;
      }
      case 'tilt': {
        const angle = typeof b.props?.angle === 'number' ? b.props.angle : -12;
        push(el, 'rotate', { t0, t1, from: get(el, 'rotate'), to: Math.max(-90, Math.min(90, angle)) * fx, ease, osc: 0 }, label);
        break;
      }
      case 'spin': {
        const r = get(el, 'rotate') as number;
        push(el, 'rotate', { t0, t1, from: r, to: r + 360, ease, osc: 0 }, label);
        break;
      }
      case 'float':
        push(el, 'translate', { t0, t1, from: tr0, to: add(tr0, [0, -36 * k]), ease: EASES['ease-in-out']!, osc: 2 }, label);
        break;
      case 'move': {
        const p = resolveMove(b.props?.to);
        if (!p) {
          issues.push(`${label}: props.to must be an anchor name or {x,y} in 0..1.`);
          break;
        }
        const d: [number, number] = [((p.x - target.origin.x) * k) * fx, (p.y - target.origin.y) * k];
        push(el, 'translate', { t0, t1, from: tr0, to: d, ease, osc: 0 }, label);
        break;
      }
      case 'set': {
        const settable = new Set(target.def.settable ?? []);
        const bad = Object.keys(b.props ?? {}).filter((key) => !settable.has(key));
        if (!b.props || bad.length) {
          issues.push(`${label}: "set" needs props among [${[...settable].join(', ') || 'none'}]${bad.length ? `; not settable: ${bad.join(', ')}` : ''}.`);
          break;
        }
        const before = propsNow.get(target.id)!;
        const parsed = target.def.props.safeParse({ ...before, ...b.props });
        if (!parsed.success) {
          issues.push(`${label}: invalid props: ${parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}`);
          break;
        }
        const after = parsed.data as Record<string, unknown>;
        const sBefore = target.def.states?.(before as never, target) ?? {};
        const sAfter = target.def.states?.(after as never, target) ?? {};
        for (const part of new Set([...Object.keys(sBefore), ...Object.keys(sAfter)])) {
          const pid = target.partId(part);
          for (const ch of Object.keys({ ...sBefore[part], ...sAfter[part] }) as Channel[]) {
            const from = (sBefore[part]?.[ch] ?? get(pid, ch)) as Value;
            const to = (sAfter[part]?.[ch] ?? from) as Value;
            if (JSON.stringify(from) !== JSON.stringify(to)) push(pid, ch, { t0, t1, from: get(pid, ch), to, ease, osc: 0 }, label);
          }
        }
        propsNow.set(target.id, after);
        break;
      }
    }

    function pushPartTrack(pid: string, tr: PartTrack, osc: number) {
      for (const ch of Object.keys(tr.to) as Channel[]) {
        const from = (tr.from[ch] ?? get(pid, ch)) as Value;
        push(pid, ch, { t0, t1, from, to: tr.to[ch] as Value, ease: osc ? EASES['ease-in-out']! : ease, osc }, label);
      }
    }
  }

  if (issues.length) throw new AnimationError(issues);

  // ---------- emit CSS ----------
  const css: string[] = [];
  const animations = new Map<string, string[]>();
  const finals = new Map<string, ChannelState>();
  for (const [key, segs] of tracks) {
    const [domId, ch] = key.split('|') as [string, Channel];
    const name = `k-${domId}-${ch}`;
    const frames = keyframes(segs, T, initial.get(key)!, ch);
    css.push(`@keyframes ${name}{${frames}}`);
    const list = animations.get(domId) ?? [];
    list.push(`${name} ${round(T, 3)}s linear forwards`);
    animations.set(domId, list);
    const f = finals.get(domId) ?? {};
    (f as Record<string, Value>)[ch] = current.get(key)!;
    finals.set(domId, f);
  }

  if (anim.ambient) {
    const t = targets.get(anim.ambient.target)!;
    const preferred = AMBIENT_PART_PREFERENCE.find((p) => t.parts.has(p));
    const domId = preferred ? t.partId(preferred) : t.domId;
    const a = AMBIENT[anim.ambient.action];
    css.push(`@keyframes amb-${anim.ambient.action}{${a.keyframes}}`);
    const list = animations.get(domId) ?? [];
    list.push(`amb-${anim.ambient.action} ${a.period}s ease-in-out infinite`);
    animations.set(domId, list);
  }

  for (const [domId, list] of animations) css.push(`#${domId}{animation:${list.join(',')}}`);
  css.push('@media (prefers-reduced-motion:reduce){*{animation:none!important}}');
  return { css: css.join(''), duration: T, finals };
}

function keyframes(segs: Segment[], T: number, init: Value, ch: Channel): string {
  const frames: [number, Value][] = [[0, init]];
  const STEP = 1 / 20; // sampling step in seconds for eased/oscillating segments
  for (const [i, s] of segs.entries()) {
    const prevEnd = i === 0 ? init : valueAt(segs[i - 1]!, 1);
    // hold the previous value until this segment starts (avoid interpolating across the gap)
    if (s.t0 > 0) frames.push([Math.max(0, s.t0 - 0.0005), prevEnd]);
    const span = s.t1 - s.t0;
    const n = span <= 0.06 ? 1 : Math.max(2, Math.ceil(span / (s.wiggle ? STEP / 2 : STEP)));
    for (let j = 0; j <= n; j++) {
      const u = j / n;
      frames.push([s.t0 + u * span, valueAt(s, u)]);
    }
  }
  const last = frames.at(-1)!;
  if (last[0] < T) frames.push([T, last[1]]);
  // dedupe identical consecutive values (keep endpoints of holds)
  const out: string[] = [];
  let prev = '';
  for (let i = 0; i < frames.length; i++) {
    const [t, v] = frames[i]!;
    const val = cssValue(ch, v);
    const next = frames[i + 1] ? cssValue(ch, frames[i + 1]![1]) : null;
    if (val === prev && val === next) continue;
    out.push(`${round((t / T) * 100, 3)}%{${val}}`);
    prev = val;
  }
  return out.join('');
}

function valueAt(s: Segment, u: number): Value {
  if (s.wiggle !== undefined && typeof s.from === 'number') {
    const decay = 1 - u * 0.5;
    return s.from + s.wiggle * decay * Math.sin(u * 3 * 2 * Math.PI);
  }
  let e: number;
  if (s.osc) {
    // from → to → from, `osc` times; eased halves
    const phase = u * s.osc * 2;
    const k = Math.floor(Math.min(phase, s.osc * 2 - 1e-9));
    const local = phase - k;
    e = k % 2 === 0 ? s.ease(local) : 1 - s.ease(local);
    if (u >= 1) e = 0;
  } else {
    e = s.ease(u);
  }
  const v = lerp(s.from, s.to, e);
  if (s.bob && Array.isArray(v)) {
    const steps = Math.max(2, Math.round((s.t1 - s.t0) * 3.5));
    return [v[0], v[1] - Math.abs(Math.sin(u * steps * Math.PI)) * s.bob * (u < 1 ? 1 : 0)];
  }
  return v;
}

function lerp(a: Value, b: Value, t: number): Value {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
  const [a0, a1] = a as [number, number];
  const [b0, b1] = b as [number, number];
  return [a0 + (b0 - a0) * t, a1 + (b1 - a1) * t];
}

export function cssValue(ch: Channel, v: Value): string {
  const r = (x: number) => round(x, 2);
  switch (ch) {
    case 'opacity':
      return `opacity:${r(v as number)}`;
    case 'rotate':
      return `rotate:${r(v as number)}deg`;
    case 'translate': {
      const [x, y] = v as [number, number];
      return `translate:${r(x)}px ${r(y)}px`;
    }
    case 'scale': {
      const [x, y] = v as [number, number];
      return `scale:${r(x)} ${r(y)}`;
    }
    case 'draw':
      return `stroke-dashoffset:${r(1 - (v as number))}`;
  }
}

/** Static CSS declarations for a final state (identity values are omitted). */
export function staticDecls(state: ChannelState): string {
  const out: string[] = [];
  for (const [ch, v] of Object.entries(state) as [Channel, Value][]) {
    if (v === undefined) continue;
    if (JSON.stringify(v) === JSON.stringify(IDENTITY[ch]) && ch !== 'draw') continue;
    out.push(cssValue(ch, v));
  }
  return out.join(';');
}

export type { Beat };
