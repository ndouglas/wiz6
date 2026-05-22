import { describe, expect, it } from 'vitest';
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
} from '../../src/queries/monsters.js';
import type { ScenarioMonster } from '@wiz6/data';

// Inline test fixture — 5 representative monsters covering classes 1-4 plus
// undead. Kept here (not shared with the viewer) because the queries module
// belongs in @wiz6/parser and crossing package boundaries for fixtures is
// fiddly. The viewer keeps its own larger fixture for component tests.

const empty158 = (): number[] => Array(158).fill(0);

const baseMonsterFields = {
  xpOnKill: 0,
  attack1DiceCount: 0,
  attack1DiceSides: 0,
  attack1SpecialChance: 0,
  attack2DiceCount: 0,
  attack2DiceSides: 0,
  attack2SpecialChance: 0,
  attack3DiceCount: 0,
  attack3DiceSides: 0,
  attack3SpecialChance: 0,
  groupDiceCount: 0,
  groupDiceSides: 0,
  hpDiceCount: 0,
  hpDiceSides: 0,
  monsterClass: 0,
  monsterSubClass: 0,
  saveTable: [0, 0, 0, 0, 0],
  effectChanceTable: [0, 0, 0, 0, 0],
  monsterLevel: 0,
  monsterLevelMax: 0,
  familyId: [0, 0, 0, 0],
  creatureKind: 0,
  monsterSex: 0,
  moveStat: 0,
  spriteGroup: 0,
  monsterAC: 0,
  attributeSaves: [0, 0, 0, 0],
  goldStat: 0,
  specialAttackElement: 0,
  monsterBehaviorClass: 0,
  attack1Extra: [0, 0],
  attack2Extra: [0, 0],
  attack3Extra: [0, 0],
  attack1PoisonChance: 0,
  attack1DrainChance: 0,
  attack1StunChance: 0,
  attack2PoisonChance: 0,
  attack2DrainChance: 0,
  attack2StunChance: 0,
  attack3PoisonChance: 0,
  attack3DrainChance: 0,
  attack3StunChance: 0,
  attack1HpDrainChance: 0,
  attack1AgeChance: 0,
  attack1DecapitateChance: 0,
  attack2HpDrainChance: 0,
  attack2AgeChance: 0,
  attack2DecapitateChance: 0,
  attack3HpDrainChance: 0,
  attack3AgeChance: 0,
  attack3DecapitateChance: 0,
  attack1Style: 0,
  attack1DamageBonus: 0,
  attack2Style: 0,
  attack2DamageBonus: 0,
  attack3Style: 0,
  attack3DamageBonus: 0,
  attack1PoisonStrength: 0,
  attack2PoisonStrength: 0,
  attack3PoisonStrength: 0,
  extendedSaves: Array(12).fill(0) as number[],
  combatSpriteId: 0,
  combatSpriteAlt: 0,
  secondarySpriteId: 0,
  picId: 0,
  magicResistChance: 0,
  combatTraitId: 0,
  auxSave103: 0,
  spellPowerChance: 0,
  auxSave106: 0,
  flyEvadeChance: 0,
};

const emptyMonster = (i: number): ScenarioMonster => ({
  index: i,
  nameIdSingular: '',
  nameIdPlural: '',
  nameUnidSingular: '',
  nameUnidPlural: '',
  statBytes: empty158(),
  empty: true,
  ...baseMonsterFields,
});

const FIXTURE_MONSTERS: ScenarioMonster[] = Array.from({ length: 250 }, (_, i) =>
  emptyMonster(i),
);
FIXTURE_MONSTERS[0] = {
  ...emptyMonster(0),
  nameIdSingular: 'GIANT RAT',
  nameIdPlural: 'GIANT RATS',
  nameUnidSingular: 'RAT',
  nameUnidPlural: 'RATS',
  empty: false,
  xpOnKill: 450,
  attack1DiceCount: 1,
  attack1DiceSides: 4,
  attack1SpecialChance: 25,
  attack1PoisonChance: 25,
  attack1PoisonStrength: 3,
  hpDiceCount: 4,
  hpDiceSides: 2,
  monsterClass: 1,
  monsterSubClass: 1,
  monsterLevel: 8,
  monsterLevelMax: 15,
  familyId: [6, 4, 14, 16],
  creatureKind: 4,
  monsterSex: 2,
  monsterAC: 3,
  specialAttackElement: 8,
  goldStat: 1,
};
FIXTURE_MONSTERS[1] = {
  ...emptyMonster(1),
  nameIdSingular: 'ZOMBIE',
  nameIdPlural: 'ZOMBIES',
  nameUnidSingular: 'CORPSE',
  nameUnidPlural: 'CORPSES',
  empty: false,
  xpOnKill: 2200,
  attack1DiceCount: 1,
  attack1DiceSides: 3,
  attack1SpecialChance: 80,
  hpDiceCount: 6,
  hpDiceSides: 6,
  monsterClass: 2,
  monsterSubClass: 1,
  monsterLevel: 10,
  monsterLevelMax: 10,
  familyId: [12, 12, 16, 12],
  creatureKind: 8,
  monsterSex: 2,
  monsterAC: 10,
  specialAttackElement: 5,
  monsterBehaviorClass: 2,
  goldStat: 20,
  saveTable: [15, 40, 30, 10, 5],
  effectChanceTable: [15, 40, 30, 10, 5],
};
FIXTURE_MONSTERS[2] = {
  ...emptyMonster(2),
  nameIdSingular: 'PIT FIEND',
  nameIdPlural: 'PIT FIENDS',
  nameUnidSingular: 'DEMON',
  nameUnidPlural: 'DEMONS',
  empty: false,
  xpOnKill: 56786,
  attack1DiceCount: 4,
  attack1DiceSides: 4,
  attack1SpecialChance: 75,
  hpDiceCount: 14,
  hpDiceSides: 4,
  monsterClass: 3,
  monsterSubClass: 1,
  monsterLevel: 12,
  monsterLevelMax: 12,
  familyId: [22, 16, 17, 17],
  creatureKind: 10,
  monsterSex: 2,
  monsterAC: 2,
  specialAttackElement: 1,
  goldStat: 140,
};
FIXTURE_MONSTERS[3] = {
  ...emptyMonster(3),
  nameIdSingular: 'WRAITH',
  nameIdPlural: 'WRAITHS',
  nameUnidSingular: 'SPIRIT',
  nameUnidPlural: 'SPIRITS',
  empty: false,
  xpOnKill: 8400,
  attack1DiceCount: 1,
  attack1DiceSides: 6,
  attack1SpecialChance: 100,
  attack1DrainChance: 100,
  hpDiceCount: 8,
  hpDiceSides: 6,
  monsterClass: 2,
  monsterSubClass: 3,
  monsterLevel: 16,
  monsterLevelMax: 16,
  familyId: [10, 12, 12, 12],
  creatureKind: 8,
  monsterSex: 2,
  monsterAC: -2,
  specialAttackElement: 11,
  monsterBehaviorClass: 2,
  goldStat: 80,
};
FIXTURE_MONSTERS[4] = {
  ...emptyMonster(4),
  nameIdSingular: 'FAERIE QUEEN',
  nameIdPlural: 'FAERIE QUEENS',
  nameUnidSingular: 'FAERIE',
  nameUnidPlural: 'FAERIES',
  empty: false,
  xpOnKill: 65535,
  attack1DiceCount: 2,
  attack1DiceSides: 10,
  attack1SpecialChance: 100,
  hpDiceCount: 20,
  hpDiceSides: 10,
  monsterClass: 4,
  monsterSubClass: 1,
  monsterLevel: 50,
  monsterLevelMax: 50,
  familyId: [99, 99, 99, 99],
  creatureKind: 5,
  monsterSex: 1,
  monsterAC: -6,
  specialAttackElement: 12,
  monsterBehaviorClass: 11,
  goldStat: 150,
};

const FIXTURE_SCENARIO_DB = { monsters: FIXTURE_MONSTERS };

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
