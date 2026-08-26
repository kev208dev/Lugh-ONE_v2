export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Clips the line segment p1→p2 (given in the SAME coordinate space as rect,
 * e.g. global screen coordinates) against the rectangle `rect`.
 *
 * Returns the clipped segment's two endpoints, in the SAME coordinate space
 * as the input (i.e. NOT translated into rect-local coordinates — that's the
 * caller's job), or `null` if the segment does not intersect rect at all
 * (including the degenerate case p1 === p2 outside the rect).
 *
 * Implementation: Liang-Barsky parametric line clipping. The segment is
 * expressed as p1 + t*(p2-p1) for t in [0,1]; t is clipped against each of
 * the 4 rectangle boundaries (left, right, top, bottom) in turn, narrowing
 * an initial [tMin, tMax] = [0, 1] range. If the range becomes empty
 * (tMin > tMax) there is no intersection.
 *
 * Grazing-corner behavior: if the segment merely touches the rect at a
 * single point (e.g. a diagonal that passes exactly through one corner, or
 * a zero-length segment sitting exactly on the boundary), Liang-Barsky
 * naturally yields tMin === tMax, i.e. a zero-length "clipped segment" at
 * that single point. This function treats that as a valid intersection
 * (returns the point twice) rather than returning null — grazing counts as
 * touching. Callers that want to skip zero-length results can filter them
 * out by comparing the two returned points.
 */
/**
 * True if the segment p1->p2 passes within `radius` of `center` at any
 * point along [0,1] (not the infinite line) — used for nebula attenuation
 * zones (a level-authored circular "fog" a beam loses intensity crossing).
 * Standard closest-point-on-segment-to-a-point distance check.
 */
export function segmentIntersectsCircle(p1: Point, p2: Point, center: Point, radius: number): boolean {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;

  let t = lenSq === 0 ? 0 : ((center.x - p1.x) * dx + (center.y - p1.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const closest = { x: p1.x + t * dx, y: p1.y + t * dy };
  const distSq = (closest.x - center.x) ** 2 + (closest.y - center.y) ** 2;
  return distSq <= radius * radius;
}

export function clipSegmentToRect(p1: Point, p2: Point, rect: Rect): [Point, Point] | null {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  const xMin = rect.left;
  const xMax = rect.left + rect.width;
  const yMin = rect.top;
  const yMax = rect.top + rect.height;

  // Boundary tests: p[i]*t <= q[i], one pair per axis (left/right, top/bottom).
  const p = [-dx, dx, -dy, dy];
  const q = [p1.x - xMin, xMax - p1.x, p1.y - yMin, yMax - p1.y];

  let tMin = 0;
  let tMax = 1;

  for (let i = 0; i < 4; i++) {
    const pi = p[i];
    const qi = q[i];

    if (pi === 0) {
      // Segment is parallel to this boundary (or has zero extent on this
      // axis). If it's outside the boundary on this axis, there is no
      // intersection at all, regardless of the other axis.
      if (qi < 0) {
        return null;
      }
      // Otherwise this boundary imposes no constraint; continue.
      continue;
    }

    const t = qi / pi;
    if (pi < 0) {
      // Entering constraint (lower bound on t).
      if (t > tMin) tMin = t;
    } else {
      // Leaving constraint (upper bound on t).
      if (t < tMax) tMax = t;
    }

    if (tMin > tMax) {
      return null;
    }
  }

  if (tMin > tMax) {
    return null;
  }

  // Special-case the untouched ends so a fully-inside segment (tMin === 0,
  // tMax === 1) round-trips to the exact original points, with no risk of
  // floating-point drift from the p1 + t*(p2-p1) reconstruction.
  const clippedP1: Point = tMin === 0 ? { x: p1.x, y: p1.y } : { x: p1.x + tMin * dx, y: p1.y + tMin * dy };
  const clippedP2: Point = tMax === 1 ? { x: p2.x, y: p2.y } : { x: p1.x + tMax * dx, y: p1.y + tMax * dy };

  return [clippedP1, clippedP2];
}
