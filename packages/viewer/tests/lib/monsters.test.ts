import { describe, expect, it } from 'vitest';
import { FIXTURE_SCENARIO_DB } from '../fixtures/scenario-fixture.js';
import {
  monsterSlug,
  findMonsterBySlug,
  searchMonsters,
  filterMonsters,
  sortMonsters,
  uniqueFilterValues,
  formatLevelRange,
  formatHpDice,
  formatAttackDice,
  type MonsterFilter,
  type MonsterSortField,
} from '../../src/lib/monsters.js';

const ALL = FIXTURE_SCENARIO_DB.monsters;
const FILLED = ALL.filter((m) => !m.empty);

describe('monsterSlug', () => {
  it('uses nameIdSingular when present', () => {
    const rat = ALL[0]!;
    expect(monsterSlug(rat)).toBe('giant-rat');
  });

  it('falls back to index for empty slots', () => {
    const empty = ALL[100]!;
    expect(monsterSlug(empty)).toBe('slot-100');
  });
});

describe('findMonsterBySlug', () => {
  it('returns the monster matching the slug', () => {
    expect(findMonsterBySlug(ALL, 'giant-rat')?.nameIdSingular).toBe('GIANT RAT');
    expect(findMonsterBySlug(ALL, 'wraith')?.nameIdSingular).toBe('WRAITH');
  });

  it('returns null for an unknown slug', () => {
    expect(findMonsterBySlug(ALL, 'nope')).toBeNull();
  });

  it('finds empty slots by their fallback slug', () => {
    expect(findMonsterBySlug(ALL, 'slot-100')?.index).toBe(100);
  });
});

describe('searchMonsters', () => {
  it('matches case-insensitively across all four name slots', () => {
    expect(searchMonsters(FILLED, 'rat').map((m) => m.nameIdSingular)).toEqual(['GIANT RAT']);
    // 'spirit' is the unid-singular of WRAITH
    expect(searchMonsters(FILLED, 'spirit').map((m) => m.nameIdSingular)).toEqual(['WRAITH']);
    // partial match
    expect(searchMonsters(FILLED, 'rats').map((m) => m.nameIdSingular)).toEqual(['GIANT RAT']);
  });

  it('returns input unchanged for empty query', () => {
    expect(searchMonsters(FILLED, '')).toEqual(FILLED);
    expect(searchMonsters(FILLED, '   ')).toEqual(FILLED);
  });
});

describe('filterMonsters', () => {
  it('filters by monsterClass', () => {
    const f: MonsterFilter = { classes: [2] };
    const names = filterMonsters(FILLED, f).map((m) => m.nameIdSingular);
    expect(names).toEqual(['ZOMBIE', 'WRAITH']);
  });

  it('filters by specialAttackElement', () => {
    const f: MonsterFilter = { elements: [1] }; // fire
    expect(filterMonsters(FILLED, f).map((m) => m.nameIdSingular)).toEqual(['PIT FIEND']);
  });

  it('filters by family (stringified 4-byte tuple)', () => {
    const f: MonsterFilter = { families: ['10,12,12,12'] };
    expect(filterMonsters(FILLED, f).map((m) => m.nameIdSingular)).toEqual(['WRAITH']);
  });

  it('combines filters with AND semantics', () => {
    const f: MonsterFilter = { classes: [2], elements: [11] }; // undead AND mental
    expect(filterMonsters(FILLED, f).map((m) => m.nameIdSingular)).toEqual(['WRAITH']);
  });

  it('hides empty slots when includeEmpty is false', () => {
    expect(filterMonsters(ALL, { includeEmpty: false }).length).toBe(FILLED.length);
  });

  it('includes empty slots when includeEmpty is true', () => {
    expect(filterMonsters(ALL, { includeEmpty: true }).length).toBe(ALL.length);
  });
});

describe('sortMonsters', () => {
  it('sorts by name ascending by default', () => {
    const sorted = sortMonsters(FILLED, 'name', 'asc').map((m) => m.nameIdSingular);
    expect(sorted).toEqual(['FAERIE QUEEN', 'GIANT RAT', 'PIT FIEND', 'WRAITH', 'ZOMBIE']);
  });

  it('sorts by level descending', () => {
    const sorted = sortMonsters(FILLED, 'level', 'desc').map((m) => m.monsterLevel);
    expect(sorted).toEqual([50, 16, 12, 10, 8]);
  });

  it('sorts by AC ascending (lower is better in Wiz6 AC)', () => {
    const sorted = sortMonsters(FILLED, 'ac', 'asc').map((m) => m.monsterAC);
    expect(sorted).toEqual([-6, -2, 2, 3, 10]);
  });

  it.each<MonsterSortField>(['name', 'level', 'ac', 'hp', 'xp', 'gold'])(
    'is stable for field %s',
    (field) => {
      const a = sortMonsters(FILLED, field, 'asc');
      const b = sortMonsters(FILLED, field, 'asc');
      expect(a.map((m) => m.index)).toEqual(b.map((m) => m.index));
    },
  );
});

describe('uniqueFilterValues', () => {
  it('extracts distinct class/element/family/etc. values from filled monsters', () => {
    const v = uniqueFilterValues(FILLED);
    const numAsc = (a: number, b: number): number => a - b;
    expect(v.classes.slice().sort(numAsc)).toEqual([1, 2, 3, 4]);
    expect(v.elements.slice().sort(numAsc)).toEqual([1, 5, 8, 11, 12]);
    expect(v.families).toContain('6,4,14,16');
    expect(v.families).toContain('10,12,12,12');
    expect(v.creatureKinds.slice().sort(numAsc)).toEqual([4, 5, 8, 10]);
    expect(v.sexes.slice().sort(numAsc)).toEqual([1, 2]);
    expect(v.behaviorClasses.slice().sort(numAsc)).toEqual([0, 2, 11]);
  });

  it('ignores empty slots', () => {
    const v = uniqueFilterValues(ALL);
    // Empty slots all have class=0, which should NOT appear in classes
    expect(v.classes).not.toContain(0);
  });
});

describe('formatters', () => {
  it('formatLevelRange shows a single value when min === max', () => {
    expect(formatLevelRange(10, 10)).toBe('10');
  });
  it('formatLevelRange shows a range when min !== max', () => {
    expect(formatLevelRange(8, 15)).toBe('8-15');
  });
  it('formatHpDice renders as NdM', () => {
    expect(formatHpDice(4, 2)).toBe('4d2');
  });
  it('formatHpDice returns "—" for unused', () => {
    expect(formatHpDice(0, 0)).toBe('—');
  });
  it('formatAttackDice renders as NdM', () => {
    expect(formatAttackDice(2, 10)).toBe('2d10');
  });
});
