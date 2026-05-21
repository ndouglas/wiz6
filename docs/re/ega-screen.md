# `titlepag.ega`, `graveyrd.ega`, `dragonsc.ega` — 32 KB EGA Screens

**Status:** Format decoded — standard EGA 4bpp planar 320×200 image with **per-plane cyclic X shifts** + 768-byte trailer (palette/script TBD).

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
offset 0x7D00..0x7FFF  (768 B)   trailer (very likely uninitialized buffer junk; titlepag has ~256 B of content + ~512 B zeros, graveyrd has scattered non-zero content, dragonsc is entirely zero — yet all three render correctly without using the trailer)
```

Image: **320 × 200 pixels**, 16-color (4bpp), standard EGA color indices.

## Pixel decoding

Each plane stores its pixel data **pre-shifted by a per-plane offset**. Plane P's bytes correspond to the source image shifted by `shiftX = 64 * P` pixels horizontally (cyclically) and `shiftY = -5 * P` rows vertically.

Crucially, the horizontal shift is implemented as a **byte-level cyclic rotation of the entire 8000-byte plane buffer** rather than a per-row rotation, so the data rolls across row boundaries at the shift column. This manifests as a **one-row Y offset on the left side of the wrap column**: pixels to the LEFT of `shiftX` come from one row LOWER in the source than pixels to the right.

To produce displayed pixel `(x, y)` from plane P, with image width W = 320 and height H = 200:

```
shiftX = (64 * P) mod W                               // 0, 64, 128, 192
shiftY = -5 * P                                       // 0, -5, -10, -15
yDrop  = (x < shiftX) ? 1 : 0                         // +1 row on the left side
srcY   = y - shiftY - yDrop
if srcY < 0 or srcY >= H: bit = 0                     // out of bounds
else:
    srcX  = (x - shiftX) mod W                        // cyclic
    byte  = plane[P][srcY * 40 + (srcX >> 3)]
    bitN  = 7 - (srcX & 7)                            // MSB = leftmost
    bit   = (byte >> bitN) & 1
color_index = (bit_3 << 3) | (bit_2 << 2) | (bit_1 << 1) | bit_0
```

This formula was discovered in Stage 1f.3 by interactive alignment in the `ScreenAlignmentTool` (which supports per-plane split offsets so two regions can be tuned independently). The same pattern produces pixel-accurate composites for all three known screens — `titlepag`, `graveyrd`, and `dragonsc` — confirming this is the canonical file-format rule.

For the simpler font and portrait formats (`wfont1-4.ega`, `wport1-3.ega`) the planes are **not shifted** — this per-plane shift pattern is specific to the 32 KB screen files.

### Why the planes are pre-shifted

**Unknown.** Empirically verified that the formula above produces pixel-accurate output for all three known screens, but the reason the file format stores planes this way is not yet established. The very mechanical `64*P` / `-5*P` pattern suggests a tool-applied transform (consistent across all assets) rather than an artist-applied per-asset choice. Working hypotheses:

- The shifts might fall out of the engine's draw routine using EGA "start address" hardware features — if each plane's source-data start address is offset by `(64*P pixels + 5*P rows)` in a shared video buffer, the displayed planes would appear shifted by exactly those amounts. The byte-level cyclic rotation we observe is consistent with EGA "start address" register behavior wrapping around the plane size.
- Could be a storage layout optimized for specific EGA write-mode tricks (e.g., the latch register can copy pre-shifted bytes between planes during reads, which a packing tool could exploit).
- Could just be an artifact of the artist's tool that the engine accommodates.

Confirming this would require tracing the actual draw routine reached via `winit.ovr`'s overlay thunks (`func_0xf130` / `func_0xf118`, called from `FUN_08f7`). Not load-bearing for correct rendering: the formula above is sufficient.

## Trailer

The 768 bytes at offset 0x7D00..0x7FFF are preserved verbatim in the extracted JSON (`trailer` field). Files differ in how much of the trailer they use — titlepag.ega has roughly 256 active bytes followed by ~512 zero bytes, graveyrd.ega has structured content extending past byte 256, and dragonsc.ega's trailer is entirely zero. Given that dragonsc renders correctly with no trailer content, the trailer is **most likely uninitialized buffer junk** from the artist's tool, not data the engine actually reads.

## Palette

The engine renders the title sequence (titlepag, graveyrd, dragonsc) using a **custom 16-entry palette permutation** of the standard EGA defaults, NOT the `wiz6-main` palette used during gameplay. Stage 1f.2 discovered this palette by capturing the title screen in DOSBox-X and inverting the per-pixel bit-pattern → color mapping. The resulting table:

| file pattern | EGA color | label                          |
| ------------ | --------- | ------------------------------ |
| 0x0          | 0         | black (background)             |
| 0x1          | 15        | white (title text, highlights) |
| 0x2          | 9         | light blue                     |
| 0x3          | 5         | magenta                        |
| 0x4          | 12        | bright red                     |
| 0x5          | 14        | yellow                         |
| 0x6          | 10        | bright green                   |
| 0x7          | 11        | bright cyan                    |
| 0x8          | 8         | dark gray (stone walls)        |
| 0x9          | 7         | light gray (wall highlights)   |
| 0xa          | 1         | blue                           |
| 0xb          | 13        | bright magenta                 |
| 0xc          | 4         | red (wizard cape)              |
| 0xd          | 6         | brown (dwarf beard, leather)   |
| 0xe          | 2         | green (dwarf tunic)            |
| 0xf          | 3         | cyan                           |

This palette is stored as `WIZ6_TITLE_PALETTE` in `packages/viewer/src/palettes/wiz6-title.ts` and is auto-applied to all `<ScreenGallery>` instances regardless of the picker selection. The picker still offers `wiz6-title` as a fourth option for inspecting fonts/portraits under this palette.

**Where the engine sets these palette registers is not yet known.** There is no `INT 10h AX=1002h` site in `wroot.exe` that loads this table, and no direct attribute-controller port writes anywhere in the binaries. The setup must happen via code reached through `winit.ovr`'s overlay thunks (likely `func_0xf130` or `func_0xf118`, called from `FUN_08f7`), or through individual `INT 10h AH=10h AL=0h` register writes we haven't matched. Tracing this requires either single-stepping in DOSBox-X's integrated debugger or resolving the MS-C overlay thunk table in `wroot.exe`. For now, the empirically-derived palette is what the renderer uses.

## File summary

| File           | Visible content                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `titlepag.ega` | "BANE OF THE COSMIC FORGE" title screen — text on the left, dungeon-wall background, dwarf and three wizards on the right           |
| `graveyrd.ega` | Graveyard cinematic — central ghost figure, tombstones and crosses, dead tree, magical glow                                         |
| `dragonsc.ega` | Top-strip HUD: "Wizardry" title in red between two golden dragon wings, character-class portrait icons in framed boxes on each side |

## Known residual differences from the original game

After Stage 1f.2 (palette discovery via DOSBox-X capture), the renderer reproduces the title screen, graveyard, and dragon HUD with the correct colors. Small differences remain:

- The **per-plane Y offsets** (-5, -10, -14) were found by manual visual alignment and may be 1-2 pixels off from what the engine actually uses.
- Where to find the **palette setup code** in the engine is still unknown (the palette values themselves are verified).

Both are minor and can be resolved by tracing the actual draw routine via the DOSBox-X integrated debugger.
