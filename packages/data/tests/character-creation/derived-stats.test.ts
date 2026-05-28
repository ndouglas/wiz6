import { describe, expect, it } from 'vitest';
import {
  computeDerivedStats,
  CLASS_ENCUMBRANCE_FORMULAS,
  type DerivedStats,
} from '../../src/character-creation/derived-stats.js';

// ---------------------------------------------------------------------------
// Deterministic RNG stub: always returns the same value for uniform(n).
// ---------------------------------------------------------------------------
function makeFixedRng(fixedValue: number) {
  return { uniform: (_n: number) => fixedValue };
}

// ---------------------------------------------------------------------------
// Attribute sets used across tests
// ---------------------------------------------------------------------------

/** Stats that produce predictable values without any bonus thresholds. */
const PLAIN_ATTRS = {
  str: 10, int: 10, pie: 10, vit: 10, dex: 10, spd: 10, per: 10, kar: 0,
};

/** High-VIT attrs that trigger both VIT bonus thresholds (16, 18). */
const HIGH_VIT_ATTRS = {
  str: 10, int: 10, pie: 10, vit: 18, dex: 10, spd: 10, per: 10, kar: 0,
};

/** Low-VIT attrs that trigger the encumbrance penalty (VIT < 8). */
const LOW_VIT_ATTRS = {
  str: 10, int: 10, pie: 10, vit: 6, dex: 10, spd: 10, per: 10, kar: 0,
};

// ---------------------------------------------------------------------------
// age
// ---------------------------------------------------------------------------

describe('age formula', () => {
  it('age = rng(1000) + 6570 when rng returns 0', () => {
    // rng.uniform(1000) = 0 → age = 6570
    const rng = makeFixedRng(0);
    const result = computeDerivedStats(rng, 0, 0, PLAIN_ATTRS);
    expect(result.age).toBe(6570);
  });

  it('age = rng(1000) + 6570 when rng returns 999', () => {
    // rng.uniform(1000) = 999 → age = 7569
    const rng = makeFixedRng(999);
    const result = computeDerivedStats(rng, 0, 0, PLAIN_ATTRS);
    expect(result.age).toBe(7569);
  });

  it('age for stock chars is in expected range 6570..7569', () => {
    // Verified against all 6 stock pcfile.dbs entries:
    // THESUS=6590, TEMPEST=7405, LYSANDR=7265, NOBAL=7057, TREON=6603, PENTAG=6698
    const stockAges = [6590, 7405, 7265, 7057, 6603, 6698];
    for (const age of stockAges) {
      expect(age).toBeGreaterThanOrEqual(6570);
      expect(age).toBeLessThanOrEqual(7569);
    }
  });
});

// ---------------------------------------------------------------------------
// level and xp
// ---------------------------------------------------------------------------

describe('level and xp at creation', () => {
  it('level is always 1 at creation', () => {
    const rng = makeFixedRng(0);
    const result = computeDerivedStats(rng, 0, 0, PLAIN_ATTRS);
    expect(result.level).toBe(1);
  });

  it('xp is always 0 at creation', () => {
    // Verified vs DOSBox save 2: *0x547c 32-bit = 0. (Earlier impl returned 1
    // based on a misread of `ui_redraw_character_sheet`; the engine memory is 0.)
    const rng = makeFixedRng(0);
    const result = computeDerivedStats(rng, 0, 0, PLAIN_ATTRS);
    expect(result.xp).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// stamina (was misnamed hpInitial in Stage A)
// Formula: (VIT*2+STR)*3 + VIT bonuses [wpcmk 0x47DF..0x4828]
// Written to pcfile+0x1c / pcfile+0x1e (sp_cur / sp_max in pcfile schema)
// ---------------------------------------------------------------------------

describe('stamina formula (VIT*2+STR)*3 + VIT bonuses', () => {
  it('plain attrs: stamina = (VIT*2+STR)*3 = (20+10)*3 = 90', () => {
    const rng = makeFixedRng(0);
    const result = computeDerivedStats(rng, 0, 0, PLAIN_ATTRS);
    // (10*2 + 10) * 3 = 30*3 = 90
    expect(result.stamina).toBe(90);
  });

  it('high-VIT attrs (VIT=18): stamina adds VIT twice', () => {
    const rng = makeFixedRng(0);
    const result = computeDerivedStats(rng, 0, 0, HIGH_VIT_ATTRS);
    // base = (18*2+10)*3 = 46*3 = 138
    // VIT>=16 bonus: +18 → 156
    // VIT>=18 bonus: +18 → 174
    expect(result.stamina).toBe(174);
  });

  it('NUG (Ninja, STR=12, VIT=12, class=13): stamina = 108', () => {
    // Ground truth: NUG on-screen STM 108/108 (DOSBox screenshot + wpcmk save)
    // (12*2+12)*3 = 36*3 = 108. VIT=12 < 16, no bonus.
    const rng = makeFixedRng(0);
    const attrs = { str: 12, int: 10, pie: 10, vit: 12, dex: 12, spd: 12, per: 8, kar: 13 };
    const result = computeDerivedStats(rng, 13, 1, attrs); // class=13 Ninja, race=1 Elf
    expect(result.stamina).toBe(108);
  });

  it('matches stock THESUS (STR=18, VIT=12): expected 126', () => {
    // (12*2+18)*3 = 42*3 = 126  (no VIT thresholds since VIT=12<16)
    // Verified: pcfile sp_cur=126, sp_max=126 for THESUS
    const rng = makeFixedRng(0);
    const attrs = { str: 18, int: 8, pie: 8, vit: 12, dex: 10, spd: 9, per: 10, kar: 0 };
    const result = computeDerivedStats(rng, 0, 0, attrs);
    expect(result.stamina).toBe(126);
  });

  it('matches stock TEMPEST (STR=13, VIT=14): expected 123', () => {
    // (14*2+13)*3 = 41*3 = 123  (VIT=14<16, no bonus)
    // Verified: pcfile sp_cur=123
    const rng = makeFixedRng(0);
    const attrs = { str: 13, int: 10, pie: 6, vit: 14, dex: 7, spd: 7, per: 10, kar: 0 };
    const result = computeDerivedStats(rng, 0, 0, attrs);
    expect(result.stamina).toBe(123);
  });

  it('matches stock LYSANDR (STR=7, VIT=11): expected 87', () => {
    // (11*2+7)*3 = 29*3 = 87  (VIT=11<16, no bonus)
    const rng = makeFixedRng(0);
    const attrs = { str: 7, int: 10, pie: 7, vit: 11, dex: 14, spd: 12, per: 10, kar: 0 };
    const result = computeDerivedStats(rng, 3, 0, attrs); // class=3 Thief
    expect(result.stamina).toBe(87);
  });

  it('matches stock NOBAL (STR=7, VIT=9): expected 75', () => {
    // (9*2+7)*3 = 25*3 = 75
    const rng = makeFixedRng(0);
    const attrs = { str: 7, int: 10, pie: 13, vit: 9, dex: 9, spd: 9, per: 10, kar: 0 };
    const result = computeDerivedStats(rng, 2, 0, attrs); // class=2 Priest
    expect(result.stamina).toBe(75);
  });

  it('matches stock TREON (STR=10, VIT=12): expected 102', () => {
    // (12*2+10)*3 = 34*3 = 102
    const rng = makeFixedRng(0);
    const attrs = { str: 10, int: 12, pie: 6, vit: 12, dex: 10, spd: 8, per: 10, kar: 0 };
    const result = computeDerivedStats(rng, 1, 0, attrs); // class=1 Mage
    expect(result.stamina).toBe(102);
  });

  it('matches stock PENTAG (STR=10, VIT=10): expected 90', () => {
    // (10*2+10)*3 = 30*3 = 90
    const rng = makeFixedRng(0);
    const attrs = { str: 10, int: 12, pie: 13, vit: 10, dex: 8, spd: 6, per: 10, kar: 0 };
    const result = computeDerivedStats(rng, 1, 0, attrs); // class=1 Mage
    expect(result.stamina).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// hpInitial (the real HP, separate from stamina)
// Formula: class-dispatch roll — same formula as encumbranceBase
// [wpcmk 0x45C4..0x47B4 class handlers → [bp-0x2] → written to staging+0x18/+0x1a]
// Written to pcfile+0x18 / pcfile+0x1a (hp_cur / hp_max in pcfile schema)
//
// This is a RANGE-producing formula (involves rng), so ground-truth tests
// check that observed values fall within the valid class-range.
// ---------------------------------------------------------------------------

describe('hpInitial formula (class-dispatch, same as encumbranceBase)', () => {
  it('hpInitial equals encumbranceMin at creation (they share the same roll)', () => {
    // The engine writes encumbranceBase to both pcfile+0x18 (hp) and +0x18 (encumbranceMin).
    // Both fields get the same class-dispatch roll value.
    const rng = makeFixedRng(3);
    const result = computeDerivedStats(rng, 0, 0, PLAIN_ATTRS);
    expect(result.hpInitial).toBe(result.encumbranceMin);
  });

  it('NUG (Ninja class=13, rng(5)+4): hpInitial=6 falls in valid range [4..8]', () => {
    // Ground truth: NUG on-screen HP 6/6 (DOSBox screenshot + wpcmk save)
    // Ninja formula: rng(5)+4 = [4..8]. HP=6 is in range.
    // No VIT adjustment (VIT=12, neither <8 nor >=16).
    const attrs = { str: 12, int: 10, pie: 10, vit: 12, dex: 12, spd: 12, per: 8, kar: 13 };
    // Verify range: rng returns 0..4
    for (let roll = 0; roll <= 4; roll++) {
      const rng = makeFixedRng(roll);
      const result = computeDerivedStats(rng, 13, 1, attrs);
      expect(result.hpInitial).toBeGreaterThanOrEqual(4);
      expect(result.hpInitial).toBeLessThanOrEqual(8);
    }
    // NUG's actual HP=6 corresponds to roll=2: rng(5)=2 → 2+4=6
    const rngRoll2 = makeFixedRng(2);
    const nugResult = computeDerivedStats(rngRoll2, 13, 1, attrs);
    expect(nugResult.hpInitial).toBe(6);
  });

  it('Fighter (class=0, rng(5)+6): THESUS hp=8 falls in range [6..10]', () => {
    // Verified: pcfile hp_cur=8, hp_max=8 for THESUS
    const attrs = { str: 18, int: 8, pie: 8, vit: 12, dex: 10, spd: 9, per: 10, kar: 0 };
    // rng=2 → rng(5)=2 → 2+6=8
    const rng = makeFixedRng(2);
    const result = computeDerivedStats(rng, 0, 0, attrs);
    expect(result.hpInitial).toBe(8);
  });

  it('Fighter (class=0, rng(5)+6): TEMPEST hp=9 falls in range [6..10]', () => {
    // Verified: pcfile hp_cur=9, hp_max=9 for TEMPEST
    const attrs = { str: 13, int: 10, pie: 6, vit: 14, dex: 7, spd: 7, per: 10, kar: 0 };
    // rng=3 → rng(5)=3 → 3+6=9
    const rng = makeFixedRng(3);
    const result = computeDerivedStats(rng, 0, 0, attrs);
    expect(result.hpInitial).toBe(9);
  });

  it('Thief (class=3, rng(4)+3): LYSANDR hp=5 falls in range [3..6]', () => {
    // Verified: pcfile hp_cur=5, hp_max=5 for LYSANDR
    const attrs = { str: 7, int: 10, pie: 7, vit: 11, dex: 14, spd: 12, per: 10, kar: 0 };
    // rng=2 → rng(4)=2 → 2+3=5
    const rng = makeFixedRng(2);
    const result = computeDerivedStats(rng, 3, 0, attrs);
    expect(result.hpInitial).toBe(5);
  });

  it('Priest (class=2, rng(4)+4): NOBAL hp=4 falls in range [4..7]', () => {
    // Verified: pcfile hp_cur=4, hp_max=4 for NOBAL
    const attrs = { str: 7, int: 10, pie: 13, vit: 9, dex: 9, spd: 9, per: 10, kar: 0 };
    // rng=0 → rng(4)=0 → 0+4=4
    const rng = makeFixedRng(0);
    const result = computeDerivedStats(rng, 2, 0, attrs);
    expect(result.hpInitial).toBe(4);
  });

  it('Mage (class=1, rng(3)+2): TREON hp=4 falls in range [2..4]', () => {
    // Verified: pcfile hp_cur=4, hp_max=4 for TREON
    const attrs = { str: 10, int: 12, pie: 6, vit: 12, dex: 10, spd: 8, per: 10, kar: 0 };
    // rng=2 → rng(3)=2 → 2+2=4
    const rng = makeFixedRng(2);
    const result = computeDerivedStats(rng, 1, 0, attrs);
    expect(result.hpInitial).toBe(4);
  });

  it('Mage (class=1, rng(3)+2): PENTAG hp=2 falls in range [2..4]', () => {
    // Verified: pcfile hp_cur=2, hp_max=2 for PENTAG
    const attrs = { str: 10, int: 12, pie: 13, vit: 10, dex: 8, spd: 6, per: 10, kar: 0 };
    // rng=0 → rng(3)=0 → 0+2=2
    const rng = makeFixedRng(0);
    const result = computeDerivedStats(rng, 1, 0, attrs);
    expect(result.hpInitial).toBe(2);
  });

  it('VIT < 8 decrements hpInitial by 1 (same VIT adj as encumbranceBase)', () => {
    // [wpcmk 0x4801..0x4807]: if VIT < 8: dec [bp-0x2]
    // Both encumbranceBase and hpInitial share [bp-0x2], so adjustment is same.
    const rng = makeFixedRng(0);
    const plain = computeDerivedStats(rng, 0, 0, PLAIN_ATTRS);    // VIT=10
    const lowVit = computeDerivedStats(makeFixedRng(0), 0, 0, LOW_VIT_ATTRS); // VIT=6
    expect(lowVit.hpInitial).toBe(plain.hpInitial - 1);
  });

  it('VIT >= 16 increments hpInitial by 1', () => {
    const vit16 = { ...PLAIN_ATTRS, vit: 16 };
    const plain = computeDerivedStats(makeFixedRng(0), 0, 0, PLAIN_ATTRS);
    const high  = computeDerivedStats(makeFixedRng(0), 0, 0, vit16);
    expect(high.hpInitial).toBe(plain.hpInitial + 1);
  });

  it('VIT >= 18 increments hpInitial by an additional 1', () => {
    const vit18 = { ...PLAIN_ATTRS, vit: 18 };
    const plain = computeDerivedStats(makeFixedRng(0), 0, 0, PLAIN_ATTRS);
    const high  = computeDerivedStats(makeFixedRng(0), 0, 0, vit18);
    expect(high.hpInitial).toBe(plain.hpInitial + 2);
  });
});

// ---------------------------------------------------------------------------
// encumbranceMin / encumbranceMax
// ---------------------------------------------------------------------------

describe('encumbranceMin/Max (class-based + VIT adjustments)', () => {
  it('encumbranceMin equals encumbranceMax at creation', () => {
    const rng = makeFixedRng(0);
    const result = computeDerivedStats(rng, 0, 0, PLAIN_ATTRS);
    expect(result.encumbranceMin).toBe(result.encumbranceMax);
  });

  it('VIT < 8 decrements encumbrance by 1', () => {
    // class 0 (Fighter): rng(5)+6; with rng=0: base = 6. VIT=6 < 8: -1 = 5
    const rng = makeFixedRng(0);
    const plain = computeDerivedStats(rng, 0, 0, PLAIN_ATTRS);   // VIT=10
    const lowVit = computeDerivedStats(makeFixedRng(0), 0, 0, LOW_VIT_ATTRS);  // VIT=6
    expect(lowVit.encumbranceMin).toBe(plain.encumbranceMin - 1);
  });

  it('VIT >= 16 increments encumbrance by 1', () => {
    const vit16 = { ...PLAIN_ATTRS, vit: 16 };
    const plain = computeDerivedStats(makeFixedRng(0), 0, 0, PLAIN_ATTRS);
    const high  = computeDerivedStats(makeFixedRng(0), 0, 0, vit16);
    expect(high.encumbranceMin).toBe(plain.encumbranceMin + 1);
  });

  it('VIT >= 18 increments encumbrance by an additional 1', () => {
    const vit18 = { ...PLAIN_ATTRS, vit: 18 };
    const plain = computeDerivedStats(makeFixedRng(0), 0, 0, PLAIN_ATTRS);
    const high  = computeDerivedStats(makeFixedRng(0), 0, 0, vit18);
    expect(high.encumbranceMin).toBe(plain.encumbranceMin + 2);
  });

  it('CLASS_ENCUMBRANCE_FORMULAS has 14 entries (one per class)', () => {
    expect(CLASS_ENCUMBRANCE_FORMULAS).toHaveLength(14);
  });

  it('Fighter (class 0) base: rng(5)+6, so min=6 with rng=0', () => {
    const rng = makeFixedRng(0);
    const result = computeDerivedStats(rng, 0, 0, PLAIN_ATTRS);
    // rng(5)=0 → base=6; VIT=10, no threshold → encumbrance=6
    expect(result.encumbranceMin).toBe(6);
  });

  it('encumbranceMin equals hpInitial (same class-dispatch roll written to both fields)', () => {
    const rng = makeFixedRng(3);
    const result = computeDerivedStats(rng, 0, 0, PLAIN_ATTRS);
    expect(result.encumbranceMin).toBe(result.hpInitial);
  });
});

// ---------------------------------------------------------------------------
// weightMin / weightMax (alias for stamina — same value as stamina at creation)
// ---------------------------------------------------------------------------

describe('weightMin/Max = stamina (same (VIT*2+STR)*3+bonus value)', () => {
  it('weightMin equals weightMax at creation', () => {
    const rng = makeFixedRng(0);
    const result = computeDerivedStats(rng, 0, 0, PLAIN_ATTRS);
    expect(result.weightMin).toBe(result.weightMax);
  });

  it('weightMin equals stamina', () => {
    // The engine stores the same (VIT*2+STR)*3+bonus value as both
    // the weight capacity AND stamina at creation.
    const rng = makeFixedRng(0);
    const result = computeDerivedStats(rng, 0, 0, PLAIN_ATTRS);
    expect(result.weightMin).toBe(result.stamina);
  });
});

// ---------------------------------------------------------------------------
// goldInitial  (the Faerie-multiplier field at staging+0x022)
// ---------------------------------------------------------------------------

describe('goldInitial = (STR*2+VIT)*3 * 15, ÷3 for Faerie', () => {
  it('non-Faerie: goldInitial = (STR*2+VIT)*3 * 15', () => {
    const rng = makeFixedRng(0);
    // PLAIN_ATTRS: STR=10, VIT=10
    // base = (20+10)*3 = 90; 90*15 = 1350
    const result = computeDerivedStats(rng, 0, 0, PLAIN_ATTRS);
    expect(result.goldInitial).toBe(1350);
  });

  it('matches stock THESUS (STR=18, VIT=12, race=0): expected 2700', () => {
    const rng = makeFixedRng(0);
    const attrs = { str: 18, int: 8, pie: 8, vit: 12, dex: 10, spd: 9, per: 10, kar: 0 };
    // base = (36+12)*3 = 144; STR>=16: +18→162; STR>=18: +18→180; 180*15=2700
    const result = computeDerivedStats(rng, 0, 0, attrs);
    expect(result.goldInitial).toBe(2700);
  });

  it('matches stock TEMPEST (STR=13, VIT=14, race=0): expected 1800', () => {
    const rng = makeFixedRng(0);
    const attrs = { str: 13, int: 10, pie: 6, vit: 14, dex: 7, spd: 7, per: 10, kar: 0 };
    // base = (26+14)*3 = 120; STR<16: no bonus; 120*15=1800
    const result = computeDerivedStats(rng, 0, 0, attrs);
    expect(result.goldInitial).toBe(1800);
  });

  it('matches stock LYSANDR (STR=7, VIT=11, race=0): expected 1125', () => {
    const rng = makeFixedRng(0);
    const attrs = { str: 7, int: 10, pie: 7, vit: 11, dex: 14, spd: 12, per: 10, kar: 0 };
    // base = (14+11)*3 = 75; 75*15=1125
    const result = computeDerivedStats(rng, 3, 0, attrs);
    expect(result.goldInitial).toBe(1125);
  });

  it('Faerie (raceIdx=5): goldInitial = (STR*2+VIT)*3 * 15 / 3 = base * 5', () => {
    const rng = makeFixedRng(0);
    const nonFaerie = computeDerivedStats(rng, 0, 0, PLAIN_ATTRS);
    const faerie    = computeDerivedStats(makeFixedRng(0), 0, 5, PLAIN_ATTRS);
    // Faerie: 1350/3=450 (i.e. base*5 instead of base*15)
    expect(faerie.goldInitial).toBe(450);
    expect(faerie.goldInitial).toBe(Math.floor(nonFaerie.goldInitial / 3));
  });
});

// ---------------------------------------------------------------------------
// Return type shape
// ---------------------------------------------------------------------------

describe('DerivedStats return shape', () => {
  it('result has all expected fields', () => {
    const rng = makeFixedRng(0);
    const result = computeDerivedStats(rng, 0, 0, PLAIN_ATTRS);
    const expected: (keyof DerivedStats)[] = [
      'age', 'encumbranceMin', 'encumbranceMax',
      'weightMin', 'weightMax', 'stamina', 'hpInitial',
      'goldInitial', 'level', 'xp',
    ];
    for (const key of expected) {
      expect(result).toHaveProperty(key);
    }
  });
});
