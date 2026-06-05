/**
 * maze-block.ts — pure decoder for the per-level maze cell map (MazeBlock).
 *
 * Ported from tools/parity/extract-mazedata.ts (RE result, Task A1 2026-06-05).
 * This module is I/O-free: callers supply the verbatim 1346-byte record buffer.
 * The CLI extractor (packages/cli/src/extractors/maze-level.ts) handles reading
 * the record from scenario.dbs via the bank-reader; parity tooling does likewise
 * via tools/parity/decode-asset.ts.
 *
 * Layout (from docs/re/findings/maze-classify-projection.json and gating.json):
 *   N        +0x60  (2 bits/cell, MSB-first)   wall north
 *   W        +0x120 (2 bits/cell)              wall west
 *   special4 +0x1f8 (4 bits/cell)              decoration code
 *   orient2  +0x378 (2 bits/cell)              door/recess orientation
 *   pit      +0x43a (1 bit/cell)               pit flag
 *   gxBase   +0x1e0 (12 bytes)                 region-X base table
 *   gyBase   +0x1ec (12 bytes)                 region-Y base table
 * Cell index = region*64 + cellA*8 + cellB. 12 regions × 64 cells = 768 cells.
 */
import type { MazeBlock, MazeBlockCell } from '@wiz6/data';

/** maze_block sub-table byte offsets (within the 1346-byte record). */
export const MB = {
  north: 0x60,
  west: 0x120,
  special4: 0x1f8,
  orient2: 0x378,
  pit: 0x43a,
  gxBase: 0x1e0,
  gyBase: 0x1ec,
} as const;

export const MAZE_BANK = 2;
export const REGIONS = 12;
export const CELLS_PER_REGION = 64;
export const TOTAL_CELLS = REGIONS * CELLS_PER_REGION; // 768

/**
 * Read an `nbits`-wide field for `cell`, MSB-first, from the contiguous bit-plane
 * starting at `base` in the record. Matches the engine's 2/4/1-bit field readers.
 */
export function getBits(buf: Uint8Array, base: number, cell: number, nbits: number): number {
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
