import { describe, it, expect } from 'vitest';
import { reflectRay, computeMirrorNormal } from '../src/optics/MirrorPhysics';
import type { MirrorSurface } from '../src/optics/MirrorPhysics';
import type { Point } from '../src/optics/Ray';

// --- test fixtures / helpers --------------------------------------------------

function vlen(a: Point): number {
  return Math.sqrt(a.x * a.x + a.y * a.y);
}

function vdot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

const HORIZONTAL_MIRROR: MirrorSurface = { a: { x: 0, y: 100 }, b: { x: 200, y: 100 } };
const DIAGONAL_45_MIRROR: MirrorSurface = { a: { x: 50, y: 150 }, b: { x: 150, y: 50 } };

// --- tests ---------------------------------------------------------------------

describe('reflectRay', () => {
  it('1. straight-down ray hitting a horizontal mirror reflects straight back up', () => {
    const origin: Point = { x: 100, y: 0 };
    const direction: Point = { x: 0, y: 1 };

    const result = reflectRay(origin, direction, HORIZONTAL_MIRROR);

    expect(result.hit).toBe(true);
    expect(result.point).not.toBeNull();
    expect(result.point!.x).toBeCloseTo(100, 9);
    expect(result.point!.y).toBeCloseTo(100, 9);

    expect(result.reflectedDirection).not.toBeNull();
    expect(result.reflectedDirection!.x).toBeCloseTo(0, 9);
    expect(result.reflectedDirection!.y).toBeCloseTo(-1, 9);
  });

  it('2. straight-right ray hitting a 45deg mirror reflects at 90deg from the incoming direction', () => {
    const origin: Point = { x: 0, y: 100 };
    const direction: Point = { x: 1, y: 0 };

    const result = reflectRay(origin, direction, DIAGONAL_45_MIRROR);

    expect(result.hit).toBe(true);
    expect(result.reflectedDirection).not.toBeNull();

    // eslint-disable-next-line no-console
    console.log(
      `[mirrorPhysics test 2] incoming: (1, 0), reflected: (${result.reflectedDirection!.x.toFixed(
        6
      )}, ${result.reflectedDirection!.y.toFixed(6)}), hit point: (${result.point!.x.toFixed(
        6
      )}, ${result.point!.y.toFixed(6)})`
    );

    // A 45deg mirror running from (50,150) to (150,50) (a line of slope -1,
    // i.e. a "/" shape in canvas coordinates where y increases downward)
    // reflects a rightward-travelling ray straight upward (toward -y):
    // (1,0) -> (0,-1) - the classic periscope-mirror behavior.
    expect(result.reflectedDirection!.x).toBeCloseTo(0, 9);
    expect(result.reflectedDirection!.y).toBeCloseTo(-1, 9);

    // Angle-of-incidence/angle-of-reflection sanity check: for an exact
    // 45deg mirror hit head-on horizontally, incoming and reflected
    // directions are perpendicular (dot product ~0).
    const d = vdot(direction, result.reflectedDirection!);
    expect(Math.abs(d)).toBeLessThan(1e-9);
  });

  it('3. a ray whose path never crosses the finite mirror segment reports a miss, without throwing', () => {
    // Aimed well above the horizontal mirror's y=100 line, travelling
    // horizontally - never crosses it at all.
    const originAbove: Point = { x: -500, y: 10 };
    const dirAbove: Point = { x: 1, y: 0 };
    expect(() => reflectRay(originAbove, dirAbove, HORIZONTAL_MIRROR)).not.toThrow();
    const resultAbove = reflectRay(originAbove, dirAbove, HORIZONTAL_MIRROR);
    expect(resultAbove.hit).toBe(false);
    expect(resultAbove.point).toBeNull();
    expect(resultAbove.reflectedDirection).toBeNull();
    expect(resultAbove.normal).toBeNull();

    // Aimed at the mirror's infinite line, but past the finite segment's
    // horizontal span (x in [0,200]) - x = 500 is well outside.
    const originPast: Point = { x: 500, y: 0 };
    const dirPast: Point = { x: 0, y: 1 };
    const resultPast = reflectRay(originPast, dirPast, HORIZONTAL_MIRROR);
    expect(resultPast.hit).toBe(false);
    expect(resultPast.point).toBeNull();
    expect(resultPast.reflectedDirection).toBeNull();
    expect(resultPast.normal).toBeNull();

    // Moving away from the mirror entirely (negative t).
    const originAway: Point = { x: 100, y: 200 };
    const dirAway: Point = { x: 0, y: 1 }; // travelling further down, away from y=100
    const resultAway = reflectRay(originAway, dirAway, HORIZONTAL_MIRROR);
    expect(resultAway.hit).toBe(false);
    expect(resultAway.point).toBeNull();
    expect(resultAway.reflectedDirection).toBeNull();
    expect(resultAway.normal).toBeNull();
  });

  it('4. reflectedDirection is always unit length, across varied angles and mirror orientations', () => {
    const directions: Point[] = [
      { x: 0, y: 1 },
      { x: 0.3, y: 1 },
      { x: -0.3, y: 1 },
      { x: 0.9, y: 1 },
      { x: -0.9, y: 1 },
      { x: 0.05, y: 1 },
      { x: 2, y: 3 }, // non-normalized input
      { x: -1.5, y: 4 },
    ];
    const mirrors: MirrorSurface[] = [HORIZONTAL_MIRROR, DIAGONAL_45_MIRROR];

    let hitCount = 0;
    for (const mirror of mirrors) {
      for (const dir of directions) {
        // Use an origin well positioned to plausibly hit each mirror's span.
        const o: Point = mirror === HORIZONTAL_MIRROR ? { x: 100, y: -50 } : { x: 0, y: 0 };
        const result = reflectRay(o, dir, mirror);
        if (result.hit) {
          hitCount++;
          expect(result.reflectedDirection).not.toBeNull();
          const len = vlen(result.reflectedDirection!);
          expect(Math.abs(len - 1)).toBeLessThan(1e-9);
        }
      }
    }
    // Sanity: at least some of these combinations should actually hit.
    expect(hitCount).toBeGreaterThan(0);
  });

  it('5. computeMirrorNormal returns a unit vector for a non-degenerate mirror', () => {
    for (const mirror of [HORIZONTAL_MIRROR, DIAGONAL_45_MIRROR]) {
      const n = computeMirrorNormal(mirror);
      const len = vlen(n);
      expect(Math.abs(len - 1)).toBeLessThan(1e-9);
    }
  });

  it('6. never returns NaN/Infinity or throws for edge-ish cases', () => {
    // Ray parallel to the mirror surface.
    const parallelOrigin: Point = { x: -50, y: 100 };
    const parallelDir: Point = { x: 1, y: 0 };
    expect(() => reflectRay(parallelOrigin, parallelDir, HORIZONTAL_MIRROR)).not.toThrow();
    const parallelResult = reflectRay(parallelOrigin, parallelDir, HORIZONTAL_MIRROR);
    expect(parallelResult.hit).toBe(false);
    expect(Number.isFinite(parallelResult.incomingDirection.x)).toBe(true);
    expect(Number.isFinite(parallelResult.incomingDirection.y)).toBe(true);

    // Ray originating exactly on the mirror's infinite line, but outside
    // the a..b finite span.
    const onLineOrigin: Point = { x: 300, y: 100 };
    const onLineDir: Point = { x: 0, y: -1 };
    expect(() => reflectRay(onLineOrigin, onLineDir, HORIZONTAL_MIRROR)).not.toThrow();
    const onLineResult = reflectRay(onLineOrigin, onLineDir, HORIZONTAL_MIRROR);
    expect(Number.isFinite(onLineResult.incomingDirection.x)).toBe(true);
    expect(Number.isFinite(onLineResult.incomingDirection.y)).toBe(true);
    if (onLineResult.point) {
      expect(Number.isFinite(onLineResult.point.x)).toBe(true);
      expect(Number.isFinite(onLineResult.point.y)).toBe(true);
    }

    // A very short mirror segment.
    const tinyMirror: MirrorSurface = { a: { x: 100, y: 100 }, b: { x: 100.0000001, y: 100 } };
    const tinyOrigin: Point = { x: 100, y: 0 };
    const tinyDir: Point = { x: 0, y: 1 };
    expect(() => reflectRay(tinyOrigin, tinyDir, tinyMirror)).not.toThrow();
    const tinyResult = reflectRay(tinyOrigin, tinyDir, tinyMirror);
    expect(Number.isFinite(tinyResult.incomingDirection.x)).toBe(true);
    expect(Number.isFinite(tinyResult.incomingDirection.y)).toBe(true);
    if (tinyResult.hit) {
      expect(tinyResult.point).not.toBeNull();
      expect(Number.isFinite(tinyResult.point!.x)).toBe(true);
      expect(Number.isFinite(tinyResult.point!.y)).toBe(true);
      expect(Number.isFinite(tinyResult.reflectedDirection!.x)).toBe(true);
      expect(Number.isFinite(tinyResult.reflectedDirection!.y)).toBe(true);
    } else {
      expect(tinyResult.point).toBeNull();
      expect(tinyResult.reflectedDirection).toBeNull();
      expect(tinyResult.normal).toBeNull();
    }

    // Zero-length direction vector (degenerate input direction).
    const zeroDirOrigin: Point = { x: 100, y: 0 };
    const zeroDir: Point = { x: 0, y: 0 };
    expect(() => reflectRay(zeroDirOrigin, zeroDir, HORIZONTAL_MIRROR)).not.toThrow();
    const zeroDirResult = reflectRay(zeroDirOrigin, zeroDir, HORIZONTAL_MIRROR);
    expect(Number.isFinite(zeroDirResult.incomingDirection.x)).toBe(true);
    expect(Number.isFinite(zeroDirResult.incomingDirection.y)).toBe(true);
  });
});
