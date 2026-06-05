import { z } from 'zod';
import { MazeBlockSchema } from './render-schema.js';

// Global cell coords (= MazeParty without runtime fields); where START NEW GAME drops the party.
export const DungeonEntranceSchema = z.object({
  gx: z.number().int().min(0), gy: z.number().int().min(0),
  z: z.number().int().min(0), facing: z.number().int().min(0).max(3),
});
export type DungeonEntrance = z.infer<typeof DungeonEntranceSchema>;

export const DungeonLevelSchema = z.object({
  id: z.number().int().min(0),
  entrance: DungeonEntranceSchema,
  mazeBlock: MazeBlockSchema,
});
export type DungeonLevel = z.infer<typeof DungeonLevelSchema>;
