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
 */
import { resolve } from 'node:path';
import { loadAssetDb, decodeAsset, type AssetDb } from './decode-asset.js';

/** One cell of a region plane (the five engine sub-table fields). */
export interface MazeBlockCell {
  north: number; // 0..3 (2-bit)
  west: number; // 0..3
  special4: number; // 0..15 (4-bit)
  orient2: number; // 0..3
  pit: number; // 0..1
}

/** The full per-level maze block (region tables + 12 × 64-cell planes). */
export interface MazeBlock {
  gxBase: number[]; // 12 entries (maze_ptr+0x1e0)
  gyBase: number[]; // 12 entries (maze_ptr+0x1ec)
  regions: MazeBlockCell[][]; // regions[r][cellA*8 + cellB], 12 × 64
}

/** maze_block sub-table byte offsets (within the 1346-byte record). */
const MB = {
  north: 0x60,
  west: 0x120,
  special4: 0x1f8,
  orient2: 0x378,
  pit: 0x43a,
  gxBase: 0x1e0,
  gyBase: 0x1ec,
} as const;

const MAZE_BANK = 2;
const REGIONS = 12;
const CELLS_PER_REGION = 64;
const TOTAL_CELLS = REGIONS * CELLS_PER_REGION; // 768

/**
 * Read an `nbits`-wide field for `cell`, MSB-first, from the contiguous bit-plane
 * starting at `base` in the record. (Matches every maze-*-probe.ts getBits + the
 * engine's 3/4-bit field readers.)
 */
function getBits(buf: Uint8Array, base: number, cell: number, nbits: number): number {
  const bitOff = cell * nbits;
  let v = 0;
  for (let i = 0; i < nbits; i++) {
    const b = bitOff + i;
    const byte = buf[base + (b >> 3)] ?? 0;
    v = (v << 1) | ((byte >> (7 - (b & 7))) & 1);
  }
  return v;
}

/** Decode a verbatim 1346-byte maze-definition record into a MazeBlock. */
export function decodeMazeBlock(record: Uint8Array): MazeBlock {
  const gxBase = Array.from(record.slice(MB.gxBase, MB.gxBase + REGIONS));
  const gyBase = Array.from(record.slice(MB.gyBase, MB.gyBase + REGIONS));
  const regions: MazeBlockCell[][] = [];
  for (let r = 0; r < REGIONS; r++) {
    const cells: MazeBlockCell[] = [];
    for (let i = 0; i < CELLS_PER_REGION; i++) {
      const cell = r * CELLS_PER_REGION + i;
      cells.push({
        north: getBits(record, MB.north, cell, 2),
        west: getBits(record, MB.west, cell, 2),
        special4: getBits(record, MB.special4, cell, 4),
        orient2: getBits(record, MB.orient2, cell, 2),
        pit: getBits(record, MB.pit, cell, 1),
      });
    }
    regions.push(cells);
  }
  return { gxBase, gyBase, regions };
}

/**
 * Extract a dungeon level's cell map from the on-disk game files (no emulator).
 * levelId 0 = the starting dungeon (zone 0 / the committed maze-corridor frame).
 */
export function extractMazeLevel(levelId: number, db?: AssetDb): MazeBlock {
  const assets = db ?? loadAssetDb();
  const record = decodeAsset(assets, MAZE_BANK, levelId);
  return decodeMazeBlock(record);
}

export { MB, MAZE_BANK, REGIONS, CELLS_PER_REGION, TOTAL_CELLS, getBits };

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
