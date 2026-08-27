import { describe, expect, it } from 'vitest';
import { parallelRayFromSun, straightRayFromSun } from '../src/optics/upstream';
import type { DeviceId, WindowGeometry } from '../src/runtime/types';

function geometry(id: DeviceId, screenX: number, screenY: number): WindowGeometry {
  return {
    id,
    screenX,
    screenY,
    outerWidth: 260,
    outerHeight: 260,
    innerWidth: 240,
    innerHeight: 220,
    chromeInsetTop: 40,
    chromeInsetLeft: 10,
    timestamp: 0
  };
}

describe('SUN upstream rays', () => {
  it('keeps ordinary direct-device routing center-targeted', () => {
    const ray = straightRayFromSun(geometry('sun', 0, 0), geometry('prism', 400, 100));
    expect(ray.directionGlobal.x).toBeGreaterThan(0);
    expect(ray.directionGlobal.y).toBeGreaterThan(0);
  });

  it('uses horizontal parallel light for a black hole instead of aiming at its event horizon', () => {
    const ray = parallelRayFromSun(geometry('sun', 0, 0), geometry('blackhole', 400, 100));
    expect(ray.directionGlobal).toEqual({ x: 1, y: 0 });
  });
});
