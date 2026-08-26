import { describe, it, expect } from 'vitest';
import { LEVELS, levelById } from '../src/level/levels/index';
import type { DevicePlacement } from '../src/level/types';

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
});
