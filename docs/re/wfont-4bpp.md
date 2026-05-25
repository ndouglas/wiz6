# `wfont1-4.ega` — 8×8 4bpp Planar Bitmap Fonts

**Status:** Format fully documented. Used by Wizardry VI for class/race icon fonts and other small 16-color glyphs.

## Files

`original/wfont1.ega`, `original/wfont2.ega`, `original/wfont3.ega`, `original/wfont4.ega` — each exactly **4096 bytes**. The four files share the same format but contain different glyph sets.

The corresponding `.cga` variants are 2048 bytes (2bpp) and `.t16` variants are 4096 bytes (different bit-packing for Tandy 16-color). Both are out of scope here.

`wfont0.ega` (1024 bytes, 1bpp) is documented separately in `wfont.md`.

## Layout

```
offset  size   contents
------  -----  -------------------------------------------------------
0x000   32     Glyph 0, four planes of 8 rows each (plane-sequential).
0x020   32     Glyph 1, four planes of 8 rows each.
...
0xFE0   32     Glyph 127, four planes of 8 rows each.
```

Total: 128 glyphs × 32 bytes = 4096 bytes.

## Glyph encoding

Each 32-byte glyph is **plane-sequential**:

- Bytes 0–7 hold **plane 0**, one byte per row (top to bottom).
- Bytes 8–15 hold **plane 1**, same row order.
- Bytes 16–23 hold **plane 2**.
- Bytes 24–31 hold **plane 3**.

Within each plane byte, **bit 7 (MSB) is the leftmost pixel**, same as `wfont0`. A pixel's 4-bit color index is the concatenation of its bit in each plane, using the standard EGA plane order (B, G, R, I):

```text
blue      = (plane_0_byte >> (7 - c)) & 1
green     = (plane_1_byte >> (7 - c)) & 1
red       = (plane_2_byte >> (7 - c)) & 1
intensity = (plane_3_byte >> (7 - c)) & 1
color = (intensity << 3) | (red << 2) | (green << 1) | blue
```

The color is a 4-bit palette index (0–15).

## Palette

The 4-bit file pixel value IS the framebuffer color attribute the engine writes to VRAM. Under the active AC palette + DAC chain, that attribute resolves to RGB. See `palette-discovery.md` for the AC→DAC chain.

`wroot.exe` 0x2043 holds the main-game AC palette (`wiz6-main`); 0x2054 holds the dungeon AC palette (`wiz6-dungeon`). Under VGA emulation of EGA mode 0Dh the BIOS DAC has `DAC[8..15] == DAC[16..23]`, so the two AC palettes produce byte-identical final RGB. The renderer uses `WIZ6_MAIN` by default.

## Final RGB (under wiz6-main AC + BIOS-default DAC)

```text
 0 (0,   0,   0)    black
 1 (255, 255, 255)  white
 2 (85,  85,  255)  light blue
 3 (255, 85,  255)  light magenta
 4 (255, 85,  85)   light red
 5 (255, 255, 85)   bright yellow
 6 (85,  255, 85)   light green
 7 (85,  255, 255)  light cyan
 8 (85,  85,  85)   dim gray
 9 (170, 170, 170)  light gray
10 (0,   0,   170)  blue
11 (170, 0,   170)  magenta
12 (170, 0,   0)    red
13 (170, 85,  0)    brown
14 (0,   170, 0)    green
15 (0,   170, 170)  cyan
```

## Glyph index mapping

Same as `wfont0`: the precise glyph-to-character mapping is Wizardry-specific and **out of scope**. Visual inspection of `wfont1.ega` reveals abbreviated class names ("FIG", "MAG", "PRI", "THI", "RAN", "ALC", "BAR", "PSI", "VAL", "BIS", "LOR", "SAM", "MON", "NIN") and various decorative icons (crosses, X-marks, frames) — strongly suggesting `wfont1.ega` is the class/race icon font.

`wfont2.ega`, `wfont3.ega`, `wfont4.ega` contain different glyph sets in the same format; their specific contents are not catalogued here.

## Reference fixture (used by decoder tests)

Glyph 0 of `wfont1.ega` is entirely zero (an empty / unused slot in the codepoint table). For a non-trivial real-file reference, glyph 37 has content in all four planes:

Bytes 0x4A0–0x4BF of `wfont1.ega` (glyph 37):

```text
00 00 ea ac ea 00 00 00   plane 0 (rows 0..7)
fe 00 00 00 00 00 fe 00   plane 1 (rows 0..7)
fe 00 ea ac ea 00 fe 00   plane 2 (rows 0..7)
ff 01 01 01 01 01 ff ff   plane 3 (rows 0..7)
```

Pixel readings for glyph 37 (using the **standard EGA** plane order B, G, R, I):
- Row 0, column 0 → B=0, G=1, R=1, I=1 → color **14** (yellow). Plane bits: (0x00>>7=0, 0xfe>>7=1, 0xfe>>7=1, 0xff>>7=1).
- Row 0, column 7 → B=0, G=0, R=0, I=1 → color **8** (dark gray). Plane bits: (0x00>>0=0, 0xfe>>0=0, 0xfe>>0=0, 0xff>>0=1).
- Row 1, column 7 → B=0, G=0, R=0, I=1 → color **8** (dark gray). The first/last rows of the glyph are framed by plane 3 (intensity).
- Row 2, column 0 → B=1, G=0, R=1, I=0 → color **5** (magenta). Plane bits: (0xea>>7=1, 0x00>>7=0, 0xea>>7=1, 0x01>>7=0). Combined: `(0<<3) | (1<<2) | (0<<1) | 1` = `0b0101` = 5.

These are colors **under the default EGA palette**. In-game, the same color indices may appear as different colors due to the palette remapping noted above.

Pixel arithmetic (synthetic, for the all-set case):
- Plane bits at any (row, col) where each plane byte's relevant bit is 1: combined color = `(1<<3) | (1<<2) | (1<<1) | 1` = `0b1111` = `15` (white).

## Validation

`packages/parser/tests/formats/wfont-4bpp.test.ts` asserts the decoder produces the expected glyph bytes for these fixture cases.
