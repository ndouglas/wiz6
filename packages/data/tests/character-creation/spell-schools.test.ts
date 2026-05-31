import { describe, expect, it } from 'vitest';
import {
  SCHOOL_NAMES,
  SPELLBOOK_NAMES,
  CLASS_SPELLBOOKS,
  SPELLBOOK_SCHOOLS,
  CLASS_SCHOOLS,
  classCanCastSchool,
  classCastingSchools,
  classIsCaster,
  classSpellbooks,
  classBookStrength,
} from '../../src/character-creation/spell-schools.js';

/**
 * Tests for spell-school-assignment RE finding (two-layer model).
 *
 * Layer 1 (class → spellbook pick count): confirmed via static asm of
 * wpcmk dispatch handlers at file 0x491A..0x4A6D. Each handler optionally
 * writes a count byte (1 or 2) at DGROUP+0x5588..0x558B. The picker loop
 * at wpcmk 0x4ef2 decrements the count after each pick (at file 0x2AF6).
 *
 * Layer 2 (spellbook → schools): derived from the 82-entry spell table
 * at DGROUP+0xde, parsed in docs/re/findings/spell-school-assignment.json.
 * Each spell's `byte5` field is a 4-bit book-membership bitmask.
 *
 * Tests below verify the byte-derived truth, not stock-character schoolMana
 * (which reflects player picks at creation, a narrower distribution).
 */

describe('SCHOOL_NAMES', () => {
  it('has 6 entries in the expected order', () => {
    expect(SCHOOL_NAMES).toEqual(['Fire', 'Water', 'Air', 'Earth', 'Mental', 'Divine']);
  });
});

describe('SPELLBOOK_NAMES', () => {
  it('has 4 entries in dispatch-byte order', () => {
    expect(SPELLBOOK_NAMES).toEqual(['Mage', 'Priest', 'Alchemist', 'Psionic']);
  });
});

describe('CLASS_SPELLBOOKS shape', () => {
  it('has 14 rows (one per class)', () => {
    expect(CLASS_SPELLBOOKS.length).toBe(14);
  });

  it('each row has exactly 4 entries (one per spellbook)', () => {
    for (const row of CLASS_SPELLBOOKS) {
      expect(row.length).toBe(4);
    }
  });

  it('every value is 0, 1, or 2 (pick counts)', () => {
    for (const row of CLASS_SPELLBOOKS) {
      for (const v of row) {
        expect([0, 1, 2]).toContain(v);
      }
    }
  });
});

describe('SPELLBOOK_SCHOOLS shape', () => {
  it('has 4 rows (one per spellbook)', () => {
    expect(SPELLBOOK_SCHOOLS.length).toBe(4);
  });

  it('each row has exactly 6 entries (one per school)', () => {
    for (const row of SPELLBOOK_SCHOOLS) {
      expect(row.length).toBe(6);
    }
  });
});

// ── Class → Spellbook assignments (Layer 1) — verified from asm ──

describe('Class → Spellbook (asm-verified)', () => {
  it('Fighter (0) has no books', () => {
    expect(CLASS_SPELLBOOKS[0]).toEqual([0, 0, 0, 0]);
  });

  it('Mage (1) gets 2 picks from Mage book', () => {
    expect(CLASS_SPELLBOOKS[1]).toEqual([2, 0, 0, 0]);
  });

  it('Priest (2) gets 2 picks from Priest book', () => {
    expect(CLASS_SPELLBOOKS[2]).toEqual([0, 2, 0, 0]);
  });

  it('Thief (3) has no books (handler aliases Fighter)', () => {
    expect(CLASS_SPELLBOOKS[3]).toEqual([0, 0, 0, 0]);
  });

  it('Ranger (4) has no books at creation', () => {
    expect(CLASS_SPELLBOOKS[4]).toEqual([0, 0, 0, 0]);
  });

  it('Alchemist (5) gets 2 picks from Alchemist book', () => {
    expect(CLASS_SPELLBOOKS[5]).toEqual([0, 0, 2, 0]);
  });

  it('Bard (6) has no books at creation', () => {
    expect(CLASS_SPELLBOOKS[6]).toEqual([0, 0, 0, 0]);
  });

  it('Psionic (7) gets 2 picks from Psionic book', () => {
    expect(CLASS_SPELLBOOKS[7]).toEqual([0, 0, 0, 2]);
  });

  it('Valkyrie (8) has no books at creation', () => {
    expect(CLASS_SPELLBOOKS[8]).toEqual([0, 0, 0, 0]);
  });

  it('Bishop (9) gets 1 pick each from Mage + Priest book', () => {
    expect(CLASS_SPELLBOOKS[9]).toEqual([1, 1, 0, 0]);
  });

  it('Lord (10) has no books at creation', () => {
    expect(CLASS_SPELLBOOKS[10]).toEqual([0, 0, 0, 0]);
  });

  it('Samurai (11) has no books at creation', () => {
    expect(CLASS_SPELLBOOKS[11]).toEqual([0, 0, 0, 0]);
  });

  it('Monk (12) has no books at creation', () => {
    expect(CLASS_SPELLBOOKS[12]).toEqual([0, 0, 0, 0]);
  });

  it('Ninja (13) has no books', () => {
    expect(CLASS_SPELLBOOKS[13]).toEqual([0, 0, 0, 0]);
  });
});

// ── Spellbook → Schools (Layer 2) — derived from spell table ──

describe('Spellbook coverage (from byte5 bitmask scan of 82-entry spell table)', () => {
  it('Mage book covers all 6 schools', () => {
    expect(SPELLBOOK_SCHOOLS[0]).toEqual([true, true, true, true, true, true]);
  });

  it('Priest book covers all 6 schools', () => {
    expect(SPELLBOOK_SCHOOLS[1]).toEqual([true, true, true, true, true, true]);
  });

  it('Alchemist book covers all 6 schools (mask 0x01, engine-verified)', () => {
    expect(SPELLBOOK_SCHOOLS[2]).toEqual([true, true, true, true, true, true]);
  });

  it('Psionic book covers 5 schools — no Fire (mask 0x02, engine-verified)', () => {
    expect(SPELLBOOK_SCHOOLS[3]).toEqual([false, true, true, true, true, true]);
  });
});

// ── Derived CLASS_SCHOOLS — non-casters confirmed via THESUS, LYSANDR ──

describe('Fighter (0) cannot cast any school', () => {
  it('classCastingSchools returns []', () => {
    expect(classCastingSchools(0)).toEqual([]);
  });
});

describe('Thief (3) cannot cast any school', () => {
  it('classCastingSchools returns []', () => {
    expect(classCastingSchools(3)).toEqual([]);
  });
});

describe('Ninja (13) cannot cast any school', () => {
  it('classCastingSchools returns []', () => {
    expect(classCastingSchools(13)).toEqual([]);
  });
});

describe('Other non-caster classes at creation', () => {
  for (const [classIdx, name] of [
    [4, 'Ranger'],
    [6, 'Bard'],
    [8, 'Valkyrie'],
    [10, 'Lord'],
    [11, 'Samurai'],
    [12, 'Monk'],
  ] as const) {
    it(`${name} (${classIdx}) has no school access at creation`, () => {
      expect(classCastingSchools(classIdx as number)).toEqual([]);
      expect(classIsCaster(classIdx as number)).toBe(false);
    });
  }
});

// ── Derived CLASS_SCHOOLS — caster classes have access to all schools in their book(s) ──

describe('Caster school access derived from spellbook coverage', () => {
  it('Mage (1) has access to all 6 schools via Mage book', () => {
    expect(classCastingSchools(1)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('Priest (2) has access to all 6 schools via Priest book', () => {
    expect(classCastingSchools(2)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('Alchemist (5) has access to all 6 schools via Alchemist book (engine-verified)', () => {
    expect(classCastingSchools(5)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('Psionic (7) has access to 5 schools via Psionic book — no Fire (engine-verified)', () => {
    expect(classCastingSchools(7)).toEqual([1, 2, 3, 4, 5]);
  });

  it('Bishop (9) has access to all 6 schools (Mage book ∪ Priest book)', () => {
    expect(classCastingSchools(9)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('Bishop classBookStrength returns 1 (one pick) for both Mage and Priest', () => {
    expect(classBookStrength(9, 0)).toBe(1);
    expect(classBookStrength(9, 1)).toBe(1);
  });
});

// ── classIsCaster / classSpellbooks ──

describe('classIsCaster', () => {
  it('returns true for the 5 caster classes', () => {
    expect(classIsCaster(1)).toBe(true);  // Mage
    expect(classIsCaster(2)).toBe(true);  // Priest
    expect(classIsCaster(5)).toBe(true);  // Alchemist
    expect(classIsCaster(7)).toBe(true);  // Psionic
    expect(classIsCaster(9)).toBe(true);  // Bishop
  });

  it('returns false for the 9 non-caster classes', () => {
    for (const c of [0, 3, 4, 6, 8, 10, 11, 12, 13]) {
      expect(classIsCaster(c)).toBe(false);
    }
  });
});

describe('classSpellbooks', () => {
  it('Bishop returns both Mage and Priest book indices', () => {
    expect(classSpellbooks(9)).toEqual([0, 1]);
  });

  it('Mage returns only the Mage book', () => {
    expect(classSpellbooks(1)).toEqual([0]);
  });

  it('Fighter returns []', () => {
    expect(classSpellbooks(0)).toEqual([]);
  });
});

it('Alchemist (class 5) can cast Fire; Psionic (class 7) cannot — engine-verified', () => {
  expect(classCanCastSchool(5, 0)).toBe(true);
  expect(classCanCastSchool(7, 0)).toBe(false);
});

// ── Edge cases ──

describe('out-of-range inputs', () => {
  it('classCanCastSchool returns false for out-of-range classIdx', () => {
    expect(classCanCastSchool(-1, 0)).toBe(false);
    expect(classCanCastSchool(14, 0)).toBe(false);
  });

  it('classCanCastSchool returns false for out-of-range schoolIdx', () => {
    expect(classCanCastSchool(1, -1)).toBe(false);
    expect(classCanCastSchool(1, 6)).toBe(false);
  });

  it('classCastingSchools returns [] for out-of-range classIdx', () => {
    expect(classCastingSchools(99)).toEqual([]);
  });

  it('classBookStrength returns 0 for out-of-range classIdx', () => {
    expect(classBookStrength(-1, 0)).toBe(0);
    expect(classBookStrength(99, 0)).toBe(0);
  });
});

// ── Sanity: matrix consistency ──

describe('CLASS_SCHOOLS derivation is consistent with CLASS_SPELLBOOKS × SPELLBOOK_SCHOOLS', () => {
  it('every row matches the union of spellbook coverages', () => {
    for (let classIdx = 0; classIdx < 14; classIdx++) {
      const books = CLASS_SPELLBOOKS[classIdx]!;
      const expected = [false, false, false, false, false, false];
      for (let b = 0; b < 4; b++) {
        if (books[b]! > 0) {
          for (let s = 0; s < 6; s++) {
            if (SPELLBOOK_SCHOOLS[b]![s]) expected[s] = true;
          }
        }
      }
      expect(CLASS_SCHOOLS[classIdx]).toEqual(expected);
    }
  });
});
