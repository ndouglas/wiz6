/**
 * door-record.test.ts — gate for decodeDoorRecords (pure special-record decoder).
 *
 * Validates against the live-pinned door:
 *   Record 109, type 7, region(z)=4, local x=7 y=0 → global (gx=127, gy=132), lock=0.
 *
 * Source: scenario.dbs bank 3 (base=0xe828, recsize=0x6cc=1740). Level 0 special
 * records are at bank 3 record 12 (zone 10, per ceiling[zone]=bank3 rec (zone+2)).
 * This is DIFFERENT from the 1346-byte maze-definition record (bank 2) that
 * decodeMazeBlock reads — they are separate buffers of different sizes.
 *
 * RE findings: docs/re/findings/maze-open-door-menu.json (live-special-record-table-layout
 * + live-door-level0-record109).
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
 * Record index = zone + 2 (e.g. zone=10 → record=12 for level 0).
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

// Level 0 special records are in bank3 record 12 (zone 10 → 10+2=12).
// Validated by: per-region[7]=121, recidx=109: type=7, x=7, y=0, z=4, lock=0.
const LEVEL0_BANK3_RECORD = 12;

const level0Record = loadSpecialRecord(LEVEL0_BANK3_RECORD);
const level0Doors = decodeDoorRecords(level0Record, GX_BASE, GY_BASE);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('decodeDoorRecords', () => {
  it('decodes the level-0 castle entry door (record 109) at (127,132) lock 0', () => {
    const d = level0Doors.find((x) => x.gx === 127 && x.gy === 132);
    expect(d).toBeDefined();
    expect(d!.lockStrength).toBe(0);
    expect(d!.welded).toBe(false);
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
