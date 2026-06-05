/**
 * maze-level.ts — CLI extractor for a dungeon level's cell map.
 *
 * Reads the maze-definition record from SCENARIO.DBS (bank 2, record=levelId),
 * decodes it into a MazeBlock via the pure decoder in @wiz6/parser, wraps it as
 * a DungeonLevel (validated against DungeonLevelSchema), and writes the result
 * to extracted/maze/level-<id>.json.
 *
 * Entrance for level 0: gy=121 (the first arrow-controllable frame, = committed
 * maze-corridor.state). gy=120 was a B3 mis-read — that frame is mid-scripted-walk,
 * not yet arrow-controllable. See docs/re/findings/maze-view-cases.json
 * entrance_discrepancy. For other levels, entrance defaults to {0,0,0,0}
 * until a live oracle is available.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { decodeMazeBlock, MAZE_BANK } from '@wiz6/parser';
import { DungeonLevelSchema, type DungeonLevel, type ScriptedEntry } from '@wiz6/data';
import { loadAssetDb, decodeAsset } from '../lib/asset-db.js';

export interface ExtractMazeLevelOpts {
  originalDir: string;
  outputPath: string;
  levelId: number;
}

export function extractMazeLevel(opts: ExtractMazeLevelOpts): DungeonLevel {
  const db = loadAssetDb(opts.originalDir);
  const record = decodeAsset(db, MAZE_BANK, opts.levelId);
  const mazeBlock = decodeMazeBlock(record);

  // Level-0 entrance: gy=121 (the first arrow-controllable frame).
  // B3 read gy=120 right after narration dismiss — but that frame is mid-scripted
  // gate-walk and is NOT arrow-controllable. The first steerable frame is gy=121
  // (= committed maze-corridor.state). Verified by the C1 arrow-BFS:
  // docs/re/findings/maze-view-cases.json → entrance_discrepancy.
  // Region 0, cellA=5, cellB=7 (gy-gyBase[0]=121-116=5, gx-gxBase[0]=127-120=7).
  // Other levels: entrance unknown; placeholder until a live oracle is available.
  const KNOWN_ENTRANCES: Record<number, { gx: number; gy: number; z: number; facing: number }> = {
    0: { gx: 127, gy: 121, z: 0, facing: 0 },
  };
  const entrance = KNOWN_ENTRANCES[opts.levelId] ?? { gx: 0, gy: 0, z: 0, facing: 0 };

  // Level-0 scripted entry: ENTERING title (gy=117) → 3-line narration (gy=118) →
  //   walk gy 119/120/121 → HMMMM front-wall bump (gy=121) → free control.
  // The TRUE start is gy=117 (the ENTERING/BANE-OF-THE-COSMIC-FORGE title-card frame);
  // the prior first pass started at gy=118 (narration) and missed the title frame.
  // 4 forward steps total (gy 117→121). titleMsgIds 1212/1213 = "ENTERING" /
  // "BANE OF THE COSMIC FORGE"; narrationMsgIds 10010/10011/10012 = "APPROACHING THE
  // GATE..."; bumpMsgId 10020 = "HMMMM...". RE: docs/re/findings/maze-newgame-byteexact.json
  // (per_enter_pin_addendum — live per-ENTER pin) + maze-entry-{narration,sequence}.json.
  const KNOWN_SCRIPTED_ENTRIES: Record<number, ScriptedEntry> = {
    0: {
      start: { gx: 127, gy: 117, z: 0, facing: 0 },
      steps: 4,
      titleMsgIds: [1212, 1213],
      narrationMsgIds: [10010, 10011, 10012],
      bumpMsgId: 10020,
    },
  };
  const scriptedEntry = KNOWN_SCRIPTED_ENTRIES[opts.levelId];

  const level: DungeonLevel = DungeonLevelSchema.parse({
    id: opts.levelId,
    entrance,
    mazeBlock,
    ...(scriptedEntry !== undefined ? { scriptedEntry } : {}),
  });

  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, JSON.stringify(level, null, 2));
  return level;
}
