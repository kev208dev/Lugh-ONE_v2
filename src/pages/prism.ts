import type { ReceiverBeam, SpectralBeamBand, WindowGeometry } from '../runtime/types';
import { createMessageBus } from '../runtime/MessageBus';
import { bootstrapDevicePage } from './deviceBootstrap';
import { LightRenderer } from '../rendering/LightRenderer';
import { windowRectGlobal, globalToLocal, localToGlobal } from '../runtime/globalCoords';
import { clipSegmentToRect, segmentIntersectsCircle, type Point } from '../optics/Ray';
import { computeWorkArea } from '../runtime/screenLayout';
import { PrismRenderer, computePrismVertices } from '../devices/Prism';
import { tracePrismInteraction, type SpectralRay } from '../optics/PrismPhysics';
import { sampleWavelengths, wavelengthToRgb } from '../optics/Spectrum';
import { SpectrumRenderer } from '../rendering/SpectrumRenderer';
import { buildSpectrumFan } from '../rendering/spectrumGeometry';
import { receiverResponse, receiverMaxResponseSum, type ReceiverId } from '../optics/Receiver';
import { LevelTracker } from '../level/level01';
import { straightRayFromSun } from '../optics/upstream';
import { currentLevel } from '../level/session';
import { resolveUpstream } from '../level/types';
import { evaluateGoal } from '../puzzle/GoalEvaluator';
import { PuzzleStateMachine } from '../puzzle/PuzzleStateMachine';

// See src/pages/blackhole.ts's identical comment: a level that skips
// straight from SUN (no MIRROR or BLACKHOLE) routes PRISM directly to SUN's
// geometry instead of listening for a 'ray-state' broadcast. No level param
// falls back to the ORIGINAL fixed blackhole->prism chain.
const level = currentLevel();
const upstreamId = level ? resolveUpstream('prism', level) : 'blackhole';

/** Level05-style attenuation zones, converted from the level's percentage-
 * of-work-area authoring space into global pixel circles once at startup
 * (the work area doesn't change mid-session — same one-shot assumption
 * WindowManager already makes when laying out popups). Empty for any level
 * without nebulae, or when opened outside the level flow entirely. */
let nebulaCirclesGlobal: Array<{ center: Point; radiusPx: number; attenuation: number }> = [];
if (level?.nebulae?.length) {
  void computeWorkArea().then((workArea) => {
    const scale = Math.min(workArea.width, workArea.height);
    nebulaCirclesGlobal = level.nebulae!.map((n) => ({
      center: { x: workArea.left + n.xPct * workArea.width, y: workArea.top + n.yPct * workArea.height },
      radiusPx: n.radiusPct * scale,
      attenuation: n.attenuation
    }));
    runPhysicsAndReportTiming();
  });
}

/** 1 for a ray whose exit segment doesn't cross any nebula zone; otherwise
 * the product of (1 - attenuation) for every zone it does cross. */
function nebulaAttenuationFactor(p1: Point, p2: Point): number {
  let factor = 1;
  for (const zone of nebulaCirclesGlobal) {
    if (segmentIntersectsCircle(p1, p2, zone.center, zone.radiusPx)) {
      factor *= 1 - zone.attenuation;
    }
  }
  return factor;
}

// ---------------------------------------------------------------------------
// IMPORTANT ORDERING NOTE: bootstrapDevicePage() (called further below)
// synchronously fires onSelfUpdate as part of starting this window's
// GeometryTracker — every const/let that path touches (canvases, renderers,
// physicsHud, angleDeg, bus) must be initialized above it. This page also
// creates its OWN MessageBus directly (rather than destructuring the one
// bootstrapDevicePage() returns) because it now broadcasts 'level-state'
// from inside that synchronously-reachable path — see src/pages/mirror.ts's
// identical comment for the TDZ ReferenceError this avoids.
// ---------------------------------------------------------------------------

const sessionId = new URLSearchParams(location.search).get('session') ?? 'lugh-v2-default-session';
const bus = createMessageBus(sessionId);

const canvas = document.getElementById('ray-canvas') as HTMLCanvasElement;
const renderer = new LightRenderer(canvas);

const prismCanvas = document.getElementById('prism-canvas') as HTMLCanvasElement;
const prismRenderer = new PrismRenderer(prismCanvas);
const physicsHud = document.getElementById('physics-hud') as HTMLPreElement | null;

const spectrumCanvas = document.getElementById('spectrum-canvas') as HTMLCanvasElement;
const spectrumRenderer = new SpectrumRenderer(spectrumCanvas);

let selfGeometry: WindowGeometry | undefined;
let angleDeg = 0;

// PRISM is now the authoritative receiver/level calculator (it's the last
// device before EARTH/MARS and already has the dispersed spectrum, so
// there's no need for a separate WORLD window). Tracks EARTH/MARS's own
// broadcast geometry, same as every device already does for itself.
const receiverGeometry: Partial<Record<'earth' | 'mars', WindowGeometry>> = {};
const levelTracker = new LevelTracker();
const puzzleStateMachine = level ? new PuzzleStateMachine(level.goal.holdDurationMs) : null;
let stabilizationTimer: ReturnType<typeof setTimeout> | undefined;

const RAY_TEST_DISTANCE = 1_000_000;

interface ReceiverResult {
  power: number;
  /** Intensity-weighted origin/direction/color of only the rays that
   * actually land in this receiver's window — the REAL exit geometry, not
   * an approximation — or null if none do. */
  beam: ReceiverBeam | null;
}

function powerAtReceiver(rays: SpectralRay[], receiverId: ReceiverId, geometry: WindowGeometry | undefined): ReceiverResult {
  if (!geometry || !selfGeometry) return { power: 0, beam: null };
  const rect = windowRectGlobal(geometry);
  let power = 0;
  let originSumX = 0;
  let originSumY = 0;
  let dirSumX = 0;
  let dirSumY = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let weightSum = 0;
  const bands: SpectralBeamBand[] = [];

  for (const ray of rays) {
    const p1 = localToGlobal(ray.exitPoint, selfGeometry);
    const p2 = { x: p1.x + ray.exitDirection.x * RAY_TEST_DISTANCE, y: p1.y + ray.exitDirection.y * RAY_TEST_DISTANCE };
    const clipped = clipSegmentToRect(p1, p2, rect);
    if (!clipped) continue;

    // Nebula attenuation is evaluated over the visible segment from where
    // the ray leaves the prism to where it actually enters the receiver's
    // window (not the full 1,000,000px test ray) — a zone the beam passes
    // through anywhere along that real path dims it.
    const attenuation = nebulaAttenuationFactor(p1, clipped[0]);
    const physicalIntensity = ray.intensity * attenuation;
    if (physicalIntensity <= 0) continue;

    const { r, g, b } = wavelengthToRgb(ray.wavelengthNm);
    const color = `rgb(${r},${g},${b})`;
    bands.push({
      wavelengthNm: ray.wavelengthNm,
      originGlobal: p1,
      directionGlobal: ray.exitDirection,
      color,
      intensity: physicalIntensity
    });

    power += physicalIntensity * receiverResponse(receiverId, ray.wavelengthNm);

    originSumX += p1.x * physicalIntensity;
    originSumY += p1.y * physicalIntensity;
    dirSumX += ray.exitDirection.x * physicalIntensity;
    dirSumY += ray.exitDirection.y * physicalIntensity;
    rSum += r * physicalIntensity;
    gSum += g * physicalIntensity;
    bSum += b * physicalIntensity;
    weightSum += physicalIntensity;
  }

  if (weightSum <= 0 || bands.length === 0) return { power, beam: null };

  const dirLen = Math.hypot(dirSumX, dirSumY) || 1;
  const beam: ReceiverBeam = {
    originGlobal: { x: originSumX / weightSum, y: originSumY / weightSum },
    directionGlobal: { x: dirSumX / dirLen, y: dirSumY / dirLen },
    color: `rgb(${Math.round(rSum / weightSum)},${Math.round(gSum / weightSum)},${Math.round(bSum / weightSum)})`,
    bands
  };
  return { power, beam };
}

// PRISM is a real link in the SUN -> [MIRROR] -> [BLACKHOLE] -> PRISM chain
// (bracketed stages are optional per-level, see resolveUpstream): its
// incoming ray is whatever `upstreamId` most recently broadcast, or a
// straight line synthesized from SUN's geometry when upstreamId is 'sun'.
// `undefined` = nothing heard yet; `null` = the beam was absorbed/lost
// upstream — no light reaches the prism at all in that case.
let incomingRay: { originGlobal: Point; directionGlobal: Point } | null | undefined;
/** upstreamId === 'sun' only: the raw geometry-update from SUN. */
let sunGeometry: WindowGeometry | undefined;

function recomputeFromSun(): void {
  if (upstreamId !== 'sun') return;
  incomingRay = selfGeometry && sunGeometry ? straightRayFromSun(sunGeometry, selfGeometry) : undefined;
  runPhysicsAndReportTiming();
}

/** Draws white light only up to the first glass contact. If the ray misses
 * the triangle, it remains an uninterrupted white pass-through. */
function renderIncoming(entryPointLocal: Point | null): void {
  if (!selfGeometry || !incomingRay) {
    renderer.clear();
    return;
  }

  const p1 = incomingRay.originGlobal;
  const p2 = {
    x: p1.x + incomingRay.directionGlobal.x * 1_000_000,
    y: p1.y + incomingRay.directionGlobal.y * 1_000_000
  };
  const myRect = windowRectGlobal(selfGeometry);
  const clipped = clipSegmentToRect(p1, p2, myRect);

  if (!clipped) {
    renderer.clear();
    return;
  }

  const local1 = globalToLocal(clipped[0], selfGeometry);
  const local2 = entryPointLocal ?? globalToLocal(clipped[1], selfGeometry);
  renderer.drawSegment(local1, local2);
}

// ---------------------------------------------------------------------------
// Optical physics: traces the full spectrum through the prism using the SAME
// vertex geometry as what's currently drawn, and renders the continuous
// spectrum fan. Only runs when real light (from BLACKHOLE) is arriving.
// ---------------------------------------------------------------------------

/** Broadcasts the current receiver percentages (0/0 if no light is
 * reaching the prism at all) and updates the level-complete tracker. */
function broadcastLevelState(
  earthPercent: number,
  marsPercent: number,
  apexGlobal: Point,
  earthBeam: ReceiverBeam | null,
  marsBeam: ReceiverBeam | null
): void {
  if (level && puzzleStateMachine) {
    const evaluation = evaluateGoal(level.goal, { earth: earthPercent, mars: marsPercent });
    const tick = puzzleStateMachine.update(evaluation.satisfied, performance.now());
    bus.send({
      type: 'level-state',
      earthPercent,
      marsPercent,
      complete: tick.state === 'SOLVED',
      apexGlobal,
      earthBeam,
      marsBeam
    });
    bus.send({
      type: 'puzzle-state',
      state: tick.state,
      holdProgress: tick.holdProgress,
      satisfied: evaluation.satisfied,
      perReceiver: evaluation.perReceiver.map(({ receiverId, currentPower, pass }) => ({ receiverId, currentPower, pass }))
    });

    // Geometry can be perfectly still while the goal is satisfied. Keep the
    // state machine ticking until the continuous hold reaches SOLVED.
    if (tick.state === 'STABILIZING' && stabilizationTimer === undefined) {
      stabilizationTimer = setTimeout(() => {
        stabilizationTimer = undefined;
        runPhysicsAndReportTiming();
      }, 50);
    }
    return;
  }

  const state = levelTracker.update(earthPercent, marsPercent, performance.now());
  bus.send({ type: 'level-state', earthPercent, marsPercent, complete: state.complete, apexGlobal, earthBeam, marsBeam });
}

function runPhysicsAndReportTiming(): void {
  if (!physicsHud) return;

  if (!selfGeometry || incomingRay === undefined) {
    physicsHud.textContent = `physics: waiting for ${upstreamId}…`;
    renderer.clear();
    spectrumRenderer.clear();
    if (selfGeometry) broadcastLevelState(0, 0, windowRectGlobalCenter(selfGeometry), null, null);
    return;
  }

  if (incomingRay === null) {
    physicsHud.textContent = 'physics: no incoming light';
    renderer.clear();
    spectrumRenderer.clear();
    broadcastLevelState(0, 0, windowRectGlobalCenter(selfGeometry), null, null);
    return;
  }

  try {
    const originLocal = globalToLocal(incomingRay.originGlobal, selfGeometry);
    const dir = incomingRay.directionGlobal; // direction vectors are translation-invariant

    const vertices = computePrismVertices(window.innerWidth, window.innerHeight, angleDeg);

    const t0 = performance.now();
    const trace = tracePrismInteraction(originLocal, dir, { vertices });
    const rays = trace.rays;
    const elapsedMs = performance.now() - t0;

    const total = sampleWavelengths().length;
    physicsHud.textContent = trace.entryPoint
      ? `physics: HIT · spectrum ${rays.length}/${total} · ${elapsedMs.toFixed(2)}ms`
      : `physics: MISS · white light · ${elapsedMs.toFixed(2)}ms`;

    renderIncoming(trace.entryPoint);
    spectrumRenderer.drawFan(buildSpectrumFan(rays), rays);

    const earthResult = powerAtReceiver(rays, 'earth', receiverGeometry.earth);
    const marsResult = powerAtReceiver(rays, 'mars', receiverGeometry.mars);
    const earthPercent = (100 * earthResult.power) / receiverMaxResponseSum('earth');
    const marsPercent = (100 * marsResult.power) / receiverMaxResponseSum('mars');

    let apexLocal = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    if (rays.length > 0) {
      const sum = rays.reduce((acc, r) => ({ x: acc.x + r.exitPoint.x, y: acc.y + r.exitPoint.y }), { x: 0, y: 0 });
      apexLocal = { x: sum.x / rays.length, y: sum.y / rays.length };
    }
    broadcastLevelState(earthPercent, marsPercent, localToGlobal(apexLocal, selfGeometry), earthResult.beam, marsResult.beam);
  } catch (err) {
    physicsHud.textContent = `physics: ERROR — ${String(err)}`;
    renderer.clear();
    spectrumRenderer.clear();
    console.error('[prism physics]', err);
    broadcastLevelState(0, 0, windowRectGlobalCenter(selfGeometry), null, null);
  }
}

function windowRectGlobalCenter(g: WindowGeometry): Point {
  const rect = windowRectGlobal(g);
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// ---------------------------------------------------------------------------
// PHASE 2: rotating triangular prism, driven by pointer-drag or mouse wheel.
// Local visual rotation is always instant/synchronous; the bus only carries
// a coalesced "latest angle" at ~28Hz while actively rotating, plus one
// immediate final send when the interaction ends.
// ---------------------------------------------------------------------------

const BUS_SEND_MIN_INTERVAL_MS = 35; // ~28Hz, within the 20-30Hz coalescing budget
let lastBusSendAt = 0;

function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a < 0) a += 360;
  return a;
}

function pointerAngleDeg(clientX: number, clientY: number): number {
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  return (Math.atan2(clientY - centerY, clientX - centerX) * 180) / Math.PI;
}

// Initial local draw + physics probe (safe now — everything above is ready).
prismRenderer.drawPrism(angleDeg);
runPhysicsAndReportTiming();

bootstrapDevicePage('prism', {
  onSelfUpdate: (g) => {
    selfGeometry = g;
    if (upstreamId === 'sun') {
      recomputeFromSun();
    } else {
      runPhysicsAndReportTiming();
    }
  }
});

bus.subscribe((msg) => {
  if (msg.type === 'reset-level' && puzzleStateMachine) {
    puzzleStateMachine.reset();
    runPhysicsAndReportTiming();
    return;
  }
  if (upstreamId === 'sun' && msg.type === 'geometry-update' && msg.geometry.id === 'sun') {
    sunGeometry = msg.geometry;
    recomputeFromSun();
    return;
  }
  if (upstreamId !== 'sun' && msg.type === 'ray-state' && msg.from === upstreamId) {
    incomingRay = msg.absorbed ? null : { originGlobal: msg.originGlobal, directionGlobal: msg.directionGlobal };
    runPhysicsAndReportTiming();
  } else if (msg.type === 'geometry-update' && (msg.geometry.id === 'earth' || msg.geometry.id === 'mars')) {
    receiverGeometry[msg.geometry.id] = msg.geometry;
    runPhysicsAndReportTiming();
  }
});

/** Sends the current angle over the bus, throttled to BUS_SEND_MIN_INTERVAL_MS
 * while an interaction is in progress. Call after every local redraw. */
function maybeSendCoalesced(): void {
  const now = Date.now();
  if (now - lastBusSendAt >= BUS_SEND_MIN_INTERVAL_MS) {
    lastBusSendAt = now;
    bus.send({ type: 'prism-rotation', angleDeg, timestamp: now });
  }
}

/** Always sends the current angle immediately, bypassing the throttle.
 * Call exactly once when an interaction ends, so the final value is never
 * dropped/stale even if it landed inside a throttle window. */
function sendFinal(): void {
  const now = Date.now();
  lastBusSendAt = now;
  bus.send({ type: 'prism-rotation', angleDeg, timestamp: now });
}

// --- Pointer-drag rotation ---------------------------------------------------

let isDragging = false;
let dragStartPointerAngleDeg = 0;
let dragStartAngleDeg = 0;

window.addEventListener('pointerdown', (e) => {
  isDragging = true;
  dragStartPointerAngleDeg = pointerAngleDeg(e.clientX, e.clientY);
  dragStartAngleDeg = angleDeg;
});

window.addEventListener('pointermove', (e) => {
  if (!isDragging) return;
  const currentPointerAngleDeg = pointerAngleDeg(e.clientX, e.clientY);
  const delta = currentPointerAngleDeg - dragStartPointerAngleDeg;
  angleDeg = normalizeAngle(dragStartAngleDeg + delta);

  prismRenderer.drawPrism(angleDeg);
  runPhysicsAndReportTiming();
  maybeSendCoalesced();
});

function endDrag(): void {
  if (!isDragging) return;
  isDragging = false;
  sendFinal();
}

window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

// --- Wheel rotation -----------------------------------------------------

let wheelIdleTimer: ReturnType<typeof setTimeout> | undefined;

window.addEventListener(
  'wheel',
  (e) => {
    angleDeg = normalizeAngle(angleDeg + e.deltaY * 0.2);

    prismRenderer.drawPrism(angleDeg);
    runPhysicsAndReportTiming();
    maybeSendCoalesced();

    if (wheelIdleTimer !== undefined) clearTimeout(wheelIdleTimer);
    wheelIdleTimer = setTimeout(() => {
      wheelIdleTimer = undefined;
      sendFinal();
    }, 150);
  },
  { passive: true }
);
