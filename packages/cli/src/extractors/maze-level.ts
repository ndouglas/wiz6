/**
 * maze-level.ts — CLI extractor for a dungeon level's cell map.
 *
 * Reads the maze-definition record from SCENARIO.DBS (bank 2, record=levelId),
 * decodes it into a MazeBlock via the pure decoder in @wiz6/parser, wraps it as
 * a DungeonLevel (validated against DungeonLevelSchema), and writes the result
 * to extracted/maze/level-<id>.json.
 *
 * Entrance for level 0: discovered via live engine drive in Task B3 (gx=127,
 * gy=120, z=0, facing=0). For other levels, entrance defaults to {0,0,0,0}
 * until a live oracle is available.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { decodeMazeBlock, MAZE_BANK } from '@wiz6/parser';
import { DungeonLevelSchema, type DungeonLevel } from '@wiz6/data';
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

  // Level-0 entrance: discovered via live engine drive in Task B3.
  // Fresh START NEW GAME → scenario pick → dungeon loads → party placed at
  // gx=127, gy=120, z=0, facing=0 (DGROUP 0x4fa4/0x4fa2/0x4f9c/0x4f9a).
  // Verified: resolves to Region 0, cellA=4, cellB=7 in the MazeBlock.
  // Other levels: entrance unknown; placeholder until a live oracle is available.
  const KNOWN_ENTRANCES: Record<number, { gx: number; gy: number; z: number; facing: number }> = {
    0: { gx: 127, gy: 120, z: 0, facing: 0 },
  };
  const entrance = KNOWN_ENTRANCES[opts.levelId] ?? { gx: 0, gy: 0, z: 0, facing: 0 };

  const level: DungeonLevel = DungeonLevelSchema.parse({
    id: opts.levelId,
    entrance,
    mazeBlock,
  });

  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, JSON.stringify(level, null, 2));
  return level;
}
