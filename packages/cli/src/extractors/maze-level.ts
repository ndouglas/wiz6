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

  // Level-0 scripted entry: OUTER GATE (gy=118) → 3-line narration → 3 ENTER-steps → free (gy=121).
  // narrationMsgIds 10010/10011/10012 + bumpMsgId 10020 are the VERIFIED entry-narration
  // message IDs (decode exactly to "APPROACHING THE GATE..." / "HMMMM..."; gated byte-exact by
  // maze-entry-narration-parity.test.ts). RE: docs/re/findings/maze-entry-{narration,sequence}.json.
  const KNOWN_SCRIPTED_ENTRIES: Record<number, ScriptedEntry> = {
    0: {
      start: { gx: 127, gy: 118, z: 0, facing: 0 },
      steps: 3,
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
