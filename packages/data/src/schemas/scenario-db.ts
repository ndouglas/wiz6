import { z } from 'zod';

const XP_CLASS_COUNT = 14;
const XP_LEVELS_PER_CLASS = 16;
const ITEM_RECORD_BYTES = 74;
const ITEM_RECORD_COUNT = 500;

const MONSTER_STAT_BYTES = 158;
const MONSTER_RECORD_COUNT = 253;

const xpLevels = z.array(z.number().int().nonnegative()).length(XP_LEVELS_PER_CLASS);

export const XpTableSchema = z.object({
  classIndex: z.number().int().nonnegative(),
  levels: xpLevels,
});

const itemBytes = z.array(z.number().int().min(0).max(255)).length(ITEM_RECORD_BYTES);
const monsterStatBytes = z.array(z.number().int().min(0).max(255)).length(MONSTER_STAT_BYTES);

export const ScenarioMonsterSchema = z.object({
  index: z.number().int().nonnegative(),
  nameIdSingular: z.string().max(15),
  nameIdPlural: z.string().max(15),
  nameUnidSingular: z.string().max(15),
  nameUnidPlural: z.string().max(15),
  statBytes: monsterStatBytes,
  empty: z.boolean(),
  xpOnKill: z.number().int().min(0).max(0xffff),
  attack1DiceCount: z.number().int().min(0).max(255),
  attack1DiceSides: z.number().int().min(0).max(255),
  attack1SpecialChance: z.number().int().min(0).max(255),
  attack2DiceCount: z.number().int().min(0).max(255),
  attack2DiceSides: z.number().int().min(0).max(255),
  attack2SpecialChance: z.number().int().min(0).max(255),
  attack3DiceCount: z.number().int().min(0).max(255),
  attack3DiceSides: z.number().int().min(0).max(255),
  attack3SpecialChance: z.number().int().min(0).max(255),
  groupDiceCount: z.number().int().min(0).max(255),
  groupDiceSides: z.number().int().min(0).max(255),
  hpDiceCount: z.number().int().min(0).max(255),
  hpDiceSides: z.number().int().min(0).max(255),
  monsterClass: z.number().int().min(0).max(255),
  monsterSubClass: z.number().int().min(0).max(255),
  saveTable: z.array(z.number().int().min(0).max(255)).length(5),
  effectChanceTable: z.array(z.number().int().min(0).max(255)).length(5),
  monsterLevel: z.number().int().min(0).max(255),
  monsterLevelMax: z.number().int().min(0).max(255),
  familyId: z.array(z.number().int().min(0).max(255)).length(4),
  creatureKind: z.number().int().min(0).max(255),
  monsterSex: z.number().int().min(0).max(255),
  moveStat: z.number().int().min(0).max(255),
  spriteGroup: z.number().int().min(0).max(255),
});

export const ScenarioItemSchema = z.object({
  index: z.number().int().nonnegative(),
  name1: z.string().max(15),
  name2: z.string().max(15),
  bytes: itemBytes,
  empty: z.boolean(),
  price: z.number().int().min(0).max(0xffff),
  hitBonus: z.number().int().min(0).max(255),
  damageDiceCount: z.number().int().min(0).max(255),
  damageDiceSides: z.number().int().min(0).max(255),
  spellOrSongId: z.number().int().min(0).max(0xffff),
  weight: z.number().int().min(0).max(255),
  classMask: z.number().int().min(0).max(0xffff),
  equipSlot: z.number().int().min(0).max(255),
});

export const ScenarioDbSchema = z
  .object({
    id: z.string().min(1),
    sourceFile: z.string().min(1),
    xpTables: z.array(XpTableSchema).length(XP_CLASS_COUNT),
    itemCount: z.number().int().positive(),
    items: z.array(ScenarioItemSchema),
    unknownPreMonster: z.array(z.number().int().min(0).max(255)),
    monsterCount: z.number().int().nonnegative(),
    monsters: z.array(ScenarioMonsterSchema).length(MONSTER_RECORD_COUNT),
    unknownTail: z.array(z.number().int().min(0).max(255)),
  })
  .refine((d) => d.itemCount === d.items.length, {
    message: 'itemCount must equal items.length',
    path: ['itemCount'],
  })
  .refine((d) => d.monsterCount === d.monsters.length, {
    message: 'monsterCount must equal monsters.length',
    path: ['monsterCount'],
  })
  .refine((d) => d.items.every((it, i) => it.index === i), {
    message: 'items must be indexed sequentially from 0',
    path: ['items'],
  })
  .refine((d) => d.monsters.every((m, i) => m.index === i), {
    message: 'monsters must be indexed sequentially from 0',
    path: ['monsters'],
  })
  .refine((d) => d.xpTables.every((t, i) => t.classIndex === i), {
    message: 'xpTables must be indexed sequentially from 0',
    path: ['xpTables'],
  });

export type XpTable = z.infer<typeof XpTableSchema>;
export type ScenarioItem = z.infer<typeof ScenarioItemSchema>;
export type ScenarioMonster = z.infer<typeof ScenarioMonsterSchema>;
export type ScenarioDb = z.infer<typeof ScenarioDbSchema>;
