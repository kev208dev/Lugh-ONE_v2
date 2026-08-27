// Shared contract for PHASE 0. Both WindowManager (runtime/window) and
// GeometryTracker/MessageBus (runtime/geometry+bus) implement against this
// file. Do not change shapes here without updating both sides.

import type { Point } from '../optics/Ray';

export type CoreDeviceId = 'sun' | 'prism' | 'earth' | 'mars' | 'mirror' | 'blackhole';
export type NebulaDeviceId = `nebula-${number}`;
export type DeviceId = CoreDeviceId | NebulaDeviceId;

export const DEVICE_IDS: CoreDeviceId[] = ['sun', 'mirror', 'blackhole', 'prism', 'earth', 'mars'];

export function isNebulaDeviceId(id: DeviceId): id is NebulaDeviceId {
  return id.startsWith('nebula-');
}

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

export interface SpectralBeamBand {
  wavelengthNm: number;
  originGlobal: Point;
  directionGlobal: Point;
  color: string;
  /** Physical intensity after path attenuation, before receiver-specific
   * sensitivity is applied. */
  intensity: number;
}

/** Real exit rays (from PRISM's spectrum trace) that land inside one
 * receiver's window. The average fields remain useful as a compact fallback;
 * `bands` preserves the actual rainbow. */
export interface ReceiverBeam {
  originGlobal: Point;
  directionGlobal: Point;
  /** css color string, e.g. "rgb(120,200,255)" — intensity-weighted blend
   * of the contributing wavelengths' true spectral colors. */
  color: string;
  bands: SpectralBeamBand[];
}

export type BusMessage =
  | { type: 'hello'; id: DeviceId; sessionId: string; launchId: string }
  | { type: 'bye'; id: DeviceId; sessionId: string; launchId: string }
  | {
      type: 'experiment-abort';
      id: DeviceId;
      launchId: string;
      reason: 'fullscreen' | 'oversized-window';
    }
  | { type: 'geometry-update'; geometry: WindowGeometry }
  /** Coalesced PRISM rotation: at most ~20-30Hz while actively rotating, plus
   * one immediate send the moment interaction ends. Never sent per-pointer-event. */
  | { type: 'prism-rotation'; angleDeg: number; timestamp: number }
  /** Broadcast by PRISM (the authoritative receiver-power/level calculator —
   * it's the last device before EARTH/MARS and already has the dispersed
   * spectrum) whenever it recomputes. `apexGlobal` is where the spectrum
   * fan exits the prism, in global coordinates. `earthBeam`/`marsBeam` are
   * the actual per-wavelength rays that physically land in that receiver's
   * window — `null` when none do — so EARTH/MARS can continue the exact
   * rainbow geometry and colors emitted by PRISM. */
  | {
      type: 'level-state';
      earthPercent: number;
      marsPercent: number;
      complete: boolean;
      apexGlobal: Point;
      earthBeam: ReceiverBeam | null;
      marsBeam: ReceiverBeam | null;
    }
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
  | {
      type: 'ray-state';
      from: DeviceId;
      originGlobal: Point;
      directionGlobal: Point;
      absorbed: boolean;
      /** Optional sampled global path. BLACKHOLE uses this so the exact
       * gravitational curve continues seamlessly through the PRISM popup. */
      pathGlobal?: Point[];
    }
  /** A light-producing page reports how much energy a fixed nebula obstacle
   * absorbed. Each nebula combines reports by source so an idle source does
   * not erase a simultaneous hit from another stage of the optical chain. */
  | { type: 'nebula-state'; id: NebulaDeviceId; source: DeviceId; intensity: number; color: string }
  /** Broadcast by PRISM alongside 'level-state', ONLY when a puzzle level is
   * active (see level/session.ts) — carries the puzzle state machine's
   * current state and per-receiver pass/fail so EARTH/MARS (ring visuals)
   * and any level-level UI can react without duplicating the goal-evaluation
   * logic themselves. `perReceiver`/`satisfied` mirror
   * puzzle/GoalEvaluator.ts's GoalEvaluation shape directly. */
  | {
      type: 'puzzle-state';
      /** Identifies the popup's experiment so a closing window cannot
       * accidentally solve the experiment that is launching next. */
      levelId: string;
      state: 'INTRO' | 'PLAYING' | 'STABILIZING' | 'SOLVED' | 'TRANSITIONING';
      holdProgress: number;
      satisfied: boolean;
      perReceiver: Array<{ receiverId: 'earth' | 'mars'; currentPower: number; pass: boolean }>;
    }
  /** Broadcast by ANY window on 'r'/'R' (see deviceBootstrap.ts) — every
   * device that owns mutable state (MIRROR/PRISM's rotation, PRISM's puzzle
   * state machine) resets itself back to its level's initial configuration.
   * No payload: a reset always means "this session's current level, from
   * scratch," never a cross-level jump. */
  | { type: 'reset-level' };

export interface MessageBus {
  send(msg: BusMessage): void;
  subscribe(handler: (msg: BusMessage) => void): () => void;
  close(): void;
}

/** Channel name is scoped per-session so retries never cross-talk with a stale channel. */
export function channelNameFor(sessionId: string): string {
  return `lugh-v2-bus-${sessionId}`;
}
