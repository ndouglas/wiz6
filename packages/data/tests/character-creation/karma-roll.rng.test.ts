import { describe, expect, it } from 'vitest';
import { WichmannHill } from '../../src/rng/wichmann-hill.js';
import {
  rollKarmaWith,
  KARMA_MIN,
  KARMA_MAX,
  KARMA_MAX_FEMALE,
} from '../../src/character-creation/karma-roll.js';

/**
 * Tests for rollKarmaWith — the WichmannHill RNG adapter over the karma roll formula.
 *
 * rollKarmaWith(rng, isFemale) should:
 *   - Call rng.uniform(19) to get 0..18
 *   - Add 1 if isFemale is true (range becomes 1..19)
 *   - Deterministically match expected sequences for a given seed
 */
describe('rollKarmaWith', () => {
  it('returns 0..18 when isFemale is false', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    for (let i = 0; i < 1000; i++) {
      const karma = rollKarmaWith(rng, false);
      expect(karma).toBeGreaterThanOrEqual(KARMA_MIN);
      expect(karma).toBeLessThanOrEqual(KARMA_MAX);
    }
  });

  it('returns 1..19 when isFemale is true', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    for (let i = 0; i < 1000; i++) {
      const karma = rollKarmaWith(rng, true);
      expect(karma).toBeGreaterThanOrEqual(1);
      expect(karma).toBeLessThanOrEqual(KARMA_MAX_FEMALE);
    }
  });

  it('defaults to isFemale=false', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    const withFalse = rollKarmaWith(rng.clone(), false);
    const withDefault = rollKarmaWith(rng);
    expect(withDefault).toBe(withFalse);
  });

  it('produces deterministic sequences from the same seed', () => {
    const rng1 = new WichmannHill(3000, 1, 29999);
    const rng2 = new WichmannHill(3000, 1, 29999);

    const seq1: number[] = [];
    const seq2: number[] = [];

    for (let i = 0; i < 100; i++) {
      seq1.push(rollKarmaWith(rng1, false));
      seq2.push(rollKarmaWith(rng2, false));
    }

    expect(seq1).toEqual(seq2);
  });

  it('produces deterministic sequences with isFemale=true', () => {
    const rng1 = new WichmannHill(3000, 1, 29999);
    const rng2 = new WichmannHill(3000, 1, 29999);

    const seq1: number[] = [];
    const seq2: number[] = [];

    for (let i = 0; i < 100; i++) {
      seq1.push(rollKarmaWith(rng1, true));
      seq2.push(rollKarmaWith(rng2, true));
    }

    expect(seq1).toEqual(seq2);
  });

  it('advances RNG state independently on each call', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    const k1 = rollKarmaWith(rng, false);
    const k2 = rollKarmaWith(rng, false);
    const k3 = rollKarmaWith(rng, false);

    // With a real RNG, three different calls should (almost certainly) yield
    // different values — not strictly guaranteed, but extremely likely with
    // a 19-element uniform range.
    const allDifferent =
      (k1 !== k2) || (k2 !== k3) || (k1 !== k3);
    expect(allDifferent).toBe(true);
  });
});
