export const SOLVED_REVEAL_DELAY_MS = 1700;
export const AUTO_ADVANCE_DELAY_MS = 1400;

export type SolvedSequence = {
  cancel: () => void;
};

type SolvedSequenceOptions = {
  currentLevelIndex: number;
  levelCount: number;
  onReveal: (nextLevelIndex: number | null, advance: () => void) => void;
  onAdvance: (nextLevelIndex: number) => void;
  revealDelayMs?: number;
  autoAdvanceDelayMs?: number;
};

/**
 * Drives the launcher-only solved sequence. A non-final experiment reveals
 * its actions and then advances automatically, while the supplied `advance`
 * callback lets the visible NEXT button perform the same idempotent action
 * immediately.
 */
export function startSolvedSequence({
  currentLevelIndex,
  levelCount,
  onReveal,
  onAdvance,
  revealDelayMs = SOLVED_REVEAL_DELAY_MS,
  autoAdvanceDelayMs = AUTO_ADVANCE_DELAY_MS
}: SolvedSequenceOptions): SolvedSequence {
  const nextLevelIndex = currentLevelIndex + 1 < levelCount ? currentLevelIndex + 1 : null;
  let revealTimer: ReturnType<typeof setTimeout> | undefined;
  let advanceTimer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  let advanced = false;

  const cancel = (): void => {
    cancelled = true;
    if (revealTimer !== undefined) clearTimeout(revealTimer);
    if (advanceTimer !== undefined) clearTimeout(advanceTimer);
    revealTimer = undefined;
    advanceTimer = undefined;
  };

  const advance = (): void => {
    if (cancelled || advanced || nextLevelIndex === null) return;
    advanced = true;
    if (advanceTimer !== undefined) clearTimeout(advanceTimer);
    advanceTimer = undefined;
    onAdvance(nextLevelIndex);
  };

  revealTimer = setTimeout(() => {
    revealTimer = undefined;
    if (cancelled) return;

    onReveal(nextLevelIndex, advance);
    if (nextLevelIndex !== null && !advanced && !cancelled) {
      advanceTimer = setTimeout(advance, autoAdvanceDelayMs);
    }
  }, revealDelayMs);

  return { cancel };
}
