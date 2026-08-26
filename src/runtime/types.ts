// Shared contract for PHASE 0. Both WindowManager (runtime/window) and
// GeometryTracker/MessageBus (runtime/geometry+bus) implement against this
// file. Do not change shapes here without updating both sides.

export type DeviceId = 'world' | 'sun' | 'prism' | 'earth' | 'mars';

export const DEVICE_IDS: DeviceId[] = ['world', 'sun', 'prism', 'earth', 'mars'];

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
  | { type: 'level-state'; earthPercent: number; marsPercent: number; complete: boolean };

export interface MessageBus {
  send(msg: BusMessage): void;
  subscribe(handler: (msg: BusMessage) => void): () => void;
  close(): void;
}

/** Channel name is scoped per-session so retries never cross-talk with a stale channel. */
export function channelNameFor(sessionId: string): string {
  return `lugh-v2-bus-${sessionId}`;
}
