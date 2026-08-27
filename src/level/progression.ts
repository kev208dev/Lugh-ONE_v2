const STORAGE_KEY = 'lugh_one_progress_v2';

export interface Progress {
  highestSolvedLevel: number;
  solvedLevelIds: string[];
}

const EMPTY_PROGRESS: Progress = { highestSolvedLevel: 0, solvedLevelIds: [] };

function isProgress(value: unknown): value is Progress {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as Progress).highestSolvedLevel === 'number' &&
    Array.isArray((value as Progress).solvedLevelIds)
  );
}

/** Never throws — a corrupt/missing/unavailable localStorage value is
 * treated as "no progress yet" rather than breaking the launcher. */
export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_PROGRESS };
    const parsed: unknown = JSON.parse(raw);
    return isProgress(parsed) ? parsed : { ...EMPTY_PROGRESS };
  } catch {
    return { ...EMPTY_PROGRESS };
  }
}

function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Storage unavailable (private mode, quota, etc.) — progress just
    // won't persist across sessions; never break the SOLVED flow over it.
  }
}

/** Records a level as solved (idempotent — solving the same level twice is
 * harmless) and returns the updated progress. */
export function markSolved(levelId: string, levelIndex: number): Progress {
  const current = loadProgress();
  const solvedLevelIds = current.solvedLevelIds.includes(levelId)
    ? current.solvedLevelIds
    : [...current.solvedLevelIds, levelId];
  const updated: Progress = {
    highestSolvedLevel: Math.max(current.highestSolvedLevel, levelIndex),
    solvedLevelIds
  };
  saveProgress(updated);
  return updated;
}

/** Clears every completed-level record and returns a fresh progress value. */
export function resetProgress(): Progress {
  const empty = { ...EMPTY_PROGRESS, solvedLevelIds: [] };
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // The caller still receives fresh in-memory progress when storage is
    // unavailable, matching loadProgress/markSolved's fail-safe behavior.
  }
  return empty;
}

export function isLevelSolved(levelId: string): boolean {
  return loadProgress().solvedLevelIds.includes(levelId);
}
