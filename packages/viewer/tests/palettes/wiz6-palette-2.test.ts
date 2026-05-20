import { describe, expect, it } from 'vitest';
import { PaletteSchema } from '@wiz6/data';
import { WIZ6_PALETTE_2 } from '../../src/palettes/wiz6-palette-2.js';

describe('WIZ6_PALETTE_2', () => {
  it('conforms to PaletteSchema', () => {
    expect(() => PaletteSchema.parse(WIZ6_PALETTE_2)).not.toThrow();
  });

  it('has the 16 RGB values discovered in wroot.exe at file offset 0x2054', () => {
    expect(WIZ6_PALETTE_2.colors).toEqual([
      [0, 0, 0],
      [170, 170, 255],  //  1 lavender
      [0, 0, 255],      //  2 pure bright blue
      [170, 0, 255],    //  3 purple
      [170, 0, 85],     //  4 dark crimson
      [170, 170, 85],   //  5 dim yellow
      [0, 170, 85],     //  6 blue-green
      [0, 170, 255],    //  7 bright cyan
      [0, 0, 85],       //  8 dim blue
      [170, 170, 170],  //  9 light gray (same as palette 1)
      [0, 0, 170],      // 10 blue
      [170, 0, 170],    // 11 magenta
      [170, 0, 0],      // 12 red
      [170, 170, 0],    // 13 olive / yellow
      [0, 170, 0],      // 14 green
      [0, 170, 170],    // 15 cyan
    ]);
  });

  it('has indices 9..15 identical to WIZ6_PALETTE_1', async () => {
    const { WIZ6_PALETTE_1 } = await import('../../src/palettes/wiz6-palette-1.js');
    for (let i = 9; i <= 15; i++) {
      expect(WIZ6_PALETTE_2.colors[i]).toEqual(WIZ6_PALETTE_1.colors[i]);
    }
  });
});
