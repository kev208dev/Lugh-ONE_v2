import type { DeviceId, WindowGeometry } from './types';

const FAST_POLL_MS = 50; // ~20Hz while geometry is actively changing
const IDLE_POLL_MS = 300; // ~3Hz once geometry has settled
const SETTLE_MS = 500; // how long geometry must be unchanged before dropping to idle rate

/** Approximate browser chrome inset, derived from outer/inner deltas. */
export function computeChromeInset(win: Window): { top: number; left: number } {
  return {
    top: Math.max(0, win.outerHeight - win.innerHeight),
    left: Math.max(0, (win.outerWidth - win.innerWidth) / 2)
  };
}

interface Sample {
  screenX: number;
  screenY: number;
  outerWidth: number;
  outerHeight: number;
}

function sample(win: Window): Sample {
  return {
    screenX: win.screenX,
    screenY: win.screenY,
    outerWidth: win.outerWidth,
    outerHeight: win.outerHeight
  };
}

function sameSample(a: Sample, b: Sample): boolean {
  return (
    a.screenX === b.screenX &&
    a.screenY === b.screenY &&
    a.outerWidth === b.outerWidth &&
    a.outerHeight === b.outerHeight
  );
}

function toGeometry(id: DeviceId, win: Window, s: Sample): WindowGeometry {
  const inset = computeChromeInset(win);
  return {
    id,
    screenX: s.screenX,
    screenY: s.screenY,
    outerWidth: s.outerWidth,
    outerHeight: s.outerHeight,
    innerWidth: win.innerWidth,
    innerHeight: win.innerHeight,
    chromeInsetTop: inset.top,
    chromeInsetLeft: inset.left,
    timestamp: Date.now()
  };
}

/**
 * Polls a popup window's geometry (position/size) with a self-adjusting
 * delay: fast (~20Hz) while it's actively changing (e.g. being dragged or
 * resized), dropping to a slow idle rate (~3Hz) once it has been stable for
 * a while, and snapping back to fast on the next change. Uses a recursive
 * setTimeout (not setInterval) so the delay can change dynamically.
 */
export class GeometryTracker {
  private readonly id: DeviceId;
  private readonly win: Window;
  private readonly onUpdate: (g: WindowGeometry) => void;

  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastSample: Sample | undefined;
  private lastChangeAt = 0;
  private settledEmitted = true;

  constructor(id: DeviceId, win: Window, onUpdate: (g: WindowGeometry) => void) {
    this.id = id;
    this.win = win;
    this.onUpdate = onUpdate;
  }

  start(): void {
    this.stop();

    const now = Date.now();
    const initial = sample(this.win);
    this.lastSample = initial;
    this.lastChangeAt = now;
    this.settledEmitted = false;

    // Always emit one initial geometry immediately.
    this.onUpdate(toGeometry(this.id, this.win, initial));
    this.settledEmitted = true;

    this.scheduleNext(FAST_POLL_MS);
  }

  stop(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private scheduleNext(delay: number): void {
    this.timer = setTimeout(() => this.tick(), delay);
  }

  private tick(): void {
    const current = sample(this.win);
    const previous = this.lastSample;
    const changed = !previous || !sameSample(previous, current);
    const now = Date.now();

    if (changed) {
      this.lastSample = current;
      this.lastChangeAt = now;
      this.settledEmitted = false;
      this.onUpdate(toGeometry(this.id, this.win, current));
      this.scheduleNext(FAST_POLL_MS);
      return;
    }

    const stableFor = now - this.lastChangeAt;
    if (stableFor > SETTLE_MS) {
      if (!this.settledEmitted) {
        this.settledEmitted = true;
        this.onUpdate(toGeometry(this.id, this.win, current));
      }
      this.scheduleNext(IDLE_POLL_MS);
      return;
    }

    // Not yet changed, but also not yet past the settle threshold — keep
    // polling at the fast rate so we catch the transition promptly.
    this.scheduleNext(FAST_POLL_MS);
  }
}
