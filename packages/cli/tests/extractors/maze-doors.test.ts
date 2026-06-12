/**
 * maze-doors.test.ts — derivation gate for extractMazeDoors.
 *
 * Exercises the EXTRACTOR (loadAssetDb → decodeMazeBlock → decodeAsset →
 * decodeDoorRecords → DoorRecordSchema.array().parse) against the pinned
 * test-fixtures/original/ game files.  This proves the DERIVATION pipeline,
 * not just the pure decoder (which is gated by door-record.test.ts in @wiz6/parser).
 *
 * Anchors mirror door-record.test.ts so any regression in the pipeline fails
 * both gates independently:
 *   - 12 type-7 doors in level-0 bank-3 record 0
 *   - recidx 24 → global (124,121), lock 3, not welded
 *   - recidx 42 → global (130,121), lock 3
 *   - at least one door with lockStrength > 0 (guards against the wrong record)
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DoorRecordSchema } from '@wiz6/data';
import { extractMazeDoors } from '../../src/extractors/maze-doors.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..', '..');
const ORIGINAL_DIR = join(REPO_ROOT, 'test-fixtures', 'original');

describe('extractMazeDoors', () => {
  it('writes doors.json and returns level-0 door records', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'wiz6-maze-doors-'));
    try {
      const outputPath = join(tmpDir, 'doors.json');
      const doors = extractMazeDoors({ originalDir: ORIGINAL_DIR, outputPath, levelId: 0 });

      // Derivation gate: same anchors as door-record.test.ts (the parser-level gate).
      expect(doors.length).toBe(12);

      const left = doors.find((d) => d.gx === 124 && d.gy === 121);
      expect(left).toBeDefined();
      expect(left!.lockStrength).toBe(3);
      expect(left!.welded).toBe(false);

      const right = doors.find((d) => d.gx === 130 && d.gy === 121);
      expect(right).toBeDefined();
      expect(right!.lockStrength).toBe(3);

      // Record 0 has real locks (guards against the wrong bank-3 record).
      expect(doors.some((d) => d.lockStrength > 0)).toBe(true);

      // All doors pass schema validation (extractor calls parse, but verify here too).
      expect(() => DoorRecordSchema.array().parse(doors)).not.toThrow();

      // Output JSON is well-formed and schema-valid.
      const written: unknown = JSON.parse(readFileSync(outputPath, 'utf8'));
      expect(() => DoorRecordSchema.array().parse(written)).not.toThrow();
      expect(Array.isArray(written) && (written as unknown[]).length).toBe(12);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('creates parent directories for the output path', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'wiz6-maze-doors-mkdir-'));
    try {
      const outputPath = join(tmpDir, 'a', 'b', 'doors.json');
      const doors = extractMazeDoors({ originalDir: ORIGINAL_DIR, outputPath, levelId: 0 });
      expect(doors.length).toBe(12);
      const written: unknown = JSON.parse(readFileSync(outputPath, 'utf8'));
      expect(Array.isArray(written) && (written as unknown[]).length).toBe(12);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
