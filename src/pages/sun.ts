import type { WindowGeometry } from '../runtime/types';
import { bootstrapDevicePage } from './deviceBootstrap';
import { SunRenderer } from '../devices/Sun';
import { LightRenderer } from '../rendering/LightRenderer';
import { windowRectGlobal, globalToLocal } from '../runtime/globalCoords';
import { clipSegmentToRect } from '../optics/Ray';
import { currentLevel } from '../level/session';
import { CANON_CHAIN_ORDER, devicesForLevel } from '../level/types';
import type { DeviceId } from '../runtime/types';
import { parallelRayFromSun, straightRayFromSun } from '../optics/upstream';

const sunCanvas = document.getElementById('sun-canvas') as HTMLCanvasElement;
new SunRenderer(sunCanvas);

// SUN is the start of the chain. Levels omit instruments, so its immediate
// downstream target may be MIRROR, BLACKHOLE, or PRISM. Opening sun.html
// outside the guided level flow preserves the original MIRROR fallback.
const level = currentLevel();
const activeDevices = level ? new Set(devicesForLevel(level)) : null;
const downstreamId: DeviceId =
  CANON_CHAIN_ORDER.slice(1).find((id) => activeDevices?.has(id)) ?? 'mirror';

const rayCanvas = document.getElementById('ray-canvas') as HTMLCanvasElement;
const rayRenderer = new LightRenderer(rayCanvas);

let selfGeometry: WindowGeometry | undefined;
let downstreamGeometry: WindowGeometry | undefined;

function renderOutgoing(): void {
  if (!selfGeometry || !downstreamGeometry) {
    rayRenderer.clear();
    return;
  }
  const ray = downstreamId === 'blackhole'
    ? parallelRayFromSun(selfGeometry, downstreamGeometry)
    : straightRayFromSun(selfGeometry, downstreamGeometry);
  const p1 = ray.originGlobal;
  const p2 = {
    x: p1.x + ray.directionGlobal.x * 1_000_000,
    y: p1.y + ray.directionGlobal.y * 1_000_000
  };
  const myRect = windowRectGlobal(selfGeometry);
  const clipped = clipSegmentToRect(p1, p2, myRect);
  if (!clipped) {
    rayRenderer.clear();
    return;
  }
  rayRenderer.drawSegment(globalToLocal(clipped[0], selfGeometry), globalToLocal(clipped[1], selfGeometry));
}

const { bus } = bootstrapDevicePage('sun', {
  onSelfUpdate: (g) => {
    selfGeometry = g;
    renderOutgoing();
  }
});

bus.subscribe((msg) => {
  if (msg.type === 'geometry-update' && msg.geometry.id === downstreamId) {
    downstreamGeometry = msg.geometry;
    renderOutgoing();
  }
});
