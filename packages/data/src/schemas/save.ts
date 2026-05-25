import { z } from 'zod';
import { PartyMemberSchema } from './character.js';

/**
 * Versioned save document. Persisted in localStorage at `wiz6:save:0`..`wiz6:save:5`.
 * Self-contained — embeds full PartyMember snapshots. The optional
 * `rosterCharacterId` on each member lets the engine sync state changes
 * back to the roster on save / end-of-game.
 */
const U16 = z.number().int().min(0).max(0xffff);

/**
 * Party position. Mirrors `packages/data/src/structs/position-state.ts`:
 *   - `zone` ↔ engine `level_z` / save_zone (current overworld + dungeon-level id)
 *   - `level` ↔ engine zone bytes (dungeon floor index within zone)
 *   - `x, y` ↔ engine local cell coords
 *   - `globalX, globalY` ↔ engine global coords (used by the automap)
 *   - `facing` ↔ player-facing 0..3 (N/E/S/W)
 */
export const PositionSchema = z.object({
  zone: U16,
  level: U16,
  x: U16,
  y: U16,
  globalX: U16,
  globalY: U16,
  facing: z.number().int().min(0).max(3),
});

/**
 * Maze state — open doors, disarmed traps, looted chests, encounter cooldowns.
 * Abstract `record<string, unknown>` for v1; refine as the wmaze RE pass
 * resolves the byte layout. (Schema-evolution risk is low because saves are
 * never replayed against a different schema version — they round-trip JSON.)
 */
export const MazeStateSchema = z.record(z.string(), z.unknown());

/**
 * Scenario flags — quest progression bitfields, NPC dialogue state,
 * scripted-event triggers. Same v1 simplification as MazeStateSchema.
 */
export const ScenarioFlagsSchema = z.record(z.string(), z.unknown());

export const SaveMetadataSchema = z.object({
  slotName: z.string().min(1),
  timestamp: z.string().datetime(),
  portVersion: z.string().min(1),
  /** Advisory RNG seed. NOT load-bearing — gameplay PRNG continues from
   *  whatever state it's in on load. Reserved for deterministic-replay tooling. */
  rngSeed: z.number().int().optional(),
});

export const SaveSchema = z.object({
  schemaVersion: z.literal(1),
  metadata: SaveMetadataSchema,
  party: z.array(PartyMemberSchema).max(6),
  position: PositionSchema,
  scenarioFlags: ScenarioFlagsSchema,
  mazeState: MazeStateSchema,
});

export type Position = z.infer<typeof PositionSchema>;
export type MazeState = z.infer<typeof MazeStateSchema>;
export type ScenarioFlags = z.infer<typeof ScenarioFlagsSchema>;
export type SaveMetadata = z.infer<typeof SaveMetadataSchema>;
export type Save = z.infer<typeof SaveSchema>;
