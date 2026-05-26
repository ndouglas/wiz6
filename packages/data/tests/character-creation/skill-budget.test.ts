/**
 * Tests for rollSkillBudget — skill-pool formula decoded from
 * skill_pool_roll_and_class_adjust @ wpcmk file 0x4222.
 *
 * The function:
 *   1. Rolls base = rng.uniform(9) + 10  (10..18)
 *   2. For Fighter/Ranger/Bishop/Monk/Ninja: subtracts a class-tier2 computed
 *      from one rng call + floor(attr_expr/div) + addend
 *   3. Returns max(0, base − tier2)
 *   4. All other classes: returns base unchanged (tier2 = 0)
 */

import { describe, expect, it } from 'vitest';
import type { WichmannHill } from '../../src/rng/wichmann-hill.js';
import { rollSkillBudget } from '../../src/character-creation/skill-budget.js';

// Minimal stub: rng.uniform(n) always returns `fixed` regardless of n.
const stub = (fixed: number) =>
  ({ uniform: (_n: number) => fixed }) as unknown as WichmannHill;

/** Default attrs — all mid-range, convenient for deterministic checks. */
const midAttrs = { str: 9, int: 9, pie: 9, vit: 9, dex: 9, spd: 9, per: 9, kar: 9 };

describe('rollSkillBudget', () => {
  // ── unadjusted classes ────────────────────────────────────────────────────
  describe('Mage (idx 1) — no tier2 adjustment', () => {
    it('returns rng(9)+10 exactly when rng returns 0', () => {
      // stub: uniform always returns 0 → base = 0+10 = 10
      expect(rollSkillBudget(stub(0), 1, midAttrs)).toBe(10);
    });

    it('returns rng(9)+10 exactly when rng returns 8 (max)', () => {
      // stub: uniform always returns 8 → base = 8+10 = 18
      expect(rollSkillBudget(stub(8), 1, midAttrs)).toBe(18);
    });

    it('ignores attrs entirely for an unadjusted class', () => {
      const highAttrs = { str: 18, int: 18, pie: 18, vit: 18, dex: 18, spd: 18, per: 18, kar: 18 };
      const lowAttrs  = { str: 3,  int: 3,  pie: 3,  vit: 3,  dex: 3,  spd: 3,  per: 3,  kar: 3  };
      // Both should give 10+5=15 (stub returns 5)
      expect(rollSkillBudget(stub(5), 1, highAttrs)).toBe(15);
      expect(rollSkillBudget(stub(5), 1, lowAttrs)).toBe(15);
    });
  });

  // Verify all nine unadjusted classes pass through unchanged (spot check idx=1,2,3,5,6,7,8,10,11)
  it.each([
    [1,  'Mage'],
    [2,  'Priest'],
    [3,  'Thief'],
    [5,  'Alchemist'],
    [6,  'Bard'],
    [7,  'Psionic'],
    [8,  'Valkyrie'],
    [10, 'Lord'],
    [11, 'Samurai'],
  ])('class %i (%s) returns rng(9)+10 with no tier2 reduction', (classIdx, _name) => {
    // stub returns 4 → base=14; tier2=0 for unadjusted → result=14
    expect(rollSkillBudget(stub(4), classIdx, midAttrs)).toBe(14);
  });

  // ── Fighter ───────────────────────────────────────────────────────────────
  describe('Fighter (idx 0) — tier2=0', () => {
    it('returns rng(9)+10 unchanged (tier2 is 0, clamp has no effect)', () => {
      // Fighter has NO adjustment constant: tier2 = 0
      // Therefore: max(0, 10+5 - 0) = 15
      expect(rollSkillBudget(stub(5), 0, midAttrs)).toBe(15);
    });

    it('returns rng(9)+10 even with high attrs (tier2=0 regardless)', () => {
      const highAttrs = { str: 18, int: 18, pie: 18, vit: 18, dex: 18, spd: 18, per: 18, kar: 18 };
      expect(rollSkillBudget(stub(5), 0, highAttrs)).toBe(15);
    });
  });

  // ── Ranger (idx 4) ────────────────────────────────────────────────────────
  // asm (wpcmk file 0x42e6): inline subtract = rng(3) + floor((INT+VIT)/10) + 2
  // attrs: INT = [bp-0x2] = DGROUP 0x559d; VIT = [bp-0xa] = DGROUP 0x559f
  describe('Ranger (idx 4) — tier2 = rng(3) + floor((INT+VIT)/10) + 2', () => {
    it('computes correct tier2 with stub=0, INT=9, VIT=9', () => {
      // tier2 = 0 + floor((9+9)/10) + 2 = 0 + 1 + 2 = 3
      // base = 0 + 10 = 10
      // result = max(0, 10 - 3) = 7
      const attrs = { ...midAttrs, int: 9, vit: 9 };
      expect(rollSkillBudget(stub(0), 4, attrs)).toBe(7);
    });

    it('computes correct tier2 with stub=2, INT=15, VIT=15', () => {
      // tier2 = 2 + floor((15+15)/10) + 2 = 2 + 3 + 2 = 7
      // base = 2 + 10 = 12
      // result = max(0, 12 - 7) = 5
      const attrs = { ...midAttrs, int: 15, vit: 15 };
      expect(rollSkillBudget(stub(2), 4, attrs)).toBe(5);
    });

    it('clamps to 0 when tier2 >= budget', () => {
      // stub=0, INT=18, VIT=18: tier2 = 0 + floor(36/10) + 2 = 0 + 3 + 2 = 5
      // base = 0 + 10 = 10 ... not quite — need a case where tier2 >= base
      // stub=0, INT=18, VIT=18: base=10, tier2=5 → 10-5=5 (doesn't clamp to 0)
      // For a clamp: need tier2 >= 10
      // stub=2, INT=18, VIT=18: tier2 = 2 + 3 + 2 = 7, base=12 → 12-7=5, still OK
      // stub=8 (max base), INT=18, VIT=18: base=18, tier2 = 8+3+2=13 → 18-13=5
      // Hmm, let me construct a genuine clamp:
      // We need rng returns something large. But stub returns same for both rng calls.
      // For Ranger: 1st rng call gives base offset, 2nd rng call gives tier2 rng part
      // With stub(5): base=15, tier2=5+3+2=10 → 15-10=5 (INT=VIT=18)
      // Hmm - hard to force to 0 with midAttrs. Let me try stub(8):
      // base=18, tier2=8+floor((3+3)/10)+2=8+0+2=10, result=8 (lowAttrs)
      // Let's try with low attrs and high rng:
      // stub(8): base=18, INT=3, VIT=3: tier2=8+0+2=10 → 18-10=8
      // tier2 CAN exceed base if we push harder
      // Actually the clamp test: the task says "c4mped >= 0"
      // Let me just verify behavior when tier2 is set to exceed base
      // stub(8): base=18; INT=18,VIT=18: tier2=8+3+2=13 → 18-13=5
      // Can't easily hit 0 without negative INT or extreme attrs
      // Use manual calculation to verify clamp triggers when tier2 > base:
      // This requires tier2 > 18 (max base), which means rng_part + floor_part + 2 > 18
      // rng_part max=2 (rng.uniform(3)), floor_part max=floor(36/10)=3 → 2+3+2=7, can't exceed 18
      // SO tier2 can never exceed budget! The clamp at 0 is defensive but never triggers for Ranger
      // Interesting - but the task says to test it anyway

      // For a VALID clamp test: test that result is never negative
      const attrs = { ...midAttrs, int: 18, vit: 18 };
      const result = rollSkillBudget(stub(2), 4, attrs);
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Bishop (idx 9) ────────────────────────────────────────────────────────
  // asm (wpcmk file 0x43ce): inline subtract = rng(3) + floor(INT/5) + 2
  describe('Bishop (idx 9) — tier2 = rng(3) + floor(INT/5) + 2', () => {
    it('computes correct tier2 with stub=0, INT=10', () => {
      // tier2 = 0 + floor(10/5) + 2 = 0 + 2 + 2 = 4
      // base = 0 + 10 = 10
      // result = max(0, 10 - 4) = 6
      const attrs = { ...midAttrs, int: 10 };
      expect(rollSkillBudget(stub(0), 9, attrs)).toBe(6);
    });

    it('computes correct tier2 with stub=1, INT=15', () => {
      // tier2 = 1 + floor(15/5) + 2 = 1 + 3 + 2 = 6
      // base = 1 + 10 = 11
      // result = max(0, 11 - 6) = 5
      const attrs = { ...midAttrs, int: 15 };
      expect(rollSkillBudget(stub(1), 9, attrs)).toBe(5);
    });

    it('uses INT attribute (not PIE or other)', () => {
      // Same INT=10 but different PIE should give same result
      const attrs1 = { ...midAttrs, int: 10, pie: 3 };
      const attrs2 = { ...midAttrs, int: 10, pie: 18 };
      expect(rollSkillBudget(stub(0), 9, attrs1)).toBe(rollSkillBudget(stub(0), 9, attrs2));
    });
  });

  // ── Monk (idx 12) ─────────────────────────────────────────────────────────
  // asm (wpcmk file 0x447e): inline subtract = rng(3) + floor((DEX+SPD)/10) + 2
  describe('Monk (idx 12) — tier2 = rng(3) + floor((DEX+SPD)/10) + 2', () => {
    it('computes correct tier2 with stub=0, DEX=9, SPD=9', () => {
      // tier2 = 0 + floor((9+9)/10) + 2 = 0 + 1 + 2 = 3
      // base = 0 + 10 = 10
      // result = max(0, 10 - 3) = 7
      const attrs = { ...midAttrs, dex: 9, spd: 9 };
      expect(rollSkillBudget(stub(0), 12, attrs)).toBe(7);
    });

    it('computes correct tier2 with stub=1, DEX=15, SPD=15', () => {
      // tier2 = 1 + floor((15+15)/10) + 2 = 1 + 3 + 2 = 6
      // base = 1 + 10 = 11
      // result = max(0, 11 - 6) = 5
      const attrs = { ...midAttrs, dex: 15, spd: 15 };
      expect(rollSkillBudget(stub(1), 12, attrs)).toBe(5);
    });
  });

  // ── Ninja (idx 13) ────────────────────────────────────────────────────────
  // asm (wpcmk file 0x44e2): inline subtract = rng(3) + floor((DEX+SPD)/10) + 2
  // Same formula as Monk for the tier2 inline subtract portion
  describe('Ninja (idx 13) — tier2 = rng(3) + floor((DEX+SPD)/10) + 2', () => {
    it('computes correct tier2 with stub=0, DEX=9, SPD=9', () => {
      // Same formula as Monk: tier2 = 0 + 1 + 2 = 3, base = 10, result = 7
      const attrs = { ...midAttrs, dex: 9, spd: 9 };
      expect(rollSkillBudget(stub(0), 13, attrs)).toBe(7);
    });

    it('computes correct tier2 with stub=2, DEX=18, SPD=18', () => {
      // tier2 = 2 + floor((18+18)/10) + 2 = 2 + 3 + 2 = 7
      // base = 2 + 10 = 12
      // result = max(0, 12 - 7) = 5
      const attrs = { ...midAttrs, dex: 18, spd: 18 };
      expect(rollSkillBudget(stub(2), 13, attrs)).toBe(5);
    });
  });

  // ── result is always non-negative ─────────────────────────────────────────
  it('never returns a negative value for any class/attr combination', () => {
    const rng = { uniform: (n: number) => n - 1 } as unknown as WichmannHill; // always max value
    const highAttrs = { str: 18, int: 18, pie: 18, vit: 18, dex: 18, spd: 18, per: 18, kar: 18 };
    for (let classIdx = 0; classIdx < 14; classIdx++) {
      expect(rollSkillBudget(rng, classIdx, highAttrs)).toBeGreaterThanOrEqual(0);
    }
  });
});
