import { describe, expect, it } from 'vitest';
import { PaletteSchema } from '@wiz6/data';
import { WIZ6_PALETTE_1 } from '../../src/palettes/wiz6-palette-1.js';

describe('WIZ6_PALETTE_1', () => {
  it('conforms to PaletteSchema', () => {
    expect(() => PaletteSchema.parse(WIZ6_PALETTE_1)).not.toThrow();
  });

  it('has the 16 RGB values discovered in wroot.exe at file offset 0x2043', () => {
    expect(WIZ6_PALETTE_1.colors).toEqual([
      [0, 0, 0],        //  0 black
      [170, 255, 170],  //  1 pale green
      [0, 85, 170],     //  2 dark teal
      [170, 85, 170],   //  3 muted magenta
      [170, 85, 0],     //  4 brown
      [170, 255, 0],    //  5 yellow-green
      [0, 255, 0],      //  6 pure bright green
      [0, 255, 170],    //  7 mint
      [0, 85, 0],       //  8 dark green
      [170, 170, 170],  //  9 light gray
      [0, 0, 170],      // 10 blue
      [170, 0, 170],    // 11 magenta
      [170, 0, 0],      // 12 red
      [170, 170, 0],    // 13 olive / yellow
      [0, 170, 0],      // 14 green
      [0, 170, 170],    // 15 cyan
    ]);
  });

  it('has a descriptive name and provenance', () => {
    expect(WIZ6_PALETTE_1.name).toMatch(/wiz6/i);
    expect(WIZ6_PALETTE_1.provenance).toMatch(/wroot\.exe/);
  });
});
