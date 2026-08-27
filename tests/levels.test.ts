import { describe, it, expect } from 'vitest';
import { LEVELS, levelById } from '../src/level/levels/index';
import { devicesForLevel, type DevicePlacement } from '../src/level/types';
import { evaluateGoal } from '../src/puzzle/GoalEvaluator';

describe('LEVELS', () => {
  it('has five valid, uniquely identified levels', () => {
    expect(LEVELS).toHaveLength(5);
    expect(new Set(LEVELS.map((level) => level.id)).size).toBe(5);
    expect(LEVELS.map((level) => level.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it('has valid receiver power ranges and placements', () => {
    for (const level of LEVELS) {
      for (const req of level.goal.receivers) {
        expect(req.minPower).toBeGreaterThanOrEqual(0);
        expect(req.minPower).toBeLessThanOrEqual(100);
        if (req.maxPower !== undefined) {
          expect(req.maxPower).toBeGreaterThan(req.minPower);
          expect(req.maxPower).toBeLessThanOrEqual(100);
        }
      }
      const placedIds = new Set(level.initialDevicePlacement.map((p: DevicePlacement) => p.id));
      for (const deviceId of level.requiredDevices) expect(placedIds.has(deviceId)).toBe(true);
    }
  });

  it('looks levels up by id', () => {
    for (const level of LEVELS) expect(levelById(level.id)).toBe(level);
    expect(levelById('not-a-real-level')).toBeUndefined();
  });

  it('opens unique full-absorption nebula windows for the veil level', () => {
    const veil = levelById('veil')!;
    expect(veil.nebulae).toHaveLength(2);
    expect(new Set(veil.nebulae?.map((nebula) => nebula.id)).size).toBe(2);
    expect(veil.nebulae?.every((nebula) => nebula.attenuation === 1)).toBe(true);
    expect(devicesForLevel(veil)).toEqual(expect.arrayContaining(['nebula-1', 'nebula-2']));
  });

  it('makes the fourth experiment a required black-hole puzzle', () => {
    const gravity = LEVELS[3];
    expect(gravity.id).toBe('gravity');
    expect(gravity.requiredDevices).toContain('blackhole');
    expect(devicesForLevel(gravity)).toEqual(
      expect.arrayContaining(['sun', 'blackhole', 'prism', 'earth'])
    );
  });

  it('accepts 100% on both planets as a solution for the third experiment', () => {
    const balance = LEVELS[2];
    expect(balance.id).toBe('balance');
    expect(balance.goal.receivers.every((receiver) => receiver.maxPower === undefined)).toBe(true);
    expect(evaluateGoal(balance.goal, { earth: 100, mars: 100 }).satisfied).toBe(true);
  });
});
