import type { Palette } from '../schemas/palette.js';

/**
 * Wizardry VI runtime palette #2 — "dungeon".
 *
 * Applied via INT 10h AX=1002h at the call site at file offset 0x2105 in
 * wroot.exe. The 17-byte palette table lives at file offset 0x2054
 * (= CS:0x1E54). Blue-leaning; indices 9..15 are identical to wiz6-main.
 *
 * Discovered in Stage 1d; see docs/re/palette-discovery.md.
 */
export const WIZ6_DUNGEON: Palette = {
  name: 'wiz6-dungeon',
  provenance: 'wroot.exe @ 0x2054 (17-byte palette table loaded by INT 10h AX=1002h at 0x2105)',
  colors: [
    [0, 0, 0],
    [170, 170, 255],
    [0, 0, 255],
    [170, 0, 255],
    [170, 0, 85],
    [170, 170, 85],
    [0, 170, 85],
    [0, 170, 255],
    [0, 0, 85],
    [170, 170, 170],
    [0, 0, 170],
    [170, 0, 170],
    [170, 0, 0],
    [170, 170, 0],
    [0, 170, 0],
    [0, 170, 170],
  ],
};
