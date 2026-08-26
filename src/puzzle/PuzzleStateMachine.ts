import type { PuzzleState } from '../level/types';

export interface PuzzleTick {
  state: PuzzleState;
  /** 0..1 while STABILIZING (elapsed/holdDurationMs); 0 in every other
   * state — including SOLVED, where "how long we held it" no longer means
   * anything actionable to a caller. */
  holdProgress: number;
}

/**
 * Sticky-hold state machine driven by an externally-evaluated `satisfied`
 * boolean (see GoalEvaluator.evaluateGoal) — mirrors the deterministic,
 * caller-supplied-clock pattern already used by src/level/level01.ts's
 * LevelTracker (nowMs injected, no internal Date.now()/performance.now()
 * reads, fully testable with literal timestamps).
 *
 * PLAYING <-> STABILIZING flip instantly on `satisfied` changing; SOLVED is
 * reached once STABILIZING has been held continuously for `holdDurationMs`
 * and is STICKY from then on — update() no longer moves it, even once
 * `satisfied` later goes false. Only reset() (an explicit "restart the
 * level" action) or the caller-driven enterIntro()/enterTransitioning() move
 * it elsewhere. INTRO and TRANSITIONING are likewise caller-driven only:
 * update() is a documented no-op while in either of those states, since
 * they represent "the puzzle loop isn't running right now" (level just
 * started / level is being swapped out), not something goal-satisfaction
 * should be able to interrupt.
 */
export class PuzzleStateMachine {
  private readonly holdDurationMs: number;
  private _state: PuzzleState = 'PLAYING';
  private stableSinceMs: number | null = null;

  constructor(holdDurationMs: number) {
    this.holdDurationMs = holdDurationMs;
  }

  get state(): PuzzleState {
    return this._state;
  }

  /** Feed a fresh goal-satisfaction reading. No-op (state and holdProgress
   * both stay put) while in INTRO/TRANSITIONING/SOLVED — SOLVED is
   * intentionally sticky, INTRO/TRANSITIONING are caller-driven only. */
  update(satisfied: boolean, nowMs: number): PuzzleTick {
    if (this._state === 'INTRO' || this._state === 'TRANSITIONING' || this._state === 'SOLVED') {
      return { state: this._state, holdProgress: 0 };
    }

    if (!satisfied) {
      this._state = 'PLAYING';
      this.stableSinceMs = null;
      return { state: this._state, holdProgress: 0 };
    }

    if (this.stableSinceMs === null) {
      this.stableSinceMs = nowMs;
    }
    const elapsed = nowMs - this.stableSinceMs;

    if (elapsed >= this.holdDurationMs) {
      this._state = 'SOLVED';
      return { state: this._state, holdProgress: 0 };
    }

    this._state = 'STABILIZING';
    const holdProgress = this.holdDurationMs <= 0 ? 1 : Math.min(1, elapsed / this.holdDurationMs);
    return { state: this._state, holdProgress };
  }

  /** Caller-driven: force INTRO (e.g. the moment a level's popups finish
   * spawning, before the player has touched anything). */
  enterIntro(): void {
    this._state = 'INTRO';
    this.stableSinceMs = null;
  }

  /** Caller-driven: force TRANSITIONING (e.g. "NEXT EXPERIMENT" clicked,
   * tearing down this level's windows before the next one's spawn). */
  enterTransitioning(): void {
    this._state = 'TRANSITIONING';
    this.stableSinceMs = null;
  }

  /** Caller-driven: leave INTRO/TRANSITIONING and resume normal update()
   * handling — e.g. once the level's intro banner has faded, or once the
   * next level's windows have finished spawning. */
  beginPlaying(): void {
    this._state = 'PLAYING';
    this.stableSinceMs = null;
  }

  /** Full reset to PLAYING, even from a sticky SOLVED — the only way SOLVED
   * ever moves. Not called automatically by update(). */
  reset(): void {
    this._state = 'PLAYING';
    this.stableSinceMs = null;
  }
}
