/**
 * Karma roll formula — decoded from wpcmk.ovr at file offset 0x3837
 * (`wpcmk_personality_reroll_loop`).
 *
 * Per loop iteration:
 *   1. karma = rng(19)               (uniform 0..18, stored at DGROUP 0x55a3)
 *   2. if [DGROUP 0x560e] == 1: karma += 1
 *
 * **`*0x560e` is the SEX byte** (0 = Male, 1 = Female — established during the
 * character-creation cell-parity work). So step 2 reads: **the +1 bonus is
 * applied iff the character is female.** The earlier "personality-reroll-confirm"
 * interpretation of this byte was wrong — Nate caught it.
 *
 * **Asm evidence (wpcmk file 0x3884..0x389a, verified bytes):**
 * ```
 * b8 13 00            ; mov ax, 19
 * 50                  ; push ax
 * e8 f3 8b            ; call rng_thunk (uniform 0..18)
 * 59                  ; pop cx
 * a2 a3 55            ; mov [0x55a3], al      ; store karma
 * 80 3e 0e 56 01      ; cmp [0x560e], 1       ; sex == female?
 * 75 04               ; jnz skip
 * fe 06 a3 55         ; inc byte [0x55a3]     ; karma += 1
 * ```
 *
 * **Cross-validation against stock characters (pcfile.dbs):**
 * | Character | Class    | Karma |
 * |-----------|----------|-------|
 * | THESUS    | Fighter  |    14 |
 * | TEMPEST   | Fighter  |    16 |
 * | LYSANDR   | Thief    |    15 |
 * | NOBAL     | Priest   |     4 |
 * | TREON     | Mage     |     3 |
 * | PENTAG    | Mage     |     9 |
 *
 * All values fall in 0..19, consistent with `rng(19)` + optional +1 (female max 19).
 *
 * **Range:** 0..18 for males; 1..19 for females.
 */

import type { Rng } from './derived-stats.js';

/**
 * Karma roll parameters decoded from wpcmk.ovr 0x3884.
 *
 * `base_range` = number of outcomes for `rng(base_range)` = 0..(base_range-1).
 * `female_bonus` = added when the character's sex is female (`*0x560e == 1`).
 */
export const KARMA_ROLL = {
  /** `rng(base_range)` gives 0..18. */
  base_range: 19,
  /** Added if the character is female (engine checks `[0x560e] == 1`). */
  female_bonus: 1,
} as const;

/**
 * Simulate one karma roll as the engine performs it.
 *
 * @param rng01    A uniform-random function returning a float in [0, 1).
 *                 Defaults to `Math.random`. Use a seeded RNG for tests.
 * @param isFemale Whether the character's sex is female (engine flag
 *                 `[0x560e] == 1`). When true, adds +1 to the base roll.
 *                 Defaults to false.
 * @returns Karma value in 0..18 (male) or 1..19 (female).
 */
export function rollKarma(
  rng01: () => number = Math.random,
  isFemale = false,
): number {
  const base = Math.floor(rng01() * KARMA_ROLL.base_range); // uniform 0..18
  return base + (isFemale ? KARMA_ROLL.female_bonus : 0);
}

/**
 * Simulate one karma roll using a WichmannHill RNG, as the engine performs it.
 *
 * Adapter over rollKarma that uses `rng.uniform(19)` instead of a float-based
 * RNG function. This matches the engine's direct call to the bounded RNG.
 *
 * @param rng      A WichmannHill instance that will be advanced once.
 * @param isFemale Whether the character's sex is female. +1 to karma if true.
 * @returns Karma value in 0..18 (male) or 1..19 (female).
 */
export function rollKarmaWith(rng: Rng, isFemale = false): number {
  const base = rng.uniform(KARMA_ROLL.base_range); // uniform 0..18
  return base + (isFemale ? KARMA_ROLL.female_bonus : 0);
}

/** Minimum karma from a normal roll. min = 0. */
export const KARMA_MIN = 0;

/** Maximum karma for a male character. max = base_range - 1 = 18. */
export const KARMA_MAX = KARMA_ROLL.base_range - 1;

/** Maximum karma for a female character (with the +1 bonus). max = 19. */
export const KARMA_MAX_FEMALE = KARMA_ROLL.base_range - 1 + KARMA_ROLL.female_bonus;

/** @deprecated — keep for backward compatibility; use KARMA_MAX_FEMALE. */
export const KARMA_MAX_WITH_BONUS = KARMA_MAX_FEMALE;
