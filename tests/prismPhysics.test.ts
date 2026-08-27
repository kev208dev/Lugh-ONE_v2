import { describe, it, expect } from 'vitest';
import {
  MAX_PRISM_BOUNCES,
  resolveDielectricBoundary,
  tracePrismInteraction,
  tracePrismSpectrum,
} from '../src/optics/PrismPhysics';
import type { PrismTriangle, SpectralRay } from '../src/optics/PrismPhysics';
import { refractiveIndex, sampleWavelengths } from '../src/optics/Spectrum';
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
  for (const point of ray.internalPath ?? []) expectFinitePoint(point);
  expect(ray.internalReflections ?? 0).toBeGreaterThanOrEqual(0);
  expect(ray.internalReflections ?? 0).toBeLessThanOrEqual(MAX_PRISM_BOUNCES);
}

function incidentDirection(angleDegFromNormal: number): Point {
  const angleRad = (angleDegFromNormal * Math.PI) / 180;
  return { x: Math.sin(angleRad), y: Math.cos(angleRad) };
}

const INCIDENT_MEDIUM_NORMAL: Point = { x: 0, y: -1 };

describe('dielectric boundary TIR', () => {
  it('Case A — air to prism always refracts, even at a steep incidence angle', () => {
    const interaction = resolveDielectricBoundary(
      incidentDirection(80),
      INCIDENT_MEDIUM_NORMAL,
      1,
      refractiveIndex(550)
    );

    expect(interaction.kind).toBe('refraction');
    expect(interaction.k).toBeGreaterThanOrEqual(0);
    expect(vlen(interaction.direction)).toBeCloseTo(1, 12);
    const tangent = { x: -interaction.normal.y, y: interaction.normal.x };
    expect(Math.abs(vdot(incidentDirection(80), tangent))).toBeCloseTo(
      refractiveIndex(550) * Math.abs(vdot(interaction.direction, tangent)),
      10
    );
  });

  it('Case B — prism to air below the critical angle refracts out', () => {
    const interaction = resolveDielectricBoundary(
      incidentDirection(30),
      { x: 0, y: 1 }, // deliberately points with I; helper must orient it
      refractiveIndex(550),
      1
    );

    expect(interaction.kind).toBe('refraction');
    expect(interaction.k).toBeGreaterThan(0);
    expect(vdot(interaction.normal, incidentDirection(30))).toBeLessThanOrEqual(0);
    expect(vlen(interaction.direction)).toBeCloseTo(1, 12);
  });

  it('Case C — prism to air above the critical angle reflects back inside', () => {
    const incident = incidentDirection(50);
    const interaction = resolveDielectricBoundary(
      incident,
      INCIDENT_MEDIUM_NORMAL,
      refractiveIndex(550),
      1
    );

    expect(interaction.kind).toBe('total-internal-reflection');
    expect(interaction.k).toBeLessThan(0);
    expect(interaction.direction.x).toBeCloseTo(incident.x, 12);
    expect(interaction.direction.y).toBeCloseTo(-incident.y, 12);
    expect(vlen(interaction.direction)).toBeCloseTo(1, 12);
  });

  it('Case D — stays finite and switches cleanly immediately around the critical angle', () => {
    const nGlass = refractiveIndex(550);
    const criticalAngleRad = Math.asin(1 / nGlass);
    const deltaRad = 1e-7;
    const directionAt = (angleRad: number): Point => ({ x: Math.sin(angleRad), y: Math.cos(angleRad) });

    const below = resolveDielectricBoundary(
      directionAt(criticalAngleRad - deltaRad),
      INCIDENT_MEDIUM_NORMAL,
      nGlass,
      1
    );
    const at = resolveDielectricBoundary(
      directionAt(criticalAngleRad),
      INCIDENT_MEDIUM_NORMAL,
      nGlass,
      1
    );
    const above = resolveDielectricBoundary(
      directionAt(criticalAngleRad + deltaRad),
      INCIDENT_MEDIUM_NORMAL,
      nGlass,
      1
    );

    expect(below.kind).toBe('refraction');
    expect(at.kind).toBe('refraction');
    expect(above.kind).toBe('total-internal-reflection');
    for (const interaction of [below, at, above]) {
      expectFinitePoint(interaction.direction);
      expect(vlen(interaction.direction)).toBeCloseTo(1, 10);
    }
  });

  it('Case F — resolves the same 41° boundary independently for each wavelength', () => {
    const incident = incidentDirection(41);
    const violet = resolveDielectricBoundary(incident, INCIDENT_MEDIUM_NORMAL, refractiveIndex(380), 1);
    const red = resolveDielectricBoundary(incident, INCIDENT_MEDIUM_NORMAL, refractiveIndex(700), 1);

    expect(violet.kind).toBe('total-internal-reflection');
    expect(red.kind).toBe('refraction');
    expect(violet.eta).toBeGreaterThan(red.eta);
  });
});

// --- tests ---------------------------------------------------------------------

describe('tracePrismSpectrum', () => {
  it('reports the glass contact point separately from the outgoing spectrum', () => {
    const interaction = tracePrismInteraction(INCOMING_ORIGIN, INCOMING_DIR, TRIANGLE);

    expect(interaction.entryPoint).not.toBeNull();
    expect(interaction.rays).toHaveLength(sampleWavelengths().length);
    expect(interaction.entryPoint).toEqual(interaction.rays[0].entryPoint);
  });

  it('reports no contact and no spectrum when white light misses the prism', () => {
    const interaction = tracePrismInteraction(
      { x: -1000, y: -1000 },
      { x: 1, y: 0 },
      TRIANGLE
    );

    expect(interaction).toEqual({ entryPoint: null, rays: [] });
  });

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

  it('8. keeps a complete visible spectrum while the prism rotates through every incidence angle', () => {
    const failures: Array<{ angleDeg: number; rayCount: number }> = [];
    const expectedRayCount = sampleWavelengths().length;

    for (let angleDeg = 0; angleDeg < 360; angleDeg += 0.5) {
      const triangle = makeTriangle(CENTER, RADIUS, angleDeg);
      const interaction = tracePrismInteraction(
        { x: CENTER.x - 1000, y: CENTER.y },
        { x: 1, y: 0 },
        triangle
      );

      if (interaction.entryPoint === null || interaction.rays.length !== expectedRayCount) {
        failures.push({ angleDeg, rayCount: interaction.rays.length });
        continue;
      }

      for (const ray of interaction.rays) expectFiniteRay(ray);
    }

    expect(failures).toEqual([]);
  });

  it('Case E — follows two consecutive TIR bounces to the next edges before exiting', () => {
    const halfHeight = Math.tan((15 * Math.PI) / 180) * 100;
    const slenderPrism: PrismTriangle = {
      vertices: [
        { x: 0, y: -halfHeight },
        { x: 0, y: halfHeight },
        { x: 100, y: 0 },
      ],
    };
    const interaction = tracePrismInteraction({ x: -100, y: 10 }, { x: 1, y: 0 }, slenderPrism);
    const violet = interaction.rays.find((ray) => ray.wavelengthNm === 380);

    expect(MAX_PRISM_BOUNCES).toBeGreaterThanOrEqual(8);
    expect(MAX_PRISM_BOUNCES).toBeLessThanOrEqual(16);
    expect(violet).toBeDefined();
    expect(violet!.internalReflections).toBe(2);
    expect(violet!.internalPath).toHaveLength(4); // entry, TIR, TIR, exit
    for (const point of violet!.internalPath!) {
      expect(isOnTriangleEdge(point, slenderPrism, 1e-5)).toBe(true);
    }
    for (let index = 1; index < violet!.internalPath!.length; index += 1) {
      expect(vlen({
        x: violet!.internalPath![index].x - violet!.internalPath![index - 1].x,
        y: violet!.internalPath![index].y - violet!.internalPath![index - 1].y,
      })).toBeGreaterThan(1e-4);
    }
    expectFiniteRay(violet!);
  });

  it('Case F integration — wavelength-dependent TIR changes the real internal path', () => {
    const wavelengthSplitPrism: PrismTriangle = {
      vertices: [
        { x: 0, y: -100 },
        { x: 0, y: 100 },
        { x: 86.932, y: 0 },
      ],
    };
    const interaction = tracePrismInteraction(
      { x: -100, y: 20 },
      { x: 1, y: 0 },
      wavelengthSplitPrism
    );
    const violet = interaction.rays.find((ray) => ray.wavelengthNm === 380);
    const red = interaction.rays.find((ray) => ray.wavelengthNm === 700);

    expect(violet).toBeDefined();
    expect(red).toBeDefined();
    expect(violet!.internalReflections).toBeGreaterThanOrEqual(1);
    expect(red!.internalReflections).toBe(0);
    expect(violet!.internalPath!.length).toBeGreaterThan(red!.internalPath!.length);
  });
});
