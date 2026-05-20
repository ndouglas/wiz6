import { describe, expect, it } from 'vitest';
import { decodeWfont } from '../../src/formats/wfont.js';

const ALL_ZEROES = new Uint8Array(1024);

const oneGlyphPattern = (() => {
  const bytes = new Uint8Array(1024);
  // Glyph 1: 00 00 0f 10 20 20 20 20 (from docs/re/wfont.md reference fixture)
  bytes[8] = 0x00;
  bytes[9] = 0x00;
  bytes[10] = 0x0f;
  bytes[11] = 0x10;
  bytes[12] = 0x20;
  bytes[13] = 0x20;
  bytes[14] = 0x20;
  bytes[15] = 0x20;
  return bytes;
})();

describe('decodeWfont', () => {
  it('rejects input that is not exactly 1024 bytes', () => {
    expect(() => decodeWfont(new Uint8Array(1023), { id: 'x', sourceFile: 'x' })).toThrow(/1024/);
    expect(() => decodeWfont(new Uint8Array(1025), { id: 'x', sourceFile: 'x' })).toThrow(/1024/);
  });

  it('produces 128 glyphs', () => {
    const font = decodeWfont(ALL_ZEROES, { id: 'wfont0', sourceFile: 'wfont0.ega' });
    expect(font.glyphCount).toBe(128);
    expect(font.glyphs).toHaveLength(128);
  });

  it('all-zero input produces all-zero glyphs', () => {
    const font = decodeWfont(ALL_ZEROES, { id: 'wfont0', sourceFile: 'wfont0.ega' });
    for (const glyph of font.glyphs) {
      expect(glyph).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    }
  });

  it('reads glyph 1 with the reference fixture bytes', () => {
    const font = decodeWfont(oneGlyphPattern, { id: 'wfont0', sourceFile: 'wfont0.ega' });
    expect(font.glyphs[1]).toEqual([0x00, 0x00, 0x0f, 0x10, 0x20, 0x20, 0x20, 0x20]);
  });

  it('preserves id and sourceFile in the output', () => {
    const font = decodeWfont(ALL_ZEROES, { id: 'wfont0', sourceFile: 'wfont0.ega' });
    expect(font.id).toBe('wfont0');
    expect(font.sourceFile).toBe('wfont0.ega');
  });
});
