import { describe, expect, it } from 'vitest';
import {
  PORTRAIT_PICKER_CHOICES_PER_CLASS,
  PORTRAIT_POOL_BY_CLASS,
  computePortraitIndex,
  PORTRAIT_INDEX_MIN,
  PORTRAIT_INDEX_MAX_SPD18,
} from '../../src/character-creation/portrait-pools.js';

/**
 * Tests for portrait-pools — decoded from wpcmk.ovr.
 *
 * Key findings:
 * 1. Portrait picker dispatches by CLASS (reads DGROUP 0x560f = class index).
 * 2. Each class has exactly 5 portrait reference values (all non-zero).
 * 3. Stored portraitIndex = SPD + 1 (formula at wpcmk 0x4ded, bytes a0 a1 55 fe c0 a2 1b 56).
 * 4. Cross-validated 100%: THESUS SPD=9 → portrait=10, TEMPEST SPD=7 → portrait=8, etc.
 */
describe('PORTRAIT_PICKER_CHOICES_PER_CLASS', () => {
  it('is 5 (each class has 5 portrait reference values)', () => {
    expect(PORTRAIT_PICKER_CHOICES_PER_CLASS).toBe(5);
  });
});

describe('PORTRAIT_POOL_BY_CLASS', () => {
  it('has exactly 14 class entries', () => {
    expect(PORTRAIT_POOL_BY_CLASS).toHaveLength(14);
  });

  it('each class has exactly 5 portrait reference values', () => {
    for (const pool of PORTRAIT_POOL_BY_CLASS) {
      expect(pool).toHaveLength(5);
    }
  });

  it('all portrait reference values are positive (no empty slots)', () => {
    for (const pool of PORTRAIT_POOL_BY_CLASS) {
      for (const ref of pool) {
        expect(ref).toBeGreaterThan(0);
      }
    }
  });

  it('Fighter (class 0) has correct portrait refs', () => {
    expect(PORTRAIT_POOL_BY_CLASS[0]).toEqual([141, 130, 132, 135, 8]);
  });

  it('Mage (class 1) has correct portrait refs', () => {
    expect(PORTRAIT_POOL_BY_CLASS[1]).toEqual([335, 130, 123, 122, 18]);
  });

  it('Ninja (class 13) has correct portrait refs', () => {
    expect(PORTRAIT_POOL_BY_CLASS[13]).toEqual([161, 159, 158, 160, 47]);
  });
});

describe('computePortraitIndex', () => {
  it('returns SPD + 1 (formula: portraitIndex = spd + 1)', () => {
    expect(computePortraitIndex(0)).toBe(1);
    expect(computePortraitIndex(5)).toBe(6);
    expect(computePortraitIndex(18)).toBe(19);
  });

  /**
   * Cross-validate against all 6 stock characters from pcfile.dbs.
   * All 6 match the SPD+1 formula exactly.
   * Bytes at wpcmk 0x4ded: a0 a1 55 fe c0 a2 1b 56
   */
  it.each([
    ['THESUS',  9,  10],
    ['TEMPEST', 7,   8],
    ['LYSANDR', 12, 13],
    ['NOBAL',   9,  10],
    ['TREON',   8,   9],
    ['PENTAG',  6,   7],
  ])('stock char %s: SPD=%i → portraitIndex=%i', (_name, spd, expected) => {
    expect(computePortraitIndex(spd)).toBe(expected);
  });
});

describe('PORTRAIT_INDEX_MIN / PORTRAIT_INDEX_MAX_SPD18', () => {
  it('PORTRAIT_INDEX_MIN is 1 (SPD=0 → portraitIndex=1)', () => {
    expect(PORTRAIT_INDEX_MIN).toBe(1);
    expect(computePortraitIndex(0)).toBe(PORTRAIT_INDEX_MIN);
  });

  it('PORTRAIT_INDEX_MAX_SPD18 is 19 (SPD=18 → portraitIndex=19)', () => {
    expect(PORTRAIT_INDEX_MAX_SPD18).toBe(19);
    expect(computePortraitIndex(18)).toBe(PORTRAIT_INDEX_MAX_SPD18);
  });
});
