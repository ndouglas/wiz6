/**
 * Karma roll formula — decoded from wpcmk.ovr at file offset 0x3837.
 *
 * The engine rolls karma via:
 *   1. karma = rng(19)   (uniform 0..18, stored at DGROUP 0x55a3)
 *   2. if [DGROUP 0x560e] == 1: karma += 1
 *
 * Step 2 is a personality-reroll flag: the "click to keep watching dice"
 * idle loop at 0x3837 sets [0x560e] = 1 when the user clicks/presses RETURN
 * to confirm, rather than just timing out. Mechanically this means the player
 * gets a free +1 to karma by actively confirming. The code clears [0x560e]
 * to 0 after use.
 *
 * **Asm evidence (wpcmk file 0x3837, verified bytes):**
 * ```
 * b8 13 00        ; mov ax, 19
 * 50              ; push ax
 * e8 f3 8b        ; call rng_thunk (uniform 0..ax-1)
 * 59              ; pop cx
 * a2 a3 55        ; mov [0x55a3], al   ; store karma
 * 80 3e 0e 56 01  ; cmp [0x560e], 1
 * 75 04           ; jnz skip
 * fe 06 a3 55     ; inc byte [0x55a3]  ; +1 if flag set
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
 * All values fall in 0..19, consistent with `rng(19)` + optional +1 (max 19).
 *
 * **Range:** 0..18 without the flag; 1..19 with the flag (flag fires if
 * the player actively confirms during the personality-reroll sequence).
 * The +1 flag adds a small bias toward higher karma for engaged players.
 */

/**
 * Karma roll parameters decoded from wpcmk.ovr 0x3837.
 *
 * `base_range` = number of outcomes for `rng(base_range)` = 0..(base_range-1).
 * `personality_bonus` = added when the player actively confirms (flag at DGROUP 0x560e).
 */
export const KARMA_ROLL = {
  /** `rng(base_range)` gives 0..18. */
  base_range: 19,
  /** Added if the personality-reroll confirm flag is set. */
  personality_bonus: 1,
} as const;

/**
 * Simulate one karma roll as the engine performs it.
 *
 * @param rng01  A uniform-random function returning a float in [0, 1).
 *               Defaults to `Math.random`.  Use a seeded RNG for tests.
 * @param personalityConfirmed  Whether the player actively confirmed the
 *               personality roll (sets the +1 flag).  Defaults to `false`.
 * @returns Karma value in 0..18 (or 1..19 if personalityConfirmed).
 */
export function rollKarma(
  rng01: () => number = Math.random,
  personalityConfirmed = false,
): number {
  const base = Math.floor(rng01() * KARMA_ROLL.base_range); // uniform 0..18
  return base + (personalityConfirmed ? KARMA_ROLL.personality_bonus : 0);
}

/**
 * Simulate one karma roll using a WichmannHill RNG, as the engine performs it.
 *
 * Adapter over rollKarma that uses `rng.uniform(19)` instead of a float-based
 * RNG function. This matches the engine's direct call to the bounded RNG.
 *
 * @param rng  A WichmannHill instance that will be advanced once.
 * @param personalityConfirmed  Whether the player actively confirmed the
 *        personality roll (sets the +1 flag).  Defaults to `false`.
 * @returns Karma value in 0..18 (or 1..19 if personalityConfirmed).
 */
export function rollKarmaWith(
  rng: any, // WichmannHill, but avoid circular import
  personalityConfirmed = false,
): number {
  const base = rng.uniform(KARMA_ROLL.base_range); // uniform 0..18
  return base + (personalityConfirmed ? KARMA_ROLL.personality_bonus : 0);
}

/**
 * Minimum karma from a normal roll (without personality confirm bonus).
 * Matches: min = 0.
 */
export const KARMA_MIN = 0;

/**
 * Maximum karma from a normal roll (without personality confirm bonus).
 * Matches: max = base_range - 1 = 18.
 */
export const KARMA_MAX = KARMA_ROLL.base_range - 1;

/**
 * Maximum karma when personality confirm bonus fires.
 * Matches: max = base_range - 1 + personality_bonus = 19.
 */
export const KARMA_MAX_WITH_BONUS =
  KARMA_ROLL.base_range - 1 + KARMA_ROLL.personality_bonus;
