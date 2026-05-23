import type { Palette } from '../schemas/palette.js';

/**
 * Standard 16-color IBM EGA palette as initialized by BIOS at video mode
 * set (mode 0Dh). Used as a fallback / debug-comparison option in the
 * viewer. NOT what Wizardry VI runs with — the engine reprograms registers
 * via INT 10h AX=1002h at startup; see wiz6-main / wiz6-dungeon.
 */
export const EGA_DEFAULT: Palette = {
  name: 'ega-default',
  provenance: 'Standard IBM EGA palette as initialized by BIOS at video mode set',
  colors: [
    [0, 0, 0],
    [0, 0, 170],
    [0, 170, 0],
    [0, 170, 170],
    [170, 0, 0],
    [170, 0, 170],
    [170, 85, 0],
    [170, 170, 170],
    [85, 85, 85],
    [85, 85, 255],
    [85, 255, 85],
    [85, 255, 255],
    [255, 85, 85],
    [255, 85, 255],
    [255, 255, 85],
    [255, 255, 255],
  ],
};
