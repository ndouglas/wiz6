/**
 * Class skill-availability bitmaps — which of the 30 skill slots each
 * class is allowed to train.
 *
 * Static data baked into wpcmk.ovr at file offset 0x5cb8..0x5e93 (476
 * bytes). For each of 14 classes, the engine stores 4 null-terminated
 * ASCII '0'/'1' strings of lengths [10, 7, 5, 8] = 30 bits, matching the
 * 30-byte skill block in the character record at +0x134..+0x151.
 *
 * We surface the 4 strings concatenated into a single 30-element boolean
 * array per class. `availability[classIndex][skillSlot] === true` means
 * that class can train that skill slot.
 *
 * **Slot ordering note:** the mapping from `skillSlot` (0..29) to a
 * skill name is now binary-verified — the engine draws each name as
 * `msg(0x157c + slot)`, so `SKILL_SLOT_NAMES` below holds the canonical
 * engine names (msg ids 5500..5529). This replaces the earlier speculative
 * martydill ordering. RE: `docs/re/findings/wpcvw-skill-names.json`.
 */

const CLASS_NAMES_FOR_SKILLS = [
  'Fighter', 'Mage', 'Priest', 'Thief', 'Ranger', 'Alchemist',
  'Bard', 'Psionic', 'Valkyrie', 'Bishop', 'Lord', 'Samurai', 'Monk', 'Ninja',
] as const;

/**
 * Bit-pattern strings as decoded from wpcmk.ovr. Each class has 4 strings
 * of lengths [10, 7, 5, 8]; we expose the concatenated 30-bit pattern.
 * Internal use only — consumers should use `CLASS_SKILL_AVAILABILITY` below.
 */
const RAW_30_BIT_PATTERNS: readonly string[] = [
  // class 0  Fighter
  '111111111001000000000011100000',
  // class 1  Mage
  '100011110001010000000011100010',
  // class 2  Priest
  '000110101001010000000011101000',
  // class 3  Thief
  '111111111001011110000011100000',
  // class 4  Ranger
  '111111111001001110000011110000',
  // class 5  Alchemist
  '100111000001000000000011110000',
  // class 6  Bard
  '111111111001111110000011100010',
  // class 7  Psionic
  '100111100001010000000011100100',
  // class 8  Valkyrie
  '111111111001010000000011101000',
  // class 9  Bishop
  '000110101001010000000011101010',
  // class 10 Lord
  '111111111001010000000011101000',
  // class 11 Samurai
  '111111111001010000000011100011',
  // class 12 Monk
  '100111110101010010000011100101',
  // class 13 Ninja
  '111111111101001110000011110001',
];

/**
 * Per-class skill availability. `CLASS_SKILL_AVAILABILITY[classIndex][skillSlot]`
 * is true if the class can train that skill slot.
 *
 * 14 classes × 30 skill slots each.
 */
export const CLASS_SKILL_AVAILABILITY: readonly (readonly boolean[])[] =
  RAW_30_BIT_PATTERNS.map((bits) => bits.split('').map((c) => c === '1'));

/**
 * Slot-to-name mapping for the 30 skill slots. **Binary-anchored** to the
 * engine: the wpcvw SKILL viewer (and the wpcmk skill-train screen) draws
 * each skill's name as `msg(0x157c + slot)` directly (1:1), so these are the
 * engine's canonical names from `extracted/messages/msg.json` ids 5500..5529.
 * RE: `docs/re/findings/wpcvw-skill-names.json` (render loop at wpcvw 0xa285).
 *
 * This SUPERSEDES the prior speculative martydill SKILL_INDEX_MAP, which had
 * the WEAPONRY block (0-9) reordered and treated slots 10 and 17-21 as
 * "holes" — they are real skills (SWIMMING + the whole PERSONAL category
 * DEFENSE/SPEED/MOVEMENT/AIM/POWER). All 30 slots are named; none are null.
 *
 * Names are upper-cased exactly as the engine stores them. The 4-category
 * taxonomy (WEAPONRY 0..9, PHYSICAL 10..16, PERSONAL 17..21, ACADEMIA 22..29)
 * matches the `[10,7,5,8]` bit-groups of CLASS_SKILL_AVAILABILITY.
 */
export const SKILL_SLOT_NAMES: readonly string[] = [
  // Weaponry (slots 0-9)
  'WAND&DAGGER', 'SWORD', 'AXE', 'MACE&FLAIL', 'POLE&STAFF',
  'THROWING', 'SLING', 'BOWS', 'SHIELD', 'HANDS&FEET',
  // Physical (slots 10-16)
  'SWIMMING', 'SCOUTING', 'MUSIC', 'ORATORY', 'LEGERDEMAIN',
  'SKULDUGGERY', 'NINJUTSU',
  // Personal (slots 17-21)
  'DEFENSE', 'SPEED', 'MOVEMENT', 'AIM', 'POWER',
  // Academia (slots 22-29)
  'ARTIFACTS', 'MYTHOLOGY', 'SCRIBE', 'ALCHEMY',
  'THEOLOGY', 'THEOSOPHY', 'THAUMATURGY', 'KIRIJUTSU',
];

/** Returns the array of skill slot indices a class can train. */
export function availableSkillSlots(classIndex: number): number[] {
  const bits = CLASS_SKILL_AVAILABILITY[classIndex];
  if (!bits) {
    throw new Error(`class index ${classIndex} out of range (valid 0..${CLASS_SKILL_AVAILABILITY.length - 1})`);
  }
  const out: number[] = [];
  for (let i = 0; i < bits.length; i++) if (bits[i]) out.push(i);
  return out;
}

/**
 * Returns true if the given class can train the given skill slot.
 */
export function classCanTrainSkill(classIndex: number, skillSlot: number): boolean {
  const bits = CLASS_SKILL_AVAILABILITY[classIndex];
  if (!bits) {
    throw new Error(`class index ${classIndex} out of range`);
  }
  if (skillSlot < 0 || skillSlot >= bits.length) {
    throw new Error(`skill slot ${skillSlot} out of range (valid 0..${bits.length - 1})`);
  }
  return bits[skillSlot] ?? false;
}

/** Convenience: array of `{ index, name }` for human-readable class iteration. */
export const CLASS_INDEX_TO_NAME = CLASS_NAMES_FOR_SKILLS.map((name, index) => ({ index, name }));
