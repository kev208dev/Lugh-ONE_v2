import type { Point } from './Ray';

export interface MirrorSurface {
  /** the two endpoints of the mirror's reflective line segment, in the
   * SAME local coordinate space as the incoming ray (a device window's own
   * canvas-local pixel space, matching how PrismPhysics's triangle vertices
   * work). */
  a: Point;
  b: Point;
}

export interface ReflectionResult {
  /** true if the incoming ray actually crosses the mirror's finite surface
   * segment (not just the infinite line through it) — a ray that misses the
   * mirror entirely passes straight through unaffected. */
  hit: boolean;
  /** the point where the ray struck the mirror, or null if hit is false. */
  point: Point | null;
  /** always populated: the original incoming direction (normalized). */
  incomingDirection: Point;
  /** the reflected direction if hit is true, else null. */
  reflectedDirection: Point | null;
  /** the mirror surface's unit normal at the hit point, or null if hit is false. */
  normal: Point | null;
}

// --- local 2D vector helpers -------------------------------------------------

function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale(a: Point, s: number): Point {
  return { x: a.x * s, y: a.y * s };
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

function length(a: Point): number {
  return Math.sqrt(a.x * a.x + a.y * a.y);
}

function normalize(a: Point): Point {
  const len = length(a);
  if (len === 0) return { x: 0, y: 0 };
  return { x: a.x / len, y: a.y / len };
}

// --- geometry helpers ---------------------------------------------------------

interface RaySegmentHit {
  t: number;
  point: Point;
}

/**
 * Intersects the ray P = O + t*D (t >= epsilon) with the segment
 * Q = A + s*(B-A), s in [0,1] (with small tolerance). Returns null if there
 * is no valid intersection (parallel, or outside the valid t/s ranges).
 */
function intersectRaySegment(
  origin: Point,
  dir: Point,
  a: Point,
  b: Point,
  epsilon: number
): RaySegmentHit | null {
  const e = sub(a, origin);
  const ab = sub(b, a);
  const denom = cross(dir, ab);
  if (Math.abs(denom) < 1e-12) return null;

  const t = cross(e, ab) / denom;
  const s = cross(e, dir) / denom;

  if (t < epsilon || s < -1e-9 || s > 1 + 1e-9) return null;

  return { t, point: add(origin, scale(dir, t)) };
}

/**
 * Unit normal of the mirror surface (perpendicular to the a->b line). Either
 * of the two perpendicular directions is a valid "the" normal for a flat
 * two-sided mirror (reflection math is symmetric regardless of which way it
 * points — see reflectRay's doc comment), so just pick one consistently:
 * a 90° rotation of the a->b edge vector.
 */
export function computeMirrorNormal(surface: MirrorSurface): Point {
  const edge = sub(surface.b, surface.a);
  return normalize({ x: -edge.y, y: edge.x });
}

/**
 * Traces the incoming ray (origin + direction, direction need not be
 * pre-normalized) against the mirror's finite surface segment. If the ray
 * doesn't cross the segment at all (t <= 0, or crosses the infinite line
 * but outside the a..b span, or is parallel to the mirror), returns
 * `{ hit: false, point: null, reflectedDirection: null, normal: null,
 * incomingDirection: <normalized input> }` — the ray is understood to pass
 * straight through unaffected in that case (the CALLER decides what to do
 * with a miss, e.g. continue the original direction unchanged — this
 * function only reports geometry, it doesn't decide pass-through behavior).
 */
export function reflectRay(origin: Point, direction: Point, surface: MirrorSurface): ReflectionResult {
  const d0 = normalize(direction);
  const hitResult = intersectRaySegment(origin, d0, surface.a, surface.b, 1e-6);

  if (!hitResult) {
    return { hit: false, point: null, incomingDirection: d0, reflectedDirection: null, normal: null };
  }

  const n = computeMirrorNormal(surface);
  // Standard vector reflection formula: r = d - 2*(d·n)*n. This is
  // symmetric under n -> -n (both give the identical reflected vector), so
  // it doesn't matter which of the two perpendicular directions
  // computeMirrorNormal happened to pick — no sign ambiguity to worry about
  // here, unlike refraction.
  const dDotN = dot(d0, n);
  const reflected = sub(d0, scale(n, 2 * dDotN));

  return {
    hit: true,
    point: hitResult.point,
    incomingDirection: d0,
    reflectedDirection: reflected,
    normal: n
  };
}
