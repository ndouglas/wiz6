import type { Palette } from '@wiz6/data';

// Standard 16-color EGA palette (default values BIOS writes at mode set).
// Used as a fallback / comparison option in the 4bpp viewer.
export const EGA_PALETTE: Palette = {
  name: 'EGA default',
  provenance: 'Standard IBM EGA palette as initialized by BIOS at video mode set.',
  colors: [
    [0, 0, 0],        //  0 black
    [0, 0, 170],      //  1 blue
    [0, 170, 0],      //  2 green
    [0, 170, 170],    //  3 cyan
    [170, 0, 0],      //  4 red
    [170, 0, 170],    //  5 magenta
    [170, 85, 0],     //  6 brown
    [170, 170, 170],  //  7 light gray
    [85, 85, 85],     //  8 dark gray
    [85, 85, 255],    //  9 light blue
    [85, 255, 85],    // 10 light green
    [85, 255, 255],   // 11 light cyan
    [255, 85, 85],    // 12 light red
    [255, 85, 255],   // 13 light magenta
    [255, 255, 85],   // 14 yellow
    [255, 255, 255],  // 15 white
  ],
};
