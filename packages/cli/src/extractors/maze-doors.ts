/**
 * maze-doors.ts — CLI extractor for type-7 door records from the maze
 * special-record table (scenario.dbs bank 3).
 *
 * Reads bank-3 record <levelId> (identity mapping: level N → bank-3 record N),
 * decodes all type-7 door entries via the pure decoder in @wiz6/parser, and
 * writes them as an array of DoorRecord to extracted/maze/doors.json.
 *
 * gxBase / gyBase are derived from the level's MazeBlock (bank-2 record
 * <levelId>) so there is no per-level hardcoding. Level 0's bases are
 * [120,128,120,128,120,128,10,18,10,18,26,26] / [116,116,124,124,132,132,10,10,18,18,10,18]
 * — consistent with the committed test (door-record.test.ts).
 *
 * Output shape: DoorRecord[] (array, not keyed — level 0 is the only shipped
 * level; extend to a Record<string,DoorRecord[]> when multi-level is needed).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { decodeMazeBlock, MAZE_BANK, decodeDoorRecords, SPECIAL_RECORD_BANK } from '@wiz6/parser';
import { DoorRecordSchema, type DoorRecord } from '@wiz6/data';
import { loadAssetDb, decodeAsset } from '../lib/asset-db.js';

export interface ExtractMazeDoorsOpts {
  originalDir: string;
  outputPath: string;
  /** Maze level id (identity-maps to both bank-2 and bank-3 record index). */
  levelId: number;
}

export function extractMazeDoors(opts: ExtractMazeDoorsOpts): DoorRecord[] {
  const db = loadAssetDb(opts.originalDir);

  // Derive gxBase/gyBase from the maze-definition record (bank 2, same levelId).
  const mazeRecord = decodeAsset(db, MAZE_BANK, opts.levelId);
  const mazeBlock = decodeMazeBlock(mazeRecord);

  // Decode type-7 doors from the special-record buffer (bank 3, same levelId).
  const specialRecord = decodeAsset(db, SPECIAL_RECORD_BANK, opts.levelId);
  const doors = decodeDoorRecords(specialRecord, mazeBlock.gxBase, mazeBlock.gyBase);

  // Validate against schema before writing.
  const validated = DoorRecordSchema.array().parse(doors);

  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, JSON.stringify(validated, null, 2));
  return validated;
}
