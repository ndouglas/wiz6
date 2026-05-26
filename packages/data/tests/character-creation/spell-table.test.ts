import { describe, expect, it } from 'vitest';
import { SPELL_TABLE, spellsInBook } from '../../src/character-creation/spell-table.js';

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
  it('Alchemist (book 2) returns 32 spells', () => {
    expect(spellsInBook(2).length).toBe(32);
  });
  it('Psionic (book 3) returns 25 spells', () => {
    expect(spellsInBook(3).length).toBe(25);
  });
});
