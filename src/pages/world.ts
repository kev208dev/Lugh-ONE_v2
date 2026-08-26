import { DEVICE_IDS, type BusMessage, type DeviceId, type WindowGeometry } from '../runtime/types';
import { GeometryTracker } from '../runtime/GeometryTracker';
import { createMessageBus } from '../runtime/MessageBus';
import { LightRenderer } from '../rendering/LightRenderer';
import { centerGlobal, windowRectGlobal, globalToLocal, localToGlobal } from '../runtime/globalCoords';
import { clipSegmentToRect } from '../optics/Ray';
import { computePrismVertices } from '../devices/Prism';
import { tracePrismSpectrum, type SpectralRay } from '../optics/PrismPhysics';
import { receiverResponse, receiverMaxResponseSum, type ReceiverId } from '../optics/Receiver';
import { LevelTracker } from '../level/level01';

const sessionId = new URLSearchParams(location.search).get('session') ?? 'lugh-v2-default-session';
const bus = createMessageBus(sessionId);
const hud = document.getElementById('hud');
const levelHud = document.getElementById('level-hud');
const rayStateHud = document.getElementById('raystate-hud');

const canvas = document.getElementById('ray-canvas') as HTMLCanvasElement;
const renderer = new LightRenderer(canvas);

// PHASE 6 (mirror/blackhole feature work): debug visualization of whichever
// ray-bending device (MIRROR, BLACKHOLE) most recently broadcast its
// outgoing ray — proves the global-coordinate cross-window handoff those
// devices use is wired correctly, the same way renderRay() already proves
// it for the SUN->PRISM segment.
const rayStateCanvas = document.getElementById('raystate-canvas') as HTMLCanvasElement;
const rayStateRenderer = new LightRenderer(rayStateCanvas);

const latest: Partial<Record<DeviceId, WindowGeometry>> = {};
let latestPrismAngleDeg = 0;
let latestRayState: Extract<BusMessage, { type: 'ray-state' }> | undefined;
const levelTracker = new LevelTracker();

function renderHud() {
  if (!hud) return;
  hud.textContent = DEVICE_IDS.map((id) => {
    const g = latest[id];
    if (!g) return `${id.padEnd(6)} —`;
    return `${id.padEnd(6)} x:${Math.round(g.screenX).toString().padStart(5)} y:${Math.round(g.screenY).toString().padStart(5)} w:${Math.round(g.outerWidth)} h:${Math.round(g.outerHeight)}`;
  }).join('\n');
}

function renderRay() {
  const selfGeometry = latest.world;
  const sunGeometry = latest.sun;
  const prismGeometry = latest.prism;

  if (!selfGeometry || !sunGeometry || !prismGeometry) {
    renderer.clear();
    return;
  }

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
// PHASE 5: WORLD is the authoritative receiver/level calculator. It has no
// canvas of its own for this — EARTH/MARS just display whatever WORLD
// broadcasts. Driven by the same sun/prism/earth/mars geometry + prism
// rotation events that already flow through this bus.
// ---------------------------------------------------------------------------

/** How far past a receiver's window an exit ray's test segment reaches —
 * just needs to be larger than any plausible screen diagonal. */
const RAY_TEST_DISTANCE = 1_000_000;

function powerAtReceiver(rays: SpectralRay[], receiverId: ReceiverId, prismGeometry: WindowGeometry, receiverGeometry: WindowGeometry | undefined): number {
  if (!receiverGeometry) return 0;
  const rect = windowRectGlobal(receiverGeometry);
  let power = 0;
  for (const ray of rays) {
    const p1 = localToGlobal(ray.exitPoint, prismGeometry);
    // exitDirection is a direction vector, unaffected by the local->global
    // translation — only the origin point needed converting.
    const p2 = { x: p1.x + ray.exitDirection.x * RAY_TEST_DISTANCE, y: p1.y + ray.exitDirection.y * RAY_TEST_DISTANCE };
    if (clipSegmentToRect(p1, p2, rect)) {
      power += ray.intensity * receiverResponse(receiverId, ray.wavelengthNm);
    }
  }
  return power;
}

function renderReceivers(): void {
  const sunGeometry = latest.sun;
  const prismGeometry = latest.prism;

  let earthPercent = 0;
  let marsPercent = 0;

  if (sunGeometry && prismGeometry) {
    try {
      const originLocal = globalToLocal(centerGlobal(sunGeometry), prismGeometry);
      const targetLocal = { x: prismGeometry.innerWidth / 2, y: prismGeometry.innerHeight / 2 };
      const dir = { x: targetLocal.x - originLocal.x, y: targetLocal.y - originLocal.y };
      const vertices = computePrismVertices(prismGeometry.innerWidth, prismGeometry.innerHeight, latestPrismAngleDeg);
      const rays = tracePrismSpectrum(originLocal, dir, { vertices });

      const earthPower = powerAtReceiver(rays, 'earth', prismGeometry, latest.earth);
      const marsPower = powerAtReceiver(rays, 'mars', prismGeometry, latest.mars);
      earthPercent = (100 * earthPower) / receiverMaxResponseSum('earth');
      marsPercent = (100 * marsPower) / receiverMaxResponseSum('mars');
    } catch (err) {
      console.error('[world receivers]', err);
      earthPercent = 0;
      marsPercent = 0;
    }
  }

  const state = levelTracker.update(earthPercent, marsPercent, performance.now());
  bus.send({ type: 'level-state', earthPercent, marsPercent, complete: state.complete });

  if (levelHud) {
    levelHud.textContent = `EARTH ${earthPercent.toFixed(0)}%  MARS ${marsPercent.toFixed(0)}%${state.complete ? '  LEVEL COMPLETE' : ''}`;
  }
}

/**
 * Debug visualization for the mirror/blackhole feature: draws whichever
 * device's most recent 'ray-state' broadcast, clipped to WORLD's own rect —
 * same clip-and-draw technique as renderRay(). Absorbed rays (a black hole
 * event horizon) simply have nothing to draw beyond the point they ended.
 */
function renderRayState() {
  const selfGeometry = latest.world;
  const state = latestRayState;

  if (rayStateHud) {
    rayStateHud.textContent = state
      ? `ray-state: from=${state.from} absorbed=${state.absorbed}`
      : 'ray-state: —';
  }

  if (!selfGeometry || !state || state.absorbed) {
    rayStateRenderer.clear();
    return;
  }

  const p1 = state.originGlobal;
  const p2 = { x: p1.x + state.directionGlobal.x * 1_000_000, y: p1.y + state.directionGlobal.y * 1_000_000 };
  const myRect = windowRectGlobal(selfGeometry);
  const clipped = clipSegmentToRect(p1, p2, myRect);

  if (!clipped) {
    rayStateRenderer.clear();
    return;
  }

  rayStateRenderer.drawSegment(globalToLocal(clipped[0], selfGeometry), globalToLocal(clipped[1], selfGeometry));
}

function render() {
  renderHud();
  renderRay();
  renderRayState();
}

bus.subscribe((msg) => {
  if (msg.type === 'geometry-update') {
    latest[msg.geometry.id] = msg.geometry;
    render();
    renderReceivers();
  } else if (msg.type === 'prism-rotation') {
    latestPrismAngleDeg = msg.angleDeg;
    renderReceivers();
  } else if (msg.type === 'ray-state') {
    latestRayState = msg;
    renderRayState();
  }
});

// WORLD tracks its own geometry too, same as every other device.
const worldTracker = new GeometryTracker('world', window, (g) => {
  latest.world = g;
  bus.send({ type: 'geometry-update', geometry: g });
  render();
});
worldTracker.start();
render();
renderReceivers();

window.addEventListener('beforeunload', () => {
  bus.send({ type: 'bye', id: 'world', sessionId });
  worldTracker.stop();
  bus.close();
});
