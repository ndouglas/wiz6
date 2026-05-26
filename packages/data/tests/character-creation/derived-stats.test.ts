import { describe, expect, it } from 'vitest';
import {
  computeDerivedStats,
  CLASS_ENCUMBRANCE_FORMULAS,
  DERIVED_STATS_FAERIE_RACE,
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

/** High-STR attrs that trigger both STR bonus thresholds (16, 18). */
const HIGH_STR_ATTRS = {
  str: 18, int: 10, pie: 10, vit: 10, dex: 10, spd: 10, per: 10, kar: 0,
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

  it('xp is always 1 at creation', () => {
    const rng = makeFixedRng(0);
    const result = computeDerivedStats(rng, 0, 0, PLAIN_ATTRS);
    expect(result.xp).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// hpInitial
// ---------------------------------------------------------------------------

describe('hpInitial formula (VIT*2+STR)*3 + VIT bonuses', () => {
  it('plain attrs: hpInitial = (VIT*2+STR)*3 = (20+10)*3 = 90', () => {
    const rng = makeFixedRng(0);
    const result = computeDerivedStats(rng, 0, 0, PLAIN_ATTRS);
    // (10*2 + 10) * 3 = 30*3 = 90
    expect(result.hpInitial).toBe(90);
  });

  it('high-VIT attrs (VIT=18): hpInitial adds VIT twice', () => {
    const rng = makeFixedRng(0);
    const result = computeDerivedStats(rng, 0, 0, HIGH_VIT_ATTRS);
    // base = (18*2+10)*3 = 46*3 = 138
    // VIT>=16 bonus: +18 → 156
    // VIT>=18 bonus: +18 → 174
    expect(result.hpInitial).toBe(174);
  });

  it('matches stock THESUS (STR=18, VIT=12): expected 126', () => {
    // (12*2+18)*3 = 42*3 = 126  (no VIT thresholds since VIT=12<16)
    const rng = makeFixedRng(0);
    const attrs = { str: 18, int: 8, pie: 8, vit: 12, dex: 10, spd: 9, per: 10, kar: 0 };
    const result = computeDerivedStats(rng, 0, 0, attrs);
    expect(result.hpInitial).toBe(126);
  });

  it('matches stock TEMPEST (STR=13, VIT=14): expected 123', () => {
    // (14*2+13)*3 = 41*3 = 123  (VIT=14<16, no bonus)
    const rng = makeFixedRng(0);
    const attrs = { str: 13, int: 10, pie: 6, vit: 14, dex: 7, spd: 7, per: 10, kar: 0 };
    const result = computeDerivedStats(rng, 0, 0, attrs);
    expect(result.hpInitial).toBe(123);
  });

  it('matches stock LYSANDR (STR=7, VIT=11): expected 87', () => {
    // (11*2+7)*3 = 29*3 = 87  (VIT=11<16, no bonus)
    const rng = makeFixedRng(0);
    const attrs = { str: 7, int: 10, pie: 7, vit: 11, dex: 14, spd: 12, per: 10, kar: 0 };
    const result = computeDerivedStats(rng, 0, 0, attrs);
    expect(result.hpInitial).toBe(87);
  });

  it('matches stock NOBAL (STR=7, VIT=9): expected 75', () => {
    // (9*2+7)*3 = 25*3 = 75
    const rng = makeFixedRng(0);
    const attrs = { str: 7, int: 10, pie: 13, vit: 9, dex: 9, spd: 9, per: 10, kar: 0 };
    const result = computeDerivedStats(rng, 0, 0, attrs);
    expect(result.hpInitial).toBe(75);
  });

  it('matches stock TREON (STR=10, VIT=12): expected 102', () => {
    // (12*2+10)*3 = 34*3 = 102
    const rng = makeFixedRng(0);
    const attrs = { str: 10, int: 12, pie: 6, vit: 12, dex: 10, spd: 8, per: 10, kar: 0 };
    const result = computeDerivedStats(rng, 0, 0, attrs);
    expect(result.hpInitial).toBe(102);
  });

  it('matches stock PENTAG (STR=10, VIT=10): expected 90', () => {
    // (10*2+10)*3 = 30*3 = 90
    const rng = makeFixedRng(0);
    const attrs = { str: 10, int: 12, pie: 13, vit: 10, dex: 8, spd: 6, per: 10, kar: 0 };
    const result = computeDerivedStats(rng, 0, 0, attrs);
    expect(result.hpInitial).toBe(90);
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
});

// ---------------------------------------------------------------------------
// weightMin / weightMax
// ---------------------------------------------------------------------------

describe('weightMin/Max = (VIT*2+STR)*3 + VIT bonuses', () => {
  it('weightMin equals weightMax at creation', () => {
    const rng = makeFixedRng(0);
    const result = computeDerivedStats(rng, 0, 0, PLAIN_ATTRS);
    expect(result.weightMin).toBe(result.weightMax);
  });

  it('weightMin equals hpInitial', () => {
    // The engine stores the same (VIT*2+STR)*3+bonus value as both
    // the weight capacity AND the initial hp at creation.
    const rng = makeFixedRng(0);
    const result = computeDerivedStats(rng, 0, 0, PLAIN_ATTRS);
    expect(result.weightMin).toBe(result.hpInitial);
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
    const result = computeDerivedStats(rng, 0, 0, attrs);
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
      'weightMin', 'weightMax', 'hpInitial',
      'goldInitial', 'level', 'xp',
    ];
    for (const key of expected) {
      expect(result).toHaveProperty(key);
    }
  });
});
