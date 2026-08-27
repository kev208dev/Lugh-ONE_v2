import { clipSegmentToRect, type Point, type Rect } from './Ray';

function distanceSquared(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function normalize(v: Point): Point {
  const length = Math.hypot(v.x, v.y);
  return length > 0 ? { x: v.x / length, y: v.y / length } : { x: 0, y: 0 };
}

/** Samples one cubic Bezier as a polyline. Keeping the sampled points in the
 * ray-state message lets every popup draw the exact same curve. */
export function sampleCubicBezier(
  start: Point,
  control1: Point,
  control2: Point,
  end: Point,
  segments = 96
): Point[] {
  const count = Math.max(2, Math.floor(segments));
  const points: Point[] = [];

  for (let index = 0; index <= count; index += 1) {
    const t = index / count;
    const inverse = 1 - t;
    const inverse2 = inverse * inverse;
    const t2 = t * t;
    points.push({
      x:
        inverse2 * inverse * start.x +
        3 * inverse2 * t * control1.x +
        3 * inverse * t2 * control2.x +
        t2 * t * end.x,
      y:
        inverse2 * inverse * start.y +
        3 * inverse2 * t * control1.y +
        3 * inverse * t2 * control2.y +
        t2 * t * end.y
    });
  }

  return points;
}

/** Builds the smooth departure from a black hole. Its first tangent matches
 * the incoming ray and its final tangent matches the physics result. */
export function buildDeflectedPath(
  deflectionPoint: Point,
  incomingDirection: Point,
  outgoingDirection: Point,
  influenceDistance = 1_400,
  segments = 128
): Point[] {
  const incoming = normalize(incomingDirection);
  const outgoing = normalize(outgoingDirection);
  const distance = Math.max(1, influenceDistance);
  const handleLength = distance * 0.4;
  const end = {
    x: deflectionPoint.x + outgoing.x * distance,
    y: deflectionPoint.y + outgoing.y * distance
  };
  const control1 = {
    x: deflectionPoint.x + incoming.x * handleLength,
    y: deflectionPoint.y + incoming.y * handleLength
  };
  const control2 = {
    x: end.x - outgoing.x * handleLength,
    y: end.y - outgoing.y * handleLength
  };

  return sampleCubicBezier(deflectionPoint, control1, control2, end, segments);
}

/** Returns the first continuous part of a sampled path visible inside rect.
 * A gravitational ray crosses each device window once, so ignoring a later
 * re-entry prevents an artificial line from being drawn across the gap. */
export function clipPathToRect(points: Point[], rect: Rect): Point[] {
  const clippedPath: Point[] = [];
  let started = false;

  for (let index = 1; index < points.length; index += 1) {
    const clipped = clipSegmentToRect(points[index - 1], points[index], rect);

    if (!clipped) {
      if (started) break;
      continue;
    }

    started = true;
    const [segmentStart, segmentEnd] = clipped;
    const previous = clippedPath.at(-1);
    if (!previous || distanceSquared(previous, segmentStart) > 1e-8) {
      clippedPath.push(segmentStart);
    }
    if (distanceSquared(clippedPath.at(-1)!, segmentEnd) > 1e-8) {
      clippedPath.push(segmentEnd);
    }
  }

  return clippedPath;
}

/** Unit tangent of the sampled curve at the segment nearest target. */
export function pathDirectionNear(points: Point[], target: Point): Point | null {
  let bestDirection: Point | null = null;
  let bestDistanceSquared = Number.POSITIVE_INFINITY;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const segment = { x: end.x - start.x, y: end.y - start.y };
    const segmentLengthSquared = segment.x * segment.x + segment.y * segment.y;
    if (segmentLengthSquared === 0) continue;

    const projection = Math.max(
      0,
      Math.min(1, ((target.x - start.x) * segment.x + (target.y - start.y) * segment.y) / segmentLengthSquared)
    );
    const nearest = {
      x: start.x + segment.x * projection,
      y: start.y + segment.y * projection
    };
    const candidateDistanceSquared = distanceSquared(nearest, target);

    if (candidateDistanceSquared < bestDistanceSquared) {
      bestDistanceSquared = candidateDistanceSquared;
      bestDirection = normalize(segment);
    }
  }

  return bestDirection;
}

export interface PathPolygonIntersection {
  point: Point;
  /** Index of the segment's ending point in the sampled path. */
  segmentIndex: number;
  direction: Point;
}

function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

/** Finds the first real crossing between a sampled path and a polygon edge.
 * Unlike extending a nearby tangent as an infinite ray, this guarantees the
 * prism only receives light where the curved beam itself reaches the glass. */
export function firstPathPolygonIntersection(
  points: Point[],
  polygon: readonly Point[]
): PathPolygonIntersection | null {
  if (points.length < 2 || polygon.length < 3) return null;
  const epsilon = 1e-9;

  for (let segmentIndex = 1; segmentIndex < points.length; segmentIndex += 1) {
    const start = points[segmentIndex - 1];
    const end = points[segmentIndex];
    const pathVector = { x: end.x - start.x, y: end.y - start.y };
    if (Math.hypot(pathVector.x, pathVector.y) <= epsilon) continue;

    let firstT = Number.POSITIVE_INFINITY;
    for (let edgeIndex = 0; edgeIndex < polygon.length; edgeIndex += 1) {
      const edgeStart = polygon[edgeIndex];
      const edgeEnd = polygon[(edgeIndex + 1) % polygon.length];
      const edgeVector = { x: edgeEnd.x - edgeStart.x, y: edgeEnd.y - edgeStart.y };
      const denominator = cross(pathVector, edgeVector);
      if (Math.abs(denominator) <= epsilon) continue;

      const betweenStarts = { x: edgeStart.x - start.x, y: edgeStart.y - start.y };
      const pathT = cross(betweenStarts, edgeVector) / denominator;
      const edgeT = cross(betweenStarts, pathVector) / denominator;
      if (
        pathT >= -epsilon &&
        pathT <= 1 + epsilon &&
        edgeT >= -epsilon &&
        edgeT <= 1 + epsilon
      ) {
        firstT = Math.min(firstT, Math.max(0, Math.min(1, pathT)));
      }
    }

    if (Number.isFinite(firstT)) {
      return {
        point: {
          x: start.x + pathVector.x * firstT,
          y: start.y + pathVector.y * firstT
        },
        segmentIndex,
        direction: normalize(pathVector)
      };
    }
  }

  return null;
}
