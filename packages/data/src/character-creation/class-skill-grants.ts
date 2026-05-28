/**
 * Per-class skill pre-grants at character creation.
 *
 * After the skill BUDGET roll (rng(9) + 10 = 10..18), the engine runs a
 * per-class routine that pre-grants 1 or 2 skill values, deducting each
 * grant from the budget. Fighter gets NO pre-grants; every other class
 * gets at least one.
 *
 * Source: `skill_pool_roll_and_class_adjust` (wpcmk file 0x4222), jump
 * table at file 0x4545 (CS:0x8aa9), per-class routines at file 0x426b..
 * 0x44e2. Decoded by raw disassembly of wpcmk.ovr — see
 * `docs/re/findings/wpcmk-class-skill-grants.json`.
 *
 * Common formula shape (all 16 grant blocks fit this template):
 *
 *     value = rng(rngRange) + sum(attrs) / attrDivisor + constAdd
 *
 *     skills[slot] = value
 *     budget -= value     (the final grant's deduction happens in the
 *                          post-dispatch tail at file 0x456e..0x4585;
 *                          earlier grants deduct inline)
 *
 * The engine uses signed 16-bit IDIV; for positive sums (which attributes
 * always are at creation) IDIV truncation toward zero equals Math.floor.
 */

import type { Rng } from './derived-stats.js';
import type { SkillBudgetAttrs } from './skill-budget.js';

/** Attribute key — matches the order STR..KAR at DGROUP 0x559c..0x55a3. */
export type AttrKey = 'str' | 'int' | 'pie' | 'vit' | 'dex' | 'spd' | 'per' | 'kar';

/** A single pre-grant: one rng(rngRange) draw + an attr-derived term + a constant. */
export interface SkillGrantFormula {
  /** Skill slot 0..29 to write the grant value to (engine address = 0x55a4 + slot). */
  slot: number;
  /** RNG range — `rng(rngRange)` returns 0..rngRange-1. */
  rngRange: number;
  /** Attribute key(s) summed before division. Empty array = no attribute term. */
  attrs: readonly AttrKey[];
  /** Divisor applied to the attribute sum (floor). 1 = no division. */
  attrDivisor: number;
  /** Constant added at the end (engine `inc ax` instructions). */
  constAdd: number;
}

/**
 * Per-class skill-grant table. Index = class index (0..13). Each entry is
 * the LIST of grants the class receives at creation, in engine order.
 *
 * Verified via raw disassembly of wpcmk.ovr at the addresses noted per row.
 */
export const CLASS_SKILL_GRANTS: ReadonlyArray<ReadonlyArray<SkillGrantFormula>> = [
  // 0 Fighter — wpcmk 0x456e: NO pre-grants (jump table sends straight to the
  // post-dispatch tail, with [bp-c] still 0 from the function prologue).
  [],
  // 1 Mage — wpcmk 0x426b. THAUMATURGY = rng(4) + INT/3 + 3.
  [{ slot: 28, rngRange: 4, attrs: ['int'],         attrDivisor: 3,  constAdd: 3 }],
  // 2 Priest — wpcmk 0x4291. THEOLOGY = rng(4) + PIE/3 + 3.
  [{ slot: 26, rngRange: 4, attrs: ['pie'],         attrDivisor: 3,  constAdd: 3 }],
  // 3 Thief — wpcmk 0x42b7. SKULDUGGERY = rng(4) + (INT+DEX)/6 + 3.
  [{ slot: 15, rngRange: 4, attrs: ['int', 'dex'],  attrDivisor: 6,  constAdd: 3 }],
  // 4 Ranger — wpcmk 0x42e6. Two grants.
  [
    { slot: 11, rngRange: 3, attrs: ['int', 'vit'], attrDivisor: 10, constAdd: 2 }, // SCOUTING
    { slot:  7, rngRange: 3, attrs: ['dex', 'spd'], attrDivisor: 10, constAdd: 2 }, // BOWS
  ],
  // 5 Alchemist — wpcmk 0x4379. ALCHEMY = rng(4) + INT/3 + 3.
  [{ slot: 25, rngRange: 4, attrs: ['int'],         attrDivisor: 3,  constAdd: 3 }],
  // 6 Bard — wpcmk 0x434a. MUSIC = rng(4) + (INT+DEX)/6 + 3.
  [{ slot: 12, rngRange: 4, attrs: ['int', 'dex'],  attrDivisor: 6,  constAdd: 3 }],
  // 7 Psionic — wpcmk 0x439f. THEOSOPHY = rng(4) + (INT+PIE)/6 + 3.
  [{ slot: 27, rngRange: 4, attrs: ['int', 'pie'],  attrDivisor: 6,  constAdd: 3 }],
  // 8 Valkyrie — wpcmk 0x4420. POLE&STAFF = rng(4) + (DEX+SPD)/6 + 3.
  [{ slot:  4, rngRange: 4, attrs: ['dex', 'spd'],  attrDivisor: 6,  constAdd: 3 }],
  // 9 Bishop — wpcmk 0x43ce. Two grants.
  [
    { slot: 28, rngRange: 3, attrs: ['int'],        attrDivisor: 5,  constAdd: 2 }, // THAUMATURGY
    { slot: 26, rngRange: 3, attrs: ['pie'],        attrDivisor: 5,  constAdd: 2 }, // THEOLOGY
  ],
  // 10 Lord — wpcmk 0x444f. SWORD = rng(4) + (DEX+SPD)/6 + 3.
  // (Lord and Samurai share this exact routine via two jump-table entries.)
  [{ slot:  1, rngRange: 4, attrs: ['dex', 'spd'],  attrDivisor: 6,  constAdd: 3 }],
  // 11 Samurai — wpcmk 0x444f (shared with Lord).
  [{ slot:  1, rngRange: 4, attrs: ['dex', 'spd'],  attrDivisor: 6,  constAdd: 3 }],
  // 12 Monk — wpcmk 0x447e. Two grants.
  [
    { slot:  9, rngRange: 3, attrs: ['dex', 'spd'], attrDivisor: 10, constAdd: 2 }, // HANDS&FEET
    { slot: 27, rngRange: 3, attrs: ['int', 'pie'], attrDivisor: 10, constAdd: 2 }, // THEOSOPHY
  ],
  // 13 Ninja — wpcmk 0x44e2. Two grants.
  [
    { slot:  9, rngRange: 3, attrs: ['dex', 'spd'], attrDivisor: 10, constAdd: 2 }, // HANDS&FEET
    { slot: 16, rngRange: 3, attrs: ['dex', 'spd'], attrDivisor: 10, constAdd: 2 }, // NINJUTSU
  ],
];

/** Result of applying class skill grants. */
export interface ClassSkillGrantResult {
  /** Grants in engine order: each entry is { slot, value }. Apply to draft.skills. */
  grants: ReadonlyArray<{ slot: number; value: number }>;
  /**
   * Total points to deduct from the skill budget pool (clamped at 0 by the
   * engine post-dispatch tail at file 0x456e..0x4580 — but here we return
   * the unclamped sum; the caller clamps as needed).
   */
  budgetDeduction: number;
}

/**
 * Apply the class skill-grant routine for `classIdx`, advancing `rng` once
 * per grant. Returns the slot/value pairs and the total budget deduction.
 *
 * Fighter (classIdx === 0) returns an empty grants list and 0 deduction.
 */
export function applyClassSkillGrants(
  rng: Rng,
  classIdx: number,
  attrs: SkillBudgetAttrs,
): ClassSkillGrantResult {
  const formulas = CLASS_SKILL_GRANTS[classIdx];
  if (!formulas) {
    throw new Error(`classIdx ${classIdx} out of range (valid 0..13)`);
  }
  const grants: { slot: number; value: number }[] = [];
  let budgetDeduction = 0;
  for (const f of formulas) {
    const rngValue = rng.uniform(f.rngRange);
    let attrSum = 0;
    for (const k of f.attrs) attrSum += attrs[k];
    const divided = f.attrDivisor > 1 ? Math.floor(attrSum / f.attrDivisor) : attrSum;
    const value = rngValue + divided + f.constAdd;
    grants.push({ slot: f.slot, value });
    budgetDeduction += value;
  }
  return { grants, budgetDeduction };
}
