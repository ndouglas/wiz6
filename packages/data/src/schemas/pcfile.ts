import { z } from 'zod';

const U8 = z.number().int().min(0).max(255);
const U16 = z.number().int().min(0).max(0xffff);
const U32 = z.number().int().min(0).max(0xffffffff);

export const PcfileHeaderSchema = z.object({
  recordSize: U16,
  slotCount: U16,
  headerSize: U32,
  status: z.array(U8).length(16),
});

/**
 * One pcfile slot. Decodes high-confidence fields per
 * `docs/re/pcfile-dbs.md`, `docs/re/findings/character-level-field.json`,
 * `docs/re/findings/character-xp-field.json`,
 * `docs/re/findings/character-record-extended-map.json`, and
 * `docs/re/findings/character-record-extended-map-v2.json`.
 * The full 432-byte raw record is preserved as `raw`.
 *
 * Field offsets (record-relative, verified by wpcvw.ovr ASM traces):
 * - name           @ +0x00, 8 bytes ASCII null-terminated
 * - ageCounter     @ +0x08, u32 LE  (stats panel image 0x1077: [bx+0x43f0] / 365 -> age in years)
 * - xp             @ +0x0c, u32 LE  (class_change_apply image 0x61e7 clears)
 * - gold           @ +0x14, u32 LE  (give_gold 0x513e: 32-bit carry math on abs 0x43fc/0x43fe)
 *                                    CORRECTED: prior schema had gold@+0x22 u16 -- that was wrong.
 * - hpCurrent      @ +0x18, u16 LE  (abs 0x4400)
 * - hpMax          @ +0x1A, u16 LE  (abs 0x4402)
 * - spCurrent      @ +0x1C, u16 LE  (abs 0x4404)
 * - spMax          @ +0x1E, u16 LE  (abs 0x4406)
 * - schoolManaCur  @ +0x28+i*4, u16[6] interleaved with schoolManaMax
 *                                    (stats panel loop file+0x0e55+0x4c: [bx+0x4410+i*4])
 * - schoolManaMax  @ +0x2a+i*4, u16[6] interleaved with schoolManaCur
 *                                    (stats panel loop file+0x0e55+0x4c: [bx+0x4412+i*4])
 * - level          @ +0x24, u16 LE  (stats panel 0x117b: push [bx+0x440c])
 * - levelSecondary @ +0x26, u16 LE  (stats panel displays, equals level in stock data)
 * - conditions     @ +0x122..+0x12b, u8[10]
 *                                    (priority loop file+0x05c6: for si=0..9 [bx+0x450a+si])
 *                                    conditions[2]=dead, conditions[3]=paralyzed (portrait overrides)
 * - str/int/pie/vit/dex/spd/per/kar @ +0x12c..+0x133, u8[8]
 *                                    (stats panel loop: [bx+0x4514+i] i=0..7, msgs 0xcc..0xd3)
 * - skills         @ +0x134..+0x141, u8[14]  cap=50
 *                                    (skill_roll_check file+0xa4c1: cmp [bx+0x451c], 0x32)
 * - reaction       @ +0x168, u8     (wmnpc.ovr file+0x671d: read/write [bx+0x4550]; capped 100)
 * - race           @ +0x19d, u8     (stats panel: mov al,[bx+0x4585]; add ax,0x64 -> msg lookup)
 *                                    NOTE: bss_layout "+0x19c" was wrong; correct is 0x19d.
 * - alignment      @ +0x19e, u8     (stats panel: mov al,[bx+0x4586]; add ax,0x8c -> msg lookup)
 * - class          @ +0x19f, u8     (stats panel: mov al,[bx+0x4587]; add ax,0x78 -> msg lookup)
 *                                    NOTE: bss_layout "+0x19e" was wrong; correct is 0x19f.
 * - savedOldLevel  @ +0x1af, u8     (class_change_apply 0x6054: stores old level; throttle ref)
 */
export const PcfileSlotSchema = z.object({
  slot: U8,
  populated: z.boolean(),
  name: z.string().nullable(),
  ageCounter: U32,
  xp: U32,
  /** Gold pieces (32-bit). At +0x14 (abs 0x43fc/0x43fe). Stock chars all 0. */
  gold: U32,
  hpCurrent: U16,
  hpMax: U16,
  spCurrent: U16,
  spMax: U16,
  /**
   * Per-school mana current values (6 schools: Fire/Water/Air/Earth/Mental/Divine).
   * At +0x28+i*4 for school i. Interleaved with schoolManaMax (+0x2a+i*4).
   * Stats panel loop (file+0x0e55+0x4c): bx=slot*0x1b0+i*4; push [bx+0x4410].
   * Stock: casters only (TREON: [3,0,0,0,3,0], NOBAL: [0,0,0,0,5,4], PENTAG: [0,3,0,3,0,0]).
   * HIGH confidence.
   */
  schoolManaCur: z.array(U16).length(6),
  /**
   * Per-school mana max values (6 schools, same order as schoolManaCur).
   * At +0x2a+i*4 for school i. HIGH confidence.
   */
  schoolManaMax: z.array(U16).length(6),
  level: U16,
  levelSecondary: U16,
  /**
   * 10-condition tracker. Non-zero = active condition.
   * At +0x122..+0x12b (abs 0x450a..0x4513). HIGH confidence.
   * conditions[2] = dead (portrait override 1).
   * conditions[3] = paralyzed/stone (portrait override 2).
   * All stock chars = [0,0,0,0,0,0,0,0,0,0].
   */
  conditions: z.array(U8).length(10),
  /**
   * Race index 0..10.
   * 0=Human, 1=Elf, 2=Dwarf, 3=Gnome, 4=Hobbit, 5=Faerie,
   * 6=Lizardman, 7=Dracon, 8=Felpurr, 9=Rawulf, 10=Mook.
   * At +0x19d (abs 0x4585). HIGH confidence.
   */
  race: U8,
  /**
   * Alignment index. Likely 0=Good, 1=Neutral, 2=Evil.
   * At +0x19e (abs 0x4586). MEDIUM confidence.
   */
  alignment: U8,
  /**
   * Class index 0..13.
   * 0=Fighter, 1=Mage, 2=Priest, 3=Thief, 4=Bard, 5=Ranger,
   * 6=Alchemist, 7=Psionic, 8=Valkyrie, 9=Lord, 10=Samurai,
   * 11=Ninja, 12=Monk, 13=Bishop.
   * At +0x19f (abs 0x4587). HIGH confidence.
   */
  class: U8,
  /** STR attribute (0..18). At +0x12c (abs 0x4514). HIGH confidence. */
  str: U8,
  /** INT attribute (0..18). At +0x12d (abs 0x4515). HIGH confidence. */
  int: U8,
  /** PIE attribute (0..18). At +0x12e (abs 0x4516). HIGH confidence. */
  pie: U8,
  /** VIT attribute (0..18). At +0x12f (abs 0x4517). HIGH confidence. */
  vit: U8,
  /** DEX attribute (0..18). At +0x130 (abs 0x4518). HIGH confidence. */
  dex: U8,
  /** SPD attribute (0..18). At +0x131 (abs 0x4519). HIGH confidence. */
  spd: U8,
  /** Personality attribute. At +0x132 (abs 0x451a). HIGH confidence (7th attr in 8-byte block). */
  per: U8,
  /** Karma attribute. At +0x133 (abs 0x451b). HIGH confidence (8th attr in 8-byte block). */
  kar: U8,
  /**
   * 14 skill levels (0..50). At +0x134..+0x141 (abs 0x451c..0x4529). HIGH confidence.
   * skill_roll_check (wpcvw file+0xa4c1): cmp [bx+0x451c+skill_idx], 0x32 (cap at 50).
   * skill_apply_growth (file+0x86d2): iterates 14 entries.
   */
  skills: z.array(U8).length(14),
  /**
   * NPC reaction score (0..100). At +0x168 (abs 0x4550). HIGH confidence.
   * wmnpc.ovr file+0x671d: reads, updates via combat delta/10, clamps to 100, writes back.
   * Stock chars: THESUS=20, TEMPEST=12, LYSANDR=16, NOBAL=20, TREON=16, PENTAG=40.
   */
  reaction: U8,
  /**
   * Level before most recent class change (0..255). At +0x1af (abs 0x4597). MEDIUM confidence.
   * class_change_apply (wpcvw 0x6054): writes *0x4597 = old_level.
   * Six functions throttle gains until current_level >= savedOldLevel.
   * Stock chars all 0 (never changed class).
   */
  savedOldLevel: U8,
  raw: z.array(U8).length(432),
});

export const DecodedPcfileSchema = z.object({
  header: PcfileHeaderSchema,
  slots: z.array(PcfileSlotSchema).length(16),
});

export type PcfileHeader = z.infer<typeof PcfileHeaderSchema>;
export type PcfileSlot = z.infer<typeof PcfileSlotSchema>;
export type DecodedPcfile = z.infer<typeof DecodedPcfileSchema>;
