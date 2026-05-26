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
 * human-readable skill name (Sword / Axe / Skulduggery / etc.) is not
 * yet rigorously verified against the engine. Martydill's open-source
 * RE repo provides a plausible ordering (see comment in `SKILL_INDEX_MAP`
 * stub below) that cross-validates against the stock characters'
 * decoded skill values, but the binary evidence for the exact mapping
 * remains a follow-up RE task. Treat `availability[i][N]` as "the bit
 * for skill slot N as the engine stores it" — the *meaning* of slot N
 * is the unresolved part.
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
 * Slot-to-name mapping for the 30 skill slots. **Speculative ordering**
 * from martydill's `bane/data/character_parser.py` SKILL_INDEX_MAP,
 * cross-validated against stock-character skill values (THESUS Axe@1=10,
 * LYSANDR Skulduggery@15=10, NOBAL Theology@26=7, etc.). Not yet
 * binary-verified against wpcmk asm.
 *
 * `null` entries indicate "hole" slots in martydill's map; the engine may
 * use them for something we haven't decoded.
 */
export const SKILL_SLOT_NAMES: readonly (string | null)[] = [
  // Weaponry (slots 0-9, 10 bits in the first group)
  'Sword', 'Axe', 'Polearm', 'Mace & Flail', 'Dagger',
  'Staff & Wand', 'Shield', 'Modern Weapons', 'Bow', 'Thrown Weapons',
  // Physical (slots 10-16, 7 bits in the second group)
  null,           // slot 10 — hole per martydill
  'Sling', 'Whip', 'Music', 'Legerdemain',
  'Skulduggery', 'Ninjutsu',
  // (slots 17-21, 5 bits in the third group) — mostly holes per martydill
  null, null, null, null, null,
  // Academia (slots 22-29, 8 bits in the fourth group)
  'Scouting', 'Mythology', 'Scribe', 'Alchemy',
  'Theology', 'Theosophy', 'Thaumaturgy', 'Kirijutsu',
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
