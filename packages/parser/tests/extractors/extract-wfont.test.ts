import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FontSchema } from '@wiz6/data';
import { extractWfont } from '../../src/extractors/extract-wfont.js';

describe('extractWfont', () => {
  it('reads bytes, decodes, writes valid JSON to the extracted dir', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wiz6-extract-wfont-'));
    try {
      const originalDir = join(tmp, 'original');
      const extractedDir = join(tmp, 'extracted');
      mkdirSync(originalDir, { recursive: true });

      // Fixture: byte i has value (i & 0xff). Verifiable round-trip.
      const inputBytes = new Uint8Array(1024);
      for (let i = 0; i < 1024; i++) inputBytes[i] = i & 0xff;
      writeFileSync(join(originalDir, 'wfont0.ega'), inputBytes);

      const result = extractWfont({
        originalPath: join(originalDir, 'wfont0.ega'),
        outputPath: join(extractedDir, 'fonts', 'wfont0.json'),
        id: 'wfont0',
      });

      // Returned object is a valid Font
      expect(() => FontSchema.parse(result)).not.toThrow();
      expect(result.glyphCount).toBe(128);

      // Output file exists and contains valid JSON matching the schema
      const onDisk = JSON.parse(readFileSync(join(extractedDir, 'fonts', 'wfont0.json'), 'utf8'));
      expect(() => FontSchema.parse(onDisk)).not.toThrow();
      expect(onDisk.glyphs[1]).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('creates parent directories for the output path if they do not exist', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wiz6-extract-wfont-mkdir-'));
    try {
      const originalPath = join(tmp, 'wfont0.ega');
      const outputPath = join(tmp, 'a', 'b', 'c', 'wfont0.json');
      writeFileSync(originalPath, new Uint8Array(1024));
      extractWfont({ originalPath, outputPath, id: 'wfont0' });
      const onDisk = readFileSync(outputPath, 'utf8');
      expect(JSON.parse(onDisk).id).toBe('wfont0');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
