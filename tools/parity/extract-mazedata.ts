/**
 * extract-mazedata.ts — offline (no-emulator) decoder for the per-level maze
 * CELL MAP, producing the exact `MazeBlock` shape `renderMazeViewport` consumes.
 *
 * RE RESULT (Task A1, 2026-06-05). The starting dungeon level's cell map is a
 * PLAIN, UNCOMPRESSED record of SCENARIO.DBS, addressed by the SAME (bank,
 * recordIndex) bank reader the floor/ceiling images use (docs/re/findings/
 * maze-asset-loader.json). The maze DEFINITION record is:
 *
 *     scenario.dbs[ base[2] + recordIndex*recsize[2] .. +recsize[2] ]
 *     = bank 2, record `levelId`   (recsize[2] = 1346 bytes)
 *
 * The 1346-byte record is loaded VERBATIM into the wmaze near-heap block at
 * DGROUP `*0x4faa` (the "maze_block" near ptr of the classify findings — the same
 * buffer the asset-loader pass labelled the "floor near-buffer"; both are 1346 B
 * because the maze record and the floor record are the SAME bank-2 record size).
 *
 * The MazeBlock fields are bit-planes within the record, at the offsets the
 * classify findings pinned (maze-classify-projection.json / -gating.json):
 *   N        +0x60  (2 bits/cell, MSB-first)   wall north
 *   W        +0x120 (2 bits/cell)              wall west
 *   special4 +0x1f8 (4 bits/cell)              decoration code
 *   orient2  +0x378 (2 bits/cell)              door/recess orientation
 *   pit      +0x43a (1 bit/cell)               pit flag
 *   gxBase   +0x1e0 (12 bytes)                 region-X base table
 *   gyBase   +0x1ec (12 bytes)                 region-Y base table
 * Cell index = region*64 + cellA*8 + cellB (cellA = ×8 axis, cellB = ×1 axis).
 * 12 regions × 64 cells = 768 cells. Highest plane byte = pit end 0x43a+96 = 0x49a
 * (= 1178), well within the 1346-byte record.
 *
 * VALIDATION: extractMazeLevel(0) === the live in-RAM MazeBlock read from
 * `*0x4faa` in maze-corridor.state — 0 diffs across all 12 region planes
 * (N/W/special4/orient2/pit) AND both region tables. See validate-maze-level.ts.
 *
 * Anchors:
 *   - wroot FUN_0882 (Ghidra 0x10882): the lseek/read bank reader (thunk 0xC31E).
 *   - wmaze 0x42..0xc3: lazy-malloc of the 1346-byte block into *0x4faa.
 *   - wmaze 0x357a/0x35b7: the gxBase(+0x1e0)/gyBase(+0x1ec) region resolver.
 *   - DGROUP 0x4faa (maze_block near ptr), 0x363c (current level/zone index).
 *
 * CAVEAT (level→record mapping): only level 0 has a live oracle (maze-corridor.
 * state is zone 0). extractMazeLevel uses record == levelId, which is byte-exact
 * for level 0. Bank 2 holds 16 records; records 2..13 are the floor IMAGES
 * (zones 0..11, per maze-asset-loader.json), so the maze-DEFINITION records are
 * 0/1 (and 14/15). The general per-level record map (whether higher levels reuse
 * the same record-0 layout or live in other records) is UNVERIFIED without a
 * second-level oracle — flagged for follow-up when a deeper-level state exists.
 *
 * NOTE (DRY): the pure decoder (decodeMazeBlock / getBits / constants) now lives
 * in packages/parser/src/maze/maze-block.ts and is re-exported from @wiz6/parser.
 * This file keeps the file-I/O wrapper (loadAssetDb / decodeAsset) local to the
 * parity tooling and re-exports the pure decoder for the validate script.
 */
import { resolve } from 'node:path';
import { loadAssetDb, decodeAsset, type AssetDb } from './decode-asset.js';
import {
  decodeMazeBlock,
  MAZE_BANK,
  CELLS_PER_REGION,
  TOTAL_CELLS,
} from '../../packages/parser/src/maze/maze-block.js';
import type { MazeBlock, MazeBlockCell } from '../../packages/data/src/index.js';

export type { MazeBlock, MazeBlockCell };
export { decodeMazeBlock };

/**
 * Extract a dungeon level's cell map from the on-disk game files (no emulator).
 * levelId 0 = the starting dungeon (zone 0 / the committed maze-corridor frame).
 */
export function extractMazeLevel(levelId: number, db?: AssetDb): MazeBlock {
  const assets = db ?? loadAssetDb();
  const record = decodeAsset(assets, MAZE_BANK, levelId);
  return decodeMazeBlock(record);
}

if (process.argv[1]?.endsWith('extract-mazedata.ts')) {
  const dir = process.argv[3] ?? 'test-fixtures/original';
  const levelId = Number(process.argv[2] ?? 0);
  const db = loadAssetDb(resolve(dir));
  const block = extractMazeLevel(levelId, db);
  let nz = 0;
  for (const region of block.regions)
    for (const c of region)
      if (c.north || c.west || c.special4 || c.orient2 || c.pit) nz++;
  console.log(`level ${levelId} (bank ${MAZE_BANK} record ${levelId}):`);
  console.log(`  gxBase = [${block.gxBase.join(', ')}]`);
  console.log(`  gyBase = [${block.gyBase.join(', ')}]`);
  console.log(`  regions = ${block.regions.length} × ${CELLS_PER_REGION} cells; ${nz}/${TOTAL_CELLS} non-empty`);
}
