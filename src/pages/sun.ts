import type { WindowGeometry } from '../runtime/types';
import { bootstrapDevicePage } from './deviceBootstrap';
import { LightRenderer } from '../rendering/LightRenderer';
import { centerGlobal, windowRectGlobal, globalToLocal } from '../runtime/globalCoords';
import { clipSegmentToRect } from '../optics/Ray';

const canvas = document.getElementById('ray-canvas') as HTMLCanvasElement;
const renderer = new LightRenderer(canvas);

let selfGeometry: WindowGeometry | undefined;
let otherGeometry: WindowGeometry | undefined; // prism

function render(): void {
  if (!selfGeometry || !otherGeometry) {
    renderer.clear();
    return;
  }

  const sunGeometry = selfGeometry;
  const prismGeometry = otherGeometry;
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

const { bus } = bootstrapDevicePage('sun', {
  onSelfUpdate: (g) => {
    selfGeometry = g;
    render();
  }
});

bus.subscribe((msg) => {
  if (msg.type === 'geometry-update' && msg.geometry.id === 'prism') {
    otherGeometry = msg.geometry;
    render();
  }
});
