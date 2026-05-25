import type { BssStruct } from './bss-types.js';

/**
 * Per-character record. Stored in a 6-slot party array at DGROUP `0x43e8`
 * with stride `0x1b0` (432 bytes per record). The on-disk and in-memory
 * layouts are IDENTICAL — wbase.ovr's add_party_member uses a straight
 * rep-movsw memcpy from the pcfile.dbs record into the BSS slot.
 *
 * Source: `docs/re/pcfile-dbs.md` + `docs/re/findings/character-level-field.json`
 *
 * Field offsets verified by two independent wpcvw.ovr ASM traces:
 *   - Stats panel renderer (image 0x117b): `push word [bx+0x440c]` → level display
 *   - level_up_apply (image 0xb22e): `inc word [bx+0x440c]` → level increment
 *   - fn-party-row-render: HP bar at abs 0x4400/0x4402; SP bar at 0x4404/0x4406
 *   - class_change_apply (image 0x6054): `mov word [bx+0x440c], 1` → level reset
 * All absolute BSS addresses relative to base 0x43e8: offset = abs − 0x43e8.
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
      // 8 bytes: 7 chars max + null terminator. Empirically confirmed by
      // pcfile.dbs RE pass (TEMPEST fills +0x00..+0x07 exactly, XP starts +0x08).
      type: { kind: 'string', length: 8, encoding: 'ascii' },
      description: 'ASCII character name. Null-terminated; max 7 chars. 8-byte field.',
    },
    {
      name: 'xp',
      offset: 0x08,
      // Empirically confirmed: THESUS bytes +0x08..+0x0b = BE 19 00 00 = 6590.
      // wpcvw stats panel reads XP from [bx+0x43f0] = BSS +0x08. HIGH confidence.
      type: { kind: 'scalar', scalar: 'u32_le' },
      description: 'Experience points (32-bit LE). At +0x08.',
    },
    // +0x0c..+0x17: 12 bytes unknown / unconfirmed. All zero in stock data.
    // class_change_apply zeros [bx+0x43f4] and [bx+0x43f6] (BSS +0x0c and +0x0e);
    // possibly a secondary XP register or reserved field.
    {
      name: 'hp_cur',
      offset: 0x18,
      // fn-party-row-render passes abs 0x4400 (BSS +0x18) to the HP-bar draw
      // function. Stock chars have hp_cur = [8,9,5,4,4,2] — small values
      // consistent with level 1.
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Current HP. At +0x18. Stock values 8/9/5/4/4/2 (level-1 party).',
    },
    {
      name: 'hp_max',
      offset: 0x1a,
      // fn-party-row-render: abs 0x4402 (BSS +0x1a). Equals hp_cur for
      // fully-healed stock chars.
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Maximum HP. At +0x1a. Equals hp_cur for fully-healed stock chars.',
    },
    {
      name: 'sp_cur',
      offset: 0x1c,
      // fn-party-row-render: abs 0x4404 (BSS +0x1c). Stock values 126/123/87/75/102/90.
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Spirit points, current. At +0x1c. Stock values 126–295.',
    },
    {
      name: 'sp_max',
      offset: 0x1e,
      // fn-party-row-render: abs 0x4406 (BSS +0x1e). Equals sp_cur for
      // fully-healed stock chars.
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Spirit points, maximum. At +0x1e. Equals sp_cur for fully-healed stock chars.',
    },
    {
      name: 'unknown_0x20',
      offset: 0x20,
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Unknown u16 at +0x20. Stock values 0x0127 (295) .. 0x0080 (128). Medium confidence: secondary SP or mana register.',
    },
    {
      name: 'gold',
      offset: 0x22,
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Gold pieces (medium confidence; u16 covers stock amounts 1035–2700).',
    },
    {
      name: 'level',
      offset: 0x24,
      // HIGH CONFIDENCE — two independent ASM traces:
      //   (1) wpcvw stats panel (image 0x117b): `push word [bx+0x440c]`
      //       → pushed as the level value for display_number call.
      //   (2) level_up_apply (image 0xb22e): `inc word [bx+0x440c]`
      //       → incremented on level-up.
      //   (3) class_change_apply (image 0x61c8): `mov word [bx+0x440c], 1`
      //       → reset to 1 on class change.
      // abs 0x440c = BSS base 0x43e8 + +0x24. disk == BSS (straight memcpy).
      // Stock chars all have value 1 at disk +0x24 → starting at level 1.
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Current character level (1-based). At +0x24. Stock chars are all level 1.',
    },
    {
      name: 'level_secondary',
      offset: 0x26,
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Equals level in stock data; possibly max_level or saved_class_change_level.',
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
