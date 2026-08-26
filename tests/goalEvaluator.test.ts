import { describe, it, expect } from 'vitest';
import { evaluateGoal } from '../src/puzzle/GoalEvaluator';
import type { LevelGoal } from '../src/level/types';

describe('evaluateGoal', () => {
  it('is not satisfied when a receiver is below minPower', () => {
    const goal: LevelGoal = {
      receivers: [{ receiverId: 'earth', minPower: 55 }],
      simultaneous: true,
      holdDurationMs: 1500
    };
    const result = evaluateGoal(goal, { earth: 40 });
    expect(result.satisfied).toBe(false);
    expect(result.perReceiver[0].pass).toBe(false);
    expect(result.perReceiver[0].passMin).toBe(false);
  });

  it('is satisfied once every requirement meets its minPower', () => {
    const goal: LevelGoal = {
      receivers: [
        { receiverId: 'earth', minPower: 55 },
        { receiverId: 'mars', minPower: 55 }
      ],
      simultaneous: true,
      holdDurationMs: 1500
    };
    expect(evaluateGoal(goal, { earth: 60, mars: 55 }).satisfied).toBe(true);
    expect(evaluateGoal(goal, { earth: 60, mars: 54 }).satisfied).toBe(false);
  });

  it('treats a missing receiver reading as 0 power', () => {
    const goal: LevelGoal = {
      receivers: [{ receiverId: 'mars', minPower: 10 }],
      simultaneous: true,
      holdDurationMs: 1500
    };
    const result = evaluateGoal(goal, {});
    expect(result.perReceiver[0].currentPower).toBe(0);
    expect(result.satisfied).toBe(false);
  });

  it('fails via maxPower overexposure even when minPower is met', () => {
    const goal: LevelGoal = {
      receivers: [{ receiverId: 'earth', minPower: 55, maxPower: 75 }],
      simultaneous: true,
      holdDurationMs: 1500
    };
    const result = evaluateGoal(goal, { earth: 90 });
    expect(result.perReceiver[0].passMin).toBe(true);
    expect(result.perReceiver[0].passMax).toBe(false);
    expect(result.perReceiver[0].pass).toBe(false);
    expect(result.satisfied).toBe(false);
  });

  it('passes within an inclusive [minPower, maxPower] band', () => {
    const goal: LevelGoal = {
      receivers: [{ receiverId: 'earth', minPower: 55, maxPower: 75 }],
      simultaneous: true,
      holdDurationMs: 1500
    };
    expect(evaluateGoal(goal, { earth: 55 }).satisfied).toBe(true);
    expect(evaluateGoal(goal, { earth: 75 }).satisfied).toBe(true);
    expect(evaluateGoal(goal, { earth: 65 }).satisfied).toBe(true);
  });

  it('ignores a receiver not mentioned in goal.receivers entirely', () => {
    const goal: LevelGoal = {
      receivers: [{ receiverId: 'earth', minPower: 65 }],
      simultaneous: true,
      holdDurationMs: 1500
    };
    // mars sitting at 0% shouldn't block a level that only cares about earth.
    expect(evaluateGoal(goal, { earth: 70, mars: 0 }).satisfied).toBe(true);
  });

  it('a spectralRange.minContribution with no supplied data defaults to passing', () => {
    const goal: LevelGoal = {
      receivers: [
        {
          receiverId: 'earth',
          minPower: 50,
          spectralRange: { minNm: 430, maxNm: 560, minContribution: 80 }
        }
      ],
      simultaneous: true,
      holdDurationMs: 1500
    };
    expect(evaluateGoal(goal, { earth: 60 }).satisfied).toBe(true);
  });

  it('a spectralRange.minContribution WITH supplied data enforces the floor', () => {
    const goal: LevelGoal = {
      receivers: [
        {
          receiverId: 'earth',
          minPower: 50,
          spectralRange: { minNm: 430, maxNm: 560, minContribution: 80 }
        }
      ],
      simultaneous: true,
      holdDurationMs: 1500
    };
    expect(evaluateGoal(goal, { earth: 60 }, { earth: 90 }).satisfied).toBe(true);
    expect(evaluateGoal(goal, { earth: 60 }, { earth: 50 }).satisfied).toBe(false);
  });
});
