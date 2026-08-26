import { describe, it, expect } from 'vitest';
import { tracePrismSpectrum } from '../src/optics/PrismPhysics';
import type { PrismTriangle, SpectralRay } from '../src/optics/PrismPhysics';
import { sampleWavelengths } from '../src/optics/Spectrum';
import type { Point } from '../src/optics/Ray';

// --- test fixtures / helpers --------------------------------------------------

const CENTER: Point = { x: 150, y: 150 };
const RADIUS = 80;

/**
 * Builds an equilateral triangle centered at `center` with the given
 * `radius`, with vertices at angles -90deg, 30deg, 150deg (plus an optional
 * extra rotation in degrees, applied about the same center).
 */
function makeTriangle(center: Point, radius: number, extraRotationDeg = 0): PrismTriangle {
  const baseAnglesDeg = [-90, 30, 150];
  const vertices = baseAnglesDeg.map((deg) => {
    const rad = ((deg + extraRotationDeg) * Math.PI) / 180;
    return {
      x: center.x + radius * Math.cos(rad),
      y: center.y + radius * Math.sin(rad),
    };
  }) as [Point, Point, Point];
  return { vertices };
}

const TRIANGLE = makeTriangle(CENTER, RADIUS);

// Incoming ray: far to the left, travelling right and slightly upward
// (+x, -y) so it enters the left face at a comfortable angle - steep enough
// to produce real dispersion, but well clear of the total-internal-reflection
// boundary at the exit face for every sampled wavelength.
const INCOMING_ORIGIN: Point = { x: -500, y: 250 };
const INCOMING_DIR: Point = { x: 1, y: -0.2 };

function vlen(a: Point): number {
  return Math.sqrt(a.x * a.x + a.y * a.y);
}

function vnormalize(a: Point): Point {
  const l = vlen(a);
  return { x: a.x / l, y: a.y / l };
}

function vdot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

/** Angle (radians) between two vectors, via acos of the dot of their unit forms. */
function angleBetween(a: Point, b: Point): number {
  const ua = vnormalize(a);
  const ub = vnormalize(b);
  const c = Math.min(1, Math.max(-1, vdot(ua, ub)));
  return Math.acos(c);
}

/** True if `p` lies on segment a->b (within tolerance), as a convex combination. */
function isOnSegment(p: Point, a: Point, b: Point, tol = 1e-6): boolean {
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const ap = { x: p.x - a.x, y: p.y - a.y };
  const abLen = vlen(ab);
  if (abLen === 0) return vlen(ap) < tol;
  // Perpendicular distance from p to the infinite line through a,b.
  const cross = ab.x * ap.y - ab.y * ap.x;
  const dist = Math.abs(cross) / abLen;
  if (dist > tol) return false;
  // Projection parameter must be within [0,1] (with small tolerance).
  const t = (ap.x * ab.x + ap.y * ab.y) / (abLen * abLen);
  return t >= -1e-6 && t <= 1 + 1e-6;
}

function isOnTriangleEdge(p: Point, triangle: PrismTriangle, tol = 1e-6): boolean {
  const [v0, v1, v2] = triangle.vertices;
  return (
    isOnSegment(p, v0, v1, tol) || isOnSegment(p, v1, v2, tol) || isOnSegment(p, v2, v0, tol)
  );
}

function expectFinitePoint(p: Point) {
  expect(Number.isFinite(p.x)).toBe(true);
  expect(Number.isFinite(p.y)).toBe(true);
}

function expectFiniteRay(ray: SpectralRay) {
  expect(Number.isFinite(ray.wavelengthNm)).toBe(true);
  expect(Number.isFinite(ray.intensity)).toBe(true);
  expectFinitePoint(ray.entryPoint);
  expectFinitePoint(ray.internalDirection);
  expectFinitePoint(ray.exitPoint);
  expectFinitePoint(ray.exitDirection);
}

// --- tests ---------------------------------------------------------------------

describe('tracePrismSpectrum', () => {
  it('1. returns wavelengths in the same ascending order as sampleWavelengths()', () => {
    const rays = tracePrismSpectrum(INCOMING_ORIGIN, INCOMING_DIR, TRIANGLE);
    const expectedOrder = sampleWavelengths();

    // For this well-aimed ray, expect all 33 wavelengths to pass through.
    expect(rays.length).toBe(expectedOrder.length);

    for (let i = 1; i < rays.length; i++) {
      expect(rays[i].wavelengthNm).toBeGreaterThan(rays[i - 1].wavelengthNm);
    }
    expect(rays.map((r) => r.wavelengthNm)).toEqual(expectedOrder);
  });

  it('3. blue (400nm) deviates more from the incoming direction than red (700nm)', () => {
    const rays = tracePrismSpectrum(INCOMING_ORIGIN, INCOMING_DIR, TRIANGLE);
    const blue = rays.find((r) => r.wavelengthNm === 400);
    const red = rays.find((r) => r.wavelengthNm === 700);

    expect(blue).toBeDefined();
    expect(red).toBeDefined();

    const blueDeviationRad = angleBetween(INCOMING_DIR, blue!.exitDirection);
    const redDeviationRad = angleBetween(INCOMING_DIR, red!.exitDirection);

    const blueDeviationDeg = (blueDeviationRad * 180) / Math.PI;
    const redDeviationDeg = (redDeviationRad * 180) / Math.PI;

    // eslint-disable-next-line no-console
    console.log(
      `[prismPhysics test 3] deviation angles - 400nm (blue): ${blueDeviationDeg.toFixed(
        4
      )} deg, 700nm (red): ${redDeviationDeg.toFixed(4)} deg, diff: ${(
        blueDeviationDeg - redDeviationDeg
      ).toFixed(4)} deg`
    );

    expect(blueDeviationRad).toBeGreaterThan(redDeviationRad);
  });

  it('4. entryPoint/exitPoint lie exactly on triangle edges, and differ from each other', () => {
    const rays = tracePrismSpectrum(INCOMING_ORIGIN, INCOMING_DIR, TRIANGLE);
    expect(rays.length).toBeGreaterThan(0);

    for (const ray of rays) {
      expect(isOnTriangleEdge(ray.entryPoint, TRIANGLE)).toBe(true);
      expect(isOnTriangleEdge(ray.exitPoint, TRIANGLE)).toBe(true);
      const dist = vlen({ x: ray.exitPoint.x - ray.entryPoint.x, y: ray.exitPoint.y - ray.entryPoint.y });
      expect(dist).toBeGreaterThan(1e-6);
    }

    // entryPoint should be identical across all wavelengths (same physical entry).
    const first = rays[0].entryPoint;
    for (const ray of rays) {
      expect(ray.entryPoint.x).toBeCloseTo(first.x, 9);
      expect(ray.entryPoint.y).toBeCloseTo(first.y, 9);
    }
  });

  it('5. every field of every returned ray is finite, across varied incoming angles (incl. steep/glancing)', () => {
    const variants: { origin: Point; dir: Point }[] = [
      { origin: INCOMING_ORIGIN, dir: { x: 1, y: 0 } },
      { origin: INCOMING_ORIGIN, dir: { x: 1, y: 0.3 } },
      { origin: INCOMING_ORIGIN, dir: { x: 1, y: -0.3 } },
      { origin: { x: -1000, y: 90 }, dir: { x: 1, y: 0.65 } }, // steep, near-grazing entry
      { origin: { x: -1000, y: 210 }, dir: { x: 1, y: -0.65 } }, // steep, near-grazing entry
      { origin: { x: -1000, y: 150 }, dir: { x: 1, y: 0.85 } }, // very steep, likely triggers TIR for some wavelengths
    ];

    for (const { origin, dir } of variants) {
      const rays = tracePrismSpectrum(origin, dir, TRIANGLE);
      for (const ray of rays) {
        expectFiniteRay(ray);
      }
    }
  });

  it('6. a ray that completely misses the triangle returns an empty array', () => {
    const missOrigin: Point = { x: -1000, y: -1000 };
    const missDir: Point = { x: 1, y: 0 };
    const rays = tracePrismSpectrum(missOrigin, missDir, TRIANGLE);
    expect(rays).toEqual([]);
  });

  it('7. behaves identically (valid, non-empty, non-NaN) for triangles rotated near the 359deg/0deg wraparound', () => {
    const triangle359 = makeTriangle(CENTER, RADIUS, 359);
    const triangle0 = makeTriangle(CENTER, RADIUS, 0);

    for (const triangle of [triangle359, triangle0]) {
      const rays = tracePrismSpectrum(INCOMING_ORIGIN, INCOMING_DIR, triangle);
      expect(rays.length).toBeGreaterThan(0);
      for (const ray of rays) {
        expectFiniteRay(ray);
      }
    }
  });
});
