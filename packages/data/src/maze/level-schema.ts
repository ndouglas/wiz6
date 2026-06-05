import { z } from 'zod';
import { MazeBlockSchema } from './render-schema.js';

// Global cell coords (= MazeParty without runtime fields); where START NEW GAME drops the party.
export const DungeonEntranceSchema = z.object({
  gx: z.number().int().min(0), gy: z.number().int().min(0),
  z: z.number().int().min(0), facing: z.number().int().min(0).max(3),
});
export type DungeonEntrance = z.infer<typeof DungeonEntranceSchema>;

// Scripted entry sequence: narration → gate-walk → free control.
// narrationMsgIds: message IDs shown on the bottom strip before ENTER is accepted.
// bumpMsgId: message shown if the player tries to move during narration/gate-walk.
// steps: number of ENTER-key forward steps before the party reaches free-control position.
export const ScriptedEntrySchema = z.object({
  start: DungeonEntranceSchema,
  steps: z.number().int().nonnegative(),
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
