import { NebulaRenderer } from '../devices/Nebula';
import { bootstrapDevicePage } from './deviceBootstrap';
import { isNebulaDeviceId, type DeviceId, type NebulaDeviceId, type WindowGeometry } from '../runtime/types';

const rawId = new URLSearchParams(location.search).get('device') ?? 'nebula-1';
if (!isNebulaDeviceId(rawId as DeviceId)) throw new Error(`Invalid nebula device id: ${rawId}`);
const id = rawId as NebulaDeviceId;

const canvas = document.getElementById('nebula-canvas') as HTMLCanvasElement;
const renderer = new NebulaRenderer(canvas);
const powerEl = document.getElementById('nebula-power');
const contributions = new Map<DeviceId, { intensity: number; color: string }>();
let fixedPosition: { x: number; y: number } | undefined;

function redraw(): void {
  const active = Array.from(contributions.values()).sort((a, b) => b.intensity - a.intensity)[0];
  const intensity = Math.min(1, Array.from(contributions.values()).reduce((sum, item) => sum + item.intensity, 0));
  renderer.draw(intensity, active?.color ?? 'rgb(190,220,255)');
  if (powerEl) powerEl.textContent = intensity > 0.001 ? `ABSORBING ${Math.round(intensity * 100)}%` : 'DORMANT';
  document.body.classList.toggle('is-absorbing', intensity > 0.001);
}

const { bus } = bootstrapDevicePage(id, {
  onSelfUpdate: (geometry: WindowGeometry) => {
    if (!fixedPosition) {
      fixedPosition = { x: geometry.screenX, y: geometry.screenY };
      return;
    }
    if (Math.abs(geometry.screenX - fixedPosition.x) > 2 || Math.abs(geometry.screenY - fixedPosition.y) > 2) {
      window.moveTo(fixedPosition.x, fixedPosition.y);
    }
  }
});

bus.subscribe((message) => {
  if (message.type !== 'nebula-state' || message.id !== id) return;
  contributions.set(message.source, { intensity: message.intensity, color: message.color });
  redraw();
});

redraw();
