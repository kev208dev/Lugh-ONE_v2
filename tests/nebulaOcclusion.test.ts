import { describe, expect, it } from 'vitest';
import {
  nebulaCircleFromGeometry,
  segmentCircleEntry,
  traceNebulaAbsorption,
  type NebulaCircle
} from '../src/optics/NebulaOcclusion';
import type { NebulaConfig } from '../src/level/types';
import type { WindowGeometry } from '../src/runtime/types';

const fullVeil: NebulaCircle = {
  id: 'nebula-1',
  center: { x: 50, y: 0 },
  radius: 10,
  attenuation: 1
};

describe('nebula occlusion', () => {
  it('finds the first point where a segment enters the cloud', () => {
    const hit = segmentCircleEntry({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 }, 10);
    expect(hit?.t).toBeCloseTo(0.4, 9);
    expect(hit?.point).toEqual({ x: 40, y: 0 });
  });

  it('does not report an infinite-line hit outside the finite segment', () => {
    expect(segmentCircleEntry({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 50, y: 0 }, 10)).toBeNull();
  });

  it('fully absorbs a ray that crosses a full-strength veil', () => {
    const trace = traceNebulaAbsorption({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.8, [fullVeil]);
    expect(trace.transmittedIntensity).toBe(0);
    expect(trace.hits).toHaveLength(1);
    expect(trace.hits[0].absorbedIntensity).toBeCloseTo(0.8, 9);
  });

  it('applies multiple partial clouds in travel order', () => {
    const trace = traceNebulaAbsorption({ x: 0, y: 0 }, { x: 100, y: 0 }, 1, [
      { ...fullVeil, id: 'nebula-2', center: { x: 70, y: 0 }, attenuation: 0.5 },
      { ...fullVeil, center: { x: 30, y: 0 }, attenuation: 0.25 }
    ]);
    expect(trace.hits.map((hit) => hit.id)).toEqual(['nebula-1', 'nebula-2']);
    expect(trace.transmittedIntensity).toBeCloseTo(0.375, 9);
  });

  it('derives the collision circle from the real popup geometry', () => {
    const config: NebulaConfig = {
      id: 'nebula-1',
      xPct: 0.5,
      yPct: 0.5,
      sizePx: 220,
      attenuation: 1
    };
    const geometry: WindowGeometry = {
      id: 'nebula-1',
      screenX: 100,
      screenY: 200,
      outerWidth: 220,
      outerHeight: 220,
      innerWidth: 200,
      innerHeight: 180,
      chromeInsetTop: 30,
      chromeInsetLeft: 10,
      timestamp: 0
    };
    const circle = nebulaCircleFromGeometry(config, geometry);
    expect(circle.center).toEqual({ x: 210, y: 320 });
    expect(circle.radius).toBeCloseTo(75.6, 9);
  });
});
