/**
 * buildCharacterFromDraft — maps a completed CreationState.draft to a
 * schema-valid Character.
 *
 * Called when the creation flow reaches `screen === 'committing'`.
 * Uses CharacterSchema.parse() to validate and apply defaults (e.g.
 * the `sex` default=0 for backwards-compatibility).
 *
 * All optional fields (inventory, equipment, npcRaceReaction, etc.) are
 * left absent so the schema default paths apply.
 *
 * The `id` is generated via `crypto.randomUUID()`.
 */

import {
  CharacterSchema,
  buildStartingInventory,
  startingEncumbrance,
  type Character,
  type ScenarioDb,
} from '@wiz6/data';
import type { DraftState } from '../state.js';

/**
 * Map a completed DraftState to a valid Character.
 *
 * Preconditions (asserted via CharacterSchema.parse):
 *   - draft.name is 1..7 chars
 *   - draft.race is 0..10 (non-null)
 *   - draft.class is 0..13 (non-null)
 *   - draft.sex is 0 or 1 (non-null)
 *   - draft.attributes are all 0..255
 *   - draft.skills is 30-element array of 0..255
 *   - draft.derived has at least hpInitial, level, xp (from computeDerivedStats)
 *
 * @throws ZodError if the draft is invalid (should not happen for a
 *   well-formed completed draft; this surfaces bugs early).
 */
export function buildCharacterFromDraft(draft: DraftState, scenarioDb?: ScenarioDb): Character {
  const id = crypto.randomUUID();

  // Clamp attributes to U8 range (0..255) — the bonus allocator already
  // enforces 0..18 cap, but CharacterSchema is more lenient (U8).
  const attrs = draft.attributes;

  // level and xp come from derived stats (computeDerivedStats fires at ALLOC_CONFIRM).
  const level = draft.derived.level ?? 1;
  const xp    = draft.derived.xp    ?? 0;
  // Starting gold is 0 for EVERY created character (confirmed by Nate's
  // recollection — all classes start broke; gold is earned through play). The
  // class STARTING KIT (see `inventory` below) is issued for FREE — gold is not
  // consumed. (Aside: the creation-starting-equipment finding's "+0x22 = gold =
  // vit*15" claim is wrong — record +0x22 is the carry capacity, THESUS's
  // +0x22=2700 == encumbranceMax; see derived-stats.ts.)
  const gold  = 0;
  // HP, stamina, and age — needed by the review char-sheet renderer (and the
  // in-game stat panel). Default to 0 if a partial draft is committed.
  const hpInitial = draft.derived.hpInitial ?? 0;
  const stamina   = draft.derived.stamina   ?? 0;
  const age       = draft.derived.age       ?? 0;

  // skills: 30-element array, clamped to U8 (already 0..50 from training)
  const skills = draft.skills.slice(0, 30);
  while (skills.length < 30) skills.push(0);

  // conditions: 10 zeros (new character is healthy)
  const conditions = new Array(10).fill(0) as number[];

  // schoolMana and schoolManaMax: 6 zeros (set later by class-mana init)
  const schoolMana    = new Array(6).fill(0) as number[];
  const schoolManaMax = new Array(6).fill(0) as number[];

  // Starting equipment — the engine issues a hardcoded per-class kit (5 carried
  // items, none auto-equipped) at creation. Needs the scenario DB to resolve
  // each item's weight/equipSlot/spriteIdx/flags. Absent it (e.g. unit tests
  // that don't pass scenarioDb), the inventory is left empty (old behavior).
  // RE: docs/re/findings/creation-starting-equipment.json.
  const inventory = scenarioDb ? buildStartingInventory(draft.class ?? 0, scenarioDb) : undefined;
  const encumbranceCurrent = inventory ? startingEncumbrance(inventory) : 0;

  const raw = {
    id,
    name: draft.name,
    race: draft.race ?? 0,
    class: draft.class ?? 0,
    sex: (draft.sex ?? 0) as 0 | 1,
    level,
    savedOldLevel: 0,
    xp,
    gold,
    conditions,
    dead: false,
    paralyzed: false,
    attributes: {
      str: attrs.str,
      int: attrs.int,
      pie: attrs.pie,
      vit: attrs.vit,
      dex: attrs.dex,
      spd: attrs.spd,
      per: attrs.per,
      kar: attrs.kar,
    },
    schoolMana,
    schoolManaMax,
    skills,
    reaction: 50,             // neutral reaction
    portraitIndex: draft.portrait,
    hpCurrent: hpInitial,
    hpMax: hpInitial,
    staminaCurrent: stamina,
    staminaMax: stamina,
    age,
    // Max carrying capacity (record +0x22), STR/VIT-derived. encumbranceCurrent
    // is the summed weight of the starting kit (engine: give_one_item's weight
    // accumulator) — 0 if no scenarioDb was supplied.
    encumbranceMax: draft.derived.carryCapacityMax ?? 0,
    encumbranceCurrent,
    // Starting inventory (the class kit). Omitted when no scenarioDb → schema
    // leaves it absent (empty), preserving the prior behavior.
    ...(inventory ? { inventory } : {}),
  };

  // CharacterSchema.parse validates and applies .default(0) for sex etc.
  return CharacterSchema.parse(raw);
}
