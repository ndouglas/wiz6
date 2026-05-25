import type { BssStruct } from './bss-types.js';

/**
 * Per-character record. Stored in a 6-slot party array at DGROUP `0x43e8`
 * with stride `0x1b0` (432 bytes per record). The on-disk and in-memory
 * layouts are IDENTICAL — wbase.ovr's add_party_member uses a straight
 * rep-movsw memcpy from the pcfile.dbs record into the BSS slot.
 *
 * Source: `docs/re/pcfile-dbs.md` + `docs/re/findings/character-level-field.json`
 *        + `docs/re/findings/character-xp-field.json`
 *
 * Field offsets verified by independent wpcvw.ovr ASM traces:
 *   - Stats panel renderer (image 0x117b): `push word [bx+0x440c]` → level display
 *   - level_up_apply (image 0xb22e): `inc word [bx+0x440c]` → level increment
 *   - fn-party-row-render: HP bar at abs 0x4400/0x4402; SP bar at 0x4404/0x4406
 *   - class_change_apply (image 0x6054): `mov word [bx+0x440c], 1` → level reset
 *   - Stats panel (image 0x1077): reads [bx+0x43f0]/[bx+0x43f2] ÷ 365 → age display
 *   - Stats panel (image 0x123e/0x1242): pushes [bx+0x43f6]/[bx+0x43f4] → XP display
 *   - level_up_check (image 0xb470/0xb474): reads [bx+0x43f4]/[bx+0x43f6] → XP threshold
 *   - class_change_apply (image 0x61e7): clears [bx+0x43f6]/[bx+0x43f4] → XP wipe
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
      // pcfile.dbs RE pass (TEMPEST fills +0x00..+0x07 exactly, age_counter starts
      // at +0x08). The prior claim of "XP starts at +0x08" was wrong; see
      // docs/re/findings/character-xp-field.json.
      type: { kind: 'string', length: 8, encoding: 'ascii' },
      description: 'ASCII character name. Null-terminated; max 7 chars. 8-byte field.',
    },
    {
      name: 'age_counter',
      offset: 0x08,
      // HIGH CONFIDENCE: 32-bit age counter in game-days.
      // (1) Stats panel renderer (wpcvw.ovr image 0x1077):
      //     mov ax,[bx+0x43f0] / mov dx,[bx+0x43f2]; cx=0x16d=365; call 0xf9c8
      //     → divides field by 365, passes result to display_number (age in years).
      // (2) Aging mechanic (wpcvw.ovr image 0x977d):
      //     reads same field, divides by 365; if quotient > 18:
      //     subtracts 365 from field AND increments VIT (+0x4517) — aging tax.
      // abs 0x43f0/0x43f2 = BSS base 0x43e8 + +0x08/+0x0a.
      // Stock chars: THESUS=6590, TEMPEST=7405, LYSANDR=7265, NOBAL=7057,
      // TREON=6603, PENTAG=6698 days (≈18–20 years).
      // Previously mislabeled 'xp' because of its u32 shape — corrected 2026-05-25.
      type: { kind: 'scalar', scalar: 'u32_le' },
      description: '32-bit age counter in game-days. Displayed as age÷365 (years) in stats panel. Aging mechanic decrements VIT when age÷365 > 18. Stock chars ≈18–20 years.',
    },
    {
      name: 'xp',
      offset: 0x0c,
      // HIGH CONFIDENCE — three converging traces from wpcvw.ovr:
      //   (1) class_change_apply (image 0x61e7): clears both XP words:
      //       C787F6430000  mov word [bx+0x43f6], 0x0
      //       C787F4430000  mov word [bx+0x43f4], 0x0
      //       abs 0x43f4 = BSS base 0x43e8 + +0x0c (xp low word)
      //       abs 0x43f6 = BSS base 0x43e8 + +0x0e (xp high word)
      //   (2) Stats panel renderer (image 0x123e/0x1242):
      //       FFB7F643  push word [bx+0x43f6] (high)
      //       FFB7F443  push word [bx+0x43f4] (low)
      //       → call display_u32 to show XP on character sheet
      //   (3) level_up_check (image 0xb470/0xb474):
      //       8B87F443  mov ax, [bx+0x43f4] (low)
      //       8B97F643  mov dx, [bx+0x43f6] (high)
      //       → 32-bit compare against next-level threshold → call level_up_apply
      // All 6 stock chars have xp=0 at +0x0c in pcfile.dbs — consistent with
      // user observation "everyone starts with 0 XP".
      type: { kind: 'scalar', scalar: 'u32_le' },
      description: 'Experience points (32-bit LE). At +0x0c. Stock chars all start at 0.',
    },
    // +0x10..+0x17: 8 bytes — two 32-bit fields, both zero in stock data.
    // Stats panel displays [bx+0x43fa]/[bx+0x43f8] (record +0x12/+0x10) as a
    // second u32 adjacent to XP (likely a bonus-XP or XP-pool register). The
    // naming pass bss_layout incorrectly labeled this as gold (+0x14/+0x16).
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
