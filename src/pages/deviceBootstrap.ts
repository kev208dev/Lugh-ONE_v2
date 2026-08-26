import type { DeviceId, WindowGeometry } from '../runtime/types';
import { GeometryTracker } from '../runtime/GeometryTracker';
import { createMessageBus } from '../runtime/MessageBus';

function sessionIdFromUrl(): string {
  return new URLSearchParams(location.search).get('session') ?? 'lugh-v2-default-session';
}

function formatGeometry(g: WindowGeometry): string {
  return [
    `x:${Math.round(g.screenX)} y:${Math.round(g.screenY)}`,
    `w:${Math.round(g.outerWidth)} h:${Math.round(g.outerHeight)}`,
    `inset t:${Math.round(g.chromeInsetTop)} l:${Math.round(g.chromeInsetLeft)}`
  ].join('\n');
}

export interface BootstrapDevicePageOptions {
  /** Called with this page's own geometry every time its GeometryTracker
   * emits — use this instead of a second GeometryTracker instance when a
   * page also needs to react to its own position (e.g. ray rendering). */
  onSelfUpdate?: (g: WindowGeometry) => void;
}

/** Wires a device popup page (SUN/PRISM/EARTH/MARS): tracks its own geometry,
 * broadcasts it on the shared bus, and renders it into the page's #hud element. */
export function bootstrapDevicePage(id: DeviceId, opts: BootstrapDevicePageOptions = {}) {
  const sessionId = sessionIdFromUrl();
  const bus = createMessageBus(sessionId);
  const hud = document.getElementById('hud');

  const tracker = new GeometryTracker(id, window, (g) => {
    bus.send({ type: 'geometry-update', geometry: g });
    if (hud) hud.textContent = formatGeometry(g);
    opts.onSelfUpdate?.(g);
  });
  tracker.start();

  bus.send({ type: 'hello', id, sessionId });
  window.addEventListener('beforeunload', () => {
    bus.send({ type: 'bye', id, sessionId });
    tracker.stop();
    bus.close();
  });

  return { bus, tracker, sessionId };
}
