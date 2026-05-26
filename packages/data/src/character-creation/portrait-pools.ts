/**
 * Portrait pools — decoded from wpcmk.ovr character-creation overlay.
 *
 * ## Key finding: portraits are chosen by CLASS, index is SPD+1
 *
 * **Portrait picker (wpcmk 0x3c49):**
 * The portrait picker reads the class index from DGROUP 0x560f (= char_base +0x19f),
 * dispatches via a 14-entry jump table, and for each class pushes 5 portrait
 * reference values then calls the portrait-display function at 0x3bfb.
 *
 * ```asm
 * a0 0f 56    ; mov al, [0x560f]   ; class index (0..13)
 * 2a e4       ; sub ah, ah
 * e9 af 01    ; jmp 0x3e06         ; dispatch table (14 cases, one per class)
 * ```
 *
 * Each class case pushes 5 portrait reference values then calls 0x3bfb, which
 * iterates them and calls the per-portrait renderer for each non-zero value.
 *
 * **Portrait index formula (wpcmk 0x4ded):**
 * After the UI selection, the stored portrait index is computed as:
 *
 * ```asm
 * a0 a1 55    ; mov al, [0x55a1]   ; SPD byte (char_base + 0x131)
 * fe c0       ; inc al             ; portraitIndex = SPD + 1
 * a2 1b 56    ; mov [0x561b], al   ; store portraitIndex (char_base + 0x1ab)
 * ```
 *
 * Verified bytes: `a0 a1 55 fe c0 a2 1b 56`
 *
 * **Cross-validation against all 6 stock characters (pcfile.dbs):**
 * | Character | Class    | SPD | portraitIndex | SPD+1 |
 * |-----------|----------|-----|---------------|-------|
 * | THESUS    | Fighter  |   9 |            10 | 10 ✓  |
 * | TEMPEST   | Fighter  |   7 |             8 |  8 ✓  |
 * | LYSANDR   | Thief    |  12 |            13 | 13 ✓  |
 * | NOBAL     | Priest   |   9 |            10 | 10 ✓  |
 * | TREON     | Mage     |   8 |             9 |  9 ✓  |
 * | PENTAG    | Mage     |   6 |             7 |  7 ✓  |
 *
 * **Consequence:** portraitIndex is NOT chosen by the player from a per-class
 * pool — it is derived deterministically from SPD after the stats roll.
 * The "portrait picker" UI shows class-appropriate portrait options to the player
 * for visual browsing, but the STORED portraitIndex is always `floor(SPD) + 1`.
 * Range: 0+1=1 (SPD=0) to 18+1=19 (SPD=18), capped by 14 portrait slots (0..13).
 *
 * **Unresolved:** It's unclear whether the inc-al formula is truncated to 0..13
 * somewhere downstream, or whether very high SPD values (≥14) would produce an
 * out-of-range portrait index. No stock char has SPD≥13 to test the ceiling.
 */

/**
 * Number of portrait choices shown to the player during character creation.
 * The picker at wpcmk 0x3c49 always passes exactly 5 reference values per class
 * to the portrait-display function at 0x3bfb.
 */
export const PORTRAIT_PICKER_CHOICES_PER_CLASS = 5;

/**
 * Per-class portrait reference values passed to the portrait picker.
 *
 * `PORTRAIT_POOL_BY_CLASS[classIndex]` is an array of 5 portrait reference IDs
 * used by the engine to display the portrait options during character creation.
 * These are engine-internal reference numbers (not stored to pcfile); the actual
 * stored portraitIndex is computed from SPD (see `computePortraitIndex`).
 *
 * **Source:** 5-push+call pattern at wpcmk 0x3c57..0x3dde (14 class cases).
 * Each case pushes exactly 5 u16 values then calls 0x3bfb. All 5 values are
 * non-zero for all 14 classes.
 *
 * **Class ordering:** same as `CLASS_INDEX_TO_NAME` (Fighter=0..Ninja=13).
 */
export const PORTRAIT_POOL_BY_CLASS: readonly (readonly number[])[] = [
  // class 0  Fighter   (wpcmk 0x3c57)
  [141, 130, 132, 135, 8],
  // class 1  Mage      (wpcmk 0x3c74)
  [335, 130, 123, 122, 18],
  // class 2  Priest    (wpcmk 0x3c91)
  [316, 130, 123, 122, 24],
  // class 3  Thief     (wpcmk 0x3cae)
  [27, 131, 121, 120, 6],
  // class 4  Ranger    (wpcmk 0x3ccb)
  [131, 127, 126, 33, 31],
  // class 5  Alchemist (wpcmk 0x3ce8)
  [326, 130, 123, 122, 18],
  // class 6  Bard      (wpcmk 0x3d05)
  [55, 121, 120, 30, 29],
  // class 7  Psionic   (wpcmk 0x3d22)
  [241, 130, 123, 122, 1],
  // class 8  Valkyrie  (wpcmk 0x3d3f)
  [138, 130, 125, 124, 22],
  // class 9  Bishop    (wpcmk 0x3d5c)
  [163, 130, 123, 122, 24],
  // class 10 Lord      (wpcmk 0x3d79)
  [143, 131, 134, 133, 9],
  // class 11 Samurai   (wpcmk 0x3d96)
  [130, 123, 122, 4, 10],
  // class 12 Monk      (wpcmk 0x3db2)
  [130, 123, 122, 47, 25],
  // class 13 Ninja     (wpcmk 0x3dce)
  [161, 159, 158, 160, 47],
] as const;

/**
 * Compute the portrait index that the engine stores at pcfile +0x1ab.
 *
 * **Formula:** `portraitIndex = spd + 1`
 *
 * Decoded from wpcmk 0x4ded (bytes `a0 a1 55 fe c0 a2 1b 56`):
 * - Load SPD byte from DGROUP 0x55a1 (= char_base + 0x131)
 * - Increment by 1
 * - Store to DGROUP 0x561b (= char_base + 0x1ab = portraitIndex field)
 *
 * Cross-validated against all 6 stock characters: all match exactly.
 *
 * @param spd  The character's rolled SPD attribute (0..18).
 * @returns Portrait index stored at pcfile +0x1ab.
 */
export function computePortraitIndex(spd: number): number {
  return spd + 1;
}

/**
 * Minimum portrait index (when SPD = 0).
 */
export const PORTRAIT_INDEX_MIN = 1;

/**
 * Maximum portrait index for a character with maximum SPD (18).
 * Note: it is unknown whether the engine clamps this to 0..13 (the 14-portrait
 * file size) or whether high SPD values are unreachable in practice due to
 * the attribute roll formula (rng(18) + race_bonus capped at 18).
 */
export const PORTRAIT_INDEX_MAX_SPD18 = 19;
