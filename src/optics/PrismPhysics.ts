import type { Point } from './Ray';
import { sampleWavelengths, refractiveIndex } from './Spectrum';

export interface SpectralRay {
  wavelengthNm: number;
  intensity: number; // uniform 1 for every wavelength in Phase 3 - intensity shaping is a later-phase concern
  entryPoint: Point;
  internalDirection: Point; // unit vector, direction of travel inside the glass
  /** Exact colored path inside the glass, including entry, any total-
   * internal-reflection contacts, and the final exit point. Older callers
   * may omit it; renderers fall back to entryPoint -> exitPoint. */
  internalPath?: Point[];
  /** Number of real total-internal-reflection events before this wavelength
   * escaped. Optional so older rendering/test fixtures remain compatible. */
  internalReflections?: number;
  exitPoint: Point;
  exitDirection: Point; // unit vector, direction of travel after leaving the glass
  /** Polygon edge used for the final glass -> air transition. Renderers can
   * avoid joining rays that physically left through different faces. */
  exitEdgeIndex?: number;
}

export interface PrismTriangle {
  vertices: [Point, Point, Point];
}

export interface PrismTrace {
  /** First physical contact with the glass, even when every wavelength is
   * later lost to total internal reflection. Null means the ray missed the
   * prism entirely. */
  entryPoint: Point | null;
  rays: SpectralRay[];
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

function reflect(d: Point, normal: Point): Point {
  return normalize(sub(d, scale(normal, 2 * dot(d, normal))));
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

export type DielectricBoundaryInteraction = {
  kind: 'refraction' | 'total-internal-reflection';
  direction: Point;
  /** Oriented unit normal, always facing the incident medium. */
  normal: Point;
  eta: number;
  cosI: number;
  k: number;
};

const TIR_K_TOLERANCE = 1e-12;
const NORMAL_ORIENTATION_TOLERANCE = 1e-12;

/**
 * Resolves one dielectric boundary using vector Snell's law. Inputs are
 * normalized here, and the normal is flipped when necessary so it always
 * points back into the incident medium (`dot(I, N) <= 0`).
 *
 *   eta  = nFrom / nTo
 *   cosI = -dot(I, N)
 *   k    = 1 - eta²(1 - cosI²)
 *
 * A meaningfully negative k has no refracted solution and therefore uses
 * R = I - 2 dot(I,N) N. Tiny negative values at the critical angle are
 * clamped to zero so floating-point noise cannot create NaNs or drop rays.
 */
export function resolveDielectricBoundary(
  incidentDirection: Point,
  surfaceNormal: Point,
  nFrom: number,
  nTo: number
): DielectricBoundaryInteraction {
  if (!(nFrom > 0) || !(nTo > 0) || !Number.isFinite(nFrom) || !Number.isFinite(nTo)) {
    throw new RangeError('refractive indices must be finite positive numbers');
  }

  const incident = normalize(incidentDirection);
  let normal = normalize(surfaceNormal);
  if (length(incident) === 0 || length(normal) === 0) {
    throw new RangeError('incident direction and surface normal must be non-zero');
  }
  if (dot(incident, normal) > NORMAL_ORIENTATION_TOLERANCE) normal = scale(normal, -1);

  const eta = nFrom / nTo;
  const cosI = Math.min(1, Math.max(0, -dot(incident, normal)));
  const k = 1 - eta * eta * (1 - cosI * cosI);

  if (k < -TIR_K_TOLERANCE) {
    return {
      kind: 'total-internal-reflection',
      direction: reflect(incident, normal),
      normal,
      eta,
      cosI,
      k,
    };
  }

  const cosT = Math.sqrt(Math.max(0, k));
  return {
    kind: 'refraction',
    direction: normalize(add(scale(incident, eta), scale(normal, eta * cosI - cosT))),
    normal,
    eta,
    cosI,
    k,
  };
}

interface Edge {
  index: number;
  a: Point;
  b: Point;
}

interface BoundaryHit {
  point: Point;
  edges: Edge[];
  outwardNormal: Point;
}

export const MAX_PRISM_BOUNCES = 12;
const TRACE_EPSILON_SCALE = 1e-7;
const MIN_TRACE_EPSILON = 1e-9;

function nearestBoundaryHit(
  origin: Point,
  direction: Point,
  edges: Edge[],
  centroid: Point,
  epsilon: number,
  excludedEdgeIndices: ReadonlySet<number>,
  requireEnteringFace = false
): BoundaryHit | null {
  const candidates: Array<{ edge: Edge; hit: RaySegmentHit; normal: Point }> = [];

  for (const edge of edges) {
    if (excludedEdgeIndices.has(edge.index)) continue;
    const normal = outwardNormal(edge.a, edge.b, centroid);
    if (requireEnteringFace && dot(direction, normal) >= -1e-12) continue;
    const hit = intersectRaySegment(origin, direction, edge.a, edge.b, epsilon);
    if (hit) candidates.push({ edge, hit, normal });
  }

  if (candidates.length === 0) return null;
  const minimumT = Math.min(...candidates.map((candidate) => candidate.hit.t));
  const tieTolerance = epsilon * 4;
  const tied = candidates.filter((candidate) => Math.abs(candidate.hit.t - minimumT) <= tieTolerance);

  // A ray that lands exactly on a convex polygon vertex intersects both
  // adjacent faces at the same t. Choosing one arbitrarily can reflect it
  // through the other face. The normalized sum is the geometric corner
  // bisector and gives a stable, winding-independent boundary convention.
  let normalSum: Point = { x: 0, y: 0 };
  for (const candidate of tied) normalSum = add(normalSum, candidate.normal);
  if (length(normalSum) <= 1e-12) {
    normalSum = tied.reduce((best, candidate) =>
      Math.abs(dot(direction, candidate.normal)) > Math.abs(dot(direction, best.normal))
        ? candidate
        : best
    ).normal;
  }

  return {
    point: add(origin, scale(direction, minimumT)),
    edges: tied.map((candidate) => candidate.edge),
    outwardNormal: normalize(normalSum),
  };
}

/**
 * Traces the incoming white ray through the prism triangle for every sampled
 * wavelength, returning one SpectralRay per wavelength that successfully
 * enters AND exits the prism.
 */
export function tracePrismInteraction(
  incomingOrigin: Point,
  incomingDir: Point,
  triangle: PrismTriangle
): PrismTrace {
  const d0 = normalize(incomingDir);

  const [v0, v1, v2] = triangle.vertices;
  const centroid: Point = {
    x: (v0.x + v1.x + v2.x) / 3,
    y: (v0.y + v1.y + v2.y) / 3,
  };

  const edges: Edge[] = [
    { index: 0, a: v0, b: v1 },
    { index: 1, a: v1, b: v2 },
    { index: 2, a: v2, b: v0 },
  ];

  const characteristicLength = Math.max(...edges.map((edge) => length(sub(edge.b, edge.a))));
  const traceEpsilon = Math.max(MIN_TRACE_EPSILON, characteristicLength * TRACE_EPSILON_SCALE);

  // Step 4: find the entry edge/point (wavelength-independent).
  const entryHit = nearestBoundaryHit(
    incomingOrigin,
    d0,
    edges,
    centroid,
    traceEpsilon,
    new Set<number>(),
    true
  );

  if (!entryHit) {
    // Ray misses the prism entirely.
    return { entryPoint: null, rays: [] };
  }

  const entryPoint = entryHit.point;

  const results: SpectralRay[] = [];

  for (const wavelengthNm of sampleWavelengths()) {
    const nGlass = refractiveIndex(wavelengthNm);

    // Step 6: entry refraction (air -> glass).
    const entryInteraction = resolveDielectricBoundary(d0, entryHit.outwardNormal, 1, nGlass);
    if (entryInteraction.kind !== 'refraction') continue; // impossible for air -> denser glass
    const internalDirection = entryInteraction.direction;

    // Step 7/8: while the wavelength remains inside the prism, resolve the
    // next physical boundary. Refraction switches it to air; TIR keeps it in
    // glass and advances toward the next edge.
    let insidePrism = true;
    let pathOrigin = add(entryPoint, scale(internalDirection, traceEpsilon));
    let pathDirection = internalDirection;
    let excludedEdgeIndices = new Set(entryHit.edges.map((edge) => edge.index));
    const internalPath: Point[] = [entryPoint];
    let internalReflections = 0;

    for (
      let interactionIndex = 0;
      insidePrism && interactionIndex <= MAX_PRISM_BOUNCES;
      interactionIndex += 1
    ) {
      const boundaryHit = nearestBoundaryHit(
        pathOrigin,
        pathDirection,
        edges,
        centroid,
        traceEpsilon,
        excludedEdgeIndices
      );
      if (!boundaryHit) break;

      const boundaryPoint = boundaryHit.point;
      internalPath.push(boundaryPoint);
      const boundaryInteraction = resolveDielectricBoundary(
        pathDirection,
        boundaryHit.outwardNormal,
        nGlass,
        1
      );

      if (boundaryInteraction.kind === 'refraction') {
        insidePrism = false;
        results.push({
          wavelengthNm,
          intensity: 1,
          entryPoint,
          internalDirection,
          internalPath,
          internalReflections,
          exitPoint: boundaryPoint,
          exitDirection: boundaryInteraction.direction,
          exitEdgeIndex: Math.min(...boundaryHit.edges.map((edge) => edge.index)),
        });
        break;
      }

      // TIR: insidePrism deliberately remains true. Stop only at the bounce
      // safety cap; otherwise advance a sub-pixel epsilon along the reflected
      // direction so the same boundary cannot self-intersect immediately.
      if (internalReflections >= MAX_PRISM_BOUNCES) break;
      internalReflections += 1;
      pathDirection = boundaryInteraction.direction;
      pathOrigin = add(boundaryPoint, scale(pathDirection, traceEpsilon));
      excludedEdgeIndices = new Set(boundaryHit.edges.map((edge) => edge.index));
    }

    // `insidePrism` is intentionally not converted into an outgoing ray at
    // the safety cap: trapped light must not contribute planet energy.
  }

  return { entryPoint, rays: results };
}

/** Backward-compatible spectrum-only API used by the physics callers and
 * existing tests. New rendering code should prefer tracePrismInteraction()
 * so it can stop the white beam exactly at the glass contact point. */
export function tracePrismSpectrum(
  incomingOrigin: Point,
  incomingDir: Point,
  triangle: PrismTriangle
): SpectralRay[] {
  return tracePrismInteraction(incomingOrigin, incomingDir, triangle).rays;
}
