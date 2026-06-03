import { describe, it, expect } from 'vitest';
import { isSpellKnown, knownSpells, knownSpellsBySchool, SPELL_TABLE } from '../../src/index.js';
import type { Character } from '../../src/index.js';

/** Build a 20-byte known-spell bitset with the given spell-table indices set. */
function bitset(indices: number[]): number[] {
  const b = new Array<number>(20).fill(0);
  for (const i of indices) b[i >> 3]! |= 1 << (i & 7);
  return b;
}

function caster(indices: number[]): Character {
  return { spellSlotsKnown: bitset(indices) } as unknown as Character;
}

describe('known-spells', () => {
  it('isSpellKnown reads the bit i&7 of byte i>>3', () => {
    const b = bitset([0, 9, 48]);
    expect(isSpellKnown(b, 0)).toBe(true);
    expect(isSpellKnown(b, 9)).toBe(true);
    expect(isSpellKnown(b, 48)).toBe(true);
    expect(isSpellKnown(b, 1)).toBe(false);
    expect(isSpellKnown(b, 8)).toBe(false);
  });

  it('knownSpells enumerates set bits as spell-table entries (TREON: {0,48})', () => {
    // Verified vs the pinned roster: TREON (Mage) record +0x188 bits {0,48}.
    const ks = knownSpells(caster([0, 48]));
    expect(ks.map((s) => s.index)).toEqual([0, 48]);
    // Each carries the spell-table school/level/cost.
    expect(ks[0]!.school).toBe(SPELL_TABLE[0]!.school);
    expect(ks[0]!.cost).toBe(SPELL_TABLE[0]!.b2);
    expect(ks[1]!.school).toBe(SPELL_TABLE[48]!.school);
  });

  it('a non-caster (empty bitset) knows no spells', () => {
    expect(knownSpells(caster([]))).toEqual([]);
    expect(knownSpells({} as Character)).toEqual([]); // no spellSlotsKnown field
  });

  it('knownSpellsBySchool groups into the 6-school grid', () => {
    const grid = knownSpellsBySchool(caster([0, 48]));
    expect(grid).toHaveLength(6);
    // index 0 + 48 land in their respective schools; total across the grid = 2.
    expect(grid.flat().map((s) => s.index).sort((a, b) => a - b)).toEqual([0, 48]);
    expect(grid[SPELL_TABLE[0]!.school]!.some((s) => s.index === 0)).toBe(true);
  });
});
