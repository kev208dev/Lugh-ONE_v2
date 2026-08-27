import { isNebulaDeviceId, type NebulaDeviceId, type WindowGeometry } from '../runtime/types';
import { createMessageBus } from '../runtime/MessageBus';
import { bootstrapDevicePage } from './deviceBootstrap';
import { LightRenderer } from '../rendering/LightRenderer';
import { centerGlobal, windowRectGlobal, globalToLocal, localToGlobal } from '../runtime/globalCoords';
import { clipSegmentToRect } from '../optics/Ray';
import { MirrorRenderer, computeMirrorSurface } from '../devices/Mirror';
import { reflectRay } from '../optics/MirrorPhysics';
import { currentLevel } from '../level/session';
import { nebulaCircleFromGeometry, traceNebulaAbsorption } from '../optics/NebulaOcclusion';

// ---------------------------------------------------------------------------
// ORDERING: bootstrapDevicePage() (called further below) starts this
// window's GeometryTracker, which invokes its onSelfUpdate callback
// SYNCHRONOUSLY as part of that very call. That callback ends up calling
// runPhysicsAndBroadcast(), which needs `bus` — so this page creates its OWN
// MessageBus directly (rather than destructuring the one bootstrapDevicePage
// would return), specifically so `bus` already exists before that
// synchronous callback could reference it. Getting this backwards is exactly
// what caused a real "Cannot access '...' before initialization" bug in
// src/pages/prism.ts earlier in this project — see that file's identical
// comment. Every other const the callback path touches (canvases,
// renderers, physicsHud, angleDeg) is likewise initialized above the
// bootstrapDevicePage() call.
// ---------------------------------------------------------------------------

const sessionId = new URLSearchParams(location.search).get('session') ?? 'lugh-v2-default-session';
const bus = createMessageBus(sessionId);
const level = currentLevel();
const nebulaConfigs = level?.nebulae ?? [];
const nebulaGeometry = new Map<NebulaDeviceId, WindowGeometry>();

const canvas = document.getElementById('ray-canvas') as HTMLCanvasElement;
const renderer = new LightRenderer(canvas); // incoming ray, SUN -> MIRROR

const outgoingCanvas = document.getElementById('outgoing-canvas') as HTMLCanvasElement;
const outgoingRenderer = new LightRenderer(outgoingCanvas); // reflected ray, within this window

const mirrorCanvas = document.getElementById('mirror-canvas') as HTMLCanvasElement;
const mirrorRenderer = new MirrorRenderer(mirrorCanvas);

const physicsHud = document.getElementById('physics-hud') as HTMLPreElement | null;

let selfGeometry: WindowGeometry | undefined;
let otherGeometry: WindowGeometry | undefined; // sun
let angleDeg = 0;

function traceIncomingNebulae() {
  if (!selfGeometry || !otherGeometry) return null;
  const circles = nebulaConfigs.flatMap((config) => {
    const geometry = nebulaGeometry.get(config.id);
    return geometry ? [nebulaCircleFromGeometry(config, geometry)] : [];
  });
  return traceNebulaAbsorption(centerGlobal(otherGeometry), centerGlobal(selfGeometry), 1, circles);
}

function broadcastNebulaLight(trace: ReturnType<typeof traceIncomingNebulae>): void {
  for (const config of nebulaConfigs) {
    const hit = trace?.hits.find((candidate) => candidate.id === config.id);
    bus.send({
      type: 'nebula-state',
      id: config.id,
      source: 'mirror',
      intensity: hit?.absorbedIntensity ?? 0,
      color: 'rgb(255,244,214)'
    });
  }
}

function renderIncoming(): void {
  if (!selfGeometry || !otherGeometry) {
    renderer.clear();
    return;
  }
  const nebulaTrace = traceIncomingNebulae();
  if (nebulaTrace && nebulaTrace.transmittedIntensity <= 0) {
    renderer.clear();
    return;
  }
  const p1 = centerGlobal(otherGeometry);
  const p2 = centerGlobal(selfGeometry);
  const myRect = windowRectGlobal(selfGeometry);
  const clipped = clipSegmentToRect(p1, p2, myRect);
  if (!clipped) {
    renderer.clear();
    return;
  }
  renderer.drawSegment(globalToLocal(clipped[0], selfGeometry), globalToLocal(clipped[1], selfGeometry));
}

/** How far past this window the outgoing ray's test segment reaches, in
 * local pixels — just needs to be larger than any plausible window size. */
const RAY_TEST_DISTANCE = 1_000_000;

/**
 * Computes the reflection (or pass-through, if the incoming ray misses the
 * mirror's finite surface), draws the outgoing segment within this window,
 * and broadcasts it in GLOBAL coordinates via 'ray-state' so any other
 * window (e.g. WORLD) can render the continuation by clipping the same
 * segment against its own rect — the same cross-window technique the
 * SUN->PRISM ray already uses.
 */
function runPhysicsAndBroadcast(): void {
  if (!otherGeometry || !selfGeometry) {
    if (physicsHud) physicsHud.textContent = 'mirror: waiting for geometry…';
    outgoingRenderer.clear();
    return;
  }

  try {
    const nebulaTrace = traceIncomingNebulae();
    broadcastNebulaLight(nebulaTrace);
    if (nebulaTrace && nebulaTrace.transmittedIntensity <= 0) {
      const hit = nebulaTrace.hits[0];
      renderer.clear();
      outgoingRenderer.clear();
      bus.send({
        type: 'ray-state',
        from: 'mirror',
        originGlobal: hit?.point ?? centerGlobal(otherGeometry),
        directionGlobal: { x: 0, y: 0 },
        absorbed: true
      });
      if (physicsHud) physicsHud.textContent = 'mirror: BLOCKED BY NEBULA';
      return;
    }

    const originLocal = globalToLocal(centerGlobal(otherGeometry), selfGeometry);
    const targetLocal = { x: selfGeometry.innerWidth / 2, y: selfGeometry.innerHeight / 2 };
    const dir = { x: targetLocal.x - originLocal.x, y: targetLocal.y - originLocal.y };
    const surface = computeMirrorSurface(selfGeometry.innerWidth, selfGeometry.innerHeight, angleDeg);
    const result = reflectRay(originLocal, dir, surface);

    const outgoingOriginLocal = result.hit ? result.point! : targetLocal;
    const outgoingDirLocal = result.hit ? result.reflectedDirection! : result.incomingDirection;

    const farLocal = {
      x: outgoingOriginLocal.x + outgoingDirLocal.x * RAY_TEST_DISTANCE,
      y: outgoingOriginLocal.y + outgoingDirLocal.y * RAY_TEST_DISTANCE
    };
    const localRect = { left: 0, top: 0, width: selfGeometry.innerWidth, height: selfGeometry.innerHeight };
    const clippedOutgoing = clipSegmentToRect(outgoingOriginLocal, farLocal, localRect);
    if (clippedOutgoing) {
      outgoingRenderer.drawSegment(clippedOutgoing[0], clippedOutgoing[1]);
    } else {
      outgoingRenderer.clear();
    }

    // exitDirection-style vectors are translation-invariant between local
    // and global space — only the origin POINT needs converting.
    const originGlobal = localToGlobal(outgoingOriginLocal, selfGeometry);
    bus.send({ type: 'ray-state', from: 'mirror', originGlobal, directionGlobal: outgoingDirLocal, absorbed: false });

    if (physicsHud) {
      physicsHud.textContent = result.hit ? 'mirror: HIT — reflecting' : 'mirror: MISS — pass-through';
    }
  } catch (err) {
    if (physicsHud) physicsHud.textContent = `mirror: ERROR — ${String(err)}`;
    outgoingRenderer.clear();
    console.error('[mirror physics]', err);
  }
}

// Initial local draw + physics probe (safe now — everything above is ready).
mirrorRenderer.drawMirror(angleDeg);
runPhysicsAndBroadcast();

bootstrapDevicePage('mirror', {
  onSelfUpdate: (g) => {
    selfGeometry = g;
    renderIncoming();
    runPhysicsAndBroadcast();
  }
});

bus.subscribe((msg) => {
  if (msg.type === 'geometry-update' && msg.geometry.id === 'sun') {
    otherGeometry = msg.geometry;
    renderIncoming();
    runPhysicsAndBroadcast();
    return;
  }
  if (msg.type === 'geometry-update' && isNebulaDeviceId(msg.geometry.id)) {
    if (!nebulaConfigs.some((config) => config.id === msg.geometry.id)) return;
    nebulaGeometry.set(msg.geometry.id, msg.geometry);
    renderIncoming();
    runPhysicsAndBroadcast();
  }
});

window.addEventListener('beforeunload', () => {
  bus.close();
});

// ---------------------------------------------------------------------------
// Rotation input — identical pattern to src/pages/prism.ts: local visual
// rotation is always synchronous/instant, the bus only carries a coalesced
// "latest angle" at ~28Hz while actively rotating, plus one immediate final
// send when the interaction ends.
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

function maybeSendCoalesced(): void {
  const now = Date.now();
  if (now - lastBusSendAt >= BUS_SEND_MIN_INTERVAL_MS) {
    lastBusSendAt = now;
    bus.send({ type: 'mirror-rotation', angleDeg, timestamp: now });
  }
}

function sendFinal(): void {
  const now = Date.now();
  lastBusSendAt = now;
  bus.send({ type: 'mirror-rotation', angleDeg, timestamp: now });
}

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

  mirrorRenderer.drawMirror(angleDeg);
  runPhysicsAndBroadcast();
  maybeSendCoalesced();
});

function endDrag(): void {
  if (!isDragging) return;
  isDragging = false;
  sendFinal();
}

window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

let wheelIdleTimer: ReturnType<typeof setTimeout> | undefined;

window.addEventListener(
  'wheel',
  (e) => {
    angleDeg = normalizeAngle(angleDeg + e.deltaY * 0.2);

    mirrorRenderer.drawMirror(angleDeg);
    runPhysicsAndBroadcast();
    maybeSendCoalesced();

    if (wheelIdleTimer !== undefined) clearTimeout(wheelIdleTimer);
    wheelIdleTimer = setTimeout(() => {
      wheelIdleTimer = undefined;
      sendFinal();
    }, 150);
  },
  { passive: true }
);
