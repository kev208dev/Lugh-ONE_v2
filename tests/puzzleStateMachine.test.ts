import { describe, it, expect } from 'vitest';
import { PuzzleStateMachine } from '../src/puzzle/PuzzleStateMachine';

describe('PuzzleStateMachine', () => {
  it('stays PLAYING while never satisfied', () => {
    const psm = new PuzzleStateMachine(1500);
    expect(psm.update(false, 0).state).toBe('PLAYING');
    expect(psm.update(false, 1000).state).toBe('PLAYING');
  });

  it('enters STABILIZING the instant satisfied flips true, with growing holdProgress', () => {
    const psm = new PuzzleStateMachine(1500);
    let tick = psm.update(true, 0);
    expect(tick.state).toBe('STABILIZING');
    expect(tick.holdProgress).toBe(0);

    tick = psm.update(true, 750);
    expect(tick.state).toBe('STABILIZING');
    expect(tick.holdProgress).toBeCloseTo(0.5, 5);
  });

  it('drops back to PLAYING with holdProgress 0 if satisfied breaks mid-hold', () => {
    const psm = new PuzzleStateMachine(1500);
    psm.update(true, 0);
    psm.update(true, 900);
    const tick = psm.update(false, 1000);
    expect(tick.state).toBe('PLAYING');
    expect(tick.holdProgress).toBe(0);
  });

  it('re-satisfying after a break restarts the hold clock from the new timestamp', () => {
    const psm = new PuzzleStateMachine(1500);
    psm.update(true, 0);
    psm.update(false, 500); // break
    const tick = psm.update(true, 800);
    expect(tick.state).toBe('STABILIZING');
    expect(tick.holdProgress).toBe(0);
  });

  it('reaches SOLVED once held continuously for the full duration', () => {
    const psm = new PuzzleStateMachine(1500);
    psm.update(true, 0);
    psm.update(true, 1000);
    const tick = psm.update(true, 1500);
    expect(tick.state).toBe('SOLVED');
  });

  it('SOLVED is sticky — later satisfied=false does not undo it, and no reset() is required to keep it sticky', () => {
    const psm = new PuzzleStateMachine(1500);
    psm.update(true, 0);
    psm.update(true, 1500);
    expect(psm.state).toBe('SOLVED');

    const tick = psm.update(false, 5000);
    expect(tick.state).toBe('SOLVED');
    expect(psm.state).toBe('SOLVED');
  });

  it('reset() returns a SOLVED machine to PLAYING', () => {
    const psm = new PuzzleStateMachine(1500);
    psm.update(true, 0);
    psm.update(true, 1500);
    expect(psm.state).toBe('SOLVED');

    psm.reset();
    expect(psm.state).toBe('PLAYING');
    expect(psm.update(false, 2000).state).toBe('PLAYING');
  });

  it('enterIntro()/enterTransitioning() force state and make update() a no-op until beginPlaying()', () => {
    const psm = new PuzzleStateMachine(1500);
    psm.enterIntro();
    expect(psm.state).toBe('INTRO');
    expect(psm.update(true, 0).state).toBe('INTRO');

    psm.beginPlaying();
    expect(psm.state).toBe('PLAYING');
    expect(psm.update(true, 0).state).toBe('STABILIZING');

    psm.enterTransitioning();
    expect(psm.state).toBe('TRANSITIONING');
    expect(psm.update(true, 100).state).toBe('TRANSITIONING');
  });
});
