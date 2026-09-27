import type { Anchor, Background } from '../pipeline/schemas/scene.ts';

/**
 * Layout on the square artboard (DESIGN §9.2). Named anchors instead of pixel math.
 * Grid anchors are the centers of a 3×3 grid laid over the safe area.
 * "Third" anchors sit on the rule-of-thirds verticals, on the ground line.
 */

export interface Artboard {
  size: number;
  safe: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const DEFAULT_HORIZON = 0.78;

/** Y of the ground line: the background horizon when there is one. */
export function groundY(board: Artboard, bg: Pick<Background, 'type' | 'horizon'>, styleHorizon?: number): number {
  const h = bg.horizon ?? (bg.type === 'sky-ground' || bg.type === 'split' ? styleHorizon : undefined) ?? DEFAULT_HORIZON;
  return board.size * h;
}

export function anchorPoint(anchor: Anchor, board: Artboard, ground: number): Point {
  const { size, safe } = board;
  const cell = (size - 2 * safe) / 3;
  const col = (i: number) => safe + cell * (i + 0.5);
  const third = size / 3;
  switch (anchor) {
    case 'top-left':
      return { x: col(0), y: col(0) };
    case 'top-center':
      return { x: col(1), y: col(0) };
    case 'top-right':
      return { x: col(2), y: col(0) };
    case 'center-left':
      return { x: col(0), y: col(1) };
    case 'center':
      return { x: col(1), y: col(1) };
    case 'center-right':
      return { x: col(2), y: col(1) };
    case 'bottom-left':
      return { x: col(0), y: col(2) };
    case 'bottom-center':
      return { x: col(1), y: col(2) };
    case 'bottom-right':
      return { x: col(2), y: col(2) };
    case 'left-third':
      return { x: third, y: ground };
    case 'center-third':
      return { x: size / 2, y: ground };
    case 'right-third':
      return { x: 2 * third, y: ground };
    case 'ground':
      return { x: size / 2, y: ground };
    case 'sky':
      return { x: size / 2, y: size * 0.22 };
  }
}

export function resolveAt(at: Anchor | Point, board: Artboard, ground: number): Point {
  return typeof at === 'string' ? anchorPoint(at, board, ground) : { x: at.x * board.size, y: at.y * board.size };
}

export function scaleBox(b: Box, s: number): Box {
  return { x: b.x * s, y: b.y * s, w: b.w * s, h: b.h * s };
}

export function translateBox(b: Box, p: Point): Box {
  return { x: b.x + p.x, y: b.y + p.y, w: b.w, h: b.h };
}

/** Point on a box's side (in the same coordinates as the box). */
export function sidePoint(b: Box, side: 'top' | 'bottom' | 'left' | 'right' | 'center'): Point {
  switch (side) {
    case 'top':
      return { x: b.x + b.w / 2, y: b.y };
    case 'bottom':
      return { x: b.x + b.w / 2, y: b.y + b.h };
    case 'left':
      return { x: b.x, y: b.y + b.h / 2 };
    case 'right':
      return { x: b.x + b.w, y: b.y + b.h / 2 };
    case 'center':
      return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }
}

export const ATTACH_GAP = 14;

/**
 * Origin for a child attached to a parent's side, so that the child's box touches
 * the parent's box on that side (or is centered inside it for "center").
 */
export function attachOrigin(parent: Box, child: Box, side: 'top' | 'bottom' | 'left' | 'right' | 'center'): Point {
  const p = sidePoint(parent, side);
  const cx = child.x + child.w / 2;
  const cy = child.y + child.h / 2;
  switch (side) {
    case 'top':
      return { x: p.x - cx, y: p.y - ATTACH_GAP - (child.y + child.h) };
    case 'bottom':
      return { x: p.x - cx, y: p.y + ATTACH_GAP - child.y };
    case 'left':
      return { x: p.x - ATTACH_GAP - (child.x + child.w), y: p.y - cy };
    case 'right':
      return { x: p.x + ATTACH_GAP - child.x, y: p.y - cy };
    case 'center':
      return { x: p.x - cx, y: p.y - cy };
  }
}
