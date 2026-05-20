import type { Palette } from '@wiz6/data';

// Wizardry VI runtime palette #1 — applied via INT 10h AX=1002h at the call
// site at file offset 0x209B in wroot.exe. The 17-byte palette table lives
// at file offset 0x2043 (= CS:0x1E43). This is the "main" palette used for
// character creation and most in-game UI. Discovered in Stage 1d; see
// docs/re/palette-discovery.md for the methodology and raw bytes.
export const WIZ6_PALETTE_1: Palette = {
  name: 'wiz6-main',
  provenance: 'wroot.exe @ 0x2043 (17-byte palette table loaded by INT 10h AX=1002h at 0x209B)',
  colors: [
    [0, 0, 0],
    [170, 255, 170],
    [0, 85, 170],
    [170, 85, 170],
    [170, 85, 0],
    [170, 255, 0],
    [0, 255, 0],
    [0, 255, 170],
    [0, 85, 0],
    [170, 170, 170],
    [0, 0, 170],
    [170, 0, 170],
    [170, 0, 0],
    [170, 170, 0],
    [0, 170, 0],
    [0, 170, 170],
  ],
};
