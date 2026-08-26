import type { WindowGeometry } from '../runtime/types';
import { createMessageBus } from '../runtime/MessageBus';
import { bootstrapDevicePage } from './deviceBootstrap';
import { LightRenderer } from '../rendering/LightRenderer';
import { centerGlobal, windowRectGlobal, globalToLocal, localToGlobal } from '../runtime/globalCoords';
import { clipSegmentToRect } from '../optics/Ray';
import { BlackHoleRenderer } from '../devices/BlackHole';
import { deflectRay, DEFAULT_BLACK_HOLE_CONFIG } from '../optics/BlackHolePhysics';

// See src/pages/mirror.ts for why this page creates its own MessageBus
// directly rather than destructuring the one bootstrapDevicePage() returns
// (avoids a TDZ ReferenceError from bootstrapDevicePage's synchronous
// first-tick callback referencing `bus` before its declaration runs).
const sessionId = new URLSearchParams(location.search).get('session') ?? 'lugh-v2-default-session';
const bus = createMessageBus(sessionId);

const canvas = document.getElementById('ray-canvas') as HTMLCanvasElement;
const renderer = new LightRenderer(canvas); // incoming ray, SUN -> BLACKHOLE

const outgoingCanvas = document.getElementById('outgoing-canvas') as HTMLCanvasElement;
const outgoingRenderer = new LightRenderer(outgoingCanvas); // deflected ray, within this window

const blackHoleCanvas = document.getElementById('blackhole-canvas') as HTMLCanvasElement;
new BlackHoleRenderer(blackHoleCanvas); // static visual, draws itself on construction + resize

const physicsHud = document.getElementById('physics-hud') as HTMLPreElement | null;

let selfGeometry: WindowGeometry | undefined;
let otherGeometry: WindowGeometry | undefined; // sun

function renderIncoming(): void {
  if (!selfGeometry || !otherGeometry) {
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

const RAY_TEST_DISTANCE = 1_000_000;

/**
 * Computes the deflection (or absorption) of the incoming ray, draws the
 * outgoing bent segment within this window (or nothing, if absorbed), and
 * broadcasts the result in GLOBAL coordinates via 'ray-state', mirroring
 * mirror.ts's cross-window continuation technique exactly.
 */
function runPhysicsAndBroadcast(): void {
  if (!otherGeometry || !selfGeometry) {
    if (physicsHud) physicsHud.textContent = 'blackhole: waiting for geometry…';
    outgoingRenderer.clear();
    return;
  }

  try {
    const originLocal = globalToLocal(centerGlobal(otherGeometry), selfGeometry);
    const centerLocal = { x: selfGeometry.innerWidth / 2, y: selfGeometry.innerHeight / 2 };
    const dir = { x: centerLocal.x - originLocal.x, y: centerLocal.y - originLocal.y };
    const result = deflectRay(originLocal, dir, centerLocal, DEFAULT_BLACK_HOLE_CONFIG);

    if (result.absorbed) {
      outgoingRenderer.clear();
      bus.send({
        type: 'ray-state',
        from: 'blackhole',
        originGlobal: localToGlobal(result.deflectionPoint, selfGeometry),
        directionGlobal: { x: 0, y: 0 },
        absorbed: true
      });
      if (physicsHud) {
        physicsHud.textContent = `blackhole: ABSORBED  closest ${result.closestDistance.toFixed(1)}px`;
      }
      return;
    }

    const outgoingOriginLocal = result.deflectionPoint;
    const outgoingDirLocal = result.outgoingDirection!;
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

    const originGlobal = localToGlobal(outgoingOriginLocal, selfGeometry);
    bus.send({ type: 'ray-state', from: 'blackhole', originGlobal, directionGlobal: outgoingDirLocal, absorbed: false });

    const deg = ((result.deflectionAngleRad ?? 0) * 180) / Math.PI;
    if (physicsHud) {
      physicsHud.textContent = `blackhole: deflect ${deg.toFixed(1)}°  closest ${result.closestDistance.toFixed(1)}px`;
    }
  } catch (err) {
    if (physicsHud) physicsHud.textContent = `blackhole: ERROR — ${String(err)}`;
    outgoingRenderer.clear();
    console.error('[blackhole physics]', err);
  }
}

// Initial physics probe (safe now — everything above is ready; shows the
// "waiting for geometry…" branch until SUN's geometry arrives).
runPhysicsAndBroadcast();

bootstrapDevicePage('blackhole', {
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
  }
});

window.addEventListener('beforeunload', () => {
  bus.close();
});
