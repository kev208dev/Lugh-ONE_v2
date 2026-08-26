import type { Point } from './Ray';

/** Tunable physics constants — deliberately NOT hardcoded inline anywhere
 * else, so the coordinator (or a future difficulty/config screen) can
 * adjust the feel without touching the math. */
export interface BlackHoleConfig {
  /** px, in the same local coordinate space as the ray — closest-approach
   * distances at or below this are absorbed instead of deflected. */
  eventHorizonRadius: number;
  /** coefficient controlling how strongly distance affects the bend angle
   * (see deflectRay's doc comment for the exact formula it plugs into). */
  deflectionStrength: number;
  /** radians — hard cap on the bend angle so a very close (but still
   * outside the event horizon) pass can't fold the ray back on itself in a
   * physically silly way. */
  maxDeflectionRad: number;
}

export const DEFAULT_BLACK_HOLE_CONFIG: BlackHoleConfig = {
  eventHorizonRadius: 26,
  deflectionStrength: 6000,
  maxDeflectionRad: Math.PI * 0.45
};

export interface DeflectionResult {
  /** true if the ray's closest approach fell at/inside eventHorizonRadius —
   * it was absorbed, there is no outgoing ray. */
  absorbed: boolean;
  /** the point on the ray's path closest to the black hole's center
   * (always populated, even when absorbed — useful for debug rendering of
   * exactly where the ray "disappeared"). */
  deflectionPoint: Point;
  /** the perpendicular distance from that closest-approach point to the
   * center — always populated. */
  closestDistance: number;
  /** the outgoing (post-bend) unit direction, or null if absorbed. */
  outgoingDirection: Point | null;
  /** the bend angle actually applied, in radians (0 if the ray passed so
   * far away the formula rounds to ~0) — null if absorbed. Useful for a
   * debug HUD readout ("deflected 12.3°"). */
  deflectionAngleRad: number | null;
}

// --- local 2D vector helpers -------------------------------------------------

function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale(a: Point, s: number): Point {
  return { x: a.x * s, y: a.y * s };
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

function length(a: Point): number {
  return Math.sqrt(a.x * a.x + a.y * a.y);
}

function normalize(a: Point): Point {
  const len = length(a);
  if (len === 0) return { x: 0, y: 0 };
  return { x: a.x / len, y: a.y / len };
}

/**
 * Computes how the black hole affects an incoming ray (origin + direction,
 * direction need not be pre-normalized), given the hole's center point (in
 * the SAME local coordinate space) and a config.
 *
 * This is a single-kink approximation of gravitational lensing (NOT real
 * general relativity — see project spec): the ray travels in a straight
 * line until its closest-approach point to the black hole's center, then
 * gets "kinked" toward the hole by a bend angle that falls off with the
 * inverse square of the closest-approach distance, capped at
 * `config.maxDeflectionRad`. Below `config.eventHorizonRadius` the ray is
 * absorbed entirely instead of being bent.
 *
 * Chosen specifically to avoid needing any sign-ambiguous rotation-direction
 * logic: the bend is always performed geometrically toward `center`, using
 * the (already correctly-signed) vector from the closest-approach point to
 * the center, rather than picking a rotation sign from a cross product.
 */
export function deflectRay(
  origin: Point,
  direction: Point,
  center: Point,
  config: BlackHoleConfig = DEFAULT_BLACK_HOLE_CONFIG
): DeflectionResult {
  const d0 = normalize(direction);

  // Closest-approach point of the ray (a forward ray, t >= 0 only — a
  // black hole "behind" the ray's origin doesn't affect it) to `center`.
  const toCenter = sub(center, origin);
  const t = Math.max(0, dot(toCenter, d0));
  const closestPoint = add(origin, scale(d0, t));
  const closestDistance = length(sub(center, closestPoint));

  if (closestDistance <= config.eventHorizonRadius) {
    return {
      absorbed: true,
      deflectionPoint: closestPoint,
      closestDistance,
      outgoingDirection: null,
      deflectionAngleRad: null
    };
  }

  // Bend angle: inverse-square falloff with distance, capped. Always >= 0
  // (magnitude only — direction of the bend is handled geometrically
  // below, not by the sign of this angle).
  const rawAngle = config.deflectionStrength / (closestDistance * closestDistance);
  const theta = Math.min(config.maxDeflectionRad, rawAngle);

  // `perp` is, BY CONSTRUCTION, perpendicular to d0 (closestPoint is
  // defined as the point on the ray's line nearest to `center`, which is
  // exactly the property that makes (center - closestPoint) perpendicular
  // to the ray's direction) AND already points from the ray straight at
  // the black hole. Rotating d0 toward `perp` by angle theta therefore
  // bends the ray toward the black hole with NO sign ambiguity to resolve
  // — this sidesteps the usual cross-product-sign-picking approach entirely.
  const perp = normalize(sub(center, closestPoint));
  const outgoingDirection =
    closestDistance > 0
      ? normalize(add(scale(d0, Math.cos(theta)), scale(perp, Math.sin(theta))))
      : d0; // degenerate: ray passes exactly through center (already inside horizon in practice, but guard anyway)

  return {
    absorbed: false,
    deflectionPoint: closestPoint,
    closestDistance,
    outgoingDirection,
    deflectionAngleRad: theta
  };
}
