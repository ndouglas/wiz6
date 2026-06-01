import { z } from 'zod';

const U8 = z.number().int().min(0).max(255);
const U16 = z.number().int().min(0).max(0xffff);
const U32 = z.number().int().min(0).max(0xffffffff);

/**
 * One 8-byte inventory item slot.
 *
 * Layout (wpcvw.ovr ASM + pcfile.dbs/scenario.dbs 100% cross-check, see
 * `docs/re/findings/character-record-inventory-equipment.json`):
 * - itemId       @ +0, u16 LE — scenario.dbs index (0 = empty slot)
 * - weight       @ +2, u8    — cached from scenario.dbs item byte 30
 * - pad          @ +3, u8    — always 0 (high byte of weight word)
 * - equipSlot    @ +4, u8    — cached from scenario.dbs item byte 60
 * - spriteIdx    @ +5, u8    — cached from scenario.dbs item byte 61
 * - quantity     @ +6, u8    — charge/stack count (0 for non-stackable)
 * - flags        @ +7, u8    — 0x01/0x02=CURSED, 0x04=stackable/thrown, 0x08=2H, 0x40=CLASS_LOCKED
 */
export const PcfileInventoryItemSchema = z.object({
  itemId: U16,
  weight: U8,
  pad: U8,
  equipSlot: U8,
  spriteIdx: U8,
  quantity: U8,
  flags: U8,
});

export type PcfileInventoryItem = z.infer<typeof PcfileInventoryItemSchema>;

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
 * - name                  @ +0x00, 8 bytes ASCII null-terminated
 * - ageCounter            @ +0x08, u32 LE  (stats panel image 0x1077: [bx+0x43f0] / 365 -> age in years)
 * - xp                    @ +0x0c, u32 LE  (class_change_apply image 0x61e7 clears)
 * - mks                   @ +0x10, u32 LE  Monster Kill Statistic (MKS). Manual p. 23. wmexe increments per kill.
 * - gold                  @ +0x14, u32 LE  (give_gold 0x513e: 32-bit carry math on abs 0x43fc/0x43fe)
 *                                           CORRECTED: prior schema had gold@+0x22 u16 -- that was wrong.
 * - hpCurrent             @ +0x18, u16 LE  (abs 0x4400)
 * - hpMax                 @ +0x1A, u16 LE  (abs 0x4402)
 * - spCurrent             @ +0x1C, u16 LE  (abs 0x4404)
 * - spMax                 @ +0x1E, u16 LE  (abs 0x4406)
 * - encumbranceCurrent    @ +0x20, u16 LE  (martydill: current load tenths-of-pound; wpcvw+0x0e3d adds inv weights)
 * - encumbranceMax        @ +0x22, u16 LE  (martydill: max carry capacity tenths-of-pound; scales with STR)
 * - schoolManaCur         @ +0x28+i*4, u16[6] interleaved with schoolManaMax
 *                                           (stats panel loop file+0x0e55+0x4c: [bx+0x4410+i*4])
 * - schoolManaMax         @ +0x2a+i*4, u16[6] interleaved with schoolManaCur
 *                                           (stats panel loop file+0x0e55+0x4c: [bx+0x4412+i*4])
 * - level                 @ +0x24, u16 LE  (stats panel 0x117b: push [bx+0x440c])
 * - levelSecondary        @ +0x26, u16 LE  (stats panel displays, equals level in stock data)
 * - conditions            @ +0x122..+0x12b, u8[10]
 *                                           (priority loop file+0x05c6: for si=0..9 [bx+0x450a+si])
 *                                           conditions[2]=dead, conditions[3]=paralyzed (portrait overrides)
 * - str/int/pie/vit/dex/spd/per/kar @ +0x12c..+0x133, u8[8]
 *                                           (stats panel loop: [bx+0x4514+i] i=0..7, msgs 0xcc..0xd3)
 *                                           per=Personality, kar=Karma (manual p. 11, distinct named stats)
 * - skills                @ +0x134..+0x151, u8[30]  cap=50
 *                                           EXTENDED from 14 to 30 bytes. Prior +0x142..+0x151
 *                                           'derived_stats_block' is skill continuation.
 *                                           (skill_roll_check file+0xa4c1: cmp [bx+0x451c], 0x32)
 * - bodyAc                @ +0x161..+0x167, u8[7]  per-body-slot AC (manual p. 25: 7 sub-components)
 * - reaction              @ +0x168, u8     (wmnpc.ovr file+0x671d: read/write [bx+0x4550]; capped 100)
 * - race                  @ +0x19d, u8     (stats panel: mov al,[bx+0x4585]; add ax,0x64 -> msg lookup)
 *                                           NOTE: bss_layout "+0x19c" was wrong; correct is 0x19d.
 * - alignment             @ +0x19e, u8     (stats panel: mov al,[bx+0x4586]; add ax,0x8c -> msg lookup)
 * - class                 @ +0x19f, u8     (stats panel: mov al,[bx+0x4587]; add ax,0x78 -> msg lookup)
 *                                           NOTE: bss_layout "+0x19e" was wrong; correct is 0x19f.
 * - savedOldLevel         @ +0x1af, u8     (class_change_apply 0x6054: stores old level; throttle ref)
 * - inventoryCountPage2   @ +0x1ad, u8     (martydill: page-2 item count; stock chars all 0)
 */
export const PcfileSlotSchema = z.object({
  slot: U8,
  populated: z.boolean(),
  name: z.string().nullable(),
  ageCounter: U32,
  xp: U32,
  /**
   * Monster Kill Statistic (MKS). At +0x10 (abs 0x43f8/0x43fa). u32 LE.
   * Manual p. 23: "number of monsters you have, in one way or another, sent to the Grim Reaper."
   * wmexe.ovr increments this per kill. All stock chars = 0.
   * HIGH confidence. Renamed from 'unknown_0x10'.
   */
  mks: U32,
  /** Gold pieces (32-bit). At +0x14 (abs 0x43fc/0x43fe). Stock chars all 0. */
  gold: U32,
  hpCurrent: U16,
  hpMax: U16,
  spCurrent: U16,
  spMax: U16,
  /**
   * Current encumbrance load in tenths of a pound. At +0x20 (abs 0x4408). u16 LE.
   * martydill/pcfile_editor.py cross-ref. wpcvw accumulates item weights here.
   * Stock: THESUS=295, TEMPEST=295, LYSANDR=225, NOBAL=136, TREON=128, PENTAG=128.
   * HIGH confidence. Renamed from 'unknown_0x20'. Refutes 'Rebirths at +0x20' hypothesis.
   */
  encumbranceCurrent: U16,
  /**
   * Max carry capacity in tenths of a pound. At +0x22. u16 LE.
   * martydill/pcfile_editor.py cross-ref. Scales with STR.
   * Stock: THESUS=2700 (270 lbs), TEMPEST=1800, LYSANDR=1125, NOBAL=1035, TREON=1440, PENTAG=1350.
   * HIGH confidence. Renamed from 'unknown_0x22' (was previously misidentified as gold).
   */
  encumbranceMax: U16,
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
   * 30 skill levels (0..50). At +0x134..+0x151 (abs 0x451c..0x4539). HIGH confidence.
   * skill_roll_check (wpcvw file+0xa4c1): cmp [bx+0x451c+skill_idx], 0x32 (cap at 50).
   * EXTENDED from 14 to 30: prior 'derived_stats_block' at +0x142..+0x151 is skill continuation.
   * Empirically confirmed: LYSANDR skills[15]=Skulduggery=10, NOBAL skills[26]=Theology=7,
   * TREON skills[28]=Thaumaturgy=10, PENTAG skills[28]=Thaumaturgy=7.
   * Index map (BINARY-VERIFIED, engine msg 5500+slot — see SKILL_SLOT_NAMES in
   * character-creation/class-skill-availability.ts + docs/re/findings/wpcvw-skill-names.json):
   * 0=WAND&DAGGER,1=SWORD,2=AXE,3=MACE&FLAIL,4=POLE&STAFF,5=THROWING,6=SLING,7=BOWS,8=SHIELD,
   * 9=HANDS&FEET,10=SWIMMING,11=SCOUTING,12=MUSIC,13=ORATORY,14=LEGERDEMAIN,15=SKULDUGGERY,
   * 16=NINJUTSU,17=DEFENSE,18=SPEED,19=MOVEMENT,20=AIM,21=POWER,22=ARTIFACTS,23=MYTHOLOGY,
   * 24=SCRIBE,25=ALCHEMY,26=THEOLOGY,27=THEOSOPHY,28=THAUMATURGY,29=KIRIJUTSU.
   * (Supersedes the speculative martydill map: weaponry 0-9 reordered; slots 10,17-21 are
   * real skills, not holes. So THESUS Fighter skills[1]=10 is SWORD, not "Axe".)
   */
  skills: z.array(U8).length(30),
  /**
   * Per-body-slot Armor Class values: 7 bytes at +0x161..+0x167 (abs 0x4549..0x454f).
   * Manual p. 25-26: AC sub-components = Magical + Head + Chest + Legs + Hands + Feet + Encumbrance/Shield.
   * Stock chars (unarmored): bodyAc=[0,0,10,10,10,10,10]. First 2 bytes 0 (no Magical AC / no encumbrance),
   * remaining 5 bytes = 10 (manual: base AC 10 = "virtually naked").
   * MEDIUM-HIGH confidence. Exact slot ordering needs ASM verification.
   */
  bodyAc: z.array(U8).length(7),
  /**
   * NPC reaction score (0..100). At +0x168 (abs 0x4550). HIGH confidence.
   * wmnpc.ovr file+0x671d: reads, updates via combat delta/10, clamps to 100, writes back.
   * Stock chars: THESUS=20, TEMPEST=12, LYSANDR=16, NOBAL=20, TREON=16, PENTAG=40.
   */
  reaction: U8,
  /**
   * Per-NPC-race reaction array: 31 bytes at +0x169..+0x187 (abs 0x4551..0x456f). HIGH confidence.
   * Entry [i] = reaction score for encounters with NPC race index i.
   * Initialized to base reaction score. Updated by wmnpc.ovr after encounters.
   * Stock chars: all 31 entries equal their base reaction score.
   */
  npcRaceReaction: z.array(U8).length(31),
  /**
   * Sparse caster-data region: 20 bytes at +0x188..+0x19b (abs 0x4570..0x4583). LOW confidence.
   * All zeros for fighters/thief. Casters have sparse nonzero values at school-aligned positions.
   * Likely spell-known counts or spell-slot tracking per school.
   * Stock: TREON=[1,0,0,0,0,0,1,0,0..0], NOBAL=[0,0,0,0,0,0,4,0,1,0..0],
   *        PENTAG=[0,2,0,0,32,0,0..0].
   */
  spellSlotsKnown: z.array(U8).length(20),
  /**
   * Portrait index (0..13). At +0x1ab (abs 0x4593). MEDIUM confidence.
   * 14 portraits available; selected at character creation.
   * Stock: THESUS=10, TEMPEST=8, LYSANDR=13, NOBAL=10, TREON=9, PENTAG=7.
   */
  portraitIndex: U8,
  /**
   * Count of items in inventory (0..22). At +0x1ac (abs 0x4594). HIGH confidence.
   * Stock chars all = 5 (5 starting items on page 1).
   */
  inventoryCount: U8,
  /**
   * Page-2 item count (0..10). At +0x1ad (abs 0x4595). MEDIUM confidence.
   * martydill cross-ref: companion to inventoryCount for the second inventory page (slots 10-19).
   * Stock chars all = 0 (only 5 items, all on page 1).
   */
  inventoryCountPage2: U8,
  /**
   * Derived AC byte. At +0x160 (abs 0x4548). HIGH confidence.
   * Base 10. wpcvw derived_ac (file+0xaa94): SPD>=16 -1, SPD>=18 -1, Faerie -2, Monk/Ninja -(level/2).
   * Stock chars all = 10.
   */
  derivedAc: U8,
  /**
   * Level before most recent class change (0..255). At +0x1af (abs 0x4597). MEDIUM confidence.
   * class_change_apply (wpcvw 0x6054): writes *0x4597 = old_level.
   * Six functions throttle gains until current_level >= savedOldLevel.
   * Stock chars all 0 (never changed class).
   */
  savedOldLevel: U8,
  /**
   * 14-byte per-school class rank threshold array. At +0x152..+0x15f (abs 0x453a). MEDIUM confidence.
   * Initialized by wpcmk creation init (file+0x3e51) using class-formula.
   * School 0 and 13 always 0. Stock: fighters=[0,8,4,8,4,8,8,8,8,28,8,48,4,0].
   */
  schoolRankThresholds: z.array(U8).length(14),
  /**
   * Inventory grid: 22 item slots x 8 bytes at record +0x40 (abs 0x4428).
   * Item slot layout: itemId(u16)+weight(u8)+pad(u8)+equipSlot(u8)+spriteIdx(u8)+quantity(u8)+flags(u8).
   * itemId = 0 means empty slot. Stock chars have 5 items each (inv_count=5, slots 5..21 empty).
   * See `docs/re/findings/character-record-inventory-equipment.json`. HIGH confidence.
   */
  inventory: z.array(PcfileInventoryItemSchema).length(22),
  /**
   * Equipment body-slot array: 8 bytes at record +0x110 (abs 0x44f8).
   * Each byte = inventory index (0..21) of equipped item, or 0xFF = empty.
   * Slots: [0]=weapon [1]=shield [2]=head [3]=body [4]=legs [5]=hands [6]=feet [7]=cloak.
   * Stock chars all 0xFF (items in inventory but not pre-equipped). HIGH confidence.
   * wpcvw.ovr file+0x81E8: mov al,[bx+0x44f8]; file+0x8327: mov [bx+0x44f8],al (write).
   */
  equipment: z.array(U8).length(8),
  raw: z.array(U8).length(432),
});

export const DecodedPcfileSchema = z.object({
  header: PcfileHeaderSchema,
  slots: z.array(PcfileSlotSchema).length(16),
});

export type PcfileHeader = z.infer<typeof PcfileHeaderSchema>;
export type PcfileSlot = z.infer<typeof PcfileSlotSchema>;
export type DecodedPcfile = z.infer<typeof DecodedPcfileSchema>;
