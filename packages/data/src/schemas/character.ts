import { z } from 'zod';

/**
 * Wizardry VI character record (TS port representation).
 *
 * Source: `packages/data/src/structs/character-record.ts` — the engine's
 * 432-byte record at BSS `0x43e8` stride `0x1b0`. The schema covers every
 * documented field; many of the record's 432 bytes are still unmapped at
 * the per-byte level (equipped item indices, full status flag layout,
 * spell-school known bitmaps). Those will be added as the RE pass refines.
 *
 * Each character has a stable UUID `id`. Rosters key on it; saves use the
 * `PartyMemberSchema` (extends this) to carry an optional `rosterCharacterId`
 * back-reference so the engine can sync state changes (level-up, death,
 * class-change) back to the roster on save.
 */
const U8 = z.number().int().min(0).max(255);
const U16 = z.number().int().min(0).max(0xffff);
const U32 = z.number().int().min(0).max(0xffffffff);

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
  /** Personality (engine offset +0x4598; exact name order vs Karma unverified). */
  personality: U8,
  /** Karma (engine offset +0x4599; exact name order vs Personality unverified). */
  karma: U8,
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
  /** Six base attributes + 2 personality bytes. */
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
  /** 14 skill levels (0..50). Cap is 50 (engine: 0x32). Bumped by wmaze + wmele on action attempts. */
  skills: z.array(U8).length(14),
  /**
   * NPC reaction score (0..100). Updated by wmnpc.ovr after encounters.
   * Engine record: +0x168 (abs 0x4550). HIGH confidence.
   */
  reaction: U8,
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
export type Character = z.infer<typeof CharacterSchema>;
export type PartyMember = z.infer<typeof PartyMemberSchema>;
