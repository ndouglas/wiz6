# `wfont0.ega` — 8×8 1bpp Bitmap Font

**Status:** Format fully documented. Used by Wizardry VI for the smallest font asset.

## File

`original/wfont0.ega` — exactly **1024 bytes**, no header, no palette, no padding.

The `.cga` and `.t16` variants (`wfont0.cga`, `wfont0.t16`) are **out of scope** for this doc; they have different sizes (2048 bytes and 4096 bytes respectively) and likely different layouts. They will be documented separately if/when needed.

`wfont1.ega` through `wfont4.ega` are 4096 bytes each and use a **different format** (likely 4bpp or larger glyphs); they are also out of scope here.

## Layout

```
offset  size   contents
------  -----  -------------------------------------------------------
0x000   8      Glyph 0, eight rows (one byte per row).
0x008   8      Glyph 1, eight rows.
...
0x3F8   8      Glyph 127, eight rows.
```

Total: 128 glyphs × 8 bytes = 1024 bytes.

## Glyph encoding

Each glyph is an 8×8 grid of pixels stored as eight bytes:

- **Row order**: top-to-bottom. `glyph[g][0]` is the top row of glyph `g`; `glyph[g][7]` is the bottom row.
- **Bit order within a byte**: **bit 7 (MSB) is the leftmost pixel**; bit 0 is the rightmost. A set bit (1) means foreground; a clear bit (0) means background.
- **Bits per pixel**: 1.

Pseudocode for reading pixel at glyph `g`, row `r`, column `c`:

```text
byte = data[g * 8 + r]
pixel = (byte >> (7 - c)) & 1
```

## Glyph index mapping

The mapping from glyph index to logical character is **Wizardry-specific** and **not documented here**. Visual inspection of the rendered grid shows:
- Glyphs in the upper rows include digits, punctuation, and box-drawing characters.
- A run of uppercase A–Z appears in the middle of the table.
- A run of lowercase a–z appears below that.
- Several glyphs near the start and end of the table are non-ASCII (custom Wizardry symbols).

Establishing the precise codepoint table requires correlating with text-rendering code in the overlay binaries (`wpops.ovr`) and is **deferred to a later stage** when we need to render actual game strings.

## Reference fixture (used by decoder tests)

These bytes are extracted from the real file at known offsets and used as test fixtures in `packages/parser/tests/formats/wfont.test.ts`:

- **Glyph 0** (offset 0x000): `00 00 00 00 00 00 00 00` — empty.
- **Glyph 1** (offset 0x008): `00 00 00 0f 10 20 20 20` — partial drawn glyph (used as a non-trivial decoding probe).

Real-file pixel readings (verified against the rendered glyph grid) used to lock in decode correctness:

- Glyph 1, row 3, column 4 → `(0x0f >> (7 - 4)) & 1` = `(0x0f >> 3) & 1` = `1` (foreground).
- Glyph 1, row 3, column 0 → `(0x0f >> 7) & 1` = `0` (background).
- Glyph 1, row 6, column 2 → `(0x20 >> 5) & 1` = `1` (foreground).

## Validation

`packages/parser/tests/formats/wfont.test.ts` asserts the decoder produces the expected pixel values for these fixture cases.
