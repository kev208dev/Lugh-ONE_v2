export const LEVEL01_TARGET_PERCENT = 60;
export const LEVEL01_SUSTAIN_MS = 1000;

export interface LevelState {
  /** true once the sustain condition has been met at least once — STICKY:
   * remains true forever after, even if percentages later drop below
   * target again. A "level complete" achievement doesn't un-complete. */
  complete: boolean;
  /** how many continuous ms both receivers have been AT OR ABOVE target,
   * right now — resets to 0 the instant either one drops below target.
   * (This keeps counting up past LEVEL01_SUSTAIN_MS if the player keeps
   * holding the alignment after already completing — it's just informational,
   * `complete` is what actually matters and never goes back to false.) */
  sustainedMs: number;
}

/**
 * Tracks whether both receivers have been simultaneously at/above
 * LEVEL01_TARGET_PERCENT for at least LEVEL01_SUSTAIN_MS continuous
 * milliseconds. Time is injected via the `nowMs` parameter (not read from
 * the system clock internally) so this is fully deterministic and testable
 * without fake timers.
 */
export class LevelTracker {
  private aboveSinceMs: number | null = null;
  private everCompleted = false;
  private _state: LevelState = { complete: false, sustainedMs: 0 };

  /**
   * Call this every time fresh receiver percentages are known (e.g. every
   * physics recompute tick). `nowMs` should be a monotonically
   * non-decreasing timestamp from the caller (e.g. `performance.now()` or
   * `Date.now()` in real use, or literal test values in a test).
   * Returns the updated LevelState (also retrievable via `.state`).
   */
  update(earthPercent: number, marsPercent: number, nowMs: number): LevelState {
    const bothAbove =
      earthPercent >= LEVEL01_TARGET_PERCENT && marsPercent >= LEVEL01_TARGET_PERCENT;

    let sustainedMs: number;
    if (bothAbove) {
      if (this.aboveSinceMs === null) {
        this.aboveSinceMs = nowMs;
      }
      sustainedMs = nowMs - this.aboveSinceMs;
      if (sustainedMs >= LEVEL01_SUSTAIN_MS) {
        this.everCompleted = true;
      }
    } else {
      this.aboveSinceMs = null;
      sustainedMs = 0;
    }

    this._state = { complete: this.everCompleted, sustainedMs };
    return this._state;
  }

  /** Current state without feeding a new reading (same object last returned
   * by update(), or the initial not-complete/zero state before any update()
   * call). */
  get state(): LevelState {
    return this._state;
  }

  /** Fully resets both `complete` (even if it was already stickily true)
   * and the in-progress sustain timer. Not called automatically by
   * update() — only for an explicit "restart the level" action elsewhere
   * in the app. */
  reset(): void {
    this.aboveSinceMs = null;
    this.everCompleted = false;
    this._state = { complete: false, sustainedMs: 0 };
  }
}
