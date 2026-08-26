import type { Point } from './Ray';
import { sampleWavelengths, refractiveIndex } from './Spectrum';

export interface SpectralRay {
  wavelengthNm: number;
  intensity: number; // uniform 1 for every wavelength in Phase 3 - intensity shaping is a later-phase concern
  entryPoint: Point;
  internalDirection: Point; // unit vector, direction of travel inside the glass
  exitPoint: Point;
  exitDirection: Point; // unit vector, direction of travel after leaving the glass
}

export interface PrismTriangle {
  vertices: [Point, Point, Point];
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
 * Outward unit normal of the edge A->B, given the triangle's centroid, such
 * that the normal points away from the triangle's interior.
 */
function outwardNormal(a: Point, b: Point, centroid: Point): Point {
  const edge = sub(b, a);
  let raw = normalize({ x: -edge.y, y: edge.x });
  const mid = scale(add(a, b), 0.5);
  if (dot(raw, sub(mid, centroid)) < 0) {
    raw = scale(raw, -1);
  }
  return raw;
}

/**
 * Vector form of Snell's law. `d` is the unit incident direction, `n` is the
 * unit normal chosen so that dot(n, d) < 0 (points back toward the medium
 * the ray is coming from), and etaRatio = n_from / n_to. Returns the unit
 * refracted direction, or null on total internal reflection.
 */
function refract(d: Point, n: Point, etaRatio: number): Point | null {
  const c = -dot(n, d);
  const sin2t = etaRatio * etaRatio * (1 - c * c);
  if (sin2t > 1) return null; // total internal reflection
  const cosT = Math.sqrt(1 - sin2t);
  return add(scale(d, etaRatio), scale(n, etaRatio * c - cosT));
}

interface Edge {
  a: Point;
  b: Point;
}

/**
 * Traces the incoming white ray through the prism triangle for every sampled
 * wavelength, returning one SpectralRay per wavelength that successfully
 * enters AND exits the prism.
 */
export function tracePrismSpectrum(
  incomingOrigin: Point,
  incomingDir: Point,
  triangle: PrismTriangle
): SpectralRay[] {
  const d0 = normalize(incomingDir);

  const [v0, v1, v2] = triangle.vertices;
  const centroid: Point = {
    x: (v0.x + v1.x + v2.x) / 3,
    y: (v0.y + v1.y + v2.y) / 3,
  };

  const edges: Edge[] = [
    { a: v0, b: v1 },
    { a: v1, b: v2 },
    { a: v2, b: v0 },
  ];

  // Step 4: find the entry edge/point (wavelength-independent).
  let entryEdge: Edge | null = null;
  let entryHit: RaySegmentHit | null = null;

  for (const edge of edges) {
    const hit = intersectRaySegment(incomingOrigin, d0, edge.a, edge.b, 1e-6);
    if (!hit) continue;
    const n = outwardNormal(edge.a, edge.b, centroid);
    if (dot(d0, n) < 0) {
      if (!entryHit || hit.t < entryHit.t) {
        entryHit = hit;
        entryEdge = edge;
      }
    }
  }

  if (!entryEdge || !entryHit) {
    // Ray misses the prism entirely.
    return [];
  }

  const entryPoint = entryHit.point;
  const entryNormal = outwardNormal(entryEdge.a, entryEdge.b, centroid);

  const otherEdges = edges.filter((e) => e !== entryEdge);

  const results: SpectralRay[] = [];

  for (const wavelengthNm of sampleWavelengths()) {
    const nGlass = refractiveIndex(wavelengthNm);

    // Step 6: entry refraction (air -> glass).
    const internalDirection = refract(d0, entryNormal, 1.0 / nGlass);
    if (!internalDirection) continue; // defensive; shouldn't happen entering a denser medium

    // Step 7: propagate internally to find the exit edge/point.
    let exitEdge: Edge | null = null;
    let exitHit: RaySegmentHit | null = null;

    for (const edge of otherEdges) {
      const hit = intersectRaySegment(entryPoint, internalDirection, edge.a, edge.b, 1e-6);
      if (!hit) continue;
      if (!exitHit || hit.t < exitHit.t) {
        exitHit = hit;
        exitEdge = edge;
      }
    }

    if (!exitEdge || !exitHit) continue; // defensive: shouldn't happen for a convex triangle

    const exitPoint = exitHit.point;

    // Step 8: exit refraction (glass -> air).
    const exitNormalOutward = outwardNormal(exitEdge.a, exitEdge.b, centroid);
    const inwardNormal = scale(exitNormalOutward, -1);
    const exitDirection = refract(internalDirection, inwardNormal, nGlass / 1.0);
    if (!exitDirection) continue; // total internal reflection - skip this wavelength

    results.push({
      wavelengthNm,
      intensity: 1,
      entryPoint,
      internalDirection,
      exitPoint,
      exitDirection,
    });
  }

  return results;
}
