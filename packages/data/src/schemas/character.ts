import { z } from 'zod';

/**
 * Wizardry VI character record (TS port representation).
 *
 * Source: `packages/data/src/structs/character-record.ts` — the engine's
 * 432-byte record at BSS `0x43e8` stride `0x1b0`. The schema covers every
 * documented field; many of the record's 432 bytes are still unmapped at
 * the per-byte level (see docs/re/findings/character-record-spells-and-gaps.json).
 * NOTE: there are NO spell bitmaps — +0x142..+0x167 contains derived stats and
 * class rank thresholds, not packed spell-access bitmasks.
 * Inventory + equipment were decoded in round 3; round 4 added npcRaceReaction,
 * spellSlotsKnown, portraitIndex, derivedAc, schoolRankThresholds.
 *
 * Each character has a stable UUID `id`. Rosters key on it; saves use the
 * `PartyMemberSchema` (extends this) to carry an optional `rosterCharacterId`
 * back-reference so the engine can sync state changes (level-up, death,
 * class-change) back to the roster on save.
 */
const U8 = z.number().int().min(0).max(255);
const U16 = z.number().int().min(0).max(0xffff);
const U32 = z.number().int().min(0).max(0xffffffff);

/**
 * One inventory item as stored in the 8-byte item slot.
 *
 * Layout (wpcvw.ovr ASM + 100% pcfile.dbs/scenario.dbs cross-check):
 * - itemId     — scenario.dbs index (0 = empty slot)
 * - weight     — cached from scenario.dbs at pick-up time
 * - equipSlot  — body-slot category cached from scenario.dbs
 * - spriteIdx  — sprite index cached from scenario.dbs
 * - quantity   — charge/stack count (0 for non-stackable items)
 * - flags      — 0x01/0x02=CURSED, 0x04=stackable/thrown, 0x08=2-handed, 0x40=CLASS_LOCKED
 *
 * The `pad` byte (always 0) is omitted from this TS-facing schema.
 */
export const InventoryItemSchema = z.object({
  /** scenario.dbs item index (0-based). 0 = empty slot. */
  itemId: U16,
  /** Weight in encumbrance units. Cached from scenario.dbs at pick-up. */
  weight: U8,
  /** Body-slot category (cached scenario byte 60). Mapped to a body slot by
   *  `bodySlotForItem` (equipment/equip-logic.ts), per the verified jump table in
   *  docs/re/findings/wpcvw-equip-action.json#equip-slot-to-body-slot-map:
   *  0,1,2,3,0xc,0x10→weapon(body0); 4=ranged→off-hand(body1); 5=cloak; 6=head;
   *  7=body/chest; 8=legs; 9=hands; 0xa=feet; 0xb=shield→off-hand; 0xd-0xf→off-hand
   *  iff dual-wield flag; ≥0x11→not equippable (scroll/consumable). NOTE: ranged is
   *  equipSlot **4**, not 3 (3 is a weapon-family slot → body0). */
  equipSlot: U8,
  /** Sprite sheet index. Cached from scenario.dbs. */
  spriteIdx: U8,
  /** Charge/stack count. 0 for non-stackable. Non-zero for thrown weapons, scrolls, potions. */
  quantity: U8,
  /** Flags: 0x01/0x02=CURSED (blocks unequip), 0x04=stackable/thrown/consumable, 0x08=two-handed, 0x40=CLASS_LOCKED. */
  flags: U8,
});

export const AttributesSchema = z.object({
  /** STR — Strength. */
  str: U8,
  /** INT — Intelligence. */
  int: U8,
  /** PIE — Piety. */
  pie: U8,
  /** VIT — Vitality. */
  vit: U8,
  /** DEX — Dexterity. */
  dex: U8,
  /** SPD — Speed. */
  spd: U8,
  /**
   * PER — Personality. Engine offset +0x451a (record +0x132). Manual p. 11: "Personality (PER)"
   * distinct primary stat. Governs NPC friendliness/interaction; extroverted=high, shy=low.
   * HIGH confidence. Renamed from 'personality'.
   */
  per: U8,
  /**
   * KAR — Karma. Engine offset +0x451b (record +0x133). Manual p. 11: "Karma (KAR)"
   * distinct primary stat. "Ethical meter" — affects everything. Starts 0 for all races; rolled at creation.
   * HIGH confidence. Renamed from 'karma'.
   */
  kar: U8,
});

export const CharacterSchema = z.object({
  /** Stable UUID. Primary key in the roster, optional back-ref in saves. */
  id: z.string().uuid(),
  /**
   * ASCII character name. 1..7 chars. The on-disk name field is 8 bytes
   * (7 chars max + null terminator), confirmed by pcfile.dbs RE pass
   * (docs/re/pcfile-dbs.md). The prior claim of 12 bytes was wrong.
   */
  name: z.string().min(1).max(7),
  /** Race index. 5 = Faerie (hard-coded penalties; see wpcvw-character-view.md). */
  race: U8,
  /** Class index. 3 = Thief, 12 = Monk, 13 = Ninja (AC + skill scaling). */
  class: U8,
  /** Current character level. */
  level: U16,
  /** Level before most recent class change (engine throttles growth until current catches up). */
  savedOldLevel: U8,
  /** Experience points (engine field is u32). */
  xp: U32,
  /** Gold (engine field is u32; engine has 64-bit-safe add/subtract path). */
  gold: U32,
  /**
   * 10-condition tracker bytes. Non-zero = active condition.
   * conditions[2] = dead override (portrait icon 1).
   * conditions[3] = paralyzed/stone override (portrait icon 2).
   * Engine record: +0x122..+0x12b (abs 0x450a..0x4513). HIGH confidence.
   */
  conditions: z.array(U8).length(10),
  /**
   * Derived from conditions[2] (dead override byte). True if conditions[2] != 0.
   * Dead characters show a special portrait and are excluded from all actions.
   */
  dead: z.boolean(),
  /**
   * Derived from conditions[3] (paralyzed/stone override byte). True if conditions[3] != 0.
   */
  paralyzed: z.boolean(),
  /** Eight primary attributes: STR/INT/PIE/VIT/DEX/SPD/PER/KAR. */
  attributes: AttributesSchema,
  /**
   * Per-school mana current values (6 schools: Fire/Water/Air/Earth/Mental/Divine).
   * Engine stores interleaved (cur, max) u16 pairs at +0x28+i*4 and +0x2a+i*4.
   * Each value is u16. HIGH confidence.
   */
  schoolMana: z.array(U16).length(6),
  /**
   * Per-school mana max values (same school order as schoolMana cur).
   * Engine record: +0x2a+i*4 for school i. HIGH confidence.
   */
  schoolManaMax: z.array(U16).length(6),
  /**
   * 30 skill levels (0..50). Cap is 50 (engine: 0x32). Bumped by wmaze + wmele on action attempts.
   * EXTENDED from 14 to 30: empirically confirmed via class-archetype skills in pcfile.dbs.
   * Index map (martydill SKILL_INDEX_MAP): 0=Sword,1=Axe,2=Polearm,3=Mace&Flail,4=Dagger,
   * 5=Staff&Wand,6=Shield,7=ModernWeapons,8=Bow,9=ThrownWeapons,11=Sling,12=Whip,13=Music,
   * 14=Legerdemain,15=Skulduggery,16=Ninjutsu,22=Scouting,23=Mythology,24=Scribe,25=Alchemy,
   * 26=Theology,27=Theosophy,28=Thaumaturgy,29=Kirijutsu. Slots 10,17-21 are holes (always 0).
   */
  skills: z.array(U8).length(30),
  /**
   * NPC reaction score (0..100). Updated by wmnpc.ovr after encounters.
   * Engine record: +0x168 (abs 0x4550). HIGH confidence.
   */
  reaction: U8,
  /**
   * Inventory grid: 22 item slots (itemId=0 means empty). At record +0x40.
   * See `docs/re/findings/character-record-inventory-equipment.json`.
   * Optional for backwards-compatibility with pre-round-3 saves/rosters.
   * When absent, callers should treat as 22 empty slots.
   */
  inventory: z.array(InventoryItemSchema).length(22).optional(),
  /**
   * Equipment body-slot array: 8 inventory indices or 255=empty.
   * Slots: [0]=weapon [1]=shield [2]=head [3]=body [4]=legs [5]=hands [6]=feet [7]=cloak.
   * At record +0x110 (abs 0x44f8). Optional for backwards-compatibility.
   */
  equipment: z.array(U8).length(8).optional(),
  /**
   * Per-NPC-race reaction array: 31 entries, each 0..100.
   * Entry [i] = reaction score for encounters with NPC race i.
   * At record +0x169..+0x187 (abs 0x4551..0x456f). HIGH confidence.
   * Initialized to base reaction. Updated independently by wmnpc.ovr.
   * Optional for backwards-compatibility.
   */
  npcRaceReaction: z.array(U8).length(31).optional(),
  /**
   * Sparse caster-data: 20 bytes at +0x188..+0x19b.
   * All zero for fighters/thief; casters have sparse nonzero values.
   * Likely spell-known counts or spell-slot tracking per school. LOW confidence.
   * Optional for backwards-compatibility.
   */
  spellSlotsKnown: z.array(U8).length(20).optional(),
  /**
   * Portrait index (0..13). 14 portraits available; selected at character creation.
   * At record +0x1ab (abs 0x4593). MEDIUM confidence.
   * Optional for backwards-compatibility.
   */
  portraitIndex: U8.optional(),
  /**
   * Derived AC byte. Base 10. At record +0x160 (abs 0x4548). HIGH confidence.
   * wpcvw derived_ac: SPD>=16 -1, SPD>=18 -1, Faerie -2, Monk/Ninja -(level/2).
   * Optional for backwards-compatibility.
   */
  derivedAc: U8.optional(),
  /**
   * 14-byte per-school class rank threshold array. At record +0x152..+0x15f.
   * Written by wpcmk creation init (class-formula). MEDIUM confidence.
   * Optional for backwards-compatibility.
   */
  schoolRankThresholds: z.array(U8).length(14).optional(),
  /**
   * Sex/gender byte. 0=Male, 1=Female. At record +0x1a1 (abs 0x4589).
   * Party-row renderer (ndisasm 0x0e55+0x59a): shl ax → portrait table lookup via cs:0x526[sex*2].
   * Written by wpcmk screen-03-sex. All stock chars = 0 (Male).
   * Optional with default 0 for backwards-compatibility with stored rosters without this field.
   */
  sex: z.union([z.literal(0), z.literal(1)]).default(0),
  /**
   * Monster Kill Statistic (MKS). Manual p. 23. u32. At record +0x10.
   * wmexe.ovr increments per kill. Stock chars all 0.
   * Optional for backwards-compatibility.
   */
  mks: U32.optional(),
  /**
   * Current encumbrance load in tenths of a pound. u16 at record +0x20.
   * martydill cross-ref. wpcvw accumulates item weights here.
   * Optional for backwards-compatibility.
   */
  encumbranceCurrent: U16.optional(),
  /**
   * Max carry capacity in tenths of a pound. u16 at record +0x22.
   * martydill cross-ref. Scales with STR.
   * Optional for backwards-compatibility.
   */
  encumbranceMax: U16.optional(),
  /**
   * Per-body-slot Armor Class values: 7 bytes at record +0x161..+0x167.
   * Manual p. 25: AC sub-components = Magical+Head+Chest+Legs+Hands+Feet+Encumbrance/Shield.
   * Base 10 = unarmored. Stock: [0,0,10,10,10,10,10].
   * Optional for backwards-compatibility.
   */
  bodyAc: z.array(U8).length(7).optional(),
  /**
   * Current HP. U16 at record +0x18. Equals hpMax for fully-healed stock chars.
   * Optional for backwards-compatibility with pre-review rosters; defaults to 0
   * when absent (REVIEW PC shows " 0" in the HP cells).
   */
  hpCurrent: U16.optional(),
  /**
   * Max HP. U16 at record +0x1a. Same class-dispatch roll as encumbranceBase
   * for a fresh character. See CLASS_ENCUMBRANCE_FORMULAS in derived-stats.ts.
   */
  hpMax: U16.optional(),
  /**
   * Current stamina (sp_cur in the engine struct). U16 at record +0x1c.
   */
  staminaCurrent: U16.optional(),
  /**
   * Max stamina (sp_max). U16 at record +0x1e. Formula (VIT*2+STR)*3 + VIT bonuses
   * — see computeDerivedStats.
   */
  staminaMax: U16.optional(),
  /**
   * Age in game-DAYS. U32 at record +0x08 (age_counter). Rendered as age/365
   * years on the char-sheet (wpcmk 0x0e44..0x0e54 + wpcvw 0x1077).
   */
  age: U32.optional(),
});

export const PartyMemberSchema = CharacterSchema.extend({
  /**
   * If present, the engine should sync state changes (level-up, death,
   * class-change, etc.) back to this roster entry on save / end-of-game.
   * Absent when a save was imported from another visitor without their
   * roster — the party member is treated as a one-off snapshot.
   */
  rosterCharacterId: z.string().uuid().optional(),
});

export type Attributes = z.infer<typeof AttributesSchema>;
export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type PartyMember = z.infer<typeof PartyMemberSchema>;
