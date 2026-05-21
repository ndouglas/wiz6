import { z } from 'zod';

const XP_CLASS_COUNT = 14;
const XP_LEVELS_PER_CLASS = 16;
const ITEM_RECORD_BYTES = 74;
const ITEM_RECORD_COUNT = 500;

const MONSTER_STAT_BYTES = 158;
const MONSTER_RECORD_COUNT = 250;
const QUEST_DATA_RECORD_COUNT = 3;
const QUEST_DATA_RECORD_BYTES = 222;

const xpLevels = z.array(z.number().int().nonnegative()).length(XP_LEVELS_PER_CLASS);

export const XpTableSchema = z.object({
  classIndex: z.number().int().nonnegative(),
  levels: xpLevels,
});

const itemBytes = z.array(z.number().int().min(0).max(255)).length(ITEM_RECORD_BYTES);
const monsterStatBytes = z.array(z.number().int().min(0).max(255)).length(MONSTER_STAT_BYTES);
const questDataBytes = z.array(z.number().int().min(0).max(255)).length(QUEST_DATA_RECORD_BYTES);

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
  monsterAC: z.number().int().min(-128).max(127),
  attributeSaves: z.array(z.number().int().min(0).max(255)).length(4),
  goldStat: z.number().int().min(0).max(255),
  specialAttackElement: z.number().int().min(0).max(255),
  monsterBehaviorClass: z.number().int().min(0).max(255),
  attack1Extra: z.array(z.number().int().min(0).max(255)).length(2),
  attack2Extra: z.array(z.number().int().min(0).max(255)).length(2),
  attack3Extra: z.array(z.number().int().min(0).max(255)).length(2),
  attack1PoisonChance: z.number().int().min(0).max(255),
  attack1DrainChance: z.number().int().min(0).max(255),
  attack1StunChance: z.number().int().min(0).max(255),
  attack2PoisonChance: z.number().int().min(0).max(255),
  attack2DrainChance: z.number().int().min(0).max(255),
  attack2StunChance: z.number().int().min(0).max(255),
  attack3PoisonChance: z.number().int().min(0).max(255),
  attack3DrainChance: z.number().int().min(0).max(255),
  attack3StunChance: z.number().int().min(0).max(255),
  attack1HpDrainChance: z.number().int().min(0).max(255),
  attack1AgeChance: z.number().int().min(0).max(255),
  attack1DecapitateChance: z.number().int().min(0).max(255),
  attack2HpDrainChance: z.number().int().min(0).max(255),
  attack2AgeChance: z.number().int().min(0).max(255),
  attack2DecapitateChance: z.number().int().min(0).max(255),
  attack3HpDrainChance: z.number().int().min(0).max(255),
  attack3AgeChance: z.number().int().min(0).max(255),
  attack3DecapitateChance: z.number().int().min(0).max(255),
  attack1Style: z.number().int().min(0).max(255),
  attack1DamageBonus: z.number().int().min(0).max(255),
  attack2Style: z.number().int().min(0).max(255),
  attack2DamageBonus: z.number().int().min(0).max(255),
  attack3Style: z.number().int().min(0).max(255),
  attack3DamageBonus: z.number().int().min(0).max(255),
  attack1PoisonStrength: z.number().int().min(0).max(255),
  attack2PoisonStrength: z.number().int().min(0).max(255),
  attack3PoisonStrength: z.number().int().min(0).max(255),
  extendedSaves: z.array(z.number().int().min(0).max(255)).length(12),
  combatSpriteId: z.number().int().min(0).max(255),
  combatSpriteAlt: z.number().int().min(0).max(255),
  secondarySpriteId: z.number().int().min(0).max(255),
  magicResistChance: z.number().int().min(0).max(255),
  combatTraitId: z.number().int().min(0).max(255),
  auxSave103: z.number().int().min(0).max(255),
  spellPowerChance: z.number().int().min(0).max(255),
  auxSave106: z.number().int().min(0).max(255),
  flyEvadeChance: z.number().int().min(0).max(255),
});

// The last three records of the monster table (file-level indices 250-252)
// are not combat monsters — they reuse the 222-byte record layout for
// embedded NPC / quest / minigame data. See docs/re/scenario-dbs.md.
export const ScenarioQuestDataSchema = z.object({
  index: z.number().int().nonnegative(),
  names: z.array(z.string().max(15)).length(4),
  rawBytes: questDataBytes,
  empty: z.boolean(),
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
    questDataCount: z.number().int().nonnegative(),
    questData: z.array(ScenarioQuestDataSchema).length(QUEST_DATA_RECORD_COUNT),
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
  .refine((d) => d.questDataCount === d.questData.length, {
    message: 'questDataCount must equal questData.length',
    path: ['questDataCount'],
  })
  .refine((d) => d.questData.every((q, i) => q.index === i), {
    message: 'questData must be indexed sequentially from 0',
    path: ['questData'],
  })
  .refine((d) => d.xpTables.every((t, i) => t.classIndex === i), {
    message: 'xpTables must be indexed sequentially from 0',
    path: ['xpTables'],
  });

export type XpTable = z.infer<typeof XpTableSchema>;
export type ScenarioItem = z.infer<typeof ScenarioItemSchema>;
export type ScenarioMonster = z.infer<typeof ScenarioMonsterSchema>;
export type ScenarioQuestData = z.infer<typeof ScenarioQuestDataSchema>;
export type ScenarioDb = z.infer<typeof ScenarioDbSchema>;
