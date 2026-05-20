import { describe, expect, it } from 'vitest';
import { EGA_PALETTE } from '../src/ega-palette.js';

describe('EGA_PALETTE', () => {
  it('has exactly 16 colors', () => {
    expect(EGA_PALETTE).toHaveLength(16);
  });

  it('color 0 is black', () => {
    expect(EGA_PALETTE[0]).toEqual([0, 0, 0]);
  });

  it('color 15 is white', () => {
    expect(EGA_PALETTE[15]).toEqual([255, 255, 255]);
  });

  it('color 1 is blue (0, 0, 170)', () => {
    expect(EGA_PALETTE[1]).toEqual([0, 0, 170]);
  });

  it('color 7 is light gray (170, 170, 170)', () => {
    expect(EGA_PALETTE[7]).toEqual([170, 170, 170]);
  });

  it('all colors are RGB triples in 0..255', () => {
    for (const [r, g, b] of EGA_PALETTE) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(255);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(255);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(255);
    }
  });
});
