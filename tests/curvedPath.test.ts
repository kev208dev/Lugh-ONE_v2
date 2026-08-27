import { describe, expect, it } from 'vitest';
import {
  buildDeflectedPath,
  clipPathToRect,
  firstPathPolygonIntersection,
  pathDirectionNear
} from '../src/optics/CurvedPath';
import { deflectRay } from '../src/optics/BlackHolePhysics';

describe('shared gravitational curve', () => {
  it('bows toward a black hole below the incoming ray, never to the opposite screen side', () => {
    const center = { x: 100, y: 160 };
    const result = deflectRay({ x: 0, y: 100 }, { x: 1, y: 0 }, center);

    expect(result.absorbed).toBe(false);
    expect(result.outgoingDirection!.y).toBeGreaterThan(0);

    const path = buildDeflectedPath(result.deflectionPoint, { x: 1, y: 0 }, result.outgoingDirection!, 1_400, 128);
    expect(path[16].y).toBeGreaterThan(result.deflectionPoint.y);
  });

  it('keeps the incoming tangent at the black-hole seam and reaches the outgoing tangent smoothly', () => {
    const incoming = { x: 1, y: 0 };
    const outgoing = { x: Math.cos(0.4), y: Math.sin(0.4) };
    const path = buildDeflectedPath({ x: 0, y: 0 }, incoming, outgoing, 1_400, 256);
    const firstDirection = pathDirectionNear(path, path[0])!;
    const finalDirection = pathDirectionNear(path, path.at(-1)!)!;

    expect(firstDirection.x).toBeCloseTo(incoming.x, 3);
    expect(firstDirection.y).toBeCloseTo(incoming.y, 2);
    expect(finalDirection.x).toBeCloseTo(outgoing.x, 2);
    expect(finalDirection.y).toBeCloseTo(outgoing.y, 2);
  });

  it('preserves a changing curve tangent inside a downstream prism window', () => {
    const path = buildDeflectedPath(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: Math.cos(0.45), y: Math.sin(0.45) },
      1_400,
      256
    );
    const visibleInPrism = clipPathToRect(path, { left: 350, top: 0, width: 320, height: 400 });

    expect(visibleInPrism.length).toBeGreaterThan(3);
    const entryDirection = pathDirectionNear(visibleInPrism, visibleInPrism[0])!;
    const exitDirection = pathDirectionNear(visibleInPrism, visibleInPrism.at(-1)!)!;
    expect(exitDirection.y).toBeGreaterThan(entryDirection.y);
  });

  it('uses the curved path crossing instead of teleporting an extended tangent into the prism', () => {
    const prism = [
      { x: 100, y: 80 },
      { x: 140, y: 140 },
      { x: 60, y: 140 }
    ];
    const crossingPath = [
      { x: 0, y: 120 },
      { x: 80, y: 118 },
      { x: 120, y: 110 }
    ];
    const missingCurve = [
      { x: 0, y: 40 },
      { x: 80, y: 45 },
      { x: 160, y: 50 }
    ];

    const hit = firstPathPolygonIntersection(crossingPath, prism);
    expect(hit).not.toBeNull();
    expect(hit!.segmentIndex).toBe(1);
    expect(hit!.point.x).toBeGreaterThan(60);
    expect(firstPathPolygonIntersection(missingCurve, prism)).toBeNull();
  });
});
