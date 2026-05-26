import { describe, expect, it } from 'vitest';
import {
  SCHOOL_NAMES,
  CLASS_SCHOOLS,
  classCanCastSchool,
  classCastingSchools,
} from '../../src/character-creation/spell-schools.js';

/**
 * Tests for spell-school-assignment RE finding.
 *
 * RE evidence (wpcmk.ovr + pcfile.dbs):
 *   - School ordering 0=Fire..5=Divine confirmed from spell table at DGROUP+0xde
 *   - THESUS (Fighter cls=0): schoolMana all-zero  → all false
 *   - LYSANDR (Thief cls=3): schoolMana all-zero   → all false
 *   - NOBAL (Priest cls=2): schoolMana Mental=5, Divine=4 → only schools 4+5
 *   - TREON (Mage cls=1): schoolMana Fire=3, Mental=3 → schools 0+4 confirmed
 *   - PENTAG (Mage cls=1): schoolMana Water=3, Earth=3 → schools 1+3 confirmed
 */

describe('SCHOOL_NAMES', () => {
  it('has 6 entries', () => {
    expect(SCHOOL_NAMES.length).toBe(6);
  });

  it('index 0 is Fire', () => {
    expect(SCHOOL_NAMES[0]).toBe('Fire');
  });

  it('index 1 is Water', () => {
    expect(SCHOOL_NAMES[1]).toBe('Water');
  });

  it('index 2 is Air', () => {
    expect(SCHOOL_NAMES[2]).toBe('Air');
  });

  it('index 3 is Earth', () => {
    expect(SCHOOL_NAMES[3]).toBe('Earth');
  });

  it('index 4 is Mental', () => {
    expect(SCHOOL_NAMES[4]).toBe('Mental');
  });

  it('index 5 is Divine', () => {
    expect(SCHOOL_NAMES[5]).toBe('Divine');
  });
});

describe('CLASS_SCHOOLS matrix shape', () => {
  it('has 14 rows (one per class)', () => {
    expect(CLASS_SCHOOLS.length).toBe(14);
  });

  it('each row has exactly 6 entries (one per school)', () => {
    for (const row of CLASS_SCHOOLS) {
      expect(row.length).toBe(6);
    }
  });
});

// ── Confirmed rows (from stock pcfile.dbs characters) ────────────────────────

describe('Fighter (cls=0) — CONFIRMED all-false via THESUS stock char', () => {
  it('cannot cast any school', () => {
    expect(classCastingSchools(0)).toEqual([]);
  });

  for (let s = 0; s < 6; s++) {
    it(`classCanCastSchool(0, ${s}) is false`, () => {
      expect(classCanCastSchool(0, s)).toBe(false);
    });
  }
});

describe('Mage (cls=1) — HIGH confidence from TREON + PENTAG stock chars', () => {
  it('can cast Fire (school 0) — confirmed by TREON schoolMana[0]=3', () => {
    expect(classCanCastSchool(1, 0)).toBe(true);
  });

  it('can cast Water (school 1) — confirmed by PENTAG schoolMana[1]=3', () => {
    expect(classCanCastSchool(1, 1)).toBe(true);
  });

  it('can cast Air (school 2)', () => {
    expect(classCanCastSchool(1, 2)).toBe(true);
  });

  it('can cast Earth (school 3) — confirmed by PENTAG schoolMana[3]=3', () => {
    expect(classCanCastSchool(1, 3)).toBe(true);
  });

  it('can cast Mental (school 4) — confirmed by TREON schoolMana[4]=3', () => {
    expect(classCanCastSchool(1, 4)).toBe(true);
  });

  it('cannot cast Divine (school 5)', () => {
    expect(classCanCastSchool(1, 5)).toBe(false);
  });

  it('classCastingSchools returns [0,1,2,3,4]', () => {
    expect(classCastingSchools(1)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('Priest (cls=2) — CONFIRMED Mental+Divine via NOBAL stock char', () => {
  it('cannot cast Fire (school 0) — NOBAL schoolMana[0]=0', () => {
    expect(classCanCastSchool(2, 0)).toBe(false);
  });

  it('cannot cast Water (school 1) — NOBAL schoolMana[1]=0', () => {
    expect(classCanCastSchool(2, 1)).toBe(false);
  });

  it('cannot cast Air (school 2) — NOBAL schoolMana[2]=0', () => {
    expect(classCanCastSchool(2, 2)).toBe(false);
  });

  it('cannot cast Earth (school 3) — NOBAL schoolMana[3]=0', () => {
    expect(classCanCastSchool(2, 3)).toBe(false);
  });

  it('can cast Mental (school 4) — NOBAL schoolMana[4]=5', () => {
    expect(classCanCastSchool(2, 4)).toBe(true);
  });

  it('can cast Divine (school 5) — NOBAL schoolMana[5]=4', () => {
    expect(classCanCastSchool(2, 5)).toBe(true);
  });

  it('classCastingSchools returns [4,5]', () => {
    expect(classCastingSchools(2)).toEqual([4, 5]);
  });
});

describe('Thief (cls=3) — CONFIRMED all-false via LYSANDR stock char', () => {
  it('cannot cast any school', () => {
    expect(classCastingSchools(3)).toEqual([]);
  });
});

describe('Ninja (cls=13) — CONFIRMED all-false (stock char data + no-magic archetype)', () => {
  it('cannot cast any school', () => {
    expect(classCastingSchools(13)).toEqual([]);
  });
});

// ── Inferred rows — tested as design intent, marked for future confirmation ──

describe('Ranger (cls=4) — MEDIUM: Earth only by game design', () => {
  it('classCastingSchools returns [3]', () => {
    expect(classCastingSchools(4)).toEqual([3]);
  });
});

describe('Alchemist (cls=5) — MEDIUM: Fire+Earth by game design', () => {
  it('classCastingSchools returns [0,3]', () => {
    expect(classCastingSchools(5)).toEqual([0, 3]);
  });
});

describe('Bard (cls=6) — LOW: Water+Air by game design', () => {
  it('classCastingSchools returns [1,2]', () => {
    expect(classCastingSchools(6)).toEqual([1, 2]);
  });
});

describe('Psionic (cls=7) — MEDIUM: Mental only', () => {
  it('classCastingSchools returns [4]', () => {
    expect(classCastingSchools(7)).toEqual([4]);
  });
});

describe('Valkyrie (cls=8) — MEDIUM: Divine only', () => {
  it('classCastingSchools returns [5]', () => {
    expect(classCastingSchools(8)).toEqual([5]);
  });
});

describe('Bishop (cls=9) — MEDIUM: all 6 schools', () => {
  it('classCastingSchools returns [0,1,2,3,4,5]', () => {
    expect(classCastingSchools(9)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('can cast every school', () => {
    for (let s = 0; s < 6; s++) {
      expect(classCanCastSchool(9, s)).toBe(true);
    }
  });
});

describe('Lord (cls=10) — MEDIUM: Mental+Divine', () => {
  it('classCastingSchools returns [4,5]', () => {
    expect(classCastingSchools(10)).toEqual([4, 5]);
  });
});

describe('Samurai (cls=11) — LOW: Mental only', () => {
  it('classCastingSchools returns [4]', () => {
    expect(classCastingSchools(11)).toEqual([4]);
  });
});

describe('Monk (cls=12) — LOW: Mental only', () => {
  it('classCastingSchools returns [4]', () => {
    expect(classCastingSchools(12)).toEqual([4]);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('classCanCastSchool — out-of-range inputs', () => {
  it('returns false for classIdx -1', () => {
    expect(classCanCastSchool(-1, 0)).toBe(false);
  });

  it('returns false for classIdx 14', () => {
    expect(classCanCastSchool(14, 0)).toBe(false);
  });

  it('returns false for schoolIdx -1', () => {
    expect(classCanCastSchool(1, -1)).toBe(false);
  });

  it('returns false for schoolIdx 6', () => {
    expect(classCanCastSchool(1, 6)).toBe(false);
  });
});

describe('classCastingSchools — out-of-range input', () => {
  it('returns [] for classIdx 99', () => {
    expect(classCastingSchools(99)).toEqual([]);
  });
});
