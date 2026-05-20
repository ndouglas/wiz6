import type { Palette } from '@wiz6/data';

// Wizardry VI title-sequence palette — used by the engine while displaying
// `titlepag.ega`, `graveyrd.ega`, and `dragonsc.ega`. Discovered in Stage 1f.2
// by capturing the actual title screen in DOSBox-X and inverting the
// pixel-to-bit-pattern mapping (see docs/re/ega-screen.md "Palette" section).
//
// Unlike `wiz6-main` and `wiz6-dungeon`, this palette is NOT loaded via a
// statically-visible `INT 10h AX=1002h` call in `wroot.exe`. It must be set
// by code in `winit.ovr` (or wroot routines invoked via overlay thunks) that
// we have not yet traced. The colors below are extracted empirically from
// the captured frame, then verified to reproduce the in-game palette exactly.
//
// Bit-pattern → color is intentionally permuted from a "raw 4bpp planar"
// mapping, so .ega screen files render correctly *only* with this palette,
// not with `wiz6-main` or `ega-default`.
//
// Empirically, this palette also looks better than `wiz6-main` for the
// fonts and portraits — suggesting that those assets were authored against
// a standard-EGA-like palette (which `wiz6-title` is, just permuted), and
// the green-themed `wiz6-main` palette is for some specific gameplay screen
// rather than a global default. This is now the picker's default.
export const WIZ6_TITLE_PALETTE: Palette = {
  name: 'wiz6-title',
  provenance: 'Stage 1f.2 — extracted from DOSBox-X capture of the title sequence',
  colors: [
    [0, 0, 0],         // file 0x0 → EGA 0  black (background)
    [255, 255, 255],   // file 0x1 → EGA 15 white  (title text, highlights)
    [85, 85, 255],     // file 0x2 → EGA 9  light blue
    [170, 0, 170],     // file 0x3 → EGA 5  magenta
    [255, 85, 85],     // file 0x4 → EGA 12 bright red
    [255, 255, 85],    // file 0x5 → EGA 14 yellow
    [85, 255, 85],     // file 0x6 → EGA 10 bright green
    [85, 255, 255],    // file 0x7 → EGA 11 bright cyan
    [85, 85, 85],      // file 0x8 → EGA 8  dark gray  (stone walls)
    [170, 170, 170],   // file 0x9 → EGA 7  light gray (wall highlights)
    [0, 0, 170],       // file 0xa → EGA 1  blue
    [255, 85, 255],    // file 0xb → EGA 13 bright magenta
    [170, 0, 0],       // file 0xc → EGA 4  red       (wizard cape)
    [170, 85, 0],      // file 0xd → EGA 6  brown     (dwarf beard, leather)
    [0, 170, 0],       // file 0xe → EGA 2  green     (dwarf tunic)
    [0, 170, 170],     // file 0xf → EGA 3  cyan
  ],
};
