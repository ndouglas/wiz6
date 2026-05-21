import { describe, expect, it } from 'vitest';
import {
  ScenarioDbSchema,
  ScenarioItemSchema,
  ScenarioMonsterSchema,
  XpTableSchema,
} from '../src/schemas/scenario-db.js';

const validBytes = Array(74).fill(0);
const validMonsterStatBytes = Array(158).fill(0);
const validLevels = Array(16).fill(0);
const baseItemFields = {
  price: 0,
  hitBonus: 0,
  damageDiceCount: 0,
  damageDiceSides: 0,
  spellOrSongId: 0,
  weight: 0,
  classMask: 0,
  equipSlot: 0,
};
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
};
const emptyMonster = (i: number) => ({
  index: i,
  nameIdSingular: '',
  nameIdPlural: '',
  nameUnidSingular: '',
  nameUnidPlural: '',
  statBytes: validMonsterStatBytes,
  empty: true,
  ...baseMonsterFields,
});

describe('XpTableSchema', () => {
  it('accepts a valid XP table', () => {
    expect(() => XpTableSchema.parse({ classIndex: 0, levels: validLevels })).not.toThrow();
  });

  it('rejects when levels length is not 16', () => {
    expect(() => XpTableSchema.parse({ classIndex: 0, levels: Array(15).fill(0) })).toThrow();
  });

  it('rejects negative XP values', () => {
    const bad = [...validLevels];
    bad[0] = -1;
    expect(() => XpTableSchema.parse({ classIndex: 0, levels: bad })).toThrow();
  });
});

describe('ScenarioItemSchema', () => {
  it('accepts a valid item', () => {
    expect(() =>
      ScenarioItemSchema.parse({
        index: 0,
        name1: 'DAGGER',
        name2: '',
        bytes: validBytes,
        empty: false,
        ...baseItemFields,
      }),
    ).not.toThrow();
  });

  it('rejects when bytes length is not 74', () => {
    expect(() =>
      ScenarioItemSchema.parse({
        index: 0,
        name1: '',
        name2: '',
        bytes: Array(73).fill(0),
        empty: true,
        ...baseItemFields,
      }),
    ).toThrow();
  });

  it('rejects when name1 exceeds 15 chars', () => {
    expect(() =>
      ScenarioItemSchema.parse({
        index: 0,
        name1: 'X'.repeat(16),
        name2: '',
        bytes: validBytes,
        empty: false,
        ...baseItemFields,
      }),
    ).toThrow();
  });

  it('rejects when price exceeds u16 range', () => {
    expect(() =>
      ScenarioItemSchema.parse({
        index: 0,
        name1: 'X',
        name2: '',
        bytes: validBytes,
        empty: false,
        ...baseItemFields,
        price: 70000,
      }),
    ).toThrow();
  });
});

describe('ScenarioMonsterSchema', () => {
  it('accepts a valid monster', () => {
    expect(() =>
      ScenarioMonsterSchema.parse({
        index: 0,
        nameIdSingular: 'GIANT RAT',
        nameIdPlural: 'GIANT RATS',
        nameUnidSingular: 'RAT',
        nameUnidPlural: 'RATS',
        statBytes: validMonsterStatBytes,
        empty: false,
        ...baseMonsterFields,
      }),
    ).not.toThrow();
  });

  it('rejects when xpOnKill exceeds u16 range', () => {
    expect(() =>
      ScenarioMonsterSchema.parse({
        ...emptyMonster(0),
        xpOnKill: 70000,
      }),
    ).toThrow();
  });

  it('rejects when statBytes length is not 158', () => {
    expect(() =>
      ScenarioMonsterSchema.parse({
        ...emptyMonster(0),
        statBytes: Array(157).fill(0),
      }),
    ).toThrow();
  });

  it('rejects when name exceeds 15 chars', () => {
    expect(() =>
      ScenarioMonsterSchema.parse({
        ...emptyMonster(0),
        nameIdSingular: 'X'.repeat(16),
      }),
    ).toThrow();
  });
});

describe('ScenarioDbSchema', () => {
  const baseDb = {
    id: 'scenario',
    sourceFile: 'scenario.dbs',
    xpTables: Array.from({ length: 14 }, (_, i) => ({ classIndex: i, levels: validLevels })),
    itemCount: 1,
    items: [{ index: 0, name1: 'BROKEN ITEM', name2: '', bytes: validBytes, empty: false, ...baseItemFields }],
    unknownPreMonster: [],
    monsterCount: 253,
    monsters: Array.from({ length: 253 }, (_, i) => emptyMonster(i)),
    unknownTail: [],
  };

  it('accepts a valid db', () => {
    expect(() => ScenarioDbSchema.parse(baseDb)).not.toThrow();
  });

  it('rejects when itemCount mismatches items.length', () => {
    expect(() => ScenarioDbSchema.parse({ ...baseDb, itemCount: 2 })).toThrow();
  });

  it('rejects items not indexed sequentially from 0', () => {
    expect(() =>
      ScenarioDbSchema.parse({
        ...baseDb,
        itemCount: 2,
        items: [
          { index: 0, name1: 'A', name2: '', bytes: validBytes, empty: false, ...baseItemFields },
          { index: 5, name1: 'B', name2: '', bytes: validBytes, empty: false, ...baseItemFields },
        ],
      }),
    ).toThrow();
  });

  it('rejects xpTables not indexed sequentially from 0', () => {
    const bad = baseDb.xpTables.map((t, i) => ({ classIndex: i === 0 ? 99 : i, levels: t.levels }));
    expect(() => ScenarioDbSchema.parse({ ...baseDb, xpTables: bad })).toThrow();
  });

  it('rejects when xpTables.length is not 14', () => {
    expect(() =>
      ScenarioDbSchema.parse({ ...baseDb, xpTables: baseDb.xpTables.slice(0, 13) }),
    ).toThrow();
  });

  it('rejects when monsterCount mismatches monsters.length', () => {
    expect(() => ScenarioDbSchema.parse({ ...baseDb, monsterCount: 100 })).toThrow();
  });

  it('rejects when monsters.length is not 253', () => {
    expect(() =>
      ScenarioDbSchema.parse({
        ...baseDb,
        monsters: baseDb.monsters.slice(0, 252),
        monsterCount: 252,
      }),
    ).toThrow();
  });

  it('rejects monsters not indexed sequentially from 0', () => {
    const bad = baseDb.monsters.map((m, i) => ({ ...m, index: i === 0 ? 99 : i }));
    expect(() => ScenarioDbSchema.parse({ ...baseDb, monsters: bad })).toThrow();
  });
});
