import type { DeviceId, NebulaDeviceId } from '../runtime/types';

// ---------------------------------------------------------------------------
// Shared puzzle/level contracts. This file is the single source of truth for
// the puzzle system's data shapes — src/puzzle/* (state machine + goal
// evaluator) and src/level/levels/* (the actual 5 level definitions) both
// implement against these types so neither side has to guess the other's
// shape.
// ---------------------------------------------------------------------------

export type PuzzleState = 'INTRO' | 'PLAYING' | 'STABILIZING' | 'SOLVED' | 'TRANSITIONING';

export type ReceiverId = 'earth' | 'mars';

export interface ReceiverRequirement {
  receiverId: ReceiverId;
  /** 0-100. Receiver power must be at/above this. */
  minPower: number;
  /** 0-100, optional. When set, power must also stay AT OR BELOW this
   * (overexposure ceiling) — see LEVEL03+ "don't overheat one side". */
  maxPower?: number;
  spectralRange?: {
    minNm: number;
    maxNm: number;
    /** 0-100, optional minimum fraction of this receiver's power that must
     * come from wavelengths inside [minNm, maxNm]. */
    minContribution?: number;
  };
}

export interface LevelGoal {
  receivers: ReceiverRequirement[];
  /** true = every requirement must hold at the SAME instant (this is the
   * only mode the initial 5 levels use — kept as an explicit flag rather
   * than always-true so a future non-simultaneous goal type has somewhere
   * to hang without a breaking change). */
  simultaneous: boolean;
  /** how long ALL requirements must hold continuously before SOLVED. */
  holdDurationMs: number;
  /** optional aggregate efficiency floor, checked alongside the per-receiver
   * requirements (not yet used by the initial 5 levels; reserved for a
   * later "don't just barely pass" level). */
  minimumEfficiency?: number;
}

/** The sun's fixed position for a level. Percentage of the work area, same
 * convention as DeviceLayout in runtime/screenLayout.ts. */
export interface FixedSourceConfig {
  xPct: number;
  yPct: number;
}

export interface ReceiverConfig {
  id: ReceiverId;
  xPct: number;
  yPct: number;
}

/** A circular attenuation zone in work-area-percentage space. Any ray
 * segment passing through it loses `attenuation` fraction of intensity —
 * evaluated as a pure geometric+intensity concern inside PRISM's existing
 * power calculation, no new physics module needed. */
export interface NebulaConfig {
  id: NebulaDeviceId;
  xPct: number;
  yPct: number;
  /** Fixed popup size in CSS pixels. The visible cloud and collision circle
   * both scale from the popup's actual inner dimensions. */
  sizePx: number;
  /** 0..1 — fraction of intensity REMOVED for a ray crossing this zone. */
  attenuation: number;
}

export interface DevicePlacement {
  id: DeviceId;
  xPct: number;
  yPct: number;
}

export interface LevelDefinition {
  id: string;
  index: number;
  name: string;
  description?: string;
  /** Movable optical instruments open for this level (e.g. ['prism'] or
   * ['prism', 'mirror']). 'sun' and every id in `receivers` are opened
   * automatically in addition to this list — don't repeat them here. */
  requiredDevices: DeviceId[];
  sun: FixedSourceConfig;
  receivers: ReceiverConfig[];
  nebulae?: NebulaConfig[];
  goal: LevelGoal;
  initialDevicePlacement: DevicePlacement[];
  introHint?: string;
}

// ---------------------------------------------------------------------------
// Chain routing: which upstream device a bending instrument (mirror,
// blackhole, prism) listens to depends on which OTHER instruments are
// present in the current level — e.g. prism listens directly to sun when
// neither mirror nor blackhole is in play. CANON_CHAIN_ORDER is the fixed
// physical ordering (sun is always first, prism is always last); a level's
// "active chain" is this order filtered down to whichever devices it
// actually opens. Kept here (not duplicated per page) since both the
// runtime device pages AND WindowManager need the exact same answer.
// ---------------------------------------------------------------------------

export const CANON_CHAIN_ORDER: DeviceId[] = ['sun', 'mirror', 'blackhole', 'prism'];

/** Every device this level opens: sun + its instruments + its receivers,
 * deduplicated, in no particular order. */
export function devicesForLevel(level: LevelDefinition): DeviceId[] {
  const set = new Set<DeviceId>([
    'sun',
    ...level.requiredDevices,
    ...level.receivers.map((r) => r.id),
    ...(level.nebulae?.map((nebula) => nebula.id) ?? [])
  ]);
  return Array.from(set);
}

/**
 * Resolves which device `id` (must be 'mirror', 'blackhole', or 'prism')
 * should treat as its upstream light source for this level: the nearest
 * device before it in CANON_CHAIN_ORDER that this level actually opens.
 * 'sun' is always present, so this always resolves to something (never
 * undefined) for a valid chain-order id.
 */
export function resolveUpstream(id: DeviceId, level: LevelDefinition): DeviceId {
  const active = new Set(devicesForLevel(level));
  const myIndex = CANON_CHAIN_ORDER.indexOf(id);
  for (let i = myIndex - 1; i >= 0; i--) {
    const candidate = CANON_CHAIN_ORDER[i];
    if (active.has(candidate)) return candidate;
  }
  return 'sun';
}
