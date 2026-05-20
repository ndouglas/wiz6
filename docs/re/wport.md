# `wport1-3.ega` — 8 × 32 × 32 4bpp Portrait Sets

**Status:** Format decoded. The 8x8 4bpp tile primitive is shared with `wfont1-4`; portraits add a 4×4 row-major composition layer.

## Files

`original/wport1.ega`, `wport2.ega`, `wport3.ega` — each exactly **4096 bytes**.

The corresponding `.cga` files (2048 bytes each, 2bpp) and `.t16` files (4096 bytes each) are out of scope here.

## Active region

Each file's first **4032 bytes** carry data; the last **64 bytes** (offsets 0xFC0..0xFFF) are zero padding to the 4KB boundary.

## Layout

```
offset  size   contents
------  -----  -------------------------------------------------------
0x000   512    Portrait 0 — 16 tiles arranged 4 × 4 row-major
0x200   512    Portrait 1
0x400   512    Portrait 2
0x600   512    Portrait 3
0x800   512    Portrait 4
0xA00   512    Portrait 5
0xC00   512    Portrait 6
0xE00   512    Portrait 7
0xFC0   64     Zero padding (unused)
```

Total: 8 portraits × 16 tiles × 32 bytes = 4096 bytes.

## Tile composition

Each portrait is **32 × 32 pixels** built from **16 contiguous 32-byte 8×8 tiles** arranged in a **4 × 4 grid, row-major**:

```text
Tile index → portrait position
 0 = (col 0, row 0)   1 = (col 1, row 0)   2 = (col 2, row 0)   3 = (col 3, row 0)
 4 = (col 0, row 1)   5 = (col 1, row 1)   6 = (col 2, row 1)   7 = (col 3, row 1)
 8 = (col 0, row 2)   9 = (col 1, row 2)  10 = (col 2, row 2)  11 = (col 3, row 2)
12 = (col 0, row 3)  13 = (col 1, row 3)  14 = (col 2, row 3)  15 = (col 3, row 3)
```

Each tile is 8 × 8 pixels. Pixel (px, py) inside a portrait → tile index = (py / 8) × 4 + (px / 8); within-tile column = px % 8, within-tile row = py % 8.

## Tile encoding

Identical to `wfont1-4` (see `wfont-4bpp.md`):

- 32 bytes per tile: bytes 0–7 = plane 0, 8–15 = plane 1, 16–23 = plane 2, 24–31 = plane 3.
- Standard EGA plane order: plane 0 = blue, plane 1 = green, plane 2 = red, plane 3 = intensity.
- Bit 7 (MSB) of each plane byte = leftmost pixel of that row.
- Pixel color index = `(intensity << 3) | (red << 2) | (green << 1) | blue` (0..15).

## Palette

Use `WIZ6_PALETTE_1` (the "wiz6-main" palette discovered in Stage 1d — see `palette-discovery.md`). Portraits are most likely shown during character creation, which uses this main palette.

## Content (empirical observations)

- `wport1.ega` and `wport2.ega` render as character-head-style 32×32 sprites. Exact race / gender / class assignments are not catalogued here.
- `wport3.ega` renders with the same byte layout but its 8 sprites appear more abstract (possibly NPC heads, monster portraits, or items). Format is the same; semantics differ.

## Validation

`packages/parser/tests/formats/wport.test.ts` asserts the decoder produces 8 portraits of 16 32-byte tiles each, with correct pass-through of source metadata.
