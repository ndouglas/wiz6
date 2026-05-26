import { describe, expect, it } from 'vitest';
import { WichmannHill } from '../../src/rng/wichmann-hill.js';
import { rollBonus } from '../../src/character-creation/bonus-roll.js';

describe('rollBonus', () => {
  it('produces values only in 5..10, 13..18, or 21..26 (gaps at 11,12,19,20)', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    const seen = new Set<number>();
    for (let i = 0; i < 200_000; i++) seen.add(rollBonus(rng));
    for (const gap of [11, 12, 19, 20]) expect(seen.has(gap)).toBe(false);
    for (const v of seen) expect(v).toBeGreaterThanOrEqual(5);
    for (const v of seen) expect(v).toBeLessThanOrEqual(26);
  });

  it('matches the theoretical distribution within tolerance', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    const N = 1_000_000;
    let noBonus = 0, oneBonus = 0, twoBonus = 0;
    for (let i = 0; i < N; i++) {
      const v = rollBonus(rng);
      if (v <= 10) noBonus++; else if (v <= 18) oneBonus++; else twoBonus++;
    }
    expect(noBonus / N).toBeCloseTo(0.9025, 2);
    expect(oneBonus / N).toBeCloseTo(0.0950, 2);
    expect(twoBonus / N).toBeCloseTo(0.0025, 2);
  });
});
