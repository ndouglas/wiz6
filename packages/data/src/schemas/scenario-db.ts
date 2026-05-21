import { z } from 'zod';

const XP_CLASS_COUNT = 14;
const XP_LEVELS_PER_CLASS = 16;
const ITEM_RECORD_BYTES = 74;
const ITEM_RECORD_COUNT = 500;

const xpLevels = z.array(z.number().int().nonnegative()).length(XP_LEVELS_PER_CLASS);

export const XpTableSchema = z.object({
  classIndex: z.number().int().nonnegative(),
  levels: xpLevels,
});

const itemBytes = z.array(z.number().int().min(0).max(255)).length(ITEM_RECORD_BYTES);

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
    unknownTail: z.array(z.number().int().min(0).max(255)),
  })
  .refine((d) => d.itemCount === d.items.length, {
    message: 'itemCount must equal items.length',
    path: ['itemCount'],
  })
  .refine((d) => d.items.every((it, i) => it.index === i), {
    message: 'items must be indexed sequentially from 0',
    path: ['items'],
  })
  .refine((d) => d.xpTables.every((t, i) => t.classIndex === i), {
    message: 'xpTables must be indexed sequentially from 0',
    path: ['xpTables'],
  });

export type XpTable = z.infer<typeof XpTableSchema>;
export type ScenarioItem = z.infer<typeof ScenarioItemSchema>;
export type ScenarioDb = z.infer<typeof ScenarioDbSchema>;
