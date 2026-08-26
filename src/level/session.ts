import type { LevelDefinition } from './types';
import { getLevelById, LEVELS } from './levels';

/** Query-param key each device popup's URL carries alongside `session` so
 * it can look up which level it belongs to (see WindowManager, which is the
 * only thing that ever sets this param when opening a popup). */
const LEVEL_PARAM = 'level';

export function levelIdFromUrl(): string | null {
  return new URLSearchParams(location.search).get(LEVEL_PARAM);
}

/**
 * Resolves the current page's level from its own URL, or `null` if there is
 * no (or an unrecognized) `?level=` param — e.g. a device page opened
 * directly outside the launcher's flow. Callers must treat `null` as "use
 * the original fixed sun->mirror->blackhole->prism->earth/mars chain",
 * never throw, so opening a device page without a level param keeps working
 * exactly as it always has.
 */
export function currentLevel(): LevelDefinition | null {
  const id = levelIdFromUrl();
  if (!id) return null;
  return getLevelById(id) ?? null;
}

export { LEVELS, getLevelById, LEVEL_PARAM };
