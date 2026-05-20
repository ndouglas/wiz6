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

## Palette — known to be approximate, not yet correct

The file does **not** carry its own palette, and Wizardry VI **reprograms the EGA palette registers at runtime** (a very common technique in EGA games). The same pixel value can therefore appear as different colors in different game screens — for example, the same file color index might be displayed as red in one menu and yellow in another, depending on which palette the game has loaded.

Stage 1c's viewer uses the **default 16-color EGA palette** as a placeholder. The plane decoding is correct (text and icon *shapes* render perfectly), but specific *colors* will not match the in-game appearance in many cases. Concrete examples observed during Stage 1c:

- `wfont1` class abbreviations ("FIG", "MAG", "PRI", …) appear in dark magenta in our viewer; in-game they are bright magenta.
- `wfont1` health/stamina bars appear in green tones in our viewer; in-game they are red and yellow.
- `wfont2` movement-button labels ("TURN", "MOVE") appear cyan-ish in our viewer; in-game they are yellow.

Reading the actual runtime palettes from the executable (likely set in `winit.ovr` and/or per-screen by `wpops.ovr` / `wmaze.ovr`) is **Stage 1d work**. Until then, all 4bpp viewer renderings should be treated as structurally correct but colorimetrically approximate.

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
