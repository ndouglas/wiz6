/**
 * applyClassChange — engine-faithful WPCVW class-change tax.
 *
 * Engine reference: `wpcvw_class_change_execute` @ wpcvw.ovr 0x6054.
 * Behavior (per docs/re/findings/wpcvw-naming-pass.json#fn-class-change-tax
 * and docs/re/wpcvw-character-view.md):
 *
 *   1. *0x4587 := new_class            (class byte set)
 *   2. *0x4597 := *0x440c IF *0x440c < 250 ELSE 0   (saved-old-level: stores
 *      the level you came from, but ZEROES if you were at the engine's
 *      throttle-release threshold; cap value 0xfa = 250)
 *   3. *0x440c := 1                    (level reset)
 *   4. *0x4588 := 0                    (high-water-mark reset — not modeled)
 *   5. *0x43f4/6 := 0                  (XP wiped)
 *   6. FUN_5f4d (race re-init)         (no-op here — race unchanged)
 *   7. FUN_5e04 (class re-init)        (re-rolls HP/encumbrance via class formula)
 *   8. FUN_8e35 (recompute derived)    (re-derives AC, stamina, etc.; ALSO unequips all)
 *
 * Age is NOT recomputed — it's set once at creation and persists across class
 * changes. HP/encumbrance/stamina are re-rolled via the same `computeDerivedStats`
 * fn used at character creation (the engine's class re-init reuses the same
 * roll path); current = max for a freshly re-classed character.
 *
 * Spec: docs/superpowers/specs/2026-05-29-wpcvw-edit-submenu-design.md
 */

import type { ActivePartyMember } from '../schemas/active-party.js';
import { computeDerivedStats, type Rng } from '../character-creation/derived-stats.js';

const SAVED_OLD_LEVEL_THRESHOLD = 250; // engine 0xfa — at this level or above, savedOldLevel is set to 0 (throttle released)
const NUM_EQUIPMENT_SLOTS = 8;
const EQUIPMENT_EMPTY = 255; // sentinel value in the equipment array for an empty body slot

export function applyClassChange(
  rng: Rng,
  member: ActivePartyMember,
  newClassId: number,
): ActivePartyMember {
  const derived = computeDerivedStats(rng, newClassId, member.race, member.attributes);
  const savedOldLevel = member.level < SAVED_OLD_LEVEL_THRESHOLD ? member.level : 0;

  return {
    ...member,
    class: newClassId,
    level: 1,
    xp: 0,
    savedOldLevel,
    equipment: new Array(NUM_EQUIPMENT_SLOTS).fill(EQUIPMENT_EMPTY),
    hpCurrent: derived.hpInitial,
    hpMax: derived.hpInitial,
    staminaCurrent: derived.stamina,
    staminaMax: derived.stamina,
    encumbranceCurrent: derived.encumbranceMax,
    encumbranceMax: derived.encumbranceMax,
  };
}
