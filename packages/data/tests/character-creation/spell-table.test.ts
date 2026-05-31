import { describe, expect, it } from 'vitest';
import { SPELL_TABLE, spellsInBook, spellCost } from '../../src/character-creation/spell-table.js';

describe('SPELL_TABLE', () => {
  it('has 82 entries', () => {
    expect(SPELL_TABLE.length).toBe(82);
  });
});

describe('spellsInBook', () => {
  it('Mage (book 0) returns 33 spells', () => {
    expect(spellsInBook(0).length).toBe(33);
  });
  it('Priest (book 1) returns 33 spells', () => {
    expect(spellsInBook(1).length).toBe(33);
  });
  it('Alchemist (book 2) returns 25 spells', () => {
    expect(spellsInBook(2).length).toBe(25);
  });
  it('Psionic (book 3) returns 32 spells', () => {
    expect(spellsInBook(3).length).toBe(32);
  });
});

it('Alchemist book (idx 2) uses byte5 bit0 (mask 0x1) — engine-verified', () => {
  expect(spellsInBook(2).some((s) => s.entryIdx === 0)).toBe(false); // ENERGY BLAST byte5=0x08 (Mage only)
  expect(spellsInBook(2).every((s) => (s.entry.byte5 & 0x1) !== 0)).toBe(true);
});
it('Psionic book (idx 3) uses byte5 bit1 (mask 0x2) — engine-verified', () => {
  expect(spellsInBook(3).every((s) => (s.entry.byte5 & 0x2) !== 0)).toBe(true);
});
it('spellCost returns the SP cost (b2): ENERGY BLAST=2, TERROR=3', () => {
  expect(spellCost(SPELL_TABLE[0]!)).toBe(2);   // ENERGY BLAST
  expect(spellCost(SPELL_TABLE[11]!)).toBe(3);  // TERROR
});

describe('spellsInBook excludes sentinel entries (byte5 === 0)', () => {
  it('does not include entries 79, 80, 81 (all bookIdx values)', () => {
    for (const bookIdx of [0, 1, 2, 3]) {
      const list = spellsInBook(bookIdx);
      const indices = list.map((e) => e.entryIdx);
      expect(indices).not.toContain(79);
      expect(indices).not.toContain(80);
      expect(indices).not.toContain(81);
    }
  });

  it('SPELL_TABLE itself has 82 entries (sentinels included for indexing)', () => {
    expect(SPELL_TABLE.length).toBe(82);
    expect(SPELL_TABLE[79]!.byte5).toBe(0);
    expect(SPELL_TABLE[80]!.byte5).toBe(0);
    expect(SPELL_TABLE[81]!.byte5).toBe(0);
  });
});
