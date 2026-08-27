import type { WindowGeometry } from '../runtime/types';
import { createMessageBus } from '../runtime/MessageBus';
import { bootstrapDevicePage } from './deviceBootstrap';
import { LightRenderer } from '../rendering/LightRenderer';
import { globalToLocal, localToGlobal } from '../runtime/globalCoords';
import { clipSegmentToRect, type Point } from '../optics/Ray';
import { BlackHoleRenderer } from '../devices/BlackHole';
import { deflectRay, DEFAULT_BLACK_HOLE_CONFIG } from '../optics/BlackHolePhysics';
import { parallelRayFromSun } from '../optics/upstream';
import { currentLevel } from '../level/session';
import { resolveUpstream } from '../level/types';
import { buildDeflectedPath, clipPathToRect } from '../optics/CurvedPath';

// Which device this window treats as its light source. Puzzle levels that
// don't include MIRROR route straight from SUN instead (see
// level/types.ts's resolveUpstream) — no level param (or an unrecognized
// one) falls back to the ORIGINAL fixed mirror->blackhole chain, so opening
// this page outside the level flow behaves exactly as it always has.
const level = currentLevel();
const upstreamId = level ? resolveUpstream('blackhole', level) : 'mirror';

// See src/pages/mirror.ts for why this page creates its own MessageBus
// directly rather than destructuring the one bootstrapDevicePage() returns
// (avoids a TDZ ReferenceError from bootstrapDevicePage's synchronous
// first-tick callback referencing `bus` before its declaration runs).
const sessionId = new URLSearchParams(location.search).get('session') ?? 'lugh-v2-default-session';
const bus = createMessageBus(sessionId);

const canvas = document.getElementById('ray-canvas') as HTMLCanvasElement;
const renderer = new LightRenderer(canvas); // incoming ray, MIRROR -> BLACKHOLE

const outgoingCanvas = document.getElementById('outgoing-canvas') as HTMLCanvasElement;
const outgoingRenderer = new LightRenderer(outgoingCanvas); // deflected ray, within this window

const blackHoleCanvas = document.getElementById('blackhole-canvas') as HTMLCanvasElement;
new BlackHoleRenderer(blackHoleCanvas); // static visual, draws itself on construction + resize

const physicsHud = document.getElementById('physics-hud') as HTMLPreElement | null;

let selfGeometry: WindowGeometry | undefined;
/** upstreamId === 'sun' only: the raw geometry-update from SUN, used to
 * synthesize a straight incoming ray (SUN never broadcasts 'ray-state'). */
let sunGeometry: WindowGeometry | undefined;
/** This is part of a REAL chain: the incoming ray is whatever `upstreamId`
 * most recently broadcast (or, when upstreamId is 'sun', a straight line
 * synthesized from SUN's geometry). `undefined` = nothing heard yet; `null`
 * = the upstream device's beam missed everything or was itself absorbed,
 * i.e. there is genuinely no light arriving here. */
let incomingRay: { originGlobal: Point; directionGlobal: Point } | null | undefined;

/** upstreamId === 'sun' only — recomputes the straight incoming line
 * whenever either SUN's geometry or this window's own geometry changes. */
function recomputeFromSun(): void {
  if (upstreamId !== 'sun') return;
  incomingRay = selfGeometry && sunGeometry ? parallelRayFromSun(sunGeometry, selfGeometry) : undefined;
  runPhysicsAndBroadcast();
}

/**
 * Computes the deflection (or absorption) of the incoming ray, and draws the
 * WHOLE visible path (incoming approach + outgoing departure) as ONE
 * continuous curve that bows in toward the black hole's center at the
 * closest-approach point — a smooth "gravity wrap" look, rather than a
 * sharp straight-line kink — then broadcasts the outgoing ray in GLOBAL
 * coordinates via 'ray-state', continuing the chain toward PRISM.
 */
function runPhysicsAndBroadcast(): void {
  if (!selfGeometry || incomingRay === undefined) {
    if (physicsHud) physicsHud.textContent = '이전 장치에서 오는 빛을 기다리는 중…';
    renderer.clear();
    outgoingRenderer.clear();
    return;
  }

  if (incomingRay === null) {
    // Nothing arrived from upstream (mirror missed/absorbed) — no light to
    // deflect, and nothing to pass on.
    if (physicsHud) physicsHud.textContent = '들어오는 빛이 없습니다';
    renderer.clear();
    outgoingRenderer.clear();
    bus.send({
      type: 'ray-state',
      from: 'blackhole',
      originGlobal: { x: 0, y: 0 },
      directionGlobal: { x: 0, y: 0 },
      absorbed: true
    });
    return;
  }

  try {
    const originLocal = globalToLocal(incomingRay.originGlobal, selfGeometry);
    const dir = incomingRay.directionGlobal; // direction vectors are translation-invariant
    const centerLocal = { x: selfGeometry.innerWidth / 2, y: selfGeometry.innerHeight / 2 };
    const result = deflectRay(originLocal, dir, centerLocal, DEFAULT_BLACK_HOLE_CONFIG);
    const localRect = { left: 0, top: 0, width: selfGeometry.innerWidth, height: selfGeometry.innerHeight };

    // The incoming approach, clipped to where it enters this window, curving
    // slightly toward the hole as it nears the closest-approach point — drawn
    // whether absorbed or not, since the ray always approaches first.
    const approachClipped = clipSegmentToRect(originLocal, result.deflectionPoint, localRect);
    const pullTowardCenter = (p: Point, t: number): Point => ({
      x: p.x + (centerLocal.x - p.x) * t,
      y: p.y + (centerLocal.y - p.y) * t
    });

    if (result.absorbed) {
      outgoingRenderer.clear();
      if (approachClipped) {
        // Curve the approach itself inward as it's pulled into the hole —
        // pulled almost all the way to the center so it visibly spirals
        // into the same point BlackHoleRenderer draws its disc around,
        // rather than kinking near the edge.
        renderer.drawCurveSegment(approachClipped[0], pullTowardCenter(result.deflectionPoint, 0.85), result.deflectionPoint);
      } else {
        renderer.clear();
      }
      bus.send({
        type: 'ray-state',
        from: 'blackhole',
        originGlobal: localToGlobal(result.deflectionPoint, selfGeometry),
        directionGlobal: { x: 0, y: 0 },
        absorbed: true
      });
      if (physicsHud) {
        physicsHud.textContent = `빛 흡수 · 최근접 거리 ${result.closestDistance.toFixed(1)}픽셀`;
      }
      return;
    }

    renderer.clear(); // the whole path is drawn as one shared path below

    const outgoingDirLocal = result.outgoingDirection!;
    const entryPoint = approachClipped ? approachClipped[0] : originLocal;
    // Start with the exact incoming tangent, then turn smoothly toward the
    // physics result over a long enough distance to remain curved inside
    // the downstream prism window. A final straight extension preserves the
    // same outgoing ray even if the player moves the prism farther away.
    const departurePathLocal = buildDeflectedPath(result.deflectionPoint, dir, outgoingDirLocal);
    const finalCurvePoint = departurePathLocal.at(-1)!;
    const fullPathLocal = [
      entryPoint,
      ...departurePathLocal,
      {
        x: finalCurvePoint.x + outgoingDirLocal.x * 1_000_000,
        y: finalCurvePoint.y + outgoingDirLocal.y * 1_000_000
      }
    ];
    const visiblePathLocal = clipPathToRect(fullPathLocal, localRect);
    outgoingRenderer.drawPath(visiblePathLocal);

    const pathGlobal = fullPathLocal.map((point) => localToGlobal(point, selfGeometry!));
    const originGlobal = localToGlobal(result.deflectionPoint, selfGeometry);
    bus.send({
      type: 'ray-state',
      from: 'blackhole',
      originGlobal,
      directionGlobal: outgoingDirLocal,
      absorbed: false,
      pathGlobal
    });

    const deg = ((result.deflectionAngleRad ?? 0) * 180) / Math.PI;
    if (physicsHud) {
      physicsHud.textContent = `빛 굴절 ${deg.toFixed(1)}도 · 최근접 거리 ${result.closestDistance.toFixed(1)}픽셀`;
    }
  } catch (err) {
    if (physicsHud) physicsHud.textContent = `블랙홀 계산 오류 · ${String(err)}`;
    renderer.clear();
    outgoingRenderer.clear();
    console.error('[blackhole physics]', err);
  }
}

// Initial physics probe (safe now — everything above is ready; shows the
// "waiting for mirror…" branch until MIRROR's ray-state arrives).
runPhysicsAndBroadcast();

bootstrapDevicePage('blackhole', {
  onSelfUpdate: (g) => {
    selfGeometry = g;
    if (upstreamId === 'sun') {
      recomputeFromSun();
    } else {
      runPhysicsAndBroadcast();
    }
  }
});

bus.subscribe((msg) => {
  if (upstreamId === 'sun') {
    if (msg.type === 'geometry-update' && msg.geometry.id === 'sun') {
      sunGeometry = msg.geometry;
      recomputeFromSun();
    }
    return;
  }
  if (msg.type === 'ray-state' && msg.from === upstreamId) {
    incomingRay = msg.absorbed ? null : { originGlobal: msg.originGlobal, directionGlobal: msg.directionGlobal };
    runPhysicsAndBroadcast();
  }
});

window.addEventListener('beforeunload', () => {
  bus.close();
});
