/**
 * load-level.test.ts — loader gate for extracted/maze/level-0.json.
 *
 * Validates the committed JSON round-trips through DungeonLevelSchema and that
 * key fields match what extractMazeLevel(0) produces offline.
 *
 * Moved here from packages/parser/tests/maze/level.test.ts when the Node-fs
 * loader was relocated to @wiz6/cli (parser must remain isomorphic).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DungeonLevelSchema } from '@wiz6/data';
import { loadDungeonLevel } from '../../src/lib/load-level.js';
import { decodeMazeBlock, MAZE_BANK } from '@wiz6/parser';

// Resolve repo root (packages/cli/tests/lib/ → up 4 = repo root)
const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..', '..', '..', '..');
const TEST_FIXTURES_DIR = join(REPO_ROOT, 'test-fixtures', 'original');

describe('loadDungeonLevel', () => {
  it('loads + validates level-0.json against DungeonLevelSchema', () => {
    const level = loadDungeonLevel(0);
    expect(level.id).toBe(0);
    expect(level.mazeBlock.regions).toHaveLength(12);
    expect(level.mazeBlock.gxBase).toHaveLength(12);
    expect(level.mazeBlock.gyBase).toHaveLength(12);
    // Entrance is a known placeholder (Task B3 will supply the real value).
    expect(level.entrance.facing).toBeGreaterThanOrEqual(0);
    expect(level.entrance.facing).toBeLessThanOrEqual(3);
  });

  it('matches the gxBase/gyBase from the offline extractor', () => {
    const level = loadDungeonLevel(0);
    // Known values from extractMazeLevel(0) — asm-confirmed (Task A1).
    expect(level.mazeBlock.gxBase).toEqual([120, 128, 120, 128, 120, 128, 10, 18, 10, 18, 26, 26]);
    expect(level.mazeBlock.gyBase).toEqual([116, 116, 124, 124, 132, 132, 10, 10, 18, 18, 10, 18]);
  });

  it('regions[0][0] matches decodeMazeBlock on the same scenario.dbs', () => {
    // Re-decode from test-fixtures to confirm the committed JSON is byte-exact.
    const diskHdr = new Uint8Array(readFileSync(join(TEST_FIXTURES_DIR, 'disk.hdr')));
    const masterHdr = new Uint8Array(readFileSync(join(TEST_FIXTURES_DIR, 'master.hdr')));
    const scenario = new Uint8Array(readFileSync(join(TEST_FIXTURES_DIR, 'scenario.dbs')));

    // Reproduce the bank reader inline (same logic as asset-db.ts / decode-asset.ts).
    function u32le(b: Uint8Array, o: number): number {
      return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
    }
    function u16le(b: Uint8Array, o: number): number {
      return b[o]! | (b[o + 1]! << 8);
    }
    const base = u32le(diskHdr, (MAZE_BANK + 1) * 4);
    const recsize = u16le(masterHdr, MAZE_BANK * 2);
    const record = scenario.slice(base, base + recsize); // levelId=0 → record 0
    const fresh = decodeMazeBlock(record);

    const level = loadDungeonLevel(0);
    expect(level.mazeBlock.regions[0]![0]).toEqual(fresh.regions[0]![0]);
  });
});
