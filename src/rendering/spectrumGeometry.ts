import type { Point } from '../optics/Ray';
import type { SpectralRay } from '../optics/PrismPhysics';
import { wavelengthToRgb } from '../optics/Spectrum';

export interface GradientStop {
  offset: number; // 0..1, monotonically non-decreasing across the returned array
  color: string; // css color string, e.g. "rgb(255,0,0)"
}

export interface SpectrumFan {
  apex: Point;
  startAngle: number; // radians, atan2 convention — angle of the SHORTEST wavelength present
  endAngle: number; // radians — angle of the LONGEST wavelength present, chosen so that
  // sweeping from startAngle to endAngle by the SHORT way (see below)
  // passes through every intermediate wavelength's angle in order
  stops: GradientStop[];
}

/**
 * Wraps `toAngle - fromAngle` into (-π, π], i.e. the short angular delta
 * from `fromAngle` to `toAngle`.
 */
function wrapDelta(fromAngle: number, toAngle: number): number {
  let d = toAngle - fromAngle;
  while (d <= -Math.PI) d += 2 * Math.PI;
  while (d > Math.PI) d -= 2 * Math.PI;
  return d; // always in (-π, π]
}

/**
 * Builds the data needed to render a continuous spectrum fan from raw
 * per-wavelength ray-trace results (already sorted ascending by wavelength
 * by the caller — tracePrismSpectrum's contract guarantees this).
 * Returns null if fewer than 2 rays are present (can't form a fan/gradient).
 */
export function buildSpectrumFan(rays: SpectralRay[]): SpectrumFan | null {
  if (rays.length < 2) return null;

  // apex: mean of all exitPoints.
  let sumX = 0;
  let sumY = 0;
  for (const ray of rays) {
    sumX += ray.exitPoint.x;
    sumY += ray.exitPoint.y;
  }
  const apex: Point = { x: sumX / rays.length, y: sumY / rays.length };

  const startAngle = Math.atan2(rays[0].exitDirection.y, rays[0].exitDirection.x);

  const lastIndex = rays.length - 1;
  const rawAngles: number[] = rays.map((r) => Math.atan2(r.exitDirection.y, r.exitDirection.x));
  const deltas: number[] = rawAngles.map((raw) => wrapDelta(startAngle, raw));

  const deltaLast = deltas[lastIndex];
  if (deltaLast === 0) {
    // Degenerate: all rays effectively at the same angle — can't build a
    // meaningful gradient sweep.
    return null;
  }

  const endAngle = startAngle + deltaLast;

  const stops: GradientStop[] = rays.map((ray, i) => {
    let offset = deltas[i] / deltaLast;
    if (offset < 0) offset = 0;
    if (offset > 1) offset = 1;
    const { r, g, b } = wavelengthToRgb(ray.wavelengthNm);
    return { offset, color: `rgb(${r},${g},${b})` };
  });

  return { apex, startAngle, endAngle, stops };
}
