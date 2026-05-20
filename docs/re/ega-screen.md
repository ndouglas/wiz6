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

The 768 bytes at offset 0x7D00..0x7FFF are preserved verbatim in the extracted JSON (`trailer` field). Files differ in how much of the trailer they use — titlepag.ega has roughly 256 active bytes followed by ~512 zero bytes, while graveyrd.ega has structured content extending past byte 256 (79 non-zero bytes scattered between offset 256 and 304 of the trailer). The encoding is not yet decoded — it might be:

- A packed per-screen palette (each .ega file likely needs its own palette since the in-game color scheme — yellow title text, brown stone walls — doesn't match any palette found in `wroot.exe`).
- A slide-in animation script (the title page is known to slide in from the left in the actual game).
- A custom LUT for runtime color remapping.

Resolving this is a follow-up task; see "Open questions" in `docs/re/ega-screen-investigation.md`.

## File summary

| File          | Visible content                                                |
|---------------|----------------------------------------------------------------|
| `titlepag.ega` | "BANE OF THE COSMIC FORGE" title screen — text on the left, dungeon-wall background, dwarf and three wizards on the right |
| `graveyrd.ega` | Graveyard cinematic — central ghost figure, tombstones and crosses, dead tree, magical glow |
| `dragonsc.ega` | Top-strip HUD: "Wizardry" title in red between two golden dragon wings, character-class portrait icons in framed boxes on each side |

## Known residual differences from the original game

The current renderer produces structurally correct images that closely match the in-game appearance but with a faint greenish tinge and slightly muted color variation versus the original. Likely causes:

- The **per-plane Y offsets** (-5, -10, -14) were found by manual visual alignment and may be a pixel or two off.
- The **palette** is whichever the picker is set to (defaults to `wiz6-main`). The true per-screen palette may live in the 768-byte trailer or be set by a routine inside `wroot.exe` that we haven't traced yet.

Both can be resolved by a DOSBox-X trace of the actual draw routine.
