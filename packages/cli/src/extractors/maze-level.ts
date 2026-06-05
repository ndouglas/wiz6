/**
 * maze-level.ts — CLI extractor for a dungeon level's cell map.
 *
 * Reads the maze-definition record from SCENARIO.DBS (bank 2, record=levelId),
 * decodes it into a MazeBlock via the pure decoder in @wiz6/parser, wraps it as
 * a DungeonLevel (validated against DungeonLevelSchema), and writes the result
 * to extracted/maze/level-<id>.json.
 *
 * Entrance is a PLACEHOLDER ({gx:0,gy:0,z:0,facing:0}) — the real START NEW GAME
 * entry point will be discovered and committed in Task B3 once the game session
 * drive confirms the actual spawn cell.
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

  const level: DungeonLevel = DungeonLevelSchema.parse({
    id: opts.levelId,
    // PLACEHOLDER: real entrance discovered in Task B3 via live engine drive.
    entrance: { gx: 0, gy: 0, z: 0, facing: 0 },
    mazeBlock,
  });

  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, JSON.stringify(level, null, 2));
  return level;
}
