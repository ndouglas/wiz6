import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractEgaScreen } from '../../src/extractors/extract-ega-screen.js';

describe('extractEgaScreen', () => {
  it('reads a 32768-byte file from disk and writes JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-ega-screen-'));
    const inputPath = join(dir, 'titlepag.ega');
    const outputPath = join(dir, 'screens', 'titlepag.json');

    const bytes = new Uint8Array(32768);
    bytes[0] = 0x42;
    bytes[8000] = 0x43;
    bytes[16000] = 0x44;
    bytes[24000] = 0x45;
    bytes[32000] = 0x99;
    writeFileSync(inputPath, bytes);

    const screen = extractEgaScreen({
      originalPath: inputPath,
      outputPath,
      id: 'titlepag',
    });

    expect(screen.id).toBe('titlepag');
    expect(screen.planes[0]?.[0]).toBe(0x42);
    expect(screen.planes[3]?.[0]).toBe(0x45);
    expect(screen.trailer[0]).toBe(0x99);

    const written = JSON.parse(readFileSync(outputPath, 'utf-8'));
    expect(written.id).toBe('titlepag');
    expect(written.planes).toHaveLength(4);
    expect(written.trailer).toHaveLength(256);
  });
});
