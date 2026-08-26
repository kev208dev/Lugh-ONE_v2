import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeChromeInset, GeometryTracker } from '../src/runtime/GeometryTracker';
import { resolveWindowFeatures } from '../src/runtime/screenLayout';
import type { DeviceLayout, WorkArea } from '../src/runtime/types';

describe('computeChromeInset', () => {
  it('computes the top inset from outer/inner height delta', () => {
    const fakeWin = {
      outerWidth: 800,
      outerHeight: 640,
      innerWidth: 784,
      innerHeight: 600
    } as unknown as Window;

    const inset = computeChromeInset(fakeWin);
    expect(inset.top).toBe(40);
    expect(inset.left).toBe(8);
  });

  it('clamps negative deltas to 0', () => {
    const fakeWin = {
      outerWidth: 100,
      outerHeight: 100,
      innerWidth: 120,
      innerHeight: 120
    } as unknown as Window;

    const inset = computeChromeInset(fakeWin);
    expect(inset.top).toBe(0);
    expect(inset.left).toBe(0);
  });
});

describe('resolveWindowFeatures', () => {
  const workArea: WorkArea = { left: 0, top: 0, width: 1000, height: 800 };

  it('centers a popup at the given percentage for a mid-screen case', () => {
    const layout: DeviceLayout = { id: 'prism', xPct: 0.5, yPct: 0.5, width: 260, height: 200 };
    const rect = resolveWindowFeatures(layout, workArea);

    // center should land at (500, 400) => left/top offset by half the size
    expect(rect.left).toBe(500 - 130);
    expect(rect.top).toBe(400 - 100);
    expect(rect.width).toBe(260);
    expect(rect.height).toBe(200);
  });

  it('respects a non-zero work area origin', () => {
    const offsetWorkArea: WorkArea = { left: 100, top: 50, width: 1000, height: 800 };
    const layout: DeviceLayout = { id: 'sun', xPct: 0.15, yPct: 0.5, width: 260, height: 200 };
    const rect = resolveWindowFeatures(layout, offsetWorkArea);

    const expectedCenterX = 100 + 0.15 * 1000;
    const expectedCenterY = 50 + 0.5 * 800;
    expect(rect.left).toBe(expectedCenterX - 130);
    expect(rect.top).toBe(expectedCenterY - 100);
  });

  it('clamps left to the work area bounds when center is near xPct=0', () => {
    const layout: DeviceLayout = { id: 'sun', xPct: 0.01, yPct: 0.5, width: 260, height: 200 };
    const rect = resolveWindowFeatures(layout, workArea);

    expect(rect.left).toBeGreaterThanOrEqual(workArea.left);
    expect(rect.left).toBe(workArea.left);
    expect(rect.left + rect.width).toBeLessThanOrEqual(workArea.left + workArea.width);
  });

  it('clamps top/left to the work area bounds when center is near the far edge', () => {
    const layout: DeviceLayout = { id: 'mars', xPct: 0.99, yPct: 0.99, width: 260, height: 200 };
    const rect = resolveWindowFeatures(layout, workArea);

    expect(rect.left + rect.width).toBeLessThanOrEqual(workArea.left + workArea.width);
    expect(rect.top + rect.height).toBeLessThanOrEqual(workArea.top + workArea.height);
    expect(rect.left).toBeGreaterThanOrEqual(workArea.left);
    expect(rect.top).toBeGreaterThanOrEqual(workArea.top);
  });

  it('never produces a negative left/top even when the popup is bigger than the work area', () => {
    const tinyWorkArea: WorkArea = { left: 0, top: 0, width: 100, height: 100 };
    const layout: DeviceLayout = { id: 'sun', xPct: 0.5, yPct: 0.5, width: 420, height: 280 };
    const rect = resolveWindowFeatures(layout, tinyWorkArea);

    expect(rect.left).toBe(0);
    expect(rect.top).toBe(0);
    expect(rect.width).toBeGreaterThanOrEqual(0);
    expect(rect.height).toBeGreaterThanOrEqual(0);
  });
});

describe('GeometryTracker', () => {
  function makeFakeWindow(overrides: Partial<Window> = {}) {
    return {
      screenX: 10,
      screenY: 20,
      outerWidth: 300,
      outerHeight: 250,
      innerWidth: 284,
      innerHeight: 210,
      ...overrides
    } as unknown as Window;
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits an initial geometry synchronously when start() is called', () => {
    const win = makeFakeWindow();
    const onUpdate = vi.fn();
    const tracker = new GeometryTracker('sun', win, onUpdate);

    tracker.start();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const g = onUpdate.mock.calls[0][0];
    expect(g.id).toBe('sun');
    expect(g.screenX).toBe(10);
    expect(g.screenY).toBe(20);
    expect(g.chromeInsetTop).toBe(40);

    tracker.stop();
  });

  it('does not invoke onUpdate again after stop()', () => {
    const win = makeFakeWindow();
    const onUpdate = vi.fn();
    const tracker = new GeometryTracker('mars', win, onUpdate);

    tracker.start();
    expect(onUpdate).toHaveBeenCalledTimes(1);

    tracker.stop();
    vi.advanceTimersByTime(5000);

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('stop() before start() does not throw', () => {
    const win = makeFakeWindow();
    const tracker = new GeometryTracker('earth', win, vi.fn());
    expect(() => tracker.stop()).not.toThrow();
  });

  it('emits again once geometry changes on a later poll', () => {
    const win = makeFakeWindow();
    const onUpdate = vi.fn();
    const tracker = new GeometryTracker('prism', win, onUpdate);

    tracker.start();
    expect(onUpdate).toHaveBeenCalledTimes(1);

    // Simulate the window moving.
    (win as any).screenX = 50;
    vi.advanceTimersByTime(60); // past the ~50ms fast poll tick

    expect(onUpdate.mock.calls.length).toBeGreaterThanOrEqual(2);
    const last = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0];
    expect(last.screenX).toBe(50);

    tracker.stop();
  });
});
