import { describe, it, expect } from 'vitest';
import {
  LEVEL01_TARGET_PERCENT,
  LEVEL01_SUSTAIN_MS,
  LevelTracker
} from '../src/level/level01';

describe('LEVEL01 constants', () => {
  it('locks in the spec-defined target percent and sustain duration', () => {
    expect(LEVEL01_TARGET_PERCENT).toBe(60);
    expect(LEVEL01_SUSTAIN_MS).toBe(1000);
  });
});

describe('LevelTracker', () => {
  it('stays not-complete with sustainedMs at 0 when both readings are always below target', () => {
    const tracker = new LevelTracker();
    let state = tracker.update(50, 55, 0);
    expect(state.complete).toBe(false);
    expect(state.sustainedMs).toBe(0);

    state = tracker.update(50, 55, 200);
    expect(state.complete).toBe(false);
    expect(state.sustainedMs).toBe(0);

    state = tracker.update(50, 55, 900);
    expect(state.complete).toBe(false);
    expect(state.sustainedMs).toBe(0);
  });

  it('accumulates sustainedMs while both stay above target, but is not complete before the sustain duration elapses', () => {
    const tracker = new LevelTracker();
    let state = tracker.update(65, 70, 0);
    expect(state.sustainedMs).toBe(0);
    expect(state.complete).toBe(false);

    state = tracker.update(65, 70, 500);
    expect(state.sustainedMs).toBe(500);
    expect(state.complete).toBe(false);
  });

  it('becomes complete once the streak reaches the sustain duration', () => {
    const tracker = new LevelTracker();
    tracker.update(65, 70, 0);
    tracker.update(65, 70, 500);

    let state = tracker.update(65, 70, 1000);
    expect(state.sustainedMs).toBeGreaterThanOrEqual(1000);
    expect(state.complete).toBe(true);

    state = tracker.update(65, 70, 1200);
    expect(state.sustainedMs).toBeGreaterThanOrEqual(1000);
    expect(state.complete).toBe(true);
  });

  it('resets sustainedMs to 0 when the streak is interrupted, and restarts the timer fresh (not resumed) on the next streak', () => {
    const tracker = new LevelTracker();
    let state = tracker.update(65, 70, 0);
    expect(state.sustainedMs).toBe(0);

    state = tracker.update(65, 70, 400);
    expect(state.sustainedMs).toBe(400);
    expect(state.complete).toBe(false);

    // one receiver drops below target -> interruption
    state = tracker.update(59, 70, 500);
    expect(state.sustainedMs).toBe(0);
    expect(state.complete).toBe(false);

    // both back above target -> new streak starts at nowMs=600
    state = tracker.update(65, 70, 600);
    expect(state.sustainedMs).toBe(0);

    state = tracker.update(65, 70, 700);
    expect(state.sustainedMs).toBe(100);
    expect(state.complete).toBe(false);
  });

  it('is sticky: complete stays true even after percentages later drop well below target', () => {
    const tracker = new LevelTracker();
    tracker.update(65, 70, 0);
    let state = tracker.update(65, 70, 1000);
    expect(state.complete).toBe(true);

    state = tracker.update(10, 10, 2000);
    expect(state.complete).toBe(true);
    expect(state.sustainedMs).toBe(0);
  });

  it('reset() clears the sticky complete flag and the in-progress timer', () => {
    const tracker = new LevelTracker();
    tracker.update(65, 70, 0);
    let state = tracker.update(65, 70, 1000);
    expect(state.complete).toBe(true);

    tracker.reset();
    expect(tracker.state.complete).toBe(false);
    expect(tracker.state.sustainedMs).toBe(0);

    state = tracker.update(10, 10, 1100);
    expect(state.complete).toBe(false);
    expect(state.sustainedMs).toBe(0);
  });

  it('treats exactly 60 as at-or-above target (inclusive boundary), and 59.999 as below', () => {
    const tracker = new LevelTracker();
    let state = tracker.update(60, 60, 0);
    expect(state.sustainedMs).toBe(0);
    expect(state.complete).toBe(false);

    state = tracker.update(60, 60, 1000);
    expect(state.sustainedMs).toBeGreaterThanOrEqual(1000);
    expect(state.complete).toBe(true);

    const tracker2 = new LevelTracker();
    state = tracker2.update(59.999, 60, 0);
    expect(state.sustainedMs).toBe(0);
    expect(state.complete).toBe(false);

    state = tracker2.update(59.999, 60, 1000);
    expect(state.sustainedMs).toBe(0);
    expect(state.complete).toBe(false);
  });

  it('exposes the initial state via .state before any update() call', () => {
    const tracker = new LevelTracker();
    expect(tracker.state).toEqual({ complete: false, sustainedMs: 0 });
  });

  it('.state reflects the same object/value last returned by update() without needing a new reading', () => {
    const tracker = new LevelTracker();
    const updated = tracker.update(65, 70, 0);
    expect(tracker.state).toEqual(updated);
  });
});
