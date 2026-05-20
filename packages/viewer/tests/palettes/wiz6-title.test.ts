import { describe, expect, it } from 'vitest';
import { PaletteSchema } from '@wiz6/data';
import { WIZ6_TITLE_PALETTE } from '../../src/palettes/wiz6-title.js';

describe('WIZ6_TITLE_PALETTE', () => {
  it('conforms to PaletteSchema', () => {
    expect(() => PaletteSchema.parse(WIZ6_TITLE_PALETTE)).not.toThrow();
  });

  it('is named "wiz6-title"', () => {
    expect(WIZ6_TITLE_PALETTE.name).toBe('wiz6-title');
  });

  it('encodes a permutation of the 16 default EGA colors', () => {
    // Each entry of WIZ6_TITLE_PALETTE.colors must appear in the standard EGA
    // default palette exactly once — the game's "title-sequence palette" is
    // a permutation, not a recoloring.
    const egaDefault = new Set([
      '0,0,0', '0,0,170', '0,170,0', '0,170,170',
      '170,0,0', '170,0,170', '170,85,0', '170,170,170',
      '85,85,85', '85,85,255', '85,255,85', '85,255,255',
      '255,85,85', '255,85,255', '255,255,85', '255,255,255',
    ]);
    const seen = new Set<string>();
    for (const [r, g, b] of WIZ6_TITLE_PALETTE.colors) {
      const key = `${r},${g},${b}`;
      expect(egaDefault.has(key)).toBe(true);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(16);
  });

  it('maps bit-pattern 0x0 to black (background) and 0x1 to white (title text)', () => {
    expect(WIZ6_TITLE_PALETTE.colors[0]).toEqual([0, 0, 0]);
    expect(WIZ6_TITLE_PALETTE.colors[1]).toEqual([255, 255, 255]);
  });

  it('maps bit-pattern 0x8 to dark gray (stone walls) and 0x9 to light gray', () => {
    expect(WIZ6_TITLE_PALETTE.colors[8]).toEqual([85, 85, 85]);
    expect(WIZ6_TITLE_PALETTE.colors[9]).toEqual([170, 170, 170]);
  });
});
