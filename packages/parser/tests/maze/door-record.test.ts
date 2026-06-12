/**
 * door-record.test.ts — gate for decodeDoorRecords (pure special-record decoder).
 *
 * Validates against the live-pinned entrance doors (bank-3 record 0):
 *   recidx 24 → global (124,121), lock 3, closed facing 2 — the exact door the
 *   user reaches via turn-left / forward×3 / turn-left from the start gate.
 *   Symmetric door recidx 42 → (130,121), lock 3.
 *
 * Source: scenario.dbs bank 3 (base=0xe828, recsize=0x6cc=1740). Level N's special
 * records are bank-3 record N (identity mapping); level 0 → record 0. The
 * ceiling[zone]=bank3 rec(zone+2) formula applies to the CEILING image asset only,
 * NOT to special records (an earlier read used record 12, which holds the wrong
 * block — a single lock-0 entry door). The bank-3 special-record buffer is also
 * DIFFERENT from the 1346-byte maze-definition record (bank 2) that decodeMazeBlock
 * reads — they are separate buffers of different sizes.
 *
 * RE findings: docs/re/findings/maze-open-door-menu.json
 *   (live-entrance-doors-bank3-rec0-CORRECTION + live-special-record-table-layout).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeDoorRecords, SPECIAL_RECORD_BANK } from '../../src/maze/door-record.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '../../../..');
const TEST_FIXTURES_DIR = join(REPO_ROOT, 'test-fixtures', 'original');

// ---------------------------------------------------------------------------
// Loader helpers (mirror load-level.test.ts pattern — inline, no I/O in decoder)
// ---------------------------------------------------------------------------

function u32le(b: Uint8Array, o: number): number {
  return ((b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0);
}
function u16le(b: Uint8Array, o: number): number {
  return b[o]! | (b[o + 1]! << 8);
}

/**
 * Load bank 3 (special-record / ceiling buffer) for a given record index.
 * Special records use an identity mapping: maze level id → bank-3 record id
 * (level 0 → record 0). (The zone+2 formula is for the ceiling image asset only.)
 */
function loadSpecialRecord(recordIndex: number): Uint8Array {
  const diskHdr = new Uint8Array(readFileSync(join(TEST_FIXTURES_DIR, 'disk.hdr')));
  const masterHdr = new Uint8Array(readFileSync(join(TEST_FIXTURES_DIR, 'master.hdr')));
  const scenario = new Uint8Array(readFileSync(join(TEST_FIXTURES_DIR, 'scenario.dbs')));
  const base = u32le(diskHdr, (SPECIAL_RECORD_BANK + 1) * 4);
  const recsize = u16le(masterHdr, SPECIAL_RECORD_BANK * 2);
  return scenario.slice(base + recordIndex * recsize, base + recordIndex * recsize + recsize);
}

/**
 * gxBase / gyBase for level 0 (from extracted/maze/level-0.json, bank 2 record 0).
 * These are used by decodeDoorRecords to convert local→global coords.
 */
const GX_BASE = [120, 128, 120, 128, 120, 128, 10, 18, 10, 18, 26, 26];
const GY_BASE = [116, 116, 124, 124, 132, 132, 10, 10, 18, 18, 10, 18];

// Level 0 special records are in bank-3 record 0 (identity mapping, level id → record id).
// Validated by: recidx 24 → (124,121) lock 3 closed facing 2 — the entrance door reached
// via turn-left / forward×3 / turn-left from the start gate. Record 0 holds 12 type-7 doors
// with locks 3..7 (record 12 held only the wrong block: a lone lock-0 entry door).
const LEVEL0_BANK3_RECORD = 0;

const level0Record = loadSpecialRecord(LEVEL0_BANK3_RECORD);
const level0Doors = decodeDoorRecords(level0Record, GX_BASE, GY_BASE);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('decodeDoorRecords', () => {
  it('decodes the level-0 entrance doors from bank-3 record 0', () => {
    // recidx 24 → the door reached via turn-left / forward×3 / turn-left from the start gate.
    const left = level0Doors.find((x) => x.gx === 124 && x.gy === 121);
    expect(left).toBeDefined();
    expect(left!.lockStrength).toBe(3);
    expect(left!.welded).toBe(false);

    // Symmetric door recidx 42.
    const right = level0Doors.find((x) => x.gx === 130 && x.gy === 121);
    expect(right).toBeDefined();
    expect(right!.lockStrength).toBe(3);

    // Record 0 holds exactly 12 type-7 doors.
    expect(level0Doors.length).toBe(12);

    // Derivation gate: record 0 has real locks (3..7), unlike record 12's lone lock-0 door.
    expect(level0Doors.some((d) => d.lockStrength > 0)).toBe(true);
  });

  it('decodes every type-7 door with facing 0..3 and lock 0..31', () => {
    expect(level0Doors.length).toBeGreaterThan(0);
    for (const d of level0Doors) {
      expect(d.facing).toBeGreaterThanOrEqual(0);
      expect(d.facing).toBeLessThanOrEqual(3);
      expect(d.lockStrength).toBeGreaterThanOrEqual(0);
      expect(d.lockStrength).toBeLessThanOrEqual(31);
    }
  });
});
