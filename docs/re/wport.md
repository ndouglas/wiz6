# `wport1-3.ega` — 14 × 24 × 24 4bpp Portrait Sets

**Status:** Format decoded and visually verified against the running game. The 8×8 4bpp tile primitive is shared with `wfont1-4`; portraits add a 3×3 row-major composition layer.

## Files

`original/wport1.ega`, `wport2.ega`, `wport3.ega` — each exactly **4096 bytes**.

The corresponding `.cga` files (2048 bytes each, 2bpp) and `.t16` files (4096 bytes each) are out of scope here.

## Active region

Each file's first **4032 bytes** carry portrait data; the last **64 bytes** (offsets 0xFC0..0xFFF) are zero padding (two unused tile slots, 32 bytes each).

## Layout

```
offset  size   contents
------  -----  ------------------------------------------------------------
0x000   288    Portrait 0  — 9 tiles arranged 3 × 3 row-major (24 × 24 px)
0x120   288    Portrait 1
0x240   288    Portrait 2
0x360   288    Portrait 3
0x480   288    Portrait 4
0x5A0   288    Portrait 5
0x6C0   288    Portrait 6
0x7E0   288    Portrait 7
0x900   288    Portrait 8
0xA20   288    Portrait 9
0xB40   288    Portrait 10
0xC60   288    Portrait 11
0xD80   288    Portrait 12
0xEA0   288    Portrait 13
0xFC0   64     Zero padding (two unused 32-byte tile slots)
```

Total: 14 portraits × 9 tiles × 32 bytes = 4032 bytes + 64 padding = 4096 bytes.

The 14 portraits per file × 3 files = **42 portraits** total. `wport1.ega` and `wport2.ega` hold playable character portraits (the count matches Wizardry VI's 14 classes — Fighter, Mage, Priest, Thief, Ranger, Alchemist, Bard, Psionic, Valkyrie, Bishop, Lord, Samurai, Monk, Ninja). `wport3.ega` holds NPC / monster / other portraits in the same format.

## Tile composition

Each portrait is **24 × 24 pixels** built from **9 contiguous 32-byte 8×8 tiles** arranged in a **3 × 3 grid, row-major**:

```text
Tile index → portrait position
 0 = (col 0, row 0)   1 = (col 1, row 0)   2 = (col 2, row 0)
 3 = (col 0, row 1)   4 = (col 1, row 1)   5 = (col 2, row 1)
 6 = (col 0, row 2)   7 = (col 1, row 2)   8 = (col 2, row 2)
```

Pixel (px, py) inside a portrait → tile index = (py / 8) × 3 + (px / 8); within-tile column = px % 8, within-tile row = py % 8.

## Tile encoding

Identical to `wfont1-4` (see `wfont-4bpp.md`):

- 32 bytes per tile: bytes 0–7 = plane 0, 8–15 = plane 1, 16–23 = plane 2, 24–31 = plane 3.
- Standard EGA plane order: plane 0 = blue, plane 1 = green, plane 2 = red, plane 3 = intensity.
- Bit 7 (MSB) of each plane byte = leftmost pixel of that row.
- Pixel color index = `(intensity << 3) | (red << 2) | (green << 1) | blue` (0..15).

## Palette

Use `WIZ6_PALETTE_1` (the "wiz6-main" palette discovered in Stage 1d — see `palette-discovery.md`). Portraits are shown during character creation and in the party UI, both of which run under this main palette.

## Validation

`packages/parser/tests/formats/wport.test.ts` asserts the decoder produces 14 portraits of 9 32-byte tiles each, with correct pass-through of source metadata.
