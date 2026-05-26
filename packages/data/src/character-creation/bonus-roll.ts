import type { WichmannHill } from '../rng/wichmann-hill.js';

/** wpcmk stat_roller_bonus @ 0x4e81: 5 + rng(6), then +8 on each of two 1/20 rolls. */
export function rollBonus(rng: WichmannHill): number {
  let bonus = 5 + rng.uniform(6);
  if (rng.uniform(20) === 0) bonus += 8;
  if (rng.uniform(20) === 0) bonus += 8;
  return bonus;
}
