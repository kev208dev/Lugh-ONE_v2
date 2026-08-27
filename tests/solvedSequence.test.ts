import { afterEach, describe, expect, it, vi } from 'vitest';
import { startSolvedSequence } from '../src/launcher/solvedSequence';

describe('launcher solved sequence', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reveals experiment 4 without opening its popup windows from a timer', () => {
    vi.useFakeTimers();
    const onReveal = vi.fn();
    const onAdvance = vi.fn();

    startSolvedSequence({
      currentLevelIndex: 2,
      levelCount: 5,
      onReveal,
      onAdvance,
      revealDelayMs: 700
    });

    vi.advanceTimersByTime(699);
    expect(onReveal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onReveal).toHaveBeenCalledWith(3, expect.any(Function));
    expect(onAdvance).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10_000);
    expect(onAdvance).not.toHaveBeenCalled();
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
      revealDelayMs: 10
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
      revealDelayMs: 10
    });
    vi.runAllTimers();
    expect(finalReveal).toHaveBeenCalledWith(null, expect.any(Function));
    expect(finalAdvance).not.toHaveBeenCalled();
  });
});
