import { describe, it, expect, beforeEach } from 'vitest';
import { loadProgress, markSolved, isLevelSolved } from '../src/level/progression';

describe('progression', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts empty when nothing has been saved yet', () => {
    expect(loadProgress()).toEqual({ highestSolvedLevel: 0, solvedLevelIds: [] });
  });

  it('markSolved records the level and bumps highestSolvedLevel', () => {
    const p = markSolved('level01', 1);
    expect(p.highestSolvedLevel).toBe(1);
    expect(p.solvedLevelIds).toEqual(['level01']);
    expect(isLevelSolved('level01')).toBe(true);
    expect(isLevelSolved('level02')).toBe(false);
  });

  it('markSolved is idempotent for the same level', () => {
    markSolved('level01', 1);
    const p = markSolved('level01', 1);
    expect(p.solvedLevelIds).toEqual(['level01']);
  });

  it('highestSolvedLevel never decreases when an earlier level is solved again', () => {
    markSolved('level02', 2);
    const p = markSolved('level01', 1);
    expect(p.highestSolvedLevel).toBe(2);
    expect(p.solvedLevelIds.sort()).toEqual(['level01', 'level02']);
  });

  it('treats corrupt stored JSON as empty progress rather than throwing', () => {
    localStorage.setItem('lugh_one_progress_v2', '{not json');
    expect(loadProgress()).toEqual({ highestSolvedLevel: 0, solvedLevelIds: [] });
  });
});
