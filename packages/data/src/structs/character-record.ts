import type { BssStruct } from './bss-types.js';

/**
 * Per-character record. Stored in a 6-slot party array at DGROUP `0x43e8`
 * with stride `0x1b0` (432 bytes per record). Source:
 * `docs/re/wpcvw-character-view.md` § "Character record layout".
 *
 * This is the most important struct in the engine for player-facing state.
 * v1 covers the documented fields; many bytes within the record are still
 * unmapped at the per-byte level (statuses, equipped item indices,
 * spell-school known bitmaps). Refine over time.
 */
export const CHARACTER_RECORD: BssStruct = {
  name: 'character_record',
  bytes: 0x1b0,
  source: 'docs/re/wpcvw-character-view.md',
  description: '432-byte per-character record. Party array at 0x43e8 stride 0x1b0.',
  fields: [
    {
      name: 'name',
      offset: 0x00,
      // Name occupies the bytes before XP at +0x0c, so 12 bytes max. Original
      // Wiz6 typically allowed shorter names (~7-8 chars); the decoder stops
      // at the first null byte so shorter names trim cleanly.
      type: { kind: 'string', length: 12, encoding: 'ascii' },
      description: 'ASCII character name. Null-terminated; decoder stops at first 0 byte.',
    },
    {
      name: 'xp',
      offset: 0x0c,
      type: { kind: 'scalar', scalar: 'u32_le' },
      description: 'Experience points (32-bit).',
    },
    {
      name: 'gold',
      offset: 0x10,
      type: { kind: 'scalar', scalar: 'u32_le' },
      description: '32-bit gold; 64-bit-safe add/subtract path documented in wpcvw findings.',
    },
    {
      name: 'level',
      offset: 0x440c - 0x43e8,
      type: { kind: 'scalar', scalar: 'u16_le' },
      description:
        'Current character level. Class-change resets to 1; old level saved at +0x4597 (saved_old_level).',
    },
    {
      name: 'saved_old_level',
      offset: 0x4597 - 0x43e8,
      type: { kind: 'scalar', scalar: 'u8' },
      description:
        'Level before most recent class change. Six different stat / HP / skill paths consult this to throttle growth until current level catches back up.',
    },
    {
      name: 'conditions',
      offset: 0x450a - 0x43e8,
      type: { kind: 'bytes', length: 10 },
      description:
        '10-condition tracker (poisoned, paralyzed, etc.). Worst rendered via the priority table at cs:0x532 in wpcvw.',
    },
    {
      name: 'dead_flag',
      offset: 0x450c - 0x43e8,
      type: { kind: 'scalar', scalar: 'u8' },
      description: 'Hard dead flag; consulted by the TPK alive-count check.',
    },
    {
      name: 'paralyzed_flag',
      offset: 0x450d - 0x43e8,
      type: { kind: 'scalar', scalar: 'u8' },
    },
    // Six base attributes — STR / INT / PIE / VIT / DEX / SPD at 0x4518..0x451d.
    // Plus 2 "personality" bytes at 0x451e..0x451f (likely Personality + Karma;
    // exact name order unverified — see wpcvw findings open question).
    {
      name: 'attributes',
      offset: 0x4518 - 0x43e8,
      type: {
        kind: 'array',
        length: 8,
        element: { kind: 'scalar', scalar: 'u8' },
      },
      description:
        'STR / INT / PIE / VIT / DEX / SPD + 2 personality bytes (likely Personality + Karma; exact order unverified).',
    },
    {
      name: 'race',
      offset: 0x4587 - 0x43e8,
      type: { kind: 'scalar', scalar: 'u8' },
      description: 'Race index. 5 = Faerie (hard-coded special-case penalties; see Notes card "faerie-tax").',
    },
    {
      name: 'class',
      offset: 0x4588 - 0x43e8,
      type: { kind: 'scalar', scalar: 'u8' },
      description: 'Class index. 3=Thief, 12=Monk, 13=Ninja (used by AC + skill scaling).',
    },
    {
      name: 'reaction',
      offset: 0x4550 - 0x43e8,
      type: { kind: 'scalar', scalar: 'u8' },
      description: 'NPC reaction value; used by charm + dialogue paths.',
    },
    // Per-school mana at +0x4410: six 32-bit MP pools (24 bytes total)
    {
      name: 'school_mana',
      offset: 0x4410 - 0x43e8,
      type: {
        kind: 'array',
        length: 6,
        element: { kind: 'scalar', scalar: 'u32_le' },
      },
      description: '6 schools × 32-bit mana. No clamp on cast deduction — can underflow (see wmexe).',
    },
    // 14-slot skill table at +0x451c
    {
      name: 'skills',
      offset: 0x451c - 0x43e8,
      type: {
        kind: 'array',
        length: 14,
        element: { kind: 'scalar', scalar: 'u8' },
      },
      description: '14 skill levels (0..100). Bumped by wmaze + wmele on action attempts via the skill-train primitive.',
    },
  ],
};
