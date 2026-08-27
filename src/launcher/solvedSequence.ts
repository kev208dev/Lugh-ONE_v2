export const SOLVED_REVEAL_DELAY_MS = 700;

export type SolvedSequence = {
  cancel: () => void;
};

type SolvedSequenceOptions = {
  currentLevelIndex: number;
  levelCount: number;
  onReveal: (nextLevelIndex: number | null, advance: () => void) => void;
  onAdvance: (nextLevelIndex: number) => void;
  revealDelayMs?: number;
};

/**
 * Drives the launcher-only solved sequence. Advancing deliberately requires
 * the visible button: Chrome may block the next experiment's popup windows
 * when they are opened from a timer without a fresh user gesture.
 */
export function startSolvedSequence({
  currentLevelIndex,
  levelCount,
  onReveal,
  onAdvance,
  revealDelayMs = SOLVED_REVEAL_DELAY_MS
}: SolvedSequenceOptions): SolvedSequence {
  const nextLevelIndex = currentLevelIndex + 1 < levelCount ? currentLevelIndex + 1 : null;
  let revealTimer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  let advanced = false;

  const cancel = (): void => {
    cancelled = true;
    if (revealTimer !== undefined) clearTimeout(revealTimer);
    revealTimer = undefined;
  };

  const advance = (): void => {
    if (cancelled || advanced || nextLevelIndex === null) return;
    advanced = true;
    onAdvance(nextLevelIndex);
  };

  revealTimer = setTimeout(() => {
    revealTimer = undefined;
    if (cancelled) return;

    onReveal(nextLevelIndex, advance);
  }, revealDelayMs);

  return { cancel };
}
