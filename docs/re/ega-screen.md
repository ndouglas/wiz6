# `titlepag.ega`, `graveyrd.ega`, `dragonsc.ega` — 32 KB EGA Screens

**Status:** Format decoded — standard EGA 4bpp planar 320×200 image + 256-byte trailer (palette TBD) + 512-byte zero pad.

The investigation that led to cracking this format is recorded in `docs/re/ega-screen-investigation.md`. This file is the implementation-grade format spec.

## Files

`original/titlepag.ega`, `graveyrd.ega`, `dragonsc.ega` — each exactly **32768 bytes**.

Companion `.cga` (16384 bytes, 2bpp), and `.t16` (32768 bytes, Tandy 16-color) variants exist for each. Those are out of scope here.

## Layout

```
offset 0x0000..0x1F3F  (8000 B)  plane 0 (blue),       40 bytes/row × 200 rows
offset 0x1F40..0x3E7F  (8000 B)  plane 1 (green),      40 bytes/row × 200 rows
offset 0x3E80..0x5DBF  (8000 B)  plane 2 (red),        40 bytes/row × 200 rows
offset 0x5DC0..0x7CFF  (8000 B)  plane 3 (intensity),  40 bytes/row × 200 rows
offset 0x7D00..0x7DFF  (256 B)   trailer (per-screen palette, encoding TBD)
offset 0x7E00..0x7FFF  (512 B)   zero padding
```

Image: **320 × 200 pixels**, 16-color (4bpp), standard EGA color indices.

## Pixel decoding

For pixel at `(x, y)` where `0 ≤ x < 320` and `0 ≤ y < 200`:

```
row_byte_index = y * 40 + (x >> 3)        // 0..7999
bit_index      = 7 - (x & 7)              // MSB is leftmost pixel

b = (plane0[row_byte_index] >> bit_index) & 1
g = (plane1[row_byte_index] >> bit_index) & 1
r = (plane2[row_byte_index] >> bit_index) & 1
i = (plane3[row_byte_index] >> bit_index) & 1

color_index = (i << 3) | (r << 2) | (g << 1) | b   // 0..15
```

This is identical to the pixel encoding used by `wfont1-4.ega` and `wport1-3.ega`, just at image scale instead of tile scale.

## Trailer

The 256 bytes at offset 0x7D00..0x7DFF are preserved verbatim in the extracted JSON (`trailer` field). The encoding is not yet decoded — it might be:

- A packed per-screen palette (each .ega file likely needs its own palette since the in-game color scheme — yellow title text, brown stone walls — doesn't match any palette found in `wroot.exe`).
- A slide-in animation script (the title page is known to slide in from the left in the actual game).
- A custom LUT for runtime color remapping.

Resolving this is a follow-up task; see "Open questions" in `docs/re/ega-screen-investigation.md`.

## File summary

| File          | Visible content (structural)                                                |
|---------------|-----------------------------------------------------------------------------|
| `titlepag.ega` | "BANE OF THE COSMIC FORGE" title screen — text on the left, wizards on the right, dungeon-wall background |
| `graveyrd.ega` | Graveyard cinematic — skull, tombstones, cross, fiery sky |
| `dragonsc.ega` | Top-strip HUD with character/class icons (top ~25% of image; rest is intentionally blank) |
