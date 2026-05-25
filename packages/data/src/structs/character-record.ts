import type { BssStruct, BssField } from './bss-types.js';

/**
 * One 8-byte item slot within the inventory grid.
 *
 * Layout (verified by wpcvw.ovr ASM + 100% pcfile.dbs/scenario.dbs cross-check):
 *   bytes 0..1: item_id   (u16 LE) — index into scenario.dbs 0-based item table (500 items)
 *   byte  2:    weight    (u8)     — cached from scenario.dbs item byte 30 at pick-up time
 *   byte  3:    pad       (u8)     — always 0 (high byte of weight; weight < 256)
 *   byte  4:    equip_slot (u8)    — cached from scenario.dbs item byte 60 (body slot category)
 *   byte  5:    sprite_idx (u8)    — cached from scenario.dbs item byte 61
 *   byte  6:    quantity  (u8)     — per-instance charge/stack count (0 for non-stackable)
 *   byte  7:    flags     (u8)     — 0x01/0x02=CURSED, 0x04=stackable/thrown, 0x08=2-handed, 0x40=CLASS_LOCKED
 *
 * Evidence:
 *   wpcvw.ovr file+0x207E: mov al,[bx+0x442c] — reads byte 4 (equip_slot)
 *   wpcvw.ovr file+0x210A: mov al,[bx+0x442d] — reads byte 5 (sprite_idx)
 *   wpcvw.ovr file+0x20BC: mov al,[bx+0x442e] — reads byte 6 (quantity)
 *   wpcvw.ovr file+0x22DC: mov al,[bx+0x442f]; and al,0x03; jnz — CURSED check
 *   wpcvw.ovr file+0x2B25: mov al,[bx+0x442f]; and al,0x40; jnz — CLASS_LOCKED check
 *   wpcvw.ovr file+0x82F9..8311: writes item_id/weight+pad/equip_slot+sprite/qty+flags on equip
 */
export const INVENTORY_ITEM_SLOT_FIELDS: BssField[] = [
  {
    name: 'item_id',
    offset: 0,
    type: { kind: 'scalar', scalar: 'u16_le' },
    description: 'Item index into scenario.dbs (0-based, 0 = empty slot). u16 LE.',
  },
  {
    name: 'weight',
    offset: 2,
    type: { kind: 'scalar', scalar: 'u8' },
    description: 'Item weight cached from scenario.dbs byte 30 at pick-up. u8.',
  },
  {
    name: 'pad',
    offset: 3,
    type: { kind: 'scalar', scalar: 'u8' },
    description: 'Always 0 (high byte of weight word). u8.',
  },
  {
    name: 'equip_slot',
    offset: 4,
    type: { kind: 'scalar', scalar: 'u8' },
    description: 'Body-slot category cached from scenario.dbs byte 60. 0=1H_weapon, 1=2H_staff, 2=thrown, 3=ranged, 5=cloak, 6=head, 7=body, 8=legs, 9=hands, 10=feet, 11=shield, 12=scroll/spell, 13=spell_scroll. u8.',
  },
  {
    name: 'sprite_idx',
    offset: 5,
    type: { kind: 'scalar', scalar: 'u8' },
    description: 'Sprite index cached from scenario.dbs byte 61. u8.',
  },
  {
    name: 'quantity',
    offset: 6,
    type: { kind: 'scalar', scalar: 'u8' },
    description: 'Per-instance charge/stack count. 0 for non-stackable items. u8.',
  },
  {
    name: 'flags',
    offset: 7,
    type: { kind: 'scalar', scalar: 'u8' },
    description: 'Item flags: 0x01/0x02=CURSED (blocks unequip), 0x04=stackable/thrown/consumable, 0x08=two-handed weapon, 0x40=CLASS_LOCKED (class/alignment restriction). u8.',
  },
];

/**
 * Per-character record. Stored in a 6-slot party array at DGROUP `0x43e8`
 * with stride `0x1b0` (432 bytes per record). The on-disk and in-memory
 * layouts are IDENTICAL — wbase.ovr's add_party_member uses a straight
 * rep-movsw memcpy from the pcfile.dbs record into the BSS slot.
 *
 * Source: `docs/re/pcfile-dbs.md` + `docs/re/findings/character-level-field.json`
 *        + `docs/re/findings/character-xp-field.json`
 *        + `docs/re/findings/character-record-extended-map.json`
 *
 * Field offsets verified by independent wpcvw.ovr ASM traces:
 *   - Stats panel renderer (image 0x117b): push word [bx+0x440c] -> level display
 *   - level_up_apply (image 0xb22e): inc word [bx+0x440c] -> level increment
 *   - fn-party-row-render: HP bar at abs 0x4400/0x4402; SP bar at 0x4404/0x4406
 *   - class_change_apply (image 0x6054): mov word [bx+0x440c], 1 -> level reset
 *   - Stats panel (image 0x1077): reads [bx+0x43f0]/[bx+0x43f2] div 365 -> age display
 *   - Stats panel (image 0x123e/0x1242): pushes [bx+0x43f6]/[bx+0x43f4] -> XP display
 *   - level_up_check (image 0xb470/0xb474): reads [bx+0x43f4]/[bx+0x43f6] -> XP threshold
 *   - class_change_apply (image 0x61e7): clears [bx+0x43f6]/[bx+0x43f4] -> XP wipe
 *   - give_gold (image 0x513e): reads [bx+0x43fc]/[bx+0x43fe] -> gold (32-bit)
 *   - Stats panel (ndisasm file+0x0e55+0x1d2): mov al,[bx+0x4585] -> race
 *   - Stats panel (ndisasm file+0x0e55+0x18f): mov al,[bx+0x4586] -> alignment
 *   - Stats panel (ndisasm file+0x0e55+0x2a8): mov al,[bx+0x4587] -> class
 *   - Stats panel loop (ndisasm file+0x0e55+0x464): [bx+0x4514+i] i=0..7 -> 8 attrs
 * All absolute BSS addresses relative to base 0x43e8: offset = abs minus 0x43e8.
 *
 * NOTE: The wpcvw-naming-pass.json bss_layout has a systematic off-by-one
 * error in the +0x19c region: it lists "+0x19c" for race but abs 0x4585
 * = 0x43e8 + 0x19d. Corrected here with direct ASM evidence.
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
      type: { kind: 'string', length: 8, encoding: 'ascii' },
      description: 'ASCII character name. Null-terminated; max 7 chars. 8-byte field.',
    },
    {
      name: 'age_counter',
      offset: 0x08,
      // HIGH CONFIDENCE: 32-bit age counter in game-days.
      // Stats panel (wpcvw.ovr image 0x1077): mov ax,[bx+0x43f0]/mov dx,[bx+0x43f2];
      //   cx=0x16d=365; call 0xf9c8 -> divides by 365, displays age in years.
      // Aging mechanic (image 0x977d): same read; if quotient>18: subtract 365,
      //   increment VIT at abs 0x4517 -- the aging tax.
      // abs 0x43f0/0x43f2 = base 0x43e8 + +0x08/+0x0a.
      // Stock: THESUS=6590, TEMPEST=7405, LYSANDR=7265, NOBAL=7057, TREON=6603, PENTAG=6698 days.
      type: { kind: 'scalar', scalar: 'u32_le' },
      description: '32-bit age counter in game-days. Displayed as age/365 years. Aging mechanic VIT-decrements when age/365 > 18. Stock chars 18-20 years.',
    },
    {
      name: 'xp',
      offset: 0x0c,
      // HIGH CONFIDENCE: abs 0x43f4 (low) / 0x43f6 (high) = base 0x43e8 + +0x0c/+0x0e.
      // class_change_apply (0x61e7): zeros both words; stats panel (0x123e/0x1242): pushes both;
      // level_up_check (0xb470/0xb474): reads for threshold compare.
      // All 6 stock chars have xp=0 in pcfile.dbs.
      type: { kind: 'scalar', scalar: 'u32_le' },
      description: 'Experience points (32-bit LE). At +0x0c (abs 0x43f4/0x43f6). Stock chars all 0.',
    },
    {
      name: 'unknown_0x10',
      offset: 0x10,
      // UNKNOWN: stats panel pushes [bx+0x43fa]/[bx+0x43f8] as second u32.
      // abs 0x43f8/0x43fa = base 0x43e8 + +0x10/+0x12.
      // All 6 stock chars = 0.
      type: { kind: 'scalar', scalar: 'u32_le' },
      description: 'Unknown u32 at +0x10 (abs 0x43f8/0x43fa). Displayed adjacent to XP. All stock chars = 0.',
    },
    {
      name: 'gold',
      offset: 0x14,
      // HIGH CONFIDENCE: 32-bit gold at abs 0x43fc/0x43fe = base 0x43e8 + +0x14/+0x16.
      // give_gold (wpcvw image 0x513e): 32-bit subtract-with-borrow / add-with-carry on this field.
      // All 6 stock chars have gold=0.
      // CORRECTION: prior decoder read u16 at +0x22 as "gold" -- that field is unknown.
      type: { kind: 'scalar', scalar: 'u32_le' },
      description: 'Gold pieces (32-bit LE). At +0x14 (abs 0x43fc/0x43fe). give_gold uses 32-bit carry math. Stock chars all 0.',
    },
    {
      name: 'hp_cur',
      offset: 0x18,
      // fn-party-row-render passes abs 0x4400 (base 0x43e8 + +0x18) to HP-bar draw.
      // Stock: THESUS=8, TEMPEST=9, LYSANDR=5, NOBAL=4, TREON=4, PENTAG=2.
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Current HP. At +0x18 (abs 0x4400). Stock values 8/9/5/4/4/2.',
    },
    {
      name: 'hp_max',
      offset: 0x1a,
      // abs 0x4402 = base 0x43e8 + +0x1a. Equals hp_cur for fully-healed stock chars.
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Maximum HP. At +0x1a (abs 0x4402). Equals hp_cur in stock data.',
    },
    {
      name: 'sp_cur',
      offset: 0x1c,
      // abs 0x4404 = base 0x43e8 + +0x1c.
      // Stock: THESUS=126, TEMPEST=123, LYSANDR=87, NOBAL=75, TREON=102, PENTAG=90.
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Spirit points, current. At +0x1c (abs 0x4404). Stock values 126/123/87/75/102/90.',
    },
    {
      name: 'sp_max',
      offset: 0x1e,
      // abs 0x4406 = base 0x43e8 + +0x1e. Equals sp_cur for fully-healed stock chars.
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Spirit points, maximum. At +0x1e (abs 0x4406). Equals sp_cur in stock data.',
    },
    {
      name: 'unknown_0x20',
      offset: 0x20,
      // UNKNOWN. Stock values: 295, 295, 225, 136, 128, 128.
      // May be encumbrance capacity computed from STR/VIT.
      // wpcvw file+0x0e3d/0x0e78: add [bx+0x4408],ax (accumulates into +0x20 from inventory).
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Unknown u16 at +0x20. Stock values 295/225/136/128. Possibly total encumbrance weight (accumulated from inventory).',
    },
    {
      name: 'unknown_0x22',
      offset: 0x22,
      // UNKNOWN. Stock values: 2700, 1800, 1125, 1035, 1440, 1350.
      // Previously misidentified as gold. Gold is confirmed at +0x14.
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Unknown u16 at +0x22. Stock values 2700/1800/1125. NOT gold (gold at +0x14).',
    },
    {
      name: 'school_mana_cur',
      offset: 0x28,
      // HIGH CONFIDENCE: 6 u16s at abs 0x4410..0x4419 (even offsets), interleaved with max.
      // Stats panel renderer (wpcvw file+0x0e55, ndisasm +0x4c..+0xee):
      //   loop si=0..5; bx = slot*0x1b0 + si*4;
      //   push word [bx+0x4410] (= cur for school si); render;
      //   push word [bx+0x4412] (= max for school si); render.
      // abs 0x4410 = base 0x43e8 + +0x28 = school_mana_cur[0].
      // Stride: each school takes 4 bytes (2 bytes cur + 2 bytes max).
      // Schools: 0=Fire, 1=Water, 2=Air, 3=Earth, 4=Mental, 5=Divine.
      // Stock: TREON(Mage) has Fire=3, Mental=3; NOBAL(Priest) has Mental=5, Divine=4;
      //        PENTAG(Mage) has Water=3, Earth=3. Fighters/Thief all 0.
      type: {
        kind: 'array',
        length: 6,
        element: { kind: 'scalar', scalar: 'u16_le' },
      },
      description: '6 per-school mana current values. Schools: [0]Fire [1]Water [2]Air [3]Earth [4]Mental [5]Divine. Layout: +0x28+i*4 = cur[i], +0x2a+i*4 = max[i]. Interleaved with school_mana_max.',
    },
    {
      name: 'school_mana_max',
      offset: 0x2a,
      // HIGH CONFIDENCE: 6 u16s at abs 0x4412..0x441b (even offsets), interleaved with cur.
      // See school_mana_cur above for evidence.
      // Stock: TREON max = [3,0,0,0,3,0]; NOBAL max = [0,0,0,0,5,4]; PENTAG max = [0,3,0,3,0,0].
      type: {
        kind: 'array',
        length: 6,
        element: { kind: 'scalar', scalar: 'u16_le' },
      },
      description: '6 per-school mana max values (same school order as school_mana_cur). At +0x2a+i*4 for school i.',
    },
    {
      name: 'level',
      offset: 0x24,
      // HIGH CONFIDENCE. abs 0x440c = base 0x43e8 + +0x24.
      // (1) Stats panel (0x117b): push word [bx+0x440c]; (2) level_up_apply (0xb22e): inc word [bx+0x440c];
      // (3) class_change_apply (0x61c8): mov word [bx+0x440c], 1. Stock chars all level 1.
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Current character level (1-based). At +0x24 (abs 0x440c). Stock chars all level 1.',
    },
    {
      name: 'level_secondary',
      offset: 0x26,
      // MEDIUM CONFIDENCE. abs 0x440e = base 0x43e8 + +0x26.
      // Displayed in stats panel. Equals level in stock data.
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Secondary level register at +0x26. Equals level in stock data. Possibly max-level-ever.',
    },
    {
      name: 'inventory',
      offset: 0x40,
      // HIGH CONFIDENCE: 22 item slots x 8 bytes = 176 bytes at abs 0x4428..0x44ef.
      // wpcvw.ovr file+0x18DC/0x23D8/0x19AA/0x2401: add ax, 0x4428 (inventory base pointer).
      // file+0x189F: mov word [bx+0x4428], 0x0 (zero slot on remove).
      // Each slot: [0-1]=item_id(u16), [2]=weight, [3]=0, [4]=equip_slot, [5]=sprite_idx,
      //            [6]=quantity, [7]=flags.
      // 100% cross-checked: slot.byte2==item.weight, slot.byte4==item.equipSlot,
      //                     slot.byte5==item.spriteIdx for all 30 stock item-slot pairs.
      // Stock chars all have 5 populated slots (inv_count=5); slots 5..21 are zero.
      type: {
        kind: 'array',
        length: 22,
        element: { kind: 'bytes', length: 8 },
      },
      description: 'Inventory grid: 22 item slots x 8 bytes at +0x40 (abs 0x4428..0x44ef). Per-slot layout: [0-1]=item_id(u16 LE), [2]=weight(cached), [3]=0, [4]=equip_slot(cached), [5]=sprite_idx(cached), [6]=quantity, [7]=flags(0x01/0x02=CURSED,0x04=stackable,0x08=2H,0x40=CLASS_LOCKED). item_id=0 means empty slot. Stock chars have 5 items each.',
    },
    {
      name: 'equipment',
      offset: 0x110,
      // HIGH CONFIDENCE: 8-byte body-slot array at abs 0x44f8..0x44ff.
      // wpcvw.ovr file+0x81E8: mov al,[bx+0x44f8] (read slot 0 = weapon).
      // file+0x1879: mov byte [bx+0x44f8], 0xff (unequip weapon).
      // file+0x8327: mov [bx+0x44f8], al (write inv index to equip slot).
      // file+0x17F7: remove_item_from_equip_slot loops 8 slots writing 0xFF.
      // Body slot mapping: [0]=weapon, [1]=shield, [2]=head, [3]=body,
      //                    [4]=legs, [5]=hands, [6]=feet, [7]=cloak.
      // Stock chars all 0xFF (items carried but not equipped on load).
      type: { kind: 'bytes', length: 8 },
      description: 'Equipment body-slot array at +0x110 (abs 0x44f8..0x44ff). Each byte = inventory index (0..21) of equipped item, or 0xFF=empty. Slots: [0]=weapon [1]=shield [2]=head [3]=body [4]=legs [5]=hands [6]=feet [7]=cloak. Stock chars all 0xFF.',
    },
    {
      name: 'unknown_0x118',
      offset: 0x118,
      // MEDIUM CONFIDENCE: 4-byte header + 6-byte per-school capacity array at abs 0x4500..0x4509.
      // Bytes +0x118..+0x11b (abs 0x4500..0x4503) = 0 for all stock chars.
      // Bytes +0x11c..+0x121 (abs 0x4504..0x4509) are class-dependent:
      //   Fighters: [1,1,1,1,1,1]; Priest(NOBAL): [2,2,3,3,2,3]; Mages: [3,3,2,2,2,3].
      // wpcvw: abs 0x4500 (record+0x118) used as counter in school loop.
      // wpcvw: abs 0x4504 (record+0x11c) used as per-school parameter.
      type: { kind: 'bytes', length: 10 },
      description: '10-byte region at +0x118 (abs 0x4500). First 4 bytes always 0. Last 6 bytes are class-dependent school capacity/access values: fighters=[1,1,1,1,1,1], priest=[2,2,3,3,2,3], mages=[3,3,2,2,2,3].',
    },
    {
      name: 'conditions',
      offset: 0x122,
      // HIGH CONFIDENCE: 10 condition bytes at abs 0x450a = base 0x43e8 + +0x122.
      // Priority loop (wpcvw file+0x05c6): for si=0..9: bx=slot*0x1b0+si;
      //   cmp byte [bx+0x450a], 0 — iterates ALL 10 conditions for 'worst priority to display'.
      // conditions[2] = +0x124 (abs 0x450c) = DEAD override (portrait icon 1):
      //   wpcvw file+0x1468: cmp byte [bx+0x450c],0; if nonzero -> portrait 1.
      // conditions[3] = +0x125 (abs 0x450d) = PARALYZED/STONE override (portrait icon 2):
      //   wpcvw file+0x1487: cmp byte [bx+0x450d],0; if nonzero -> portrait 2.
      // NOTE: dead and paralyzed are NOT separate bytes outside this array;
      // they are conditions[2] and conditions[3] within it.
      // All 6 stock chars have conditions = all zeros (no active conditions).
      type: {
        kind: 'array',
        length: 10,
        element: { kind: 'scalar', scalar: 'u8' },
      },
      description: '10-condition tracker at +0x122 (abs 0x450a..0x4513). Non-zero = active. conditions[2]=dead, conditions[3]=paralyzed/stone (both are portrait overrides). Stock all 0.',
    },
    {
      name: 'attributes',
      offset: 0x12c,
      // HIGH CONFIDENCE: 8-byte attribute block at abs 0x4514 = base 0x43e8 + +0x12c.
      // Stats panel loop (ndisasm 0x0e55+0x464): for si=0..7: bx=slot*0x1b0+si;
      //   mov al,[bx+0x4514]; call display with msg 0xcc+si
      //   -> msgs 0xcc..0xd3 = STR/INT/PIE/VIT/DEX/SPD/PER/KAR (per wpcmk stat_panel 0x2b04).
      // VIT at abs 0x4517 = +0x12f incremented by aging mechanic.
      // DEX at abs 0x4518 = +0x130 used in AC formula.
      // SPD at abs 0x4519 = +0x131 used in Faerie level-cap check.
      // Stock THESUS: [18,8,8,12,10,9,8,14]; TEMPEST: [13,10,6,14,7,7,10,16]
      // LYSANDR: [7,10,7,11,14,12,10,15]; NOBAL: [7,10,13,9,9,9,8,4]
      // TREON: [10,12,6,12,10,8,6,3]; PENTAG: [10,12,13,10,8,6,6,9]
      type: {
        kind: 'array',
        length: 8,
        element: { kind: 'scalar', scalar: 'u8' },
      },
      description: 'STR/INT/PIE/VIT/DEX/SPD/PER/KAR (8 bytes, range 0..18). At +0x12c (abs 0x4514). Stats panel msgs 0xcc..0xd3.',
    },
    {
      name: 'skills',
      offset: 0x134,
      // HIGH CONFIDENCE: abs 0x451c = base 0x43e8 + +0x134.
      // skill_roll_check (wpcvw file+0xa4c1):
      //   add bx,[bp+0xc] (skill_index); cmp byte [bx+0x451c], 0x32 (cap check)
      //   mov al,[bx+0x451c]; add ax,[bp-0x2]; mov [bx+0x451c],al (write back)
      // skill_apply_growth (wpcvw file+0x86d2): iterates [bp-2] from 0 to 0x0d (14 total).
      // Cap = 0x32 = 50 (NOT 100).
      // Stock: THESUS [0,10,0,0,0,0,0,0,2,...], TEMPEST [0,16,...], LYSANDR [1,3,...],
      //        NOBAL [0,0,0,0,2,0,0,0,2,...], TREON [0,0,0,0,7,...], PENTAG [5,...]
      type: {
        kind: 'array',
        length: 14,
        element: { kind: 'scalar', scalar: 'u8' },
      },
      description: '14 skill levels (0..50). At +0x134 (abs 0x451c). Cap is 0x32=50. skill_roll_check (0xa4c1): [bx+0x451c+skill_idx]. skill_apply_growth (0x86d2) iterates 14 entries.',
    },
    {
      name: 'derived_stats_block',
      offset: 0x142,
      // MEDIUM CONFIDENCE: 16-byte derived stats/flags block at abs 0x452a..0x4539.
      // Mostly zero for fighters. Casters have class-specific nonzero values.
      // Confirmed: wtrea.ovr reads abs 0x4545 (=record+0x15d, in the school_rank_thresholds
      // array below) for trap damage susceptibility. Lower = more susceptible.
      // Stock: THESUS=[0..0], LYSANDR=[0,10,0..0], NOBAL=[0..0,7,0,0,0], TREON=[0..0,10,0], PENTAG=[0..0,7,0].
      type: { kind: 'bytes', length: 16 },
      description: '16-byte derived stats block at +0x142 (abs 0x452a). Mostly zero for fighters; class-specific nonzero values for casters/thieves. Exact semantics TBD.',
    },
    {
      name: 'school_rank_thresholds',
      offset: 0x152,
      // MEDIUM CONFIDENCE: 14 bytes at abs 0x453a..0x4547.
      // Initialized by wpcmk.ovr creation init at file+0x3e51:
      //   for school 0..13: *(scratch+0x152+school) = max(0, min(125, class_table[school]*4-260))
      //   where scratch base = 0x5470, so scratch+0x152 = pcfile+0x152.
      // School 0 always 0; school 13 always 0. School 1 = 8 for all non-caster classes.
      // These are class-derived rank thresholds, NOT current spell levels.
      // Stock: THESUS/Fighter=[0,8,4,8,4,8,8,8,8,28,8,48,4,0]
      //        NOBAL/Priest=[0,8,16,8,8,16,24,8,8,52,20,40,20,0]
      //        TREON/Mage=[0,8,4,0,8,12,16,8,18,16,41,16,24,0]
      type: {
        kind: 'array',
        length: 14,
        element: { kind: 'scalar', scalar: 'u8' },
      },
      description: '14-byte per-school class rank threshold array at +0x152 (abs 0x453a). Written by wpcmk creation init using class-formula. School 0 and 13 always 0. Schools 1..12 class-dependent.',
    },
    {
      name: 'derived_ac',
      offset: 0x160,
      // HIGH CONFIDENCE: abs 0x4548 = base 0x43e8 + +0x160.
      // wpcvw file+0x8d32: mov byte [bx+0x4548], 0xa — initializes AC to 10 at creation.
      // derived_ac (wpcvw file+0xaa94): reads SPD for +/-1 at 16/18; reads race for Faerie -2;
      //   reads class for Monk/Ninja -(level/2); writes result to [bx+0x4548].
      // Base AC = 10. SPD>=16: -1. SPD>=18: -1 additional. Race=5(Faerie): -2.
      //   Class=12(Monk) or 13(Ninja): -(level/2). No DEX bonus (SPD carries agility).
      // All 6 stock chars = 10 (no bonuses apply at level 1).
      type: { kind: 'scalar', scalar: 'u8' },
      description: 'Derived AC at +0x160 (abs 0x4548). Base 10, reduced by SPD bonuses, Faerie race, Monk/Ninja class. All stock chars = 10.',
    },
    {
      name: 'unknown_0x161',
      offset: 0x161,
      // UNKNOWN: 2 bytes, both = 0 for all stock chars.
      // Adjacent to derived_ac. Possibly AC modifier components (bonus/penalty split).
      type: { kind: 'bytes', length: 2 },
      description: '2 unknown bytes at +0x161 (abs 0x4549..0x454a). Zero for all stock chars. Possibly AC sub-components.',
    },
    {
      name: 'unknown_0x163',
      offset: 0x163,
      // UNKNOWN: 5 bytes, all = 10 (0x0a) for all 6 stock characters.
      // No overlay ASM references found for these specific offsets in this pass.
      // Constant value 10 across all chars regardless of class or race.
      type: { kind: 'bytes', length: 5 },
      description: '5 unknown bytes at +0x163 (abs 0x454b..0x454f). All = 10 (0x0a) for all stock chars regardless of class/race. Purpose unknown.',
    },
    {
      name: 'reaction',
      offset: 0x168,
      // HIGH CONFIDENCE: abs 0x4550 = base 0x43e8 + +0x168.
      // wmnpc.ovr file+0x671d: mov al,[bx+0x4550]; cbw; cwd;
      //   compute delta/10; add to reaction; cmp ax,0x64; clamp to 100;
      //   mov [bx+0x4550],al (write back).
      // Very high ref count in wmnpc.ovr: 15 reads + 7 writes — this is the
      // primary NPC encounter reaction stat.
      // Stock: THESUS=20, TEMPEST=12, LYSANDR=16, NOBAL=20, TREON=16, PENTAG=40.
      // NOT 50 as neutral — stock chars have 12-40 range.
      type: { kind: 'scalar', scalar: 'u8' },
      description: 'NPC reaction score (0..100). At +0x168 (abs 0x4550). Updated by wmnpc.ovr after encounters. Capped at 100. Stock chars range 12-40.',
    },
    {
      name: 'npc_race_reaction',
      offset: 0x169,
      // HIGH CONFIDENCE: 31 bytes at abs 0x4551..0x456f = base 0x43e8 + +0x169..+0x187.
      // 31 entries = 31 possible NPC race indices. Each byte is the reaction score for
      // encounters with that NPC race.
      // Initialized to the base reaction score (+0x168) at character creation.
      // wmnpc.ovr reads/writes [bx+0x4551..0x456f] for per-race reaction adjustments
      // after each NPC encounter (12+ read refs + 7+ write refs in wmnpc.ovr).
      // Stock chars: all 31 bytes equal base reaction (no prior NPC encounters).
      //   THESUS: all=20, TEMPEST: all=12, LYSANDR: all=16, NOBAL: all=20, TREON: all=16, PENTAG: all=40.
      type: {
        kind: 'array',
        length: 31,
        element: { kind: 'scalar', scalar: 'u8' },
      },
      description: '31-byte per-NPC-race reaction array at +0x169 (abs 0x4551..0x456f). Each entry = reaction score for encounters with NPC race [i]. Initialized to base reaction. Updated by wmnpc.ovr after encounters.',
    },
    {
      name: 'spell_slots_known',
      offset: 0x188,
      // LOW CONFIDENCE: 20-byte sparse region at abs 0x4570..0x4583 = base 0x43e8 + +0x188..+0x19b.
      // All zeros for fighters and thief. Casters have sparse nonzero values:
      //   NOBAL(Priest): [0,0,0,0,0,0,4,0,1,0,0..0]
      //   TREON(Mage):   [1,0,0,0,0,0,1,0,0..0]
      //   PENTAG(Mage):  [0,2,0,0,32,0,0..0]
      // Values are small and sparse. Pattern of nonzero indices consistent with
      // which spell schools the character can access. Possibly spell-known counters
      // or spell-slot tracking per school. ASM evidence not traced in this pass.
      type: { kind: 'bytes', length: 20 },
      description: '20-byte sparse region at +0x188 (abs 0x4570). All-zero for non-casters. Casters have sparse nonzero values at school-aligned positions. Likely spell-known counts or spell-slot tracking.',
    },
    {
      name: 'unknown_0x19c',
      offset: 0x19c,
      // UNKNOWN: 1 byte at abs 0x4584. All stock chars = 0.
      // One byte gap between spell_slots_known (+0x188..+0x19b) and race (+0x19d).
      type: { kind: 'scalar', scalar: 'u8' },
      description: '1 unknown byte at +0x19c (abs 0x4584). Zero for all stock chars.',
    },
    {
      name: 'race',
      offset: 0x19d,
      // HIGH CONFIDENCE: abs 0x4585 = base 0x43e8 + 0x19d.
      // Stats panel ndisasm (file 0x0e55+0x1d2):
      //   8A878545 mov al,[bx+0x4585]; 056400 add ax,0x64; call 0xfd5c (msg lookup)
      //   -> msg 0x64+race = race name string.
      // Also Faerie (race==5) has AC-2, HP-penalty, level-cap-1 hard-coded.
      // NOTE: prior bss_layout "+0x19c" was wrong; correct is abs 0x4585-base = 0x19d.
      // Stock: THESUS=0(Human), TEMPEST=10(Mook), LYSANDR=8(Felpurr),
      //        NOBAL=1(Elf), TREON=7(Dracon), PENTAG=3(Gnome)
      type: { kind: 'scalar', scalar: 'u8' },
      description: 'Race index 0..10. 0=Human,1=Elf,2=Dwarf,3=Gnome,4=Hobbit,5=Faerie,6=Lizardman,7=Dracon,8=Felpurr,9=Rawulf,10=Mook. At +0x19d (abs 0x4585).',
    },
    {
      name: 'alignment',
      offset: 0x19e,
      // MEDIUM CONFIDENCE: abs 0x4586 = base 0x43e8 + 0x19e.
      // Stats panel (file 0x0e55+0x18f): mov al,[bx+0x4586]; add ax,0x8c -> msg lookup.
      // Stock: THESUS=0, TEMPEST=1, LYSANDR=0, NOBAL=0, TREON=0, PENTAG=0.
      // Likely 0=Good, 1=Neutral, 2=Evil.
      type: { kind: 'scalar', scalar: 'u8' },
      description: 'Alignment index at +0x19e (abs 0x4586). Used as msg table index (+0x8c). Likely 0=Good,1=Neutral,2=Evil.',
    },
    {
      name: 'class',
      offset: 0x19f,
      // HIGH CONFIDENCE: abs 0x4587 = base 0x43e8 + 0x19f.
      // Stats panel (file 0x0e55+0x2a8): mov al,[bx+0x4587]; add ax,0x78 -> msg lookup.
      // class_change_apply (0x6054): *0x4587 := new_class - 1 (0-indexed stored).
      // 14 class-dispatch jump tables key on this byte.
      // NOTE: prior bss_layout "+0x19e" was wrong; correct is abs 0x4587-base = 0x19f.
      // Stock: THESUS=0(Fighter), TEMPEST=0(Fighter), LYSANDR=3(Thief),
      //        NOBAL=2(Priest), TREON=1(Mage), PENTAG=1(Mage)
      type: { kind: 'scalar', scalar: 'u8' },
      description: 'Class index 0..13. 0=Fighter,1=Mage,2=Priest,3=Thief,4=Bard,5=Ranger,6=Alchemist,7=Psionic,8=Valkyrie,9=Lord,10=Samurai,11=Ninja,12=Monk,13=Bishop. At +0x19f (abs 0x4587).',
    },
    {
      name: 'high_water_level',
      offset: 0x1a0,
      // MEDIUM CONFIDENCE: abs 0x4588 = base 0x43e8 + 0x1a0.
      // Updated by 0xb182 counting how many of 7 level-thresholds are met.
      // Used with class index to look up class title string.
      type: { kind: 'scalar', scalar: 'u8' },
      description: 'Level high-water mark (count of 7 threshold levels reached). Used for class title display. At +0x1a0 (abs 0x4588).',
    },
    {
      name: 'sex',
      offset: 0x1a1,
      // MEDIUM CONFIDENCE: abs 0x4589 = base 0x43e8 + 0x1a1.
      // Party-row renderer (ndisasm 0x0e55+0x59a):
      //   8A878945 mov al,[bx+0x4589]; D1E0 shl ax; 8BD8 mov bx,ax;
      //   8B872605 mov ax,[bx+0x526] -> portrait table lookup (sex*2).
      // All 6 stock chars = 0.
      type: { kind: 'scalar', scalar: 'u8' },
      description: 'Sex/gender byte at +0x1a1 (abs 0x4589). Portrait-table index via cs:0x526[sex*2]. All stock chars = 0.',
    },
    {
      name: 'unknown_0x1a2',
      offset: 0x1a2,
      // UNKNOWN: 4 bytes at abs 0x458a..0x458d. All stock chars = 0.
      type: { kind: 'bytes', length: 4 },
      description: '4 unknown bytes at +0x1a2 (abs 0x458a..0x458d). Zero for all stock chars.',
    },
    {
      name: 'unknown_0x1a6',
      offset: 0x1a6,
      // UNKNOWN: 1 byte at abs 0x458e. All stock chars = 1.
      // Constant 1 across all 6 chars. May be a boolean flag or 1-based index.
      type: { kind: 'scalar', scalar: 'u8' },
      description: '1 unknown byte at +0x1a6 (abs 0x458e). Value = 1 for all stock chars.',
    },
    {
      name: 'unknown_0x1a7',
      offset: 0x1a7,
      // UNKNOWN: 1 byte at abs 0x458f. All stock chars = 10 (0x0a).
      // Constant 10 across all 6 chars regardless of class/race.
      type: { kind: 'scalar', scalar: 'u8' },
      description: '1 unknown byte at +0x1a7 (abs 0x458f). Value = 10 for all stock chars.',
    },
    {
      name: 'spells_to_learn',
      offset: 0x1a8,
      // abs 0x4590 = base 0x43e8 + 0x1a8.
      type: { kind: 'scalar', scalar: 'u8' },
      description: 'Spells to learn this level. Set to rng(6)+5 on level-up. At +0x1a8 (abs 0x4590). 0 in stock data.',
    },
    {
      name: 'unknown_0x1a9',
      offset: 0x1a9,
      // UNKNOWN: 1 byte at abs 0x4591. All stock chars = 1.
      type: { kind: 'scalar', scalar: 'u8' },
      description: '1 unknown byte at +0x1a9 (abs 0x4591). Value = 1 for all stock chars.',
    },
    {
      name: 'unknown_0x1aa',
      offset: 0x1aa,
      // UNKNOWN: 1 byte at abs 0x4592. All stock chars = 1.
      type: { kind: 'scalar', scalar: 'u8' },
      description: '1 unknown byte at +0x1aa (abs 0x4592). Value = 1 for all stock chars.',
    },
    {
      name: 'portrait_index',
      offset: 0x1ab,
      // MEDIUM CONFIDENCE: abs 0x4593 = base 0x43e8 + +0x1ab.
      // Values vary per character and align with portrait indices 0-13 (14 available portraits).
      // Stock: THESUS=10, TEMPEST=8, LYSANDR=13, NOBAL=10, TREON=9, PENTAG=7.
      // Portrait selection code in wpcmk.ovr accesses this offset.
      // Range 7..13 for stock chars; THESUS and NOBAL share portrait 10.
      type: { kind: 'scalar', scalar: 'u8' },
      description: 'Portrait index (0..13). At +0x1ab (abs 0x4593). Selected at character creation; 14 portraits available. Stock: THESUS=10,TEMPEST=8,LYSANDR=13,NOBAL=10,TREON=9,PENTAG=7.',
    },
    {
      name: 'inventory_count',
      offset: 0x1ac,
      // HIGH CONFIDENCE: abs 0x4594 = base 0x43e8 + 0x1ac.
      // Stock chars all = 5 (matching 5 starting items visible in inventory_records).
      type: { kind: 'scalar', scalar: 'u8' },
      description: 'Count of items in inventory (0..22). At +0x1ac (abs 0x4594). Stock chars all = 5.',
    },
    {
      name: 'unknown_0x1ad',
      offset: 0x1ad,
      // UNKNOWN: 1 byte at abs 0x4595. All stock chars = 0.
      // Adjacent to inventory_count (+0x1ac) and unknown_0x1ae.
      type: { kind: 'scalar', scalar: 'u8' },
      description: '1 unknown byte at +0x1ad (abs 0x4595). Zero for all stock chars.',
    },
    {
      name: 'unknown_0x1ae',
      offset: 0x1ae,
      // UNKNOWN: 1 byte at abs 0x4596. All stock chars = 100 (0x64).
      // Constant 100 across all 6 chars. May mirror max reaction score or be some other cap.
      // Position just before saved_old_level (+0x1af=0x4597).
      type: { kind: 'scalar', scalar: 'u8' },
      description: '1 unknown byte at +0x1ae (abs 0x4596). Value = 100 for all stock chars. Purpose unknown; may be a max-value cap.',
    },
    {
      name: 'saved_old_level',
      offset: 0x1af,
      // MEDIUM CONFIDENCE: abs 0x4597 = base 0x43e8 + 0x1af.
      // Set by class_change_apply: *0x4597 := *0x440c (capped at 250).
      // Six functions throttle gains until current_level >= saved_old_level.
      type: { kind: 'scalar', scalar: 'u8' },
      description: 'Level before most recent class change. Functions throttle growth until level catches up. At +0x1af (abs 0x4597). 0 in stock data.',
    },
  ],
};
