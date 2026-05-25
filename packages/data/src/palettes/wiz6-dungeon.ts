import type { Palette } from '../schemas/palette.js';
import { applyAcPalette } from './ac-to-rgb.js';

/**
 * Wizardry VI runtime palette #2 — "dungeon".
 *
 * The 17-byte AC palette table lives at wroot.exe file offset 0x2054
 * (= image 0x1E54); the load is INT 10h AX=1002h at file 0x2105.
 *
 * Compared to wiz6-main, only AC[1..8] differ: dungeon uses DAC indices
 * 0x08..0x0F whereas main uses 0x10..0x17. On real EGA hardware (64-entry
 * DAC) those would be distinct shades. Under VGA emulation of EGA mode
 * 0Dh the BIOS DAC has DAC[8..15] == DAC[16..23] (byte-identical
 * duplicate), so wiz6-main and wiz6-dungeon produce the EXACT same 16
 * final RGB colors after the DAC chain. Both AC tables are retained as
 * separate exports for RE fidelity even though they're visually identical
 * under our emulation target.
 *
 * See docs/re/findings/menu-cursor-render-path.json.
 */
export const WIZ6_DUNGEON_AC: readonly number[] = [
  0x00, 0x0f, 0x09, 0x0d, 0x0c, 0x0e, 0x0a, 0x0b,
  0x08, 0x07, 0x01, 0x05, 0x04, 0x06, 0x02, 0x03,
];

const COLORS = applyAcPalette(WIZ6_DUNGEON_AC) as Palette['colors'];

export const WIZ6_DUNGEON: Palette = {
  name: 'wiz6-dungeon',
  provenance:
    'wroot.exe @ 0x2054 (16-byte AC palette + 1 overscan byte, loaded via INT 10h AX=1002h at file 0x2105). RGB = AC chained through VGA_DEFAULT_DAC.',
  colors: COLORS,
};
