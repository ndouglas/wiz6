import { describe, expect, it } from 'vitest';
import { decodeWfont4bpp } from '../../src/formats/wfont-4bpp.js';

const ALL_ZEROES = new Uint8Array(4096);

const oneGlyphPattern = (() => {
  const bytes = new Uint8Array(4096);
  // Glyph 0 — synthetic plane bytes for testing plane decomposition.
  // Plane 0: 0xff in row 0, zeros elsewhere
  bytes[0] = 0xff;
  // Plane 1: 0xff in row 1
  bytes[8 + 1] = 0xff;
  // Plane 2: 0xff in row 2
  bytes[16 + 2] = 0xff;
  // Plane 3: 0xff in row 3
  bytes[24 + 3] = 0xff;
  return bytes;
})();

describe('decodeWfont4bpp', () => {
  it('rejects input that is not exactly 4096 bytes', () => {
    expect(() => decodeWfont4bpp(new Uint8Array(4095), { id: 'x', sourceFile: 'x' })).toThrow(/4096/);
    expect(() => decodeWfont4bpp(new Uint8Array(4097), { id: 'x', sourceFile: 'x' })).toThrow(/4096/);
  });

  it('produces 128 glyphs', () => {
    const font = decodeWfont4bpp(ALL_ZEROES, { id: 'wfont1', sourceFile: 'wfont1.ega' });
    expect(font.glyphCount).toBe(128);
    expect(font.glyphs).toHaveLength(128);
  });

  it('all-zero input produces all-zero glyphs', () => {
    const font = decodeWfont4bpp(ALL_ZEROES, { id: 'wfont1', sourceFile: 'wfont1.ega' });
    for (const glyph of font.glyphs) {
      expect(glyph).toEqual(Array(32).fill(0));
    }
  });

  it('reads glyph 0 with the synthetic plane fixture bytes', () => {
    const font = decodeWfont4bpp(oneGlyphPattern, { id: 'wfont1', sourceFile: 'wfont1.ega' });
    const expected = Array(32).fill(0);
    expected[0] = 0xff;
    expected[9] = 0xff;
    expected[18] = 0xff;
    expected[27] = 0xff;
    expect(font.glyphs[0]).toEqual(expected);
  });

  it('preserves id and sourceFile in the output', () => {
    const font = decodeWfont4bpp(ALL_ZEROES, { id: 'wfont1', sourceFile: 'wfont1.ega' });
    expect(font.id).toBe('wfont1');
    expect(font.sourceFile).toBe('wfont1.ega');
  });
});
