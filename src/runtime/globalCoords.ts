import type { WindowGeometry } from './types';
import type { Point, Rect } from '../optics/Ray';

/** This window's content area (excluding browser chrome), in global screen coordinates. */
export function windowRectGlobal(g: WindowGeometry): Rect {
  return {
    left: g.screenX + g.chromeInsetLeft,
    top: g.screenY + g.chromeInsetTop,
    width: g.innerWidth,
    height: g.innerHeight
  };
}

/** Center point of this window's content area, in global screen coordinates. */
export function centerGlobal(g: WindowGeometry): Point {
  const rect = windowRectGlobal(g);
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

/** Converts a global screen point into this window's own canvas-local coordinate
 * space, where (0,0) is the top-left of its content area. */
export function globalToLocal(p: Point, g: WindowGeometry): Point {
  return {
    x: p.x - (g.screenX + g.chromeInsetLeft),
    y: p.y - (g.screenY + g.chromeInsetTop)
  };
}

/** Inverse of globalToLocal: converts a point in this window's own
 * canvas-local coordinate space into global screen coordinates. Direction
 * VECTORS (as opposed to points) don't need this conversion at all — a pure
 * translation between coordinate spaces leaves vector direction unchanged. */
export function localToGlobal(p: Point, g: WindowGeometry): Point {
  return {
    x: p.x + g.screenX + g.chromeInsetLeft,
    y: p.y + g.screenY + g.chromeInsetTop
  };
}
