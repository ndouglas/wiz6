import { describe, expect, it } from 'vitest';
import {
  KARMA_ROLL,
  rollKarma,
  KARMA_MIN,
  KARMA_MAX,
  KARMA_MAX_FEMALE,
} from '../../src/character-creation/karma-roll.js';

/**
 * Tests for the karma-roll formula decoded from wpcmk.ovr file offset 0x3837.
 *
 * Engine formula:
 *   karma = rng(19)          → uniform 0..18
 *   if [DGROUP 0x560e] == 1: → sex byte == female
 *     karma += 1             → +1 for female characters only
 *
 * Verified bytes (wpcmk 0x3837..0x384a):
 *   b8 13 00 50 e8 f3 8b 59 a2 a3 55 80 3e 0e 56 01 75 04 fe 06 a3 55
 *
 * Cross-validated against stock characters in pcfile.dbs:
 *   THESUS=14, TEMPEST=16, LYSANDR=15, NOBAL=4, TREON=3, PENTAG=9
 *   All in 0..19 ✓
 */
describe('KARMA_ROLL constants', () => {
  it('base_range is 19 (rng(19) yields 0..18)', () => {
    expect(KARMA_ROLL.base_range).toBe(19);
  });

  it('female_bonus is 1 (inc byte [0x55a3] when [0x560e] == 1)', () => {
    expect(KARMA_ROLL.female_bonus).toBe(1);
  });
});

describe('KARMA_MIN / KARMA_MAX / KARMA_MAX_FEMALE', () => {
  it('KARMA_MIN is 0', () => {
    expect(KARMA_MIN).toBe(0);
  });

  it('KARMA_MAX is 18 (rng(19) max = base_range - 1)', () => {
    expect(KARMA_MAX).toBe(18);
  });

  it('KARMA_MAX_FEMALE is 19 (18 + female_bonus)', () => {
    expect(KARMA_MAX_FEMALE).toBe(19);
  });
});

describe('rollKarma', () => {
  it('returns 0 when rng01 returns 0 and male', () => {
    expect(rollKarma(() => 0, false)).toBe(0);
  });

  it('returns 18 when rng01 returns just below 1 and male', () => {
    // Math.floor(0.9999 * 19) = Math.floor(18.9981) = 18
    expect(rollKarma(() => 0.9999, false)).toBe(18);
  });

  it('returns 1 when rng01 returns 0 and female', () => {
    expect(rollKarma(() => 0, true)).toBe(1);
  });

  it('returns 19 when rng01 returns just below 1 and female', () => {
    expect(rollKarma(() => 0.9999, true)).toBe(19);
  });

  it('never exceeds 19 over many rolls (female path)', () => {
    for (let i = 0; i < 10000; i++) {
      const k = rollKarma(Math.random, true);
      expect(k).toBeGreaterThanOrEqual(1);
      expect(k).toBeLessThanOrEqual(19);
    }
  });

  it('never exceeds 18 for males over many rolls', () => {
    for (let i = 0; i < 10000; i++) {
      const k = rollKarma(Math.random, false);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThanOrEqual(18);
    }
  });

  it('defaults isFemale to false', () => {
    // Deterministic: seeded rng returning 0 → karma = 0 (not 1)
    expect(rollKarma(() => 0)).toBe(0);
  });

  /**
   * Cross-validate against stock characters from pcfile.dbs.
   * All stock karma values are in the reachable range 0..19.
   */
  it.each([
    ['THESUS',  14],
    ['TEMPEST', 16],
    ['LYSANDR', 15],
    ['NOBAL',    4],
    ['TREON',    3],
    ['PENTAG',   9],
  ])('stock character %s karma=%i is in reachable range', (_name, karma) => {
    expect(karma).toBeGreaterThanOrEqual(KARMA_MIN);
    expect(karma).toBeLessThanOrEqual(KARMA_MAX_FEMALE);
  });
});
