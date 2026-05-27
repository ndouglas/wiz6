import type { WichmannHill } from '../rng/wichmann-hill.js';

/**
 * Maximum value `rollBonus` can return: 5 + 5 (max of rng(6)) + 8 + 8 = 26.
 * The `pinMaxBonusRoll` house rule uses this to skip the bonus-roll grind.
 */
export const MAX_BONUS_POINTS = 26;

/** wpcmk stat_roller_bonus @ 0x4e81: 5 + rng(6), then +8 on each of two 1/20 rolls. */
export function rollBonus(rng: WichmannHill): number {
  let bonus = 5 + rng.uniform(6);
  if (rng.uniform(20) === 0) bonus += 8;
  if (rng.uniform(20) === 0) bonus += 8;
  return bonus;
}
