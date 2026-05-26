import { describe, expect, it } from 'vitest';
import {
  CLASS_REQUIREMENTS,
  getClassRequirements,
  meetsClassRequirements,
  eligibleClasses,
  type AttributeSet,
} from '../../src/character-creation/class-requirements.js';

describe('CLASS_REQUIREMENTS', () => {
  it('has exactly 14 classes', () => {
    expect(CLASS_REQUIREMENTS).toHaveLength(14);
  });

  it('indices are sequential 0..13', () => {
    for (let i = 0; i < 14; i++) {
      expect(CLASS_REQUIREMENTS[i]!.index).toBe(i);
    }
  });

  it('no class has a KAR minimum (karma is rolled per-character, not gating)', () => {
    for (const c of CLASS_REQUIREMENTS) {
      expect(c.kar).toBe(0);
    }
  });

  it('all attribute mins are in 0..18 range', () => {
    for (const c of CLASS_REQUIREMENTS) {
      for (const v of [c.str, c.int, c.pie, c.vit, c.dex, c.spd, c.per]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(18);
      }
    }
  });

  it('Fighter (0) has STR>=12 as its only gate', () => {
    const f = CLASS_REQUIREMENTS[0]!;
    expect(f.name).toBe('Fighter');
    expect(f.str).toBe(12);
    expect([f.int, f.pie, f.vit, f.dex, f.spd, f.per]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('Bishop (9) requires very high INT and PIE (15 each) — one of the famously elite classes', () => {
    const b = CLASS_REQUIREMENTS[9]!;
    expect(b.name).toBe('Bishop');
    expect(b.int).toBe(15);
    expect(b.pie).toBe(15);
  });

  it('Ninja (13) has 6 distinct attribute gates', () => {
    const n = CLASS_REQUIREMENTS[13]!;
    expect(n.name).toBe('Ninja');
    const gates = [n.str, n.int, n.pie, n.vit, n.dex, n.spd, n.per].filter((v) => v > 0);
    expect(gates).toHaveLength(6);
  });
});

describe('getClassRequirements', () => {
  it('returns class by index', () => {
    expect(getClassRequirements(0).name).toBe('Fighter');
    expect(getClassRequirements(13).name).toBe('Ninja');
  });

  it('throws on out-of-range', () => {
    expect(() => getClassRequirements(-1)).toThrow();
    expect(() => getClassRequirements(14)).toThrow();
  });
});

describe('meetsClassRequirements', () => {
  const balanced: AttributeSet = {
    str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 12, kar: 12,
  };

  it('balanced 12s qualify for base classes (Fighter/Mage/Priest/Thief)', () => {
    // Fighter STR=12 ✓; Mage INT=12 ✓; Priest PIE=12 PER=12>=8 ✓; Thief DEX=12 SPD=12>=8 ✓
    expect(meetsClassRequirements(balanced, 0)).toBe(true);
    expect(meetsClassRequirements(balanced, 1)).toBe(true);
    expect(meetsClassRequirements(balanced, 2)).toBe(true);
    expect(meetsClassRequirements(balanced, 3)).toBe(true);
  });

  it('balanced 12s do NOT qualify for Bishop (needs INT>=15 PIE>=15)', () => {
    expect(meetsClassRequirements(balanced, 9)).toBe(false);
  });

  it('balanced 12s do NOT qualify for Lord (needs PER>=14)', () => {
    expect(meetsClassRequirements(balanced, 10)).toBe(false);
  });
});

describe('eligibleClasses cross-validates against stock characters', () => {
  // Stock characters from pcfile.dbs — their decoded attributes + actual class.
  // (Decoded earlier in the rounds — see packages/viewer/public/gallery/characters.json.)
  const STOCK = [
    { name: 'THESUS',  expectedClass: 0,  attrs: { str: 18, int: 8,  pie: 8,  vit: 12, dex: 10, spd: 9,  per: 8,  kar: 14 } },
    { name: 'TEMPEST', expectedClass: 0,  attrs: { str: 13, int: 10, pie: 6,  vit: 14, dex: 7,  spd: 7,  per: 10, kar: 16 } },
    { name: 'LYSANDR', expectedClass: 3,  attrs: { str: 7,  int: 10, pie: 7,  vit: 11, dex: 14, spd: 12, per: 10, kar: 15 } },
    { name: 'NOBAL',   expectedClass: 2,  attrs: { str: 7,  int: 10, pie: 13, vit: 9,  dex: 9,  spd: 9,  per: 8,  kar: 4  } },
    { name: 'TREON',   expectedClass: 1,  attrs: { str: 10, int: 12, pie: 6,  vit: 12, dex: 10, spd: 8,  per: 6,  kar: 3  } },
    { name: 'PENTAG',  expectedClass: 1,  attrs: { str: 10, int: 12, pie: 13, vit: 10, dex: 8,  spd: 6,  per: 6,  kar: 9  } },
  ];

  for (const c of STOCK) {
    it(`${c.name} qualifies for their actual class (${c.expectedClass})`, () => {
      const eligible = eligibleClasses(c.attrs);
      expect(eligible).toContain(c.expectedClass);
    });
  }
});
