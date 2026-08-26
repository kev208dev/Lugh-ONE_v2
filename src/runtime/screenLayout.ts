import type { DeviceLayout, WorkArea } from './types';

/**
 * Default popup layout, expressed as CENTER-point percentages (0..1) of the
 * WorkArea, per the design spec. Do not deviate from these numbers without
 * updating the design spec.
 */
export const DEVICE_LAYOUTS: DeviceLayout[] = [
  // WORLD is a small debug/HUD window in Phase 0 (no optics rendering yet).
  { id: 'world', xPct: 0.1, yPct: 0.1, width: 420, height: 280 },
  // Height bumped from 200 to 260: at Windows display-scale factors above
  // 100% (125%/150%, very common on laptops), the label + multi-line debug
  // HUD text can overflow a 200px-tall popup and get clipped by body's
  // overflow:hidden — the physics-hud line (bottom-most) disappears first.
  { id: 'sun', xPct: 0.15, yPct: 0.5, width: 260, height: 260 },
  { id: 'mirror', xPct: 0.32, yPct: 0.25, width: 260, height: 260 },
  { id: 'blackhole', xPct: 0.32, yPct: 0.75, width: 260, height: 260 },
  { id: 'prism', xPct: 0.5, yPct: 0.5, width: 260, height: 260 },
  { id: 'mars', xPct: 0.8, yPct: 0.35, width: 260, height: 260 },
  { id: 'earth', xPct: 0.8, yPct: 0.68, width: 260, height: 260 }
];

function fallbackWorkArea(): WorkArea {
  // availLeft/availTop are widely supported at runtime but not part of the
  // standard TS DOM lib's Screen type, so access them via a narrow cast.
  const screen = window.screen as Screen & { availLeft?: number; availTop?: number };
  return {
    left: screen.availLeft ?? 0,
    top: screen.availTop ?? 0,
    width: screen.availWidth,
    height: screen.availHeight
  };
}

/**
 * Resolves the usable screen work area. Prefers the Window Management API
 * (requires the 'window-management' permission) when it is ALREADY granted,
 * and always falls back to window.screen.avail* otherwise. Never throws.
 *
 * Deliberately does not call getScreenDetails() when permission is not yet
 * granted: that call would show a native permission prompt and await the
 * user's response, which burns the transient user-activation from the
 * START click — every window.open() called afterwards in the same launch
 * would then be silently blocked as a popup. Checking permission state via
 * permissions.query() first is not itself gated on activation and resolves
 * near-instantly, so it doesn't have this problem.
 */
export async function computeWorkArea(): Promise<WorkArea> {
  const w = window as any;
  if (typeof w.getScreenDetails === 'function') {
    try {
      const status = await navigator.permissions.query({ name: 'window-management' as PermissionName });
      if (status.state === 'granted') {
        const screenDetails = await w.getScreenDetails();
        const screen = screenDetails?.currentScreen ?? screenDetails?.screens?.[0];
        if (screen) {
          return {
            left: screen.availLeft,
            top: screen.availTop,
            width: screen.availWidth,
            height: screen.availHeight
          };
        }
      }
    } catch {
      // Permission API unsupported for this name, or query itself failed —
      // fall through to the safe synchronous fallback below.
    }
  }
  return fallbackWorkArea();
}

/**
 * Fire-and-forget: prompts for the window-management permission (if
 * supported and not already decided) so that a LATER launch attempt in this
 * session can use the real multi-screen work area. Must never be awaited by
 * the launch flow itself — see computeWorkArea's doc comment.
 */
export function requestWindowManagementPermissionInBackground(): void {
  const w = window as any;
  if (typeof w.getScreenDetails === 'function') {
    w.getScreenDetails().catch(() => {
      // ignore — user declined or API unsupported, fallback layout stands
    });
  }
}

/**
 * Computes the top-left + size for a popup window given its center-point
 * layout and the current work area, clamped so the full popup rect stays
 * within the work area bounds.
 */
export function resolveWindowFeatures(
  layout: DeviceLayout,
  workArea: WorkArea
): { left: number; top: number; width: number; height: number } {
  const rawLeft = workArea.left + layout.xPct * workArea.width - layout.width / 2;
  const rawTop = workArea.top + layout.yPct * workArea.height - layout.height / 2;

  const maxLeft = Math.max(workArea.left, workArea.left + workArea.width - layout.width);
  const maxTop = Math.max(workArea.top, workArea.top + workArea.height - layout.height);

  const left = Math.min(Math.max(rawLeft, workArea.left), maxLeft);
  const top = Math.min(Math.max(rawTop, workArea.top), maxTop);

  return {
    left,
    top,
    width: Math.max(0, layout.width),
    height: Math.max(0, layout.height)
  };
}
