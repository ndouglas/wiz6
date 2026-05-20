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
offset 0x7D00..0x7FFF  (768 B)   trailer (per-screen palette / animation script, encoding TBD; titlepag has ~256 B of content + ~512 B of trailing zeros, graveyrd has structured content extending past byte 256)
```

Image: **320 × 200 pixels**, 16-color (4bpp), standard EGA color indices.

## Pixel decoding

Each plane stores its pixel data pre-shifted horizontally by a per-plane offset. To produce the displayed pixel at screen coordinate `(x, y)`, sample each plane at `(x - dx_N, y - dy_N)` with **cyclic X wrap** (so coordinates outside 0..319 wrap modulo 320) and **bounded Y** (out-of-range = 0):

```
PLANE_OFFSETS = [
    { dx:    0, dy:   0 },   // plane 0 (B)
    { dx:  +64, dy:  -5 },   // plane 1 (G)
    { dx: +128, dy: -10 },   // plane 2 (R)
    { dx: -128, dy: -14 },   // plane 3 (I)  ≡  dx=+192 mod 320
]

for each (x, y) in 0..319, 0..199:
    bits = [0, 0, 0, 0]
    for plane_idx in 0..3:
        (dx, dy) = PLANE_OFFSETS[plane_idx]
        src_y = y - dy                              // bounded
        if src_y < 0 or src_y >= 200: continue      // contributes 0
        src_x = (x - dx) mod 320                    // cyclic
        byte_idx = src_y * 40 + (src_x >> 3)        // 0..7999
        bit_idx  = 7 - (src_x & 7)                  // MSB = leftmost
        bits[plane_idx] = (plane[plane_idx][byte_idx] >> bit_idx) & 1
    color_index = (bits[3] << 3) | (bits[2] << 2) | (bits[1] << 1) | bits[0]
```

The shifts are **constant across all three known screens** (titlepag, graveyrd, dragonsc). The Y values (-5, -10, -14) are not a clean linear progression and may be approximations from manual visual alignment; expect refinement of ±1-2 pixels once the actual draw routine is traced in DOSBox-X.

For the simpler font and portrait formats (`wfont1-4.ega`, `wport1-3.ega`) the planes are **not shifted** — the per-plane offset trick is specific to the 32 KB screen files.

### Why the planes are pre-shifted

We don't yet know. Hypotheses:

- **Slide-in animation precompute**: the title screen slides in from the side; storing the image at 4 different cyclic shifts lets the engine display intermediate animation frames cheaply by selecting different plane-mask combinations.
- **Authoring artifact**: the original graphics tool may have stored multi-image data in a way that produced this layout.
- **EGA write-mode optimization**: pre-shifted data plus the EGA latch register can speed up certain compositing operations.

Resolving this requires reading the draw routine in `wroot.exe` (the function reached via the overlay thunks from `winit.ovr`'s `FUN_08f7`). See `docs/re/ega-screen-investigation.md` for entry points.

## Trailer

The 768 bytes at offset 0x7D00..0x7FFF are preserved verbatim in the extracted JSON (`trailer` field). Files differ in how much of the trailer they use — titlepag.ega has roughly 256 active bytes followed by ~512 zero bytes, graveyrd.ega has structured content extending past byte 256, and dragonsc.ega's trailer is entirely zero. Given that dragonsc renders correctly with no trailer content, the trailer is **most likely uninitialized buffer junk** from the artist's tool, not data the engine actually reads.

## Palette

The engine renders the title sequence (titlepag, graveyrd, dragonsc) using a **custom 16-entry palette permutation** of the standard EGA defaults, NOT the `wiz6-main` palette used during gameplay. Stage 1f.2 discovered this palette by capturing the title screen in DOSBox-X and inverting the per-pixel bit-pattern → color mapping. The resulting table:

| file pattern | EGA color | label |
|---|---|---|
| 0x0 | 0  | black (background) |
| 0x1 | 15 | white (title text, highlights) |
| 0x2 | 9  | light blue |
| 0x3 | 5  | magenta |
| 0x4 | 12 | bright red |
| 0x5 | 14 | yellow |
| 0x6 | 10 | bright green |
| 0x7 | 11 | bright cyan |
| 0x8 | 8  | dark gray (stone walls) |
| 0x9 | 7  | light gray (wall highlights) |
| 0xa | 1  | blue |
| 0xb | 13 | bright magenta |
| 0xc | 4  | red (wizard cape) |
| 0xd | 6  | brown (dwarf beard, leather) |
| 0xe | 2  | green (dwarf tunic) |
| 0xf | 3  | cyan |

This palette is stored as `WIZ6_TITLE_PALETTE` in `packages/viewer/src/palettes/wiz6-title.ts` and is auto-applied to all `<ScreenGallery>` instances regardless of the picker selection. The picker still offers `wiz6-title` as a fourth option for inspecting fonts/portraits under this palette.

**Where the engine sets these palette registers is not yet known.** There is no `INT 10h AX=1002h` site in `wroot.exe` that loads this table, and no direct attribute-controller port writes anywhere in the binaries. The setup must happen via code reached through `winit.ovr`'s overlay thunks (likely `func_0xf130` or `func_0xf118`, called from `FUN_08f7`), or through individual `INT 10h AH=10h AL=0h` register writes we haven't matched. Tracing this requires either single-stepping in DOSBox-X's integrated debugger or resolving the MS-C overlay thunk table in `wroot.exe`. For now, the empirically-derived palette is what the renderer uses.

## File summary

| File          | Visible content                                                |
|---------------|----------------------------------------------------------------|
| `titlepag.ega` | "BANE OF THE COSMIC FORGE" title screen — text on the left, dungeon-wall background, dwarf and three wizards on the right |
| `graveyrd.ega` | Graveyard cinematic — central ghost figure, tombstones and crosses, dead tree, magical glow |
| `dragonsc.ega` | Top-strip HUD: "Wizardry" title in red between two golden dragon wings, character-class portrait icons in framed boxes on each side |

## Known residual differences from the original game

After Stage 1f.2 (palette discovery via DOSBox-X capture), the renderer reproduces the title screen, graveyard, and dragon HUD with the correct colors. Small differences remain:

- The **per-plane Y offsets** (-5, -10, -14) were found by manual visual alignment and may be 1-2 pixels off from what the engine actually uses.
- Where to find the **palette setup code** in the engine is still unknown (the palette values themselves are verified).

Both are minor and can be resolved by tracing the actual draw routine via the DOSBox-X integrated debugger.
