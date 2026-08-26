import type { WindowGeometry } from '../runtime/types';
import { bootstrapDevicePage } from './deviceBootstrap';
import { LightRenderer } from '../rendering/LightRenderer';
import { centerGlobal, windowRectGlobal, globalToLocal } from '../runtime/globalCoords';
import { clipSegmentToRect } from '../optics/Ray';
import { PrismRenderer, computePrismVertices } from '../devices/Prism';
import { tracePrismSpectrum } from '../optics/PrismPhysics';
import { sampleWavelengths } from '../optics/Spectrum';
import { SpectrumRenderer } from '../rendering/SpectrumRenderer';
import { buildSpectrumFan } from '../rendering/spectrumGeometry';

// ---------------------------------------------------------------------------
// IMPORTANT ORDERING NOTE: bootstrapDevicePage() (called further below) starts
// this window's GeometryTracker, which invokes its onSelfUpdate callback
// SYNCHRONOUSLY as part of that very call (GeometryTracker.start() emits one
// geometry immediately). That callback calls runPhysicsAndReportTiming() and
// render(), so every `const`/`let` those functions close over — canvases,
// renderers, the physics-hud element, angleDeg — MUST be initialized above
// the bootstrapDevicePage() call. Getting this backwards previously caused an
// uncaught "Cannot access '...' before initialization" ReferenceError that
// aborted the rest of this module's top-level script (so the sun geometry
// subscription and all rotation input listeners silently never registered).
// ---------------------------------------------------------------------------

const canvas = document.getElementById('ray-canvas') as HTMLCanvasElement;
const renderer = new LightRenderer(canvas);

const prismCanvas = document.getElementById('prism-canvas') as HTMLCanvasElement;
const prismRenderer = new PrismRenderer(prismCanvas);
const physicsHud = document.getElementById('physics-hud') as HTMLPreElement | null;

// PHASE 4: continuous rainbow-gradient spectrum fan, drawn on its own layer
// between the incoming white ray (bottom) and the prism outline (top).
const spectrumCanvas = document.getElementById('spectrum-canvas') as HTMLCanvasElement;
const spectrumRenderer = new SpectrumRenderer(spectrumCanvas);

let selfGeometry: WindowGeometry | undefined;
let otherGeometry: WindowGeometry | undefined; // sun
let angleDeg = 0;

function render(): void {
  if (!selfGeometry || !otherGeometry) {
    renderer.clear();
    return;
  }

  const sunGeometry = otherGeometry;
  const prismGeometry = selfGeometry;
  const p1 = centerGlobal(sunGeometry);
  const p2 = centerGlobal(prismGeometry);
  const myRect = windowRectGlobal(selfGeometry);
  const clipped = clipSegmentToRect(p1, p2, myRect);

  if (!clipped) {
    renderer.clear();
    return;
  }

  const local1 = globalToLocal(clipped[0], selfGeometry);
  const local2 = globalToLocal(clipped[1], selfGeometry);
  renderer.drawSegment(local1, local2);
}

// ---------------------------------------------------------------------------
// PHASE 3: real optical physics computation, wired in purely to verify
// performance while the user rotates the prism. No new visuals are drawn
// here — only a small timing readout in the #physics-hud debug element.
// ---------------------------------------------------------------------------

/**
 * Traces the full spectrum through the prism (using the SAME vertex geometry
 * as what's currently drawn) and reports how long it took into #physics-hud.
 * Purely a performance probe for this phase — the resulting rays aren't used
 * for anything else yet (that's Phase 4+).
 */
function runPhysicsAndReportTiming(): void {
  if (!physicsHud) return;

  if (!otherGeometry || !selfGeometry) {
    physicsHud.textContent = 'physics: waiting for geometry…';
    spectrumRenderer.clear();
    return;
  }

  try {
    const originLocal = globalToLocal(centerGlobal(otherGeometry), selfGeometry);
    const targetLocal = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const dir = { x: targetLocal.x - originLocal.x, y: targetLocal.y - originLocal.y };

    const vertices = computePrismVertices(window.innerWidth, window.innerHeight, angleDeg);

    const t0 = performance.now();
    const rays = tracePrismSpectrum(originLocal, dir, { vertices });
    const elapsedMs = performance.now() - t0;

    const total = sampleWavelengths().length;
    physicsHud.textContent = `physics: ${elapsedMs.toFixed(2)}ms  rays: ${rays.length}/${total}`;

    spectrumRenderer.drawFan(buildSpectrumFan(rays));
  } catch (err) {
    // Surface the failure directly in the HUD so it's visible without
    // opening devtools — this readout is a debug/verification aid.
    physicsHud.textContent = `physics: ERROR — ${String(err)}`;
    spectrumRenderer.clear();
    console.error('[prism physics]', err);
  }
}

// ---------------------------------------------------------------------------
// PHASE 2: rotating triangular prism, driven by pointer-drag or mouse wheel.
//
// Principle: the local visual rotation must feel instant/60fps and must
// NEVER wait on a round-trip through the message bus. Input goes straight to
// local rendering (synchronous drawPrism call in the event handler). The bus
// is only used to tell the rest of the system the LATEST angle, coalesced to
// at most ~28Hz while actively rotating, plus exactly one immediate send the
// moment the interaction ends (pointerup/pointercancel, or wheel-idle).
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

// ---------------------------------------------------------------------------
// Now that every local dependency is initialized, it's safe to start the
// GeometryTracker (via bootstrapDevicePage) and the bus subscription — their
// callbacks can run synchronously/asynchronously at any point from here on.
// ---------------------------------------------------------------------------

const { bus } = bootstrapDevicePage('prism', {
  onSelfUpdate: (g) => {
    selfGeometry = g;
    render();
    runPhysicsAndReportTiming();
  }
});

bus.subscribe((msg) => {
  if (msg.type === 'geometry-update' && msg.geometry.id === 'sun') {
    otherGeometry = msg.geometry;
    render();
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
