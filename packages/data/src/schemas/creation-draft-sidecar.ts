import { z } from 'zod';

/**
 * Creation-draft sidecar — the engine's decoded in-creation draft character,
 * captured at a fixture waypoint via `LiveSession.dumpDraft()` and committed
 * alongside the framebuffer fixture as `<name>.character.json`.
 *
 * Why: creation rolls are non-deterministic run-to-run, so a creation fixture
 * is re-minted by `unserialize`+`fb` of a pinned `.state` rather than recipe
 * replay. The parity test must render the SAME rolled character the fixture
 * shows — so we commit the engine's decode here and feed it to the composer via
 * `draftFromEngineDump`, instead of hardcoding RE'd stats that go stale.
 *
 * Shape mirrors `dumpDraft()`: `{ draft: <character_record subset>, bonusPool }`.
 * The record fields are the subset the char-sheet renderer consumes (snake_case
 * to match the `character_record` BssStruct decode).
 */

const U8 = z.number().int().min(0).max(255);
const U16 = z.number().int().min(0).max(0xffff);
const U32 = z.number().int().min(0).max(0xffffffff);

export const CreationDraftRecordSchema = z.object({
  name: z.string(),
  race: U8,
  sex: U8,
  class: U8,
  /** [str, int, pie, vit, dex, spd, per, kar] */
  attributes: z.array(U8).length(8),
  rendered_portrait_index: U8,
  /** Age in game-days (u32). */
  age_counter: U32,
  hp_cur: U16,
  hp_max: U16,
  sp_cur: U16,
  sp_max: U16,
  level: U16,
  level_secondary: U16,
  skills: z.array(U8).length(30),
  xp: U32,
  encumbrance_max: U16,
});

export const CreationDraftSidecarSchema = z.object({
  draft: CreationDraftRecordSchema,
  /** Remaining bonus pool (engine u16 at DGROUP 0x56ac). */
  bonusPool: U16,
});

export type CreationDraftRecord = z.infer<typeof CreationDraftRecordSchema>;
export type CreationDraftSidecar = z.infer<typeof CreationDraftSidecarSchema>;
