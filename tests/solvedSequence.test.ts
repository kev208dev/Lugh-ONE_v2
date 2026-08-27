import { afterEach, describe, expect, it, vi } from 'vitest';
import { startSolvedSequence } from '../src/launcher/solvedSequence';

describe('launcher solved sequence', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('automatically advances experiment 3 to the black-hole experiment 4', () => {
    vi.useFakeTimers();
    const onReveal = vi.fn();
    const onAdvance = vi.fn();

    startSolvedSequence({
      currentLevelIndex: 2,
      levelCount: 5,
      onReveal,
      onAdvance,
      revealDelayMs: 1700,
      autoAdvanceDelayMs: 1400
    });

    vi.advanceTimersByTime(1699);
    expect(onReveal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onReveal).toHaveBeenCalledWith(3, expect.any(Function));
    expect(onAdvance).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1400);
    expect(onAdvance).toHaveBeenCalledTimes(1);
    expect(onAdvance).toHaveBeenCalledWith(3);
  });

  it('lets NEXT advance immediately and never auto-wraps the final experiment', () => {
    vi.useFakeTimers();
    const onAdvance = vi.fn();
    let manualAdvance: (() => void) | undefined;

    startSolvedSequence({
      currentLevelIndex: 2,
      levelCount: 5,
      onReveal: (_next, advance) => {
        manualAdvance = advance;
      },
      onAdvance,
      revealDelayMs: 10,
      autoAdvanceDelayMs: 10
    });
    vi.advanceTimersByTime(10);
    manualAdvance?.();
    vi.runAllTimers();
    expect(onAdvance).toHaveBeenCalledTimes(1);
    expect(onAdvance).toHaveBeenCalledWith(3);

    const finalAdvance = vi.fn();
    const finalReveal = vi.fn();
    startSolvedSequence({
      currentLevelIndex: 4,
      levelCount: 5,
      onReveal: finalReveal,
      onAdvance: finalAdvance,
      revealDelayMs: 10,
      autoAdvanceDelayMs: 10
    });
    vi.runAllTimers();
    expect(finalReveal).toHaveBeenCalledWith(null, expect.any(Function));
    expect(finalAdvance).not.toHaveBeenCalled();
  });
});
