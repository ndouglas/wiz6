import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PortraitSetSchema } from '@wiz6/data';
import { extractWport } from '../../src/extractors/extract-wport.js';

describe('extractWport', () => {
  it('reads bytes, decodes, writes valid JSON', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wiz6-extract-wport-'));
    try {
      const originalDir = join(tmp, 'original');
      const extractedDir = join(tmp, 'extracted');
      mkdirSync(originalDir, { recursive: true });

      const inputBytes = new Uint8Array(4096);
      for (let i = 0; i < 4096; i++) inputBytes[i] = i & 0xff;
      writeFileSync(join(originalDir, 'wport1.ega'), inputBytes);

      const result = extractWport({
        originalPath: join(originalDir, 'wport1.ega'),
        outputPath: join(extractedDir, 'portraits', 'wport1.json'),
        id: 'wport1',
      });

      expect(() => PortraitSetSchema.parse(result)).not.toThrow();
      expect(result.portraitCount).toBe(8);
      // Portrait 0 tile 0 = bytes 0..31, so tile[0][0] = 0, tile[0][1] = 1, etc.
      expect(result.portraits[0]!.tiles[0]![0]).toBe(0);
      expect(result.portraits[0]!.tiles[0]![1]).toBe(1);

      const onDisk = JSON.parse(readFileSync(join(extractedDir, 'portraits', 'wport1.json'), 'utf8'));
      expect(() => PortraitSetSchema.parse(onDisk)).not.toThrow();
      expect(onDisk.id).toBe('wport1');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('creates parent directories for the output path', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wiz6-extract-wport-mkdir-'));
    try {
      const originalPath = join(tmp, 'wport1.ega');
      const outputPath = join(tmp, 'a', 'b', 'c', 'wport1.json');
      writeFileSync(originalPath, new Uint8Array(4096));
      extractWport({ originalPath, outputPath, id: 'wport1' });
      expect(JSON.parse(readFileSync(outputPath, 'utf8')).id).toBe('wport1');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
