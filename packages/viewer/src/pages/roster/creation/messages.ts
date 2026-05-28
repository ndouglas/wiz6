// packages/viewer/src/pages/roster/creation/messages.ts
//
// msg.dbs string wiring for the wpcmk character-creation screens.
// Authoritative spec: docs/re/wpcmk-screens.md §3
//
// All on-screen text comes via msg.dbs IDs — no literal strings are baked here.
// The MSG constant table captures the fixed per-screen IDs from §3.
// Dynamic names (race/class/sex/spell/skill-category) use base+index offsets.

import type { MessageDb } from '@wiz6/data';

// ---------------------------------------------------------------------------
// Fixed per-screen message IDs  (§3)
// ---------------------------------------------------------------------------

export const MSG = {
  /** screen-00: "CHARACTER NAME >" */
  namePrompt: 0x044c,
  /** screen-00: "* CHARACTER ALREADY EXISTS *" */
  dupNameError: 0x044e,
  /** screen-15: "SAVE THIS CHARACTER?" */
  confirmPrompt: 0x044f,
  /** screen-02: "SELECT CHARACTER RACE" */
  racePrompt: 0x0450,
  /** screen-03: "SELECT CHARACTER SEX" */
  sexPrompt: 0x0451,
  /** screen-05: "SELECT CHARACTER PROFESSION" */
  classPrompt: 0x0452,
  /** screen-06: "BONUS" */
  bonusLabel: 0x0453,
  /** screen-06: "\x11\x12 ADJUSTS ABILITY" */
  bonusAdjust: 0x0454,
  /** screen-06: "\x13\x14 SELECTS ABILITY" */
  bonusSelect: 0x0455,
  /** screen-08: "CASTING KARMA - PRESS \x15" */
  personality: 0x0457,
  /** screen-10: "\x11\x12 TO REVIEW PORTRAITS" */
  portraitReview: 0x0458,
  /** screen-10: "PRESS \x15 TO SELECT" */
  portraitSelect: 0x0459,
  /** screen-15: "YES" (option list for KEEP/DISCARD picker) */
  confirmOptions: 0x045a,
  /** screen-02 title: "CHARACTER RACE" */
  raceTitle: 0x045c,
  /** screen-03 title: "CHARACTER SEX" */
  sexTitle: 0x045d,
  /** screen-05 title: "PROFESSION" */
  classTitle: 0x045e,
  /** screen-10 title: "CHARACTER PORTRAIT" */
  portraitTitle: 0x045f,
  /** screen-06 title: "ASSIGN ABILITY SCORE BONUS" */
  bonusTitle: 0x0460,
  /** screen-13: "SKILL POINTS" */
  skillPoints: 0x159a,
  /** screen-13 bottomBar row 1: "ASSIGN INITIAL SKILL BONUS" */
  skillAssign: 0x0262,
  /** screen-13 bottomBar row 2 (left half): "◄► ADJUSTS SKILL" */
  skillAdjusts: 0x025e,
  /** screen-13 bottomBar row 2 (right half): " ▲▼ SELECTS SKILL" — note leading space in DB */
  skillSelects: 0x025f,
  /** screen-13 bottomBar row 3: "PRESS ▶ FOR NEXT CATEGORY" */
  skillNextCategory: 0x0260,
  /** screen-14 title: "      SPELLS      " */
  spellsTitle: 0x02bc,
  /** screen-14: "COST" */
  cost: 0x0f75,
} as const;

// ---------------------------------------------------------------------------
// Dynamic name base offsets  (§3 / §9)
// ---------------------------------------------------------------------------

/** Race names: HUMAN=0x64, ELF=0x65, …, MOOK=0x6e  (11 races, indices 0..10) */
export const RACE_NAME_BASE = 0x64;

/** Class names: FIGHTER=0x78, MAGE=0x79, …, NINJA=0x85  (14 classes, indices 0..13) */
export const CLASS_NAME_BASE = 0x78;

/** Sex names: MALE=0x8c, FEMALE=0x8d  (indices 0..1) */
export const SEX_NAME_BASE = 0x8c;

/** Skill-category names: WEAPONRY=0x258, PHYSICAL=0x259, PERSONAL=0x25a, ACADEMIA=0x25b */
export const SKILL_CAT_BASE = 0x0258;

/**
 * Skill names: WAND&DAGGER=0x157c, SWORD=0x157d, AXE=0x157e, …
 * msg_id = 0x157c + skill_slot_index  (30 skill slots, indices 0..29)
 */
export const SKILL_NAME_BASE = 0x157c;

/** Spell names: ENERGY BLAST=0xfa0, BLINDING FLASH=0xfa1, …  (82 spells, indices 0..81) */
export const SPELL_NAME_BASE = 0x0fa0;

// ---------------------------------------------------------------------------
// Core lookup
// ---------------------------------------------------------------------------

/**
 * Look up the decoded text for `msgId` in a loaded MessageDb.
 * Returns an empty string if the id is not found (matches the "missing = empty" fallback).
 *
 * The `indexedMessages` array is the correct channel — it maps the integer msg.dbs IDs
 * (routed through msg.hdr's bank-structured index) to their decodedText values.
 */
export function creationString(db: MessageDb, msgId: number): string {
  const entry = db.indexedMessages.find((m) => m.id === msgId);
  return entry?.decodedText ?? '';
}

// ---------------------------------------------------------------------------
// Convenience helpers for dynamic name bases
// ---------------------------------------------------------------------------

/** Race name by index (0..10). */
export function raceName(db: MessageDb, i: number): string {
  return creationString(db, RACE_NAME_BASE + i);
}

/** Class name by index (0..13). */
export function className(db: MessageDb, i: number): string {
  return creationString(db, CLASS_NAME_BASE + i);
}

/** Sex name by index (0=MALE, 1=FEMALE). */
export function sexName(db: MessageDb, i: number): string {
  return creationString(db, SEX_NAME_BASE + i);
}

/** Skill-category name by index (0=WEAPONRY, 1=PHYSICAL, 2=PERSONAL, 3=ACADEMIA). */
export function skillCatName(db: MessageDb, i: number): string {
  return creationString(db, SKILL_CAT_BASE + i);
}

/** Skill name by slot index (0..29, maps to msg 0x157c..0x1599). */
export function skillName(db: MessageDb, slotIdx: number): string {
  return creationString(db, SKILL_NAME_BASE + slotIdx);
}

/** Spell name by entry index (0..81, maps to msg 0xfa0..0xff1). */
export function spellName(db: MessageDb, i: number): string {
  return creationString(db, SPELL_NAME_BASE + i);
}
