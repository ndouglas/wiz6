import { describe, it, expect } from 'vitest';
import {
  CLASS_SKILL_GRANTS,
  applyClassSkillGrants,
} from '../../src/character-creation/class-skill-grants.js';
import type { Rng } from '../../src/character-creation/derived-stats.js';

/**
 * Tests for per-class skill pre-grants, decoded from wpcmk.ovr's
 * `skill_pool_roll_and_class_adjust` (file 0x4222) jump table at 0x4545.
 *
 * Verified against engine save 1 (NATHAN samurai, DEX=12 SPD=14: SWORD=9
 * ∈ [7..10]) and save 2 (NATHAN Fighter Rawulf: all skills 0).
 */

const NATHAN_SAMURAI_ATTRS = {
  str: 14, int: 11, pie: 8, vit: 9, dex: 12, spd: 14, per: 8, kar: 3,
};

/** Deterministic RNG that returns a fixed value modulo each `uniform(n)` call. */
function makeFixedRng(fixed: number): Rng {
  return { uniform: (n: number) => fixed % n };
}

describe('CLASS_SKILL_GRANTS — table shape', () => {
  it('has 14 entries (one per class 0..13)', () => {
    expect(CLASS_SKILL_GRANTS).toHaveLength(14);
  });

  it('Fighter (class 0) has no pre-grants', () => {
    expect(CLASS_SKILL_GRANTS[0]).toEqual([]);
  });

  it.each([
    [1, 'Mage'], [2, 'Priest'], [3, 'Thief'], [4, 'Ranger'],
    [5, 'Alchemist'], [6, 'Bard'], [7, 'Psionic'], [8, 'Valkyrie'],
    [9, 'Bishop'], [10, 'Lord'], [11, 'Samurai'], [12, 'Monk'], [13, 'Ninja'],
  ] as const)('class %i %s has at least 1 pre-grant', (idx, _name) => {
    expect(CLASS_SKILL_GRANTS[idx]!.length).toBeGreaterThan(0);
  });

  it('Lord and Samurai share the same grant routine', () => {
    expect(CLASS_SKILL_GRANTS[10]).toEqual(CLASS_SKILL_GRANTS[11]);
  });

  it('Ranger, Bishop, Monk, Ninja each have 2 grants', () => {
    expect(CLASS_SKILL_GRANTS[4]).toHaveLength(2);
    expect(CLASS_SKILL_GRANTS[9]).toHaveLength(2);
    expect(CLASS_SKILL_GRANTS[12]).toHaveLength(2);
    expect(CLASS_SKILL_GRANTS[13]).toHaveLength(2);
  });
});

describe('applyClassSkillGrants — formula evaluation', () => {
  it('Fighter (class 0) returns empty grants + 0 deduction', () => {
    const result = applyClassSkillGrants(makeFixedRng(0), 0, NATHAN_SAMURAI_ATTRS);
    expect(result.grants).toEqual([]);
    expect(result.budgetDeduction).toBe(0);
  });

  it('Samurai (class 11): SWORD = rng(4) + (DEX+SPD)/6 + 3', () => {
    // NATHAN samurai with DEX=12, SPD=14: (12+14)/6 = 4 → rng(4) + 4 + 3 = 7..10.
    // Engine save 1 observed SWORD = 9. rng(2) gives 0..1; pick rng=2 → 9. ✓
    const result = applyClassSkillGrants(makeFixedRng(2), 11, NATHAN_SAMURAI_ATTRS);
    expect(result.grants).toEqual([{ slot: 1, value: 9 }]);
    expect(result.budgetDeduction).toBe(9);
  });

  it('Samurai with rng=0: SWORD = 0 + 4 + 3 = 7 (min)', () => {
    const result = applyClassSkillGrants(makeFixedRng(0), 11, NATHAN_SAMURAI_ATTRS);
    expect(result.grants).toEqual([{ slot: 1, value: 7 }]);
  });

  it('Samurai with rng=3: SWORD = 3 + 4 + 3 = 10 (max)', () => {
    const result = applyClassSkillGrants(makeFixedRng(3), 11, NATHAN_SAMURAI_ATTRS);
    expect(result.grants).toEqual([{ slot: 1, value: 10 }]);
  });

  it('Lord uses the same formula as Samurai → SWORD slot 1', () => {
    const samurai = applyClassSkillGrants(makeFixedRng(2), 11, NATHAN_SAMURAI_ATTRS);
    const lord = applyClassSkillGrants(makeFixedRng(2), 10, NATHAN_SAMURAI_ATTRS);
    expect(lord).toEqual(samurai);
  });

  it('Mage (class 1): THAUMATURGY = rng(4) + INT/3 + 3', () => {
    // INT=11 → 11/3 = 3 → rng(4) + 3 + 3 = 6..9. rng=0 → 6.
    const result = applyClassSkillGrants(makeFixedRng(0), 1, NATHAN_SAMURAI_ATTRS);
    expect(result.grants).toEqual([{ slot: 28, value: 6 }]);
  });

  it('Bishop (class 9): two grants — THAUMATURGY + THEOLOGY', () => {
    // THAUMATURGY = rng(3) + INT/5 + 2: INT=11 → 11/5 = 2 → 0+2+2 = 4
    // THEOLOGY    = rng(3) + PIE/5 + 2: PIE=8  → 8/5  = 1 → 0+1+2 = 3
    const result = applyClassSkillGrants(makeFixedRng(0), 9, NATHAN_SAMURAI_ATTRS);
    expect(result.grants).toEqual([
      { slot: 28, value: 4 },
      { slot: 26, value: 3 },
    ]);
    expect(result.budgetDeduction).toBe(7);
  });

  it('Ninja (class 13): HANDS&FEET + NINJUTSU both use (DEX+SPD)/10', () => {
    // (12+14)/10 = 2 → both grants = rng(3) + 2 + 2 = 4..6. rng=0 → 4.
    const result = applyClassSkillGrants(makeFixedRng(0), 13, NATHAN_SAMURAI_ATTRS);
    expect(result.grants).toEqual([
      { slot: 9, value: 4 },   // HANDS&FEET
      { slot: 16, value: 4 },  // NINJUTSU
    ]);
  });

  it('throws on out-of-range classIdx', () => {
    expect(() => applyClassSkillGrants(makeFixedRng(0), 14, NATHAN_SAMURAI_ATTRS)).toThrow();
  });
});
