import { describe, expect, it } from 'vitest';
import { renderTextRun, measureTextRun } from '../../src/formats/wfont-render.js';
import { EGA_DEFAULT, type Font } from '@wiz6/data';

function makeFont(glyphs: Record<number, number[]>): Font {
  // 128 entries, default to 8 zero bytes
  const all: number[][] = [];
  for (let i = 0; i < 128; i++) {
    all.push(glyphs[i] ?? [0, 0, 0, 0, 0, 0, 0, 0]);
  }
  return {
    id: 'test',
    sourceFile: 'test.ega',
    glyphCount: 128,
    glyphs: all,
  };
}

describe('renderTextRun', () => {
  it('writes a single foreground pixel for each set bit in a glyph row', () => {
    // Glyph for 'A' (ASCII 65): row 0 = 0b10000000 (just top-left pixel set)
    const font = makeFont({ 65: [0x80, 0, 0, 0, 0, 0, 0, 0] });
    const dest = new Uint8ClampedArray(16 * 8 * 4);
    renderTextRun(dest, 16, 8, 0, 0, 'A', font, 14, EGA_DEFAULT); // 14 = yellow
    const [r, g, b] = EGA_DEFAULT.colors[14]!;
    expect(Array.from(dest.subarray(0, 4))).toEqual([r, g, b, 0xff]);
    // Pixel (1,0) should be transparent (bit 6 of byte 0x80 is 0)
    expect(Array.from(dest.subarray(4, 8))).toEqual([0, 0, 0, 0]);
  });

  it('advances the cursor 8 pixels per character', () => {
    const font = makeFont({
      65: [0xff, 0, 0, 0, 0, 0, 0, 0], // 'A' = full top row
      66: [0xff, 0, 0, 0, 0, 0, 0, 0], // 'B' = full top row
    });
    const dest = new Uint8ClampedArray(24 * 8 * 4);
    renderTextRun(dest, 24, 8, 0, 0, 'AB', font, 15, EGA_DEFAULT);
    // First 8 pixels: A; next 8: B
    // Pixel at (0,0) should be white
    expect(dest[3]).toBe(0xff);
    // Pixel at (8,0) should be white (B's top row)
    expect(dest[(8 * 4) + 3]).toBe(0xff);
    // Pixel at (16,0) should be transparent (no third char)
    expect(dest[(16 * 4) + 3]).toBe(0);
  });

  it('skips unknown glyphs but still advances the cursor', () => {
    const font = makeFont({ 65: [0xff, 0, 0, 0, 0, 0, 0, 0] });
    const dest = new Uint8ClampedArray(24 * 8 * 4);
    renderTextRun(dest, 24, 8, 0, 0, 'A\xffA', font, 15, EGA_DEFAULT);
    // First char at x=0: A draws
    expect(dest[3]).toBe(0xff);
    // Second char (0xff = undefined glyph) skipped, cursor at x=8: nothing drawn
    expect(dest[(8 * 4) + 3]).toBe(0);
    // Third char A at x=16: draws
    expect(dest[(16 * 4) + 3]).toBe(0xff);
  });

  it('honors bgIndex when set, filling cleared bits with bg color', () => {
    const font = makeFont({ 65: [0xc0, 0, 0, 0, 0, 0, 0, 0] }); // top row: 2 fg + 6 bg pixels
    const dest = new Uint8ClampedArray(8 * 8 * 4);
    renderTextRun(dest, 8, 8, 0, 0, 'A', font, 15, EGA_DEFAULT, 1); // fg=white, bg=blue
    // Pixel (0,0) = fg = white
    expect(dest[3]).toBe(0xff);
    // Pixel (2,0) = bg = blue (color index 1)
    const [r, g, b] = EGA_DEFAULT.colors[1]!;
    expect(Array.from(dest.subarray(8, 12))).toEqual([r, g, b, 0xff]);
  });

  it('clips writes to destination bounds without throwing', () => {
    const font = makeFont({ 65: [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff] });
    const dest = new Uint8ClampedArray(8 * 8 * 4);
    // Render off-screen
    renderTextRun(dest, 8, 8, -5, -5, 'A', font, 15, EGA_DEFAULT);
    // Should not throw; some pixels should still be touched
    let touched = 0;
    for (let i = 3; i < dest.length; i += 4) if (dest[i]! > 0) touched++;
    expect(touched).toBeGreaterThan(0);
  });
});

describe('measureTextRun', () => {
  it('returns 8 pixels per character', () => {
    const font = makeFont({});
    expect(measureTextRun('ADD PARTY MEMBER', font)).toBe(16 * 8);
    expect(measureTextRun('', font)).toBe(0);
  });
});
