/**
 * door-record.ts — pure decoder for type-7 door records from the maze special-record
 * table (the 1740-byte bank-3 ceiling/special-record buffer).
 *
 * ── SOURCE ──────────────────────────────────────────────────────────────────────
 * The special-record table lives in SCENARIO.DBS bank 3 (base=0xe828, recsize=0x6cc
 * = 1740 bytes). It is NOT the same as the 1346-byte maze-definition record (bank 2)
 * that decodeMazeBlock reads — they are separate buffers. The bank-3 record also
 * doubles as the ceiling image asset (per maze-asset-loader.json: ceiling[zone] =
 * bank3 record (zone+2)).
 *
 * Level-0 (castle surface) special records → bank 3 record 12 (zone 10, 10+2=12).
 * Validated: record 109, type=7, z=4, x=7, y=0, lock=0 → global gx=127, gy=132.
 *
 * ── FIELD LAYOUT (from base of 1740-byte record) ──────────────────────────────
 * Per-record parallel byte arrays (max 144 = 0x90 records):
 *   +0x360  TYPE byte (7 = door)
 *   +0x3f0  X byte (local column 0..7)
 *   +0x480  Y byte (local row 0..7)
 *   +0x510  Z byte (region index 0..11)
 *   +0x240  WALL-PLANE word LE (stride 2, index=recidx*2):
 *             getbit_chunk(word, facing*2, 2) → 0=open, 1=closed, 2=welded
 *             getbit_chunk is LSB-first: (word >> (facing*2)) & 0x3
 *   +0x630  LOCK byte: (byte >> 0) & 0x1f → 5-bit strength 0..31
 *   +0x6c0  PER-REGION first-record-index byte array (12 bytes)
 *
 * RE reference: docs/re/findings/maze-open-door-menu.json
 *   (live-special-record-table-layout + live-door-level0-record109)
 */

import type { DoorRecord } from '@wiz6/data';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** scenario.dbs bank that holds the special-record / ceiling-image records. */
export const SPECIAL_RECORD_BANK = 3;

/** Maximum number of special records per level (engine scans 0..0x8f = 0..143). */
const MAX_RECORDS = 144;

/** Record type byte = 7 for forceable/pickable doors. */
const TYPE_DOOR = 7;

// Field offsets within the 1740-byte special-record buffer:
const OFF_WALL = 0x240;   // WORD array (stride 2), LE
const OFF_TYPE = 0x360;   // BYTE array
const OFF_X    = 0x3f0;   // BYTE array (local column)
const OFF_Y    = 0x480;   // BYTE array (local row)
const OFF_Z    = 0x510;   // BYTE array (region index)
const OFF_LOCK = 0x630;   // BYTE array (low 5 bits = lock strength)

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/**
 * LSB-first bit field extract: (data >> offset) & ((1 << width) - 1).
 * Matches the engine's getbit_chunk (wroot image 0x2962).
 */
function getbitChunk(data: number, offset: number, width: number): number {
  return (data >>> offset) & ((1 << width) - 1);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Decode all type-7 door records from a 1740-byte special-record buffer.
 *
 * @param record  Verbatim 1740-byte buffer from scenario.dbs bank 3 (the
 *                ceiling/special-record asset for this level).
 * @param gxBase  12-entry region X-base table (from the level's MazeBlock,
 *                bank 2 same level ID).
 * @param gyBase  12-entry region Y-base table.
 * @returns Array of DoorRecord sorted by recidx (ascending).
 */
export function decodeDoorRecords(
  record: Uint8Array,
  gxBase: readonly number[],
  gyBase: readonly number[],
): DoorRecord[] {
  const doors: DoorRecord[] = [];

  for (let recidx = 0; recidx < MAX_RECORDS; recidx++) {
    const type = record[OFF_TYPE + recidx] ?? 0;
    if (type !== TYPE_DOOR) continue;

    const localX = record[OFF_X + recidx] ?? 0;
    const localY = record[OFF_Y + recidx] ?? 0;
    const region = record[OFF_Z + recidx] ?? 0;

    // global coordinates: gx = gxBase[region] + localX, gy = gyBase[region] + localY
    const gx = (gxBase[region] ?? 0) + localX;
    const gy = (gyBase[region] ?? 0) + localY;

    // wall-plane word (WORD array, stride 2, LE)
    const wallWord =
      (record[OFF_WALL + recidx * 2] ?? 0) |
      ((record[OFF_WALL + recidx * 2 + 1] ?? 0) << 8);

    // Find the facing with a non-zero wall state (closed=1 or welded=2).
    // If none found (door is open / all states 0), default to facing=0.
    let facing = 0;
    let wallState = 0;
    for (let f = 0; f < 4; f++) {
      const state = getbitChunk(wallWord, f * 2, 2);
      if (state > 0) {
        facing = f;
        wallState = state;
        break;
      }
    }

    // 5-bit lock strength at bits [4:0] of the lock byte
    const lockByte = record[OFF_LOCK + recidx] ?? 0;
    const lockStrength = getbitChunk(lockByte, 0, 5);

    doors.push({
      gx,
      gy,
      facing,
      lockStrength,
      welded: wallState === 2,
    });
  }

  return doors;
}
