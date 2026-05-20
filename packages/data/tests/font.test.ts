import { describe, expect, it } from 'vitest';
import { FontSchema, FontGlyphSchema, type Font } from '../src/index.js';

describe('FontGlyphSchema', () => {
  it('accepts an array of exactly 8 bytes', () => {
    const glyph = [0, 0, 0, 0, 0, 0, 0, 0];
    expect(() => FontGlyphSchema.parse(glyph)).not.toThrow();
  });

  it('rejects an array of 7 bytes', () => {
    expect(() => FontGlyphSchema.parse([0, 0, 0, 0, 0, 0, 0])).toThrow();
  });

  it('rejects an array of 9 bytes', () => {
    expect(() => FontGlyphSchema.parse([0, 0, 0, 0, 0, 0, 0, 0, 0])).toThrow();
  });

  it('rejects values outside 0..255', () => {
    expect(() => FontGlyphSchema.parse([0, 0, 0, 256, 0, 0, 0, 0])).toThrow();
    expect(() => FontGlyphSchema.parse([0, 0, 0, -1, 0, 0, 0, 0])).toThrow();
  });
});

describe('FontSchema', () => {
  const validFont: Font = {
    id: 'wfont0',
    sourceFile: 'wfont0.ega',
    glyphCount: 128,
    glyphs: Array.from({ length: 128 }, () => [0, 0, 0, 0, 0, 0, 0, 0]),
  };

  it('accepts a valid 128-glyph font', () => {
    expect(() => FontSchema.parse(validFont)).not.toThrow();
  });

  it('rejects a font whose glyphCount disagrees with glyphs.length', () => {
    const bad = { ...validFont, glyphCount: 127 };
    expect(() => FontSchema.parse(bad)).toThrow();
  });

  it('rejects a font missing the sourceFile field', () => {
    const { sourceFile, ...incomplete } = validFont;
    void sourceFile;
    expect(() => FontSchema.parse(incomplete)).toThrow();
  });
});
