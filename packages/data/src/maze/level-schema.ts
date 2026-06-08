import { z } from 'zod';
import { MazeBlockSchema } from './render-schema.js';

// Global cell coords (= MazeParty without runtime fields); where START NEW GAME drops the party.
export const DungeonEntranceSchema = z.object({
  gx: z.number().int().min(0), gy: z.number().int().min(0),
  z: z.number().int().min(0), facing: z.number().int().min(0).max(3),
});
export type DungeonEntrance = z.infer<typeof DungeonEntranceSchema>;

// Scripted entry cutscene (timed auto-push): door-open → title → approach1 →
// gate1-open → walk → approach2 → gate2-open → free control. See entry-sequence.ts.
// titleMsgIds:    message IDs for the "ENTERING / <scenario>" title-card (blue on gray
//                 widget) shown at the start position (gy=117) before the dungeon loads.
// narrationMsgIds: message IDs shown on the black strip at the approach1 beat (gy=118,
//                 "APPROACHING THE GATE...").
// bumpMsgId:      message shown at the approach2 beat (gy=120, "HMMM...").
// steps:          number of forward steps from `start` to the final cell
//                 (gy 117 → 121 = 4 steps).
export const ScriptedEntrySchema = z.object({
  start: DungeonEntranceSchema,
  steps: z.number().int().nonnegative(),
  titleMsgIds: z.array(z.number().int()),
  narrationMsgIds: z.array(z.number().int()),
  bumpMsgId: z.number().int(),
});
export type ScriptedEntry = z.infer<typeof ScriptedEntrySchema>;

export const DungeonLevelSchema = z.object({
  id: z.number().int().min(0),
  entrance: DungeonEntranceSchema,
  mazeBlock: MazeBlockSchema,
  scriptedEntry: ScriptedEntrySchema.optional(),
});
export type DungeonLevel = z.infer<typeof DungeonLevelSchema>;
