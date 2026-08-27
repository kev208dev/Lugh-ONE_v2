import type { DeviceId, WindowGeometry } from '../runtime/types';
import { GeometryTracker } from '../runtime/GeometryTracker';
import { createMessageBus } from '../runtime/MessageBus';
import { isPopupOversized, popupDimensions } from '../runtime/PopupGuard';

function lifecycleIdsFromUrl(): { sessionId: string; launchId: string } {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session') ?? 'lugh-v2-default-session';
  return { sessionId, launchId: params.get('launch') ?? sessionId };
}

function formatGeometry(g: WindowGeometry): string {
  return [
    `위치 X:${Math.round(g.screenX)} Y:${Math.round(g.screenY)}`,
    `크기 너비:${Math.round(g.outerWidth)} 높이:${Math.round(g.outerHeight)}`,
    `창 여백 위:${Math.round(g.chromeInsetTop)} 왼쪽:${Math.round(g.chromeInsetLeft)}`
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
  const { sessionId, launchId } = lifecycleIdsFromUrl();
  const bus = createMessageBus(sessionId);
  const hud = document.getElementById('hud');
  const launchDimensions = popupDimensions(window);
  let invalidWindow = false;

  function rejectInvalidWindow(): boolean {
    const fullscreen = document.fullscreenElement != null;
    const oversized = isPopupOversized(launchDimensions, popupDimensions(window));
    if (!fullscreen && !oversized) return false;
    if (invalidWindow) return true;
    invalidWindow = true;

    if (fullscreen && typeof document.exitFullscreen === 'function') {
      void document.exitFullscreen().catch(() => undefined);
    }
    bus.send({
      type: 'experiment-abort',
      id,
      launchId,
      reason: fullscreen ? 'fullscreen' : 'oversized-window'
    });
    window.setTimeout(() => window.close(), 0);
    return true;
  }

  const onResize = () => rejectInvalidWindow();
  const onFullscreenChange = () => rejectInvalidWindow();
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'F11') event.preventDefault();
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKeyDown);
  document.addEventListener('fullscreenchange', onFullscreenChange);

  const tracker = new GeometryTracker(id, window, (g) => {
    if (rejectInvalidWindow()) return;
    bus.send({ type: 'geometry-update', geometry: g });
    if (hud) hud.textContent = formatGeometry(g);
    opts.onSelfUpdate?.(g);
  });

  // Popup documents load in a nondeterministic order. An earlier device's
  // initial geometry broadcast can therefore happen before a later device
  // has subscribed, leaving the optical chain permanently waiting until the
  // user happens to move a window. Every already-running device answers a
  // new peer's hello with a fresh geometry snapshot, making startup order
  // irrelevant without adding a permanent heartbeat.
  const unsubscribeLifecycle = bus.subscribe((msg) => {
    if (msg.type === 'hello' && msg.launchId === launchId && msg.id !== id) {
      bus.send({ type: 'geometry-update', geometry: tracker.snapshot() });
    } else if (msg.type === 'bye' && msg.launchId === launchId && msg.id !== id) {
      window.close();
    } else if (msg.type === 'experiment-abort' && msg.launchId === launchId) {
      window.close();
    }
  });

  tracker.start();

  bus.send({ type: 'hello', id, sessionId, launchId });
  window.addEventListener('beforeunload', () => {
    bus.send({ type: 'bye', id, sessionId, launchId });
    unsubscribeLifecycle();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    tracker.stop();
    bus.close();
  });

  return { bus, tracker, sessionId, launchId };
}
