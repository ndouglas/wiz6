import { describe, expect, it } from 'vitest';
import { Font4bppSchema, Font4bppGlyphSchema, type Font4bpp } from '../src/index.js';

describe('Font4bppGlyphSchema', () => {
  it('accepts an array of exactly 32 bytes', () => {
    const glyph = Array.from({ length: 32 }, (_, i) => i);
    expect(() => Font4bppGlyphSchema.parse(glyph)).not.toThrow();
  });

  it('rejects an array of 31 bytes', () => {
    expect(() => Font4bppGlyphSchema.parse(Array(31).fill(0))).toThrow();
  });

  it('rejects an array of 33 bytes', () => {
    expect(() => Font4bppGlyphSchema.parse(Array(33).fill(0))).toThrow();
  });

  it('rejects values outside 0..255', () => {
    const bad = Array(32).fill(0);
    bad[5] = 256;
    expect(() => Font4bppGlyphSchema.parse(bad)).toThrow();
  });
});

describe('Font4bppSchema', () => {
  const validFont: Font4bpp = {
    id: 'wfont1',
    sourceFile: 'wfont1.ega',
    glyphCount: 128,
    glyphs: Array.from({ length: 128 }, () => Array(32).fill(0)),
  };

  it('accepts a valid 128-glyph 4bpp font', () => {
    expect(() => Font4bppSchema.parse(validFont)).not.toThrow();
  });

  it('rejects a font whose glyphCount disagrees with glyphs.length', () => {
    const bad = { ...validFont, glyphCount: 127 };
    expect(() => Font4bppSchema.parse(bad)).toThrow();
  });

  it('rejects a font missing the sourceFile field', () => {
    const { sourceFile, ...incomplete } = validFont;
    void sourceFile;
    expect(() => Font4bppSchema.parse(incomplete)).toThrow();
  });

  it('accepts an optional palette name field', () => {
    const withPalette = { ...validFont, palette: 'wiz6-main' };
    const parsed = Font4bppSchema.parse(withPalette);
    expect((parsed as Font4bpp & { palette?: string }).palette).toBe('wiz6-main');
  });

  it('accepts a Font4bpp without a palette field (backward compat)', () => {
    expect(() => Font4bppSchema.parse(validFont)).not.toThrow();
  });
});
