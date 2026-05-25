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
 * `docs/re/findings/character-xp-field.json`, and
 * `docs/re/findings/character-record-extended-map.json`.
 * The full 432-byte raw record is preserved as `raw`.
 *
 * Field offsets (record-relative, verified by wpcvw.ovr ASM traces):
 * - name        @ +0x00, 8 bytes ASCII null-terminated
 * - ageCounter  @ +0x08, u32 LE  (stats panel image 0x1077: [bx+0x43f0] / 365 -> age in years)
 * - xp          @ +0x0c, u32 LE  (class_change_apply image 0x61e7 clears;
 *                                  stats panel 0x123e/0x1242 displays; level_up_check 0xb470 reads)
 * - gold        @ +0x14, u32 LE  (give_gold 0x513e: 32-bit carry math on abs 0x43fc/0x43fe)
 *                                  CORRECTED: prior schema had gold@+0x22 u16 -- that was wrong.
 * - hpCurrent  @ +0x18, u16 LE  (abs 0x4400)
 * - hpMax      @ +0x1A, u16 LE  (abs 0x4402)
 * - spCurrent  @ +0x1C, u16 LE  (abs 0x4404)
 * - spMax      @ +0x1E, u16 LE  (abs 0x4406)
 * - level      @ +0x24, u16 LE  (stats panel 0x117b: push [bx+0x440c])
 * - levelSecondary @ +0x26, u16 LE  (stats panel displays, equals level in stock data)
 * - race       @ +0x19d, u8     (stats panel: mov al,[bx+0x4585]; add ax,0x64 -> msg lookup)
 *                                  NOTE: bss_layout "+0x19c" was wrong; correct is 0x19d.
 * - alignment  @ +0x19e, u8     (stats panel: mov al,[bx+0x4586]; add ax,0x8c -> msg lookup)
 * - class      @ +0x19f, u8     (stats panel: mov al,[bx+0x4587]; add ax,0x78 -> msg lookup)
 *                                  NOTE: bss_layout "+0x19e" was wrong; correct is 0x19f.
 * - str/int/pie/vit/dex/spd/per/kar @ +0x12c..+0x133, u8[8]
 *                                  (stats panel loop: [bx+0x4514+i] i=0..7, msgs 0xcc..0xd3)
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
  level: U16,
  levelSecondary: U16,
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
  raw: z.array(U8).length(432),
});

export const DecodedPcfileSchema = z.object({
  header: PcfileHeaderSchema,
  slots: z.array(PcfileSlotSchema).length(16),
});

export type PcfileHeader = z.infer<typeof PcfileHeaderSchema>;
export type PcfileSlot = z.infer<typeof PcfileSlotSchema>;
export type DecodedPcfile = z.infer<typeof DecodedPcfileSchema>;
