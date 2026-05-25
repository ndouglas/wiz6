import type { BssStruct } from './bss-types.js';

/**
 * Per-character record. Stored in a 6-slot party array at DGROUP `0x43e8`
 * with stride `0x1b0` (432 bytes per record). The on-disk and in-memory
 * layouts are IDENTICAL — wbase.ovr's add_party_member uses a straight
 * rep-movsw memcpy from the pcfile.dbs record into the BSS slot.
 *
 * Source: `docs/re/pcfile-dbs.md` (2026-05-25 empirical pass against the
 * 6 stock characters in original/pcfile.dbs + wbase.ovr disasm).
 *
 * ⚠️  CORRECTION: The prior wpcvw-naming-pass.json bss_layout had several
 * wrong offsets in the first 0x30 bytes of the record because it claimed
 * name=char[12] (actual: char[8]). Fields from +0x12c onward (attributes,
 * skills, conditions, inventory) were correct in that document. The fields
 * below reflect the corrected, empirically-verified offsets.
 */
export const CHARACTER_RECORD: BssStruct = {
  name: 'character_record',
  bytes: 0x1b0,
  source: 'docs/re/pcfile-dbs.md',
  description: '432-byte per-character record. Party array at 0x43e8 stride 0x1b0. On-disk == in-memory (straight memcpy on load).',
  fields: [
    {
      name: 'name',
      offset: 0x00,
      // Engine name field is 8 bytes (7 chars max + null).
      // Prior bss_layout claimed 12 bytes — that was wrong; empirically
      // confirmed by pcfile.dbs RE pass (TEMPEST fills +0x00..+0x07 exactly,
      // XP starts at +0x08).
      type: { kind: 'string', length: 8, encoding: 'ascii' },
      description: 'ASCII character name. Null-terminated; max 7 chars. 8-byte field.',
    },
    {
      name: 'xp',
      offset: 0x08,
      // Prior bss_layout claimed xp at +0x0c — wrong. Empirically confirmed:
      // THESUS bytes +0x08..+0x0b = BE 19 00 00 = 6590.
      type: { kind: 'scalar', scalar: 'u32_le' },
      description: 'Experience points (32-bit). At +0x08, NOT +0x0c.',
    },
    // +0x0c..+0x17: unknown 12 bytes, all 0 in stock data.
    // Possibly gold u32 + padding, or reserved. Not decoded.
    {
      name: 'level',
      offset: 0x18,
      // Prior bss_layout claimed level at +0x24 (abs 0x440c) — wrong.
      // Empirically confirmed: +0x18 = [8,9,5,4,4,2] for stock chars.
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Current character level (1-based). At +0x18, NOT +0x24.',
    },
    {
      name: 'level_secondary',
      offset: 0x1a,
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Equals level in stock data; possibly max_level or saved_class_change_level.',
    },
    {
      name: 'hp_cur',
      offset: 0x1c,
      // Prior bss_layout claimed hp_cur at +0x18 — wrong.
      // Empirically confirmed: +0x1c = [126,123,87,75,102,90] for stock chars.
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Current HP. At +0x1c, NOT +0x18.',
    },
    {
      name: 'hp_max',
      offset: 0x1e,
      // Prior bss_layout claimed hp_max at +0x1a — wrong.
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Maximum HP. Equals hp_cur for fully-healed stock chars.',
    },
    {
      name: 'sp_cur',
      offset: 0x20,
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Spirit points, current (medium confidence). Values 128-295 for stock chars.',
    },
    {
      name: 'gold',
      offset: 0x22,
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Gold pieces (medium confidence; u16 is sufficient for stock amounts 1035-2700).',
    },
    {
      name: 'inventory_records',
      offset: 0x40,
      type: {
        kind: 'array',
        length: 22,
        element: { kind: 'bytes', length: 8 },
      },
      description: 'Item slots. Each item: +0 item_id(u16), +2 u16, +4 u8, +5 u8, +6 u8, +7 u8. 5 items in stock chars.',
    },
    {
      name: 'equipment_slots',
      offset: 0x110,
      type: { kind: 'bytes', length: 8 },
      description: '8 equipment slots; each byte = inventory-index of equipped item (0xFF=empty).',
    },
    {
      name: 'conditions',
      offset: 0x122,
      type: { kind: 'bytes', length: 10 },
      description: '10-condition tracker (poisoned, paralyzed, etc.). Per wpcvw bss_layout — offset confirmed.',
    },
    {
      name: 'attributes',
      offset: 0x12c,
      type: {
        kind: 'array',
        length: 6,
        element: { kind: 'scalar', scalar: 'u8' },
      },
      description: 'STR / INT / PIE / VIT / DEX / SPD in order. HIGH confidence: THESUS STR=18, LYSANDR DEX=14.',
    },
    {
      name: 'skills',
      offset: 0x134,
      type: {
        kind: 'array',
        length: 14,
        element: { kind: 'scalar', scalar: 'u8' },
      },
      description: '14 skill levels (0..100). Per wpcvw bss_layout — offset confirmed.',
    },
    {
      name: 'inventory_count',
      offset: 0x1ac,
      type: { kind: 'scalar', scalar: 'u8' },
      description: 'Count of items in inventory (0..22). HIGH confidence: value 5 matches actual item count for all stock chars.',
    },
    {
      name: 'saved_old_level',
      offset: 0x1af,
      type: { kind: 'scalar', scalar: 'u8' },
      description: 'Level before most recent class change. Six stat/HP/skill functions consult this to throttle gains. Per wpcvw bss_layout — LOW confidence without live verification.',
    },
  ],
};
