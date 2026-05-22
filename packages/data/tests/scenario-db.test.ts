import { describe, expect, it } from 'vitest';
import {
  ScenarioDbSchema,
  ScenarioItemSchema,
  ScenarioMonsterSchema,
  ScenarioQuestDataSchema,
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
  extendedSaves: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  combatSpriteId: 0,
  combatSpriteAlt: 0,
  secondarySpriteId: 0,
  magicResistChance: 0,
  combatTraitId: 0,
  auxSave103: 0,
  spellPowerChance: 0,
  auxSave106: 0,
  flyEvadeChance: 0,
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
const validQuestDataBytes = Array(222).fill(0);
const emptyQuestData = (i: number) => ({
  index: i,
  names: ['', '', '', ''],
  rawBytes: validQuestDataBytes,
  empty: true,
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

  it('rejects when name1 exceeds 32 chars', () => {
    expect(() =>
      ScenarioItemSchema.parse({
        index: 0,
        name1: 'X'.repeat(33),
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

  it('rejects when name exceeds 32 chars', () => {
    expect(() =>
      ScenarioMonsterSchema.parse({
        ...emptyMonster(0),
        nameIdSingular: 'X'.repeat(33),
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
    monsterCount: 250,
    monsters: Array.from({ length: 250 }, (_, i) => emptyMonster(i)),
    questDataCount: 3,
    questData: Array.from({ length: 3 }, (_, i) => emptyQuestData(i)),
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

  it('rejects when monsters.length is not 250', () => {
    expect(() =>
      ScenarioDbSchema.parse({
        ...baseDb,
        monsters: baseDb.monsters.slice(0, 249),
        monsterCount: 249,
      }),
    ).toThrow();
  });

  it('rejects monsters not indexed sequentially from 0', () => {
    const bad = baseDb.monsters.map((m, i) => ({ ...m, index: i === 0 ? 99 : i }));
    expect(() => ScenarioDbSchema.parse({ ...baseDb, monsters: bad })).toThrow();
  });

  it('rejects when questDataCount mismatches questData.length', () => {
    expect(() => ScenarioDbSchema.parse({ ...baseDb, questDataCount: 2 })).toThrow();
  });

  it('rejects when questData.length is not 3', () => {
    expect(() =>
      ScenarioDbSchema.parse({
        ...baseDb,
        questData: baseDb.questData.slice(0, 2),
        questDataCount: 2,
      }),
    ).toThrow();
  });

  it('rejects questData not indexed sequentially from 0', () => {
    const bad = baseDb.questData.map((q, i) => ({ ...q, index: i === 0 ? 99 : i }));
    expect(() => ScenarioDbSchema.parse({ ...baseDb, questData: bad })).toThrow();
  });
});

describe('ScenarioQuestDataSchema', () => {
  it('accepts a valid quest-data record', () => {
    expect(() =>
      ScenarioQuestDataSchema.parse({
        index: 0,
        names: ['CAPTAIN MATEY', 'QUEEQUEG', '', ''],
        rawBytes: validQuestDataBytes,
        empty: false,
      }),
    ).not.toThrow();
  });

  it('rejects when rawBytes length is not 222', () => {
    expect(() =>
      ScenarioQuestDataSchema.parse({
        index: 0,
        names: ['', '', '', ''],
        rawBytes: Array(221).fill(0),
        empty: true,
      }),
    ).toThrow();
  });

  it('rejects when names length is not 4', () => {
    expect(() =>
      ScenarioQuestDataSchema.parse({
        index: 0,
        names: ['A', 'B', 'C'],
        rawBytes: validQuestDataBytes,
        empty: false,
      }),
    ).toThrow();
  });

  it('rejects when a name exceeds 32 chars', () => {
    expect(() =>
      ScenarioQuestDataSchema.parse({
        index: 0,
        names: ['X'.repeat(33), '', '', ''],
        rawBytes: validQuestDataBytes,
        empty: false,
      }),
    ).toThrow();
  });
});
