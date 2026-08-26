// Shared contract for PHASE 0. Both WindowManager (runtime/window) and
// GeometryTracker/MessageBus (runtime/geometry+bus) implement against this
// file. Do not change shapes here without updating both sides.

import type { Point } from '../optics/Ray';

export type DeviceId = 'world' | 'sun' | 'prism' | 'earth' | 'mars' | 'mirror' | 'blackhole';

export const DEVICE_IDS: DeviceId[] = ['world', 'sun', 'mirror', 'blackhole', 'prism', 'earth', 'mars'];

/** Stable per-device popup name (also the BroadcastChannel scoping key input). */
export function popupNameFor(id: DeviceId): string {
  return `lugh-v2-${id}`;
}

export interface WorkArea {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Percentage-based target layout for a device popup, relative to WorkArea. */
export interface DeviceLayout {
  id: DeviceId;
  /** center point, 0..1 */
  xPct: number;
  yPct: number;
  width: number;
  height: number;
}

export interface WindowGeometry {
  id: DeviceId;
  screenX: number;
  screenY: number;
  outerWidth: number;
  outerHeight: number;
  innerWidth: number;
  innerHeight: number;
  /** approximate browser chrome inset, derived from outer/inner deltas */
  chromeInsetTop: number;
  chromeInsetLeft: number;
  timestamp: number;
}

export type BusMessage =
  | { type: 'hello'; id: DeviceId; sessionId: string }
  | { type: 'bye'; id: DeviceId; sessionId: string }
  | { type: 'geometry-update'; geometry: WindowGeometry }
  /** Coalesced PRISM rotation: at most ~20-30Hz while actively rotating, plus
   * one immediate send the moment interaction ends. Never sent per-pointer-event. */
  | { type: 'prism-rotation'; angleDeg: number; timestamp: number }
  /** Broadcast by WORLD (the authoritative receiver-power/level calculator)
   * whenever it recomputes, driven by the same geometry/rotation events. */
  | { type: 'level-state'; earthPercent: number; marsPercent: number; complete: boolean }
  /** Coalesced MIRROR rotation — mirrors prism-rotation's throttling contract
   * exactly (max ~20-30Hz while actively rotating, plus one immediate send
   * the moment interaction ends). */
  | { type: 'mirror-rotation'; angleDeg: number; timestamp: number }
  /** Broadcast by a ray-bending device (MIRROR, BLACKHOLE) once it has
   * computed its outgoing ray, in GLOBAL screen coordinates, so any other
   * window can render the continuation by clipping this same segment
   * against its own rect (the same technique the SUN->PRISM ray already
   * uses). `absorbed: true` means the ray terminated at this device (e.g. a
   * black hole's event horizon) and there is no continuation to draw. */
  | { type: 'ray-state'; from: DeviceId; originGlobal: Point; directionGlobal: Point; absorbed: boolean };

export interface MessageBus {
  send(msg: BusMessage): void;
  subscribe(handler: (msg: BusMessage) => void): () => void;
  close(): void;
}

/** Channel name is scoped per-session so retries never cross-talk with a stale channel. */
export function channelNameFor(sessionId: string): string {
  return `lugh-v2-bus-${sessionId}`;
}
