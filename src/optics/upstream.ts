import type { Point } from './Ray';
import type { WindowGeometry } from '../runtime/types';
import { centerGlobal } from '../runtime/globalCoords';

function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function normalize(a: Point): Point {
  const len = Math.hypot(a.x, a.y);
  return len === 0 ? { x: 0, y: 0 } : { x: a.x / len, y: a.y / len };
}

/**
 * The straight incoming ray from SUN's center toward `selfGeometry`'s
 * center — the same "no instrument in between" line MIRROR has always drawn
 * for its own sun-facing incoming render, generalized so BLACKHOLE/PRISM can
 * use it too whenever a level's active chain (see level/types.ts's
 * resolveUpstream) skips straight from SUN to them with nothing in between.
 */
export function straightRayFromSun(
  sunGeometry: WindowGeometry,
  selfGeometry: WindowGeometry
): { originGlobal: Point; directionGlobal: Point } {
  const originGlobal = centerGlobal(sunGeometry);
  const directionGlobal = normalize(sub(centerGlobal(selfGeometry), originGlobal));
  return { originGlobal, directionGlobal };
}

/** A star emits parallel light; a black hole should bend that free ray based
 * on how close its movable window is to the beam. A center-targeted ray
 * would always pass through the event horizon and make deflection
 * impossible, which is why BLACKHOLE uses this variant. */
export function parallelRayFromSun(
  sunGeometry: WindowGeometry,
  downstreamGeometry: WindowGeometry
): { originGlobal: Point; directionGlobal: Point } {
  const originGlobal = centerGlobal(sunGeometry);
  const downstream = centerGlobal(downstreamGeometry);
  return {
    originGlobal,
    directionGlobal: { x: downstream.x >= originGlobal.x ? 1 : -1, y: 0 }
  };
}
