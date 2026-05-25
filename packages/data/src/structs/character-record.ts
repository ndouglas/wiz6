import type { BssStruct } from './bss-types.js';

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
      name: 'inventory_records',
      offset: 0x40,
      type: {
        kind: 'array',
        length: 22,
        element: { kind: 'bytes', length: 8 },
      },
      description: 'Item slots (22 x 8 bytes). +0=item_id(u16), +5=quantity, +7=flags(cursed/locked). 5 items in stock chars.',
    },
    {
      name: 'equipment_slots',
      offset: 0x110,
      type: { kind: 'bytes', length: 8 },
      description: '8 equipment slots; each byte = inventory-index of equipped item (0xFF=empty). At +0x110 (abs 0x44f8).',
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
      name: 'spells_to_learn',
      offset: 0x1a8,
      // abs 0x4590 = base 0x43e8 + 0x1a8.
      type: { kind: 'scalar', scalar: 'u8' },
      description: 'Spells to learn this level. Set to rng(6)+5 on level-up. At +0x1a8 (abs 0x4590). 0 in stock data.',
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
