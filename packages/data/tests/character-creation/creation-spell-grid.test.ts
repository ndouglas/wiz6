import { describe, it, expect } from 'vitest';
import { creationSpellGrid, creationPickCount } from '../../src/character-creation/creation-spell-grid.js';

describe('creationSpellGrid', () => {
  it('Mage (class 1): per-school level-1 counts = FIRE1 WATER2 AIR0 EARTH2 MENTAL1 MAGIC0', () => {
    const g = creationSpellGrid(1);
    expect(g.map((s) => s.length)).toEqual([1, 2, 0, 2, 1, 0]);
    expect(g[1].map((s) => s.entryIdx)).toEqual([9, 11]); // CHILLING TOUCH, TERROR
  });
  it('Priest (class 2): FIRE0 WATER1 AIR0 EARTH0 MENTAL2 MAGIC2', () => {
    expect(creationSpellGrid(2).map((s) => s.length)).toEqual([0, 1, 0, 0, 2, 2]);
  });
  it('Alchemist (class 5): FIRE0 WATER1 AIR1 EARTH2 MENTAL2 MAGIC1', () => {
    expect(creationSpellGrid(5).map((s) => s.length)).toEqual([0, 1, 1, 2, 2, 1]);
  });
  it('non-caster (Fighter, class 0) → all empty', () => {
    expect(creationSpellGrid(0).every((s) => s.length === 0)).toBe(true);
  });
  it('creationPickCount: Mage=2, Bishop(9)=2, Fighter=0', () => {
    expect(creationPickCount(1)).toBe(2);
    expect(creationPickCount(9)).toBe(2);
    expect(creationPickCount(0)).toBe(0);
  });
});
