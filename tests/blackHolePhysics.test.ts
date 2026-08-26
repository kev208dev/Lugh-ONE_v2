import { describe, it, expect } from 'vitest';
import { deflectRay, DEFAULT_BLACK_HOLE_CONFIG } from '../src/optics/BlackHolePhysics';
import type { BlackHoleConfig } from '../src/optics/BlackHolePhysics';
import type { Point } from '../src/optics/Ray';

// --- local test helpers (mirrors the style used in tests/prismPhysics.test.ts) ---

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

describe('deflectRay', () => {
  it('absorbs a ray aimed directly at the center (closest approach inside the horizon)', () => {
    const origin: Point = { x: 0, y: 0 };
    const direction: Point = { x: 1, y: 0 };
    const center: Point = { x: 50, y: 0 }; // dead ahead -> closestDistance 0

    const result = deflectRay(origin, direction, center);

    expect(result.absorbed).toBe(true);
    expect(result.outgoingDirection).toBeNull();
    expect(result.deflectionAngleRad).toBeNull();
    expect(result.closestDistance).toBeLessThanOrEqual(DEFAULT_BLACK_HOLE_CONFIG.eventHorizonRadius);
  });

  it('does not absorb a ray passing far from center, and bends it only slightly', () => {
    const origin: Point = { x: 0, y: 0 };
    const direction: Point = { x: 1, y: 0 };
    const center: Point = { x: 1000, y: 400 }; // closestDistance = 400px, well outside the 26px horizon

    const result = deflectRay(origin, direction, center);

    expect(result.absorbed).toBe(false);
    expect(result.closestDistance).toBeCloseTo(400, 6);
    expect(result.deflectionAngleRad).not.toBeNull();
    expect(result.deflectionAngleRad as number).toBeGreaterThan(0);
    expect(result.deflectionAngleRad as number).toBeLessThan(0.05);
    // exact expected value from the documented formula
    const expected = DEFAULT_BLACK_HOLE_CONFIG.deflectionStrength / (400 * 400);
    expect(result.deflectionAngleRad as number).toBeCloseTo(expected, 9);
  });

  it('bends more sharply the closer the closest-approach distance is (monotonic falloff)', () => {
    // Fixed ray direction; a series of parallel rays (origin offset
    // perpendicular to `direction`) passing at increasing closest-approach
    // distances from `center`, all outside the 26px event horizon.
    //
    // NOTE: under DEFAULT_BLACK_HOLE_CONFIG the raw inverse-square formula
    // (deflectionStrength / d^2 = 6000 / d^2) exceeds maxDeflectionRad
    // (~1.4137 rad) for any d below ~65.15px. Distances of 30 and 50px
    // would therefore BOTH be clamped to the exact same capped value,
    // breaking strict monotonicity for a reason that has nothing to do
    // with the falloff shape itself (that's covered separately by the cap
    // -enforcement test below). To numerically verify the actual "closer =
    // more bending" falloff claim (not the cap), this series uses
    // distances that stay in the smooth, uncapped region of the default
    // config's curve: 70, 100, 150, 250px.
    const direction: Point = { x: 1, y: 0 };
    const center: Point = { x: 1000, y: 0 };
    const distances = [70, 100, 150, 250];

    const angles = distances.map((d) => {
      const origin: Point = { x: 0, y: -d };
      const result = deflectRay(origin, direction, center);
      expect(result.absorbed).toBe(false);
      expect(result.closestDistance).toBeCloseTo(d, 6);
      // sanity: confirm we're actually in the uncapped region for this assertion
      expect(result.deflectionAngleRad as number).toBeLessThan(DEFAULT_BLACK_HOLE_CONFIG.maxDeflectionRad);
      return result.deflectionAngleRad as number;
    });

    for (let i = 1; i < angles.length; i++) {
      expect(angles[i]).toBeLessThan(angles[i - 1]);
    }

    // Report-friendly readout (also asserted numerically above).
    // eslint-disable-next-line no-console
    console.log(
      'monotonic falloff series (deg): ' +
        distances
          .map((d, i) => `${d}px -> ${((angles[i] * 180) / Math.PI).toFixed(3)}°`)
          .join(', ')
    );
  });

  it('clamps the deflection angle to maxDeflectionRad when the raw formula would exceed it', () => {
    const origin: Point = { x: 0, y: 0 };
    const direction: Point = { x: 1, y: 0 };
    const closeDistance = DEFAULT_BLACK_HOLE_CONFIG.eventHorizonRadius + 1; // 27px, just outside the horizon
    const center: Point = { x: 1000, y: closeDistance };

    const rawAngle = DEFAULT_BLACK_HOLE_CONFIG.deflectionStrength / (closeDistance * closeDistance);
    expect(rawAngle).toBeGreaterThan(DEFAULT_BLACK_HOLE_CONFIG.maxDeflectionRad); // sanity: formula would overshoot without a cap

    const result = deflectRay(origin, direction, center);

    expect(result.absorbed).toBe(false);
    expect(result.deflectionAngleRad).toBe(DEFAULT_BLACK_HOLE_CONFIG.maxDeflectionRad);
  });

  it('always returns a unit-length outgoingDirection when not absorbed', () => {
    const cases: Array<{ origin: Point; direction: Point; center: Point }> = [
      { origin: { x: 0, y: 0 }, direction: { x: 1, y: 0 }, center: { x: 1000, y: 400 } },
      { origin: { x: 0, y: -70 }, direction: { x: 1, y: 0 }, center: { x: 1000, y: 0 } },
      { origin: { x: 0, y: -250 }, direction: { x: 1, y: 0 }, center: { x: 1000, y: 0 } },
      { origin: { x: 0, y: 0 }, direction: { x: 1, y: 0 }, center: { x: 1000, y: 27 } },
      { origin: { x: 5, y: -30 }, direction: { x: 3, y: 4 }, center: { x: 200, y: 200 } }
    ];

    for (const { origin, direction, center } of cases) {
      const result = deflectRay(origin, direction, center);
      if (!result.absorbed) {
        const dir = result.outgoingDirection as Point;
        expect(Math.abs(vlen(dir) - 1)).toBeLessThan(1e-9);
      }
    }
  });

  it('bends the ray toward the black hole, not away from or unchanged relative to it', () => {
    const origin: Point = { x: 0, y: 0 };
    const direction: Point = { x: 1, y: 0 };
    const center: Point = { x: 100, y: 50 }; // above/right of the rightward-moving ray, outside the horizon

    const result = deflectRay(origin, direction, center);
    expect(result.absorbed).toBe(false);

    const d0 = vnormalize(direction);
    const perp = vnormalize({ x: center.x - result.deflectionPoint.x, y: center.y - result.deflectionPoint.y });
    const outgoing = result.outgoingDirection as Point;

    expect(vdot(outgoing, perp)).toBeGreaterThan(vdot(d0, perp));
  });

  it('does not produce NaN/Infinity or throw for a ray through center or originating at center', () => {
    // Ray whose line passes exactly through center.
    const throughCenter = deflectRay({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 50, y: 0 });
    expect(Number.isFinite(throughCenter.closestDistance)).toBe(true);
    expect(Number.isFinite(throughCenter.deflectionPoint.x)).toBe(true);
    expect(Number.isFinite(throughCenter.deflectionPoint.y)).toBe(true);
    if (!throughCenter.absorbed) {
      expect(Number.isFinite((throughCenter.outgoingDirection as Point).x)).toBe(true);
      expect(Number.isFinite((throughCenter.outgoingDirection as Point).y)).toBe(true);
      expect(Number.isFinite(throughCenter.deflectionAngleRad as number)).toBe(true);
    }

    // Ray originating exactly at center.
    const atCenter = deflectRay({ x: 50, y: 50 }, { x: 1, y: 0 }, { x: 50, y: 50 });
    expect(Number.isFinite(atCenter.closestDistance)).toBe(true);
    expect(Number.isFinite(atCenter.deflectionPoint.x)).toBe(true);
    expect(Number.isFinite(atCenter.deflectionPoint.y)).toBe(true);
    expect(atCenter.absorbed).toBe(true); // distance 0 is inside the default horizon
  });

  it('actually uses the passed-in config rather than hardcoded constants', () => {
    const origin: Point = { x: 0, y: 0 };
    const direction: Point = { x: 1, y: 0 };
    const center: Point = { x: 1000, y: 10 }; // closestDistance 10px

    // Under the default config (horizon 26px) this is absorbed.
    const withDefault = deflectRay(origin, direction, center, DEFAULT_BLACK_HOLE_CONFIG);
    expect(withDefault.absorbed).toBe(true);

    // Under a custom config with a much smaller horizon, it should NOT be absorbed.
    const customConfig: BlackHoleConfig = {
      eventHorizonRadius: 5,
      deflectionStrength: 100,
      maxDeflectionRad: Math.PI * 0.5 // generous enough that this case isn't clamped, so the raw formula is what's being checked
    };
    const withCustom = deflectRay(origin, direction, center, customConfig);
    expect(withCustom.absorbed).toBe(false);
    expect(withCustom.deflectionAngleRad as number).toBeCloseTo(customConfig.deflectionStrength / (10 * 10), 9);
  });
});
