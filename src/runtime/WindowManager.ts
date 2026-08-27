import { DEVICE_IDS, isNebulaDeviceId, popupNameFor, type DeviceId } from './types';
import { DEVICE_LAYOUTS, computeWorkArea, resolveWindowFeatures, resolveDeviceLayoutsForLevel } from './screenLayout';
import type { LevelDefinition } from '../level/types';

export type LaunchResult =
  | { ok: true; windows: Record<DeviceId, Window> }
  | { ok: false; error: string };

const DEVICE_LABELS = {
  sun: 'SUN',
  prism: 'PRISM',
  earth: 'EARTH',
  mars: 'MARS',
  mirror: 'MIRROR',
  blackhole: 'BLACKHOLE'
} as const;

function deviceLabel(id: DeviceId): string {
  return isNebulaDeviceId(id) ? 'NEBULA' : DEVICE_LABELS[id];
}

function urlFor(id: DeviceId, sessionId: string, levelId: string | undefined): string {
  const params = new URLSearchParams({ session: sessionId });
  if (levelId) params.set('level', levelId);
  if (isNebulaDeviceId(id)) params.set('device', id);
  const page = isNebulaDeviceId(id) ? 'nebula' : id;
  return `${import.meta.env.BASE_URL}${page}.html?${params.toString()}`;
}

function featuresString(rect: { left: number; top: number; width: number; height: number }): string {
  return `popup=yes,left=${Math.round(rect.left)},top=${Math.round(rect.top)},width=${Math.round(
    rect.width
  )},height=${Math.round(rect.height)}`;
}

/**
 * Owns the lifecycle of the 5 real Chrome popup windows (WORLD, SUN, PRISM,
 * EARTH, MARS). Launch is atomic: if any popup fails to open, every popup
 * opened during that attempt is closed and the registry is cleared before
 * returning failure — callers never observe a partial set of open windows.
 */
export class WindowManager {
  private registry: Map<DeviceId, Window> = new Map();
  private pollHandle: ReturnType<typeof setInterval> | undefined;

  /**
   * `level`, when given, opens only that level's devices (sun + its
   * instruments + its receivers, see level/types.ts's devicesForLevel) at
   * that level's own positions, and tags each popup URL with `?level=` so
   * the device page can resolve its own upstream chain (see
   * level/session.ts). Omitting it preserves the ORIGINAL behavior exactly
   * — every device, at the fixed DEVICE_LAYOUTS spot — so any existing
   * caller (or a device page opened directly) is unaffected.
   */
  async launchAll(sessionId: string, level?: LevelDefinition): Promise<LaunchResult> {
    // Defensive: never accumulate windows across attempts.
    this.closeAll();

    let workArea;
    try {
      workArea = await computeWorkArea();
    } catch (err) {
      return { ok: false, error: `화면 정보를 가져오지 못했습니다: ${String(err)}` };
    }

    const layouts = level ? resolveDeviceLayoutsForLevel(level) : DEVICE_LAYOUTS;
    const deviceIds = level ? layouts.map((l) => l.id) : DEVICE_IDS;

    const opened: Map<DeviceId, Window> = new Map();

    for (const id of deviceIds) {
      const layout = layouts.find((l: { id: DeviceId }) => l.id === id);
      if (!layout) {
        this.closeOpened(opened);
        return { ok: false, error: `레이아웃 정의가 없습니다: ${id}` };
      }

      const rect = resolveWindowFeatures(layout, workArea);
      const win = window.open(urlFor(id, sessionId, level?.id), popupNameFor(id), featuresString(rect));

      if (!win) {
        this.closeOpened(opened);
        return { ok: false, error: `팝업이 차단되어 열리지 않았습니다: ${deviceLabel(id)}` };
      }

      opened.set(id, win);
    }

    // Full success: adopt into the real registry.
    this.registry = opened;
    this.startPolling();

    const windows = {} as Record<DeviceId, Window>;
    for (const [id, win] of this.registry) {
      windows[id] = win;
    }
    return { ok: true, windows };
  }

  closeAll(): void {
    this.closeOpened(this.registry);
    this.registry = new Map();
    this.stopPolling();
  }

  isOpen(id: DeviceId): boolean {
    const win = this.registry.get(id);
    return !!win && !win.closed;
  }

  get(id: DeviceId): Window | undefined {
    return this.registry.get(id);
  }

  private closeOpened(map: Map<DeviceId, Window>): void {
    for (const win of map.values()) {
      try {
        if (!win.closed) {
          win.close();
        }
      } catch {
        // ignore — window may already be gone / cross-origin restricted
      }
    }
    map.clear();
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollHandle = setInterval(() => {
      for (const [id, win] of this.registry) {
        if (win.closed) {
          this.registry.delete(id);
        }
      }
    }, 500);
  }

  private stopPolling(): void {
    if (this.pollHandle !== undefined) {
      clearInterval(this.pollHandle);
      this.pollHandle = undefined;
    }
  }
}
