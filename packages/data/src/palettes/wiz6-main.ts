import type { Palette } from '../schemas/palette.js';
import { applyAcPalette } from './ac-to-rgb.js';

/**
 * Wizardry VI runtime palette #1 — "main".
 *
 * The 17-byte AC palette table lives at wroot.exe file offset 0x2043
 * (= image 0x1E43); the load is INT 10h AX=1002h at file 0x209B. Bytes 0..15
 * are the AC palette registers (4-bit color attribute -> 6-bit DAC index);
 * byte 16 is the overscan color. This palette is programmed into the live
 * VGA AC across every captured save state in tools/dosbox/save/ (verified
 * via Vga-blob byte match).
 *
 * The shipped `colors` array is the AC chained through the VGA DAC, NOT
 * the AC bytes 6-bit-expanded as RGB (which is what we incorrectly shipped
 * before). For example AC[5] = 0x16 -> DAC[22] = (255, 255, 85) bright
 * yellow, which is what the engine renders as the selected-menu-row
 * highlight background. See docs/re/findings/menu-cursor-render-path.json.
 */
export const WIZ6_MAIN_AC: readonly number[] = [
  0x00, 0x17, 0x11, 0x15, 0x14, 0x16, 0x12, 0x13,
  0x10, 0x07, 0x01, 0x05, 0x04, 0x06, 0x02, 0x03,
];

const COLORS = applyAcPalette(WIZ6_MAIN_AC) as Palette['colors'];

export const WIZ6_MAIN: Palette = {
  name: 'wiz6-main',
  provenance:
    'wroot.exe @ 0x2043 (16-byte AC palette + 1 overscan byte, loaded via INT 10h AX=1002h at file 0x209B). RGB = AC chained through VGA_DEFAULT_DAC.',
  colors: COLORS,
};
