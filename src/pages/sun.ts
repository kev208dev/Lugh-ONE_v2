import type { WindowGeometry } from '../runtime/types';
import { bootstrapDevicePage } from './deviceBootstrap';
import { SunRenderer } from '../devices/Sun';
import { LightRenderer } from '../rendering/LightRenderer';
import { centerGlobal, windowRectGlobal, globalToLocal } from '../runtime/globalCoords';
import { clipSegmentToRect } from '../optics/Ray';

const sunCanvas = document.getElementById('sun-canvas') as HTMLCanvasElement;
new SunRenderer(sunCanvas);

// SUN is the start of the chain (SUN -> MIRROR -> BLACKHOLE -> PRISM ->
// EARTH/MARS): every downstream device draws its own outgoing beam within
// its own window, so SUN needs to do the same for the leg heading to
// MIRROR, or the chain visually starts from nowhere.
const rayCanvas = document.getElementById('ray-canvas') as HTMLCanvasElement;
const rayRenderer = new LightRenderer(rayCanvas);

let selfGeometry: WindowGeometry | undefined;
let mirrorGeometry: WindowGeometry | undefined;

function renderOutgoing(): void {
  if (!selfGeometry || !mirrorGeometry) {
    rayRenderer.clear();
    return;
  }
  const p1 = centerGlobal(selfGeometry);
  const p2 = centerGlobal(mirrorGeometry);
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
  if (msg.type === 'geometry-update' && msg.geometry.id === 'mirror') {
    mirrorGeometry = msg.geometry;
    renderOutgoing();
  }
});
