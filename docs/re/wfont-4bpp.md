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

Wizardry VI reprograms the EGA palette registers at runtime — the file format does not carry its own palette. The two runtime palettes baked into `wroot.exe` were discovered in Stage 1d; see `palette-discovery.md` for the methodology, raw bytes, and decoded RGB tables.

- `WIZ6_PALETTE_1` ("wiz6-main") — applied at the `INT 10h AX=1002h` call site at file offset 0x209B. Indices 9–15 are the standard EGA primaries (red, green, blue, magenta, cyan, yellow, light gray); indices 1–8 are green-leaning UI accents. This is the default palette used by the Stage 1d viewer.
- `WIZ6_PALETTE_2` ("wiz6-dungeon") — applied at 0x2105. Indices 9–15 are identical to palette 1; indices 1–8 are blue/purple variants for dungeon scenes.

The Stage 1d viewer's palette picker switches between these two and the default EGA palette for side-by-side comparison.

**Per-screen palette switching** is documented but not yet handled beyond the two known palettes — if the game programs additional palettes from other call sites (besides 0x209B and 0x2105), they have not yet been catalogued.

## Standard EGA palette (used for rendering)

```text
 0 (0,   0,   0)    black
 1 (0,   0,   170)  blue
 2 (0,   170, 0)    green
 3 (0,   170, 170)  cyan
 4 (170, 0,   0)    red
 5 (170, 0,   170)  magenta
 6 (170, 85,  0)    brown
 7 (170, 170, 170)  light gray
 8 (85,  85,  85)   dark gray
 9 (85,  85,  255)  light blue
10 (85,  255, 85)   light green
11 (85,  255, 255)  light cyan
12 (255, 85,  85)   light red
13 (255, 85,  255)  light magenta
14 (255, 255, 85)   yellow
15 (255, 255, 255)  white
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
