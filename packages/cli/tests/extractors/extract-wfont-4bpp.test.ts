import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Font4bppSchema } from '@wiz6/data';
import { extractWfont4bpp } from '../../src/extractors/extract-wfont-4bpp.js';

describe('extractWfont4bpp', () => {
  it('reads bytes, decodes, writes valid JSON', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wiz6-extract-wfont-4bpp-'));
    try {
      const originalDir = join(tmp, 'original');
      const extractedDir = join(tmp, 'extracted');
      mkdirSync(originalDir, { recursive: true });

      const inputBytes = new Uint8Array(4096);
      for (let i = 0; i < 4096; i++) inputBytes[i] = i & 0xff;
      writeFileSync(join(originalDir, 'wfont1.ega'), inputBytes);

      const result = extractWfont4bpp({
        originalPath: join(originalDir, 'wfont1.ega'),
        outputPath: join(extractedDir, 'fonts', 'wfont1.json'),
        id: 'wfont1',
      });

      expect(() => Font4bppSchema.parse(result)).not.toThrow();
      expect(result.glyphCount).toBe(128);
      expect(result.glyphs[0]).toEqual(Array.from({ length: 32 }, (_, i) => i));

      const onDisk = JSON.parse(readFileSync(join(extractedDir, 'fonts', 'wfont1.json'), 'utf8'));
      expect(() => Font4bppSchema.parse(onDisk)).not.toThrow();
      expect(onDisk.id).toBe('wfont1');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('creates parent directories for the output path', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wiz6-extract-wfont-4bpp-mkdir-'));
    try {
      const originalPath = join(tmp, 'wfont1.ega');
      const outputPath = join(tmp, 'a', 'b', 'c', 'wfont1.json');
      writeFileSync(originalPath, new Uint8Array(4096));
      extractWfont4bpp({ originalPath, outputPath, id: 'wfont1' });
      expect(JSON.parse(readFileSync(outputPath, 'utf8')).id).toBe('wfont1');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("emits palette: 'ega-default' in the extracted JSON", () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wiz6-extract-wfont-4bpp-palette-'));
    try {
      const originalPath = join(tmp, 'wfont1.ega');
      const outputPath = join(tmp, 'wfont1.json');
      writeFileSync(originalPath, new Uint8Array(4096));
      const result = extractWfont4bpp({ originalPath, outputPath, id: 'wfont1' });
      expect((result as { palette?: string }).palette).toBe('ega-default');
      const onDisk = JSON.parse(readFileSync(outputPath, 'utf8'));
      expect(onDisk.palette).toBe('ega-default');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
