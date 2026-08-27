import type { NebulaConfig } from '../level/types';
import { centerGlobal } from '../runtime/globalCoords';
import type { NebulaDeviceId, WindowGeometry } from '../runtime/types';
import type { Point } from './Ray';

export interface NebulaCircle {
  id: NebulaDeviceId;
  center: Point;
  radius: number;
  attenuation: number;
}

export interface NebulaHit {
  id: NebulaDeviceId;
  point: Point;
  t: number;
  absorbedIntensity: number;
}

export interface NebulaTraceResult {
  transmittedIntensity: number;
  hits: NebulaHit[];
}

/** Builds the collision circle from the obstacle's real popup geometry, so
 * moving or resizing another optical window never desynchronizes physics
 * from the cloud the player can actually see. */
export function nebulaCircleFromGeometry(config: NebulaConfig, geometry: WindowGeometry): NebulaCircle {
  return {
    id: config.id,
    center: centerGlobal(geometry),
    radius: Math.min(geometry.innerWidth, geometry.innerHeight) * 0.42,
    attenuation: Math.min(1, Math.max(0, config.attenuation))
  };
}

/** Entry point of a finite segment into a circle. Returns null for a miss. */
export function segmentCircleEntry(p1: Point, p2: Point, center: Point, radius: number): { point: Point; t: number } | null {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const fx = p1.x - center.x;
  const fy = p1.y - center.y;
  const a = dx * dx + dy * dy;

  if (a === 0) {
    return fx * fx + fy * fy <= radius * radius ? { point: { ...p1 }, t: 0 } : null;
  }

  const c = fx * fx + fy * fy - radius * radius;
  if (c <= 0) return { point: { ...p1 }, t: 0 };

  const b = 2 * (fx * dx + fy * dy);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;

  const sqrt = Math.sqrt(discriminant);
  const t1 = (-b - sqrt) / (2 * a);
  const t2 = (-b + sqrt) / (2 * a);
  const t = [t1, t2].filter((candidate) => candidate >= 0 && candidate <= 1).sort((x, y) => x - y)[0];
  if (t === undefined) return null;
  return { point: { x: p1.x + dx * t, y: p1.y + dy * t }, t };
}

/** Applies every crossed cloud in travel order. A full-strength veil leaves
 * zero transmitted light, while the generic math still supports softer
 * clouds for future levels. */
export function traceNebulaAbsorption(
  p1: Point,
  p2: Point,
  initialIntensity: number,
  circles: NebulaCircle[]
): NebulaTraceResult {
  let transmittedIntensity = Math.max(0, initialIntensity);
  const crossings = circles
    .map((circle) => ({ circle, entry: segmentCircleEntry(p1, p2, circle.center, circle.radius) }))
    .filter((crossing): crossing is { circle: NebulaCircle; entry: { point: Point; t: number } } => crossing.entry !== null)
    .sort((a, b) => a.entry.t - b.entry.t);

  const hits: NebulaHit[] = [];
  for (const { circle, entry } of crossings) {
    if (transmittedIntensity <= 0) break;
    const absorbedIntensity = transmittedIntensity * circle.attenuation;
    transmittedIntensity -= absorbedIntensity;
    hits.push({ id: circle.id, point: entry.point, t: entry.t, absorbedIntensity });
  }

  return { transmittedIntensity, hits };
}
