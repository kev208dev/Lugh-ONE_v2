import type { LevelDefinition } from '../types';
import { level01 } from './level01';
import { level02 } from './level02';
import { level03 } from './level03';
import { level04 } from './level04';
import { level05 } from './level05';

/** The 5 shipped levels, in play order (index 0..4 matches array order). */
export const LEVELS: LevelDefinition[] = [level01, level02, level03, level04, level05];

export function getLevelById(id: string): LevelDefinition | undefined {
  return LEVELS.find((level) => level.id === id);
}

export const levelById = getLevelById;
