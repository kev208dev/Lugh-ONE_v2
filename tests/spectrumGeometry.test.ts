import { describe, it, expect } from 'vitest';
import { buildSpectrumFan } from '../src/rendering/spectrumGeometry';
import type { SpectralRay } from '../src/optics/PrismPhysics';
import type { Point } from '../src/optics/Ray';

const RGB_RE = /^rgb\(\d+,\d+,\d+\)$/;

function unitDir(angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.cos(rad), y: Math.sin(rad) };
}

function makeRay(wavelengthNm: number, exitAngleDeg: number, exitPoint: Point): SpectralRay {
  return {
    wavelengthNm,
    intensity: 1,
    entryPoint: { x: 0, y: 0 },
    internalDirection: unitDir(exitAngleDeg), // not used by buildSpectrumFan, plausible placeholder
    exitPoint,
    exitDirection: unitDir(exitAngleDeg),
  };
}

describe('buildSpectrumFan', () => {
  it('returns null for 0 rays', () => {
    expect(buildSpectrumFan([])).toBeNull();
  });

  it('returns null for exactly 1 ray', () => {
    const rays = [makeRay(500, 12, { x: 10, y: 10 })];
    expect(buildSpectrumFan(rays)).toBeNull();
  });

  it('does not invent one filled fan across wavelengths that exit different prism faces', () => {
    const first = makeRay(400, -20, { x: 40, y: 10 });
    const second = makeRay(700, 35, { x: 80, y: 50 });
    first.exitEdgeIndex = 0;
    second.exitEdgeIndex = 2;

    expect(buildSpectrumFan([first, second])).toBeNull();
  });

  it('builds a normal fan for a smoothly-varying, non-wraparound set of angles', () => {
    const wavelengths = [400, 450, 500, 550, 600];
    const angles = [10, 10.75, 11.5, 12.25, 13]; // ascending, ascending wavelength order
    const rays: SpectralRay[] = wavelengths.map((wl, i) =>
      makeRay(wl, angles[i], { x: 10 * i, y: 5 * i })
    );

    const fan = buildSpectrumFan(rays);
    expect(fan).not.toBeNull();
    if (!fan) return;

    // apex is the mean of all exitPoints: mean x = (0+10+20+30+40)/5 = 20,
    // mean y = (0+5+10+15+20)/5 = 10.
    expect(fan.apex.x).toBeCloseTo(20, 10);
    expect(fan.apex.y).toBeCloseTo(10, 10);

    expect(fan.stops.length).toBe(5);
    expect(fan.stops[0].offset).toBe(0);
    expect(fan.stops[fan.stops.length - 1].offset).toBe(1);

    for (let i = 1; i < fan.stops.length; i++) {
      expect(fan.stops[i].offset).toBeGreaterThanOrEqual(fan.stops[i - 1].offset);
    }

    for (const stop of fan.stops) {
      expect(stop.color).toMatch(RGB_RE);
      expect(stop.offset).toBeGreaterThanOrEqual(0);
      expect(stop.offset).toBeLessThanOrEqual(1);
    }

    // startAngle should equal the raw angle of the first (shortest wavelength) ray.
    expect(fan.startAngle).toBeCloseTo((10 * Math.PI) / 180, 10);
  });

  it('handles the ±π wraparound case: angles straddling the atan2 boundary stay monotonic and small-swept', () => {
    // Angles (degrees), ascending wavelength order, straddling ±180°:
    // 178, 179, -179.5, -179 — physically these are only a few degrees apart
    // (178 -> 179 -> 180/-180 -> -179.5 -> -179), but atan2 returns values
    // that jump from ~+3.13 rad to ~-3.13 rad, i.e. naive subtraction would
    // suggest a ~358° sweep instead of the true ~3° sweep.
    const wavelengths = [400, 450, 500, 550];
    const angles = [178, 179, -179.5, -179];
    const rays: SpectralRay[] = wavelengths.map((wl, i) =>
      makeRay(wl, angles[i], { x: i, y: -i })
    );

    // Sanity: confirm this fixture actually straddles the atan2 ±π boundary
    // with real numbers (raw atan2 values for consecutive rays differ by a
    // large jump even though physically adjacent).
    const rawAngles = rays.map((r) => Math.atan2(r.exitDirection.y, r.exitDirection.x));
    expect(rawAngles[1]).toBeGreaterThan(3); // ~179° in radians, near +π
    expect(rawAngles[2]).toBeLessThan(-3); // ~-179.5° in radians, near -π
    expect(Math.abs(rawAngles[2] - rawAngles[1])).toBeGreaterThan(6); // naive delta ~358°, proves the trap is real

    const fan = buildSpectrumFan(rays);
    expect(fan).not.toBeNull();
    if (!fan) return;

    // The real physical sweep is only a few degrees — must NOT be ~2π.
    expect(Math.abs(fan.endAngle - fan.startAngle)).toBeLessThan(0.2);

    expect(fan.stops.length).toBe(4);
    expect(fan.stops[0].offset).toBe(0);
    expect(fan.stops[fan.stops.length - 1].offset).toBe(1);

    for (let i = 1; i < fan.stops.length; i++) {
      expect(fan.stops[i].offset).toBeGreaterThanOrEqual(fan.stops[i - 1].offset);
    }

    for (const stop of fan.stops) {
      expect(stop.offset).toBeGreaterThanOrEqual(0);
      expect(stop.offset).toBeLessThanOrEqual(1);
      expect(stop.color).toMatch(RGB_RE);
    }
  });

  it('returns only finite numbers for apex, angles, and offsets across all fixtures', () => {
    const fixtures: SpectralRay[][] = [
      [400, 450, 500, 550, 600].map((wl, i) =>
        makeRay(wl, 10 + i * 0.75, { x: 10 * i, y: 5 * i })
      ),
      [400, 450, 500, 550].map((wl, i) =>
        makeRay(wl, [178, 179, -179.5, -179][i], { x: i, y: -i })
      ),
    ];

    for (const rays of fixtures) {
      const fan = buildSpectrumFan(rays);
      expect(fan).not.toBeNull();
      if (!fan) continue;

      expect(Number.isFinite(fan.apex.x)).toBe(true);
      expect(Number.isFinite(fan.apex.y)).toBe(true);
      expect(Number.isFinite(fan.startAngle)).toBe(true);
      expect(Number.isFinite(fan.endAngle)).toBe(true);
      for (const stop of fan.stops) {
        expect(Number.isFinite(stop.offset)).toBe(true);
      }
    }

    // Edge cases (0 and 1 ray) return null, not NaN-filled objects.
    expect(buildSpectrumFan([])).toBeNull();
    expect(buildSpectrumFan([makeRay(500, 12, { x: 10, y: 10 })])).toBeNull();
  });
});
