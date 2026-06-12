import { describe, it, expect } from 'vitest';
import { drawGlyph4bpp, drawGlyph1bpp } from '../../src/pages/game/glyph-core.js';
import wfont0 from '../../src/data/wfont0.json';
import wfont3 from '../../src/data/wfont3.json';

describe('glyph-core', () => {
  it('drawGlyph4bpp writes the file pixel value as the palette index', () => {
    const W = 8, H = 8; const buf = new Uint8Array(W * H);
    drawGlyph4bpp(buf, W, H, 0, 0, 'A'.charCodeAt(0), wfont3.glyphs);
    // 'A' has at least one non-zero pixel
    expect(buf.some((v) => v !== 0)).toBe(true);
  });
  it('drawGlyph1bpp inverse fills bg then strokes', () => {
    const W = 8, H = 8; const buf = new Uint8Array(W * H);
    drawGlyph1bpp(buf, W, H, 0, 0, ' '.charCodeAt(0), 0, 5, true, wfont0.glyphs);
    expect(buf.every((v) => v === 5)).toBe(true); // blank glyph -> all bg
  });
});
