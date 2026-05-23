# Wizardry VI EGA Runtime Palettes

**Status:** Two palettes discovered and verified empirically against in-game appearance. Per-screen palette switching is documented but not yet handled in the viewer — see "Stage 1d non-goals" in the design spec.

## Where they live

Both palettes are baked into `original/wroot.exe`. The game programs them via the BIOS function `INT 10h, AX=1002h` ("Set All Palette Registers"), which copies a 17-byte table (16 palette register values + 1 overscan/border) from `ES:DX` into the EGA palette registers.

The MZ executable header reports a header size of 0x20 paragraphs (0x200 bytes), so file offset = `0x200 + CS:offset`.

| Site (file offset) | DX value (CS-relative) | Palette table (file offset) |
| ------------------ | ---------------------- | --------------------------- |
| 0x209B             | 0x1E43                 | **0x2043**                  |
| 0x2105             | 0x1E54                 | **0x2054**                  |

The instruction sequence at each call site is:

```text
8C C8        MOV  AX, CS
8E C0        MOV  ES, AX
BA xx xx     MOV  DX, <table_offset>
B8 02 10     MOV  AX, 0x1002
CD 10        INT  10h
```

## Raw bytes

**Palette 1** at file 0x2043 (17 bytes):
```text
00 17 11 15 14 16 12 13 10 07 01 05 04 06 02 03 00
```

**Palette 2** at file 0x2054 (17 bytes):
```text
00 0f 09 0d 0c 0e 0a 0b 08 07 01 05 04 06 02 03 00
```

## EGA register-byte → RGB decoding

Each byte is a 6-bit EGA color code. The bit layout is:

| bit | meaning                   |
| --- | ------------------------- |
| 5   | R at 1/3 intensity (+85)  |
| 4   | G at 1/3 intensity (+85)  |
| 3   | B at 1/3 intensity (+85)  |
| 2   | R at 2/3 intensity (+170) |
| 1   | G at 2/3 intensity (+170) |
| 0   | B at 2/3 intensity (+170) |

For each channel, the displayed value is the sum of contributions from the two bits (capped at 255). Verified against the standard EGA palette: `0x00 → (0,0,0)`, `0x01 → (0,0,170)`, `0x07 → (170,170,170)`, `0x38 → (85,85,85)`, `0x3F → (255,255,255)`.

## Decoded palettes

**Palette 1** (the "main" palette — applied at site 0x209B, used for character creation and most in-game UI):

| idx | reg  | RGB             | rough name        |
| --- | ---- | --------------- | ----------------- |
| 0   | 0x00 | (0, 0, 0)       | black             |
| 1   | 0x17 | (170, 255, 170) | pale green        |
| 2   | 0x11 | (0, 85, 170)    | dark teal         |
| 3   | 0x15 | (170, 85, 170)  | muted magenta     |
| 4   | 0x14 | (170, 85, 0)    | brown             |
| 5   | 0x16 | (170, 255, 0)   | yellow-green      |
| 6   | 0x12 | (0, 255, 0)     | pure bright green |
| 7   | 0x13 | (0, 255, 170)   | mint              |
| 8   | 0x10 | (0, 85, 0)      | dark green        |
| 9   | 0x07 | (170, 170, 170) | light gray        |
| 10  | 0x01 | (0, 0, 170)     | blue              |
| 11  | 0x05 | (170, 0, 170)   | magenta           |
| 12  | 0x04 | (170, 0, 0)     | red               |
| 13  | 0x06 | (170, 170, 0)   | olive / yellow    |
| 14  | 0x02 | (0, 170, 0)     | green             |
| 15  | 0x03 | (0, 170, 170)   | cyan              |

**Palette 2** (the "dungeon" palette — applied at site 0x2105, blue-leaning for dungeon scenes):

| idx  | reg                 | RGB             | rough name       |
| ---- | ------------------- | --------------- | ---------------- |
| 0    | 0x00                | (0, 0, 0)       | black            |
| 1    | 0x0F                | (170, 170, 255) | lavender         |
| 2    | 0x09                | (0, 0, 255)     | pure bright blue |
| 3    | 0x0D                | (170, 0, 255)   | purple           |
| 4    | 0x0C                | (170, 0, 85)    | dark crimson     |
| 5    | 0x0E                | (170, 170, 85)  | dim yellow       |
| 6    | 0x0A                | (0, 170, 85)    | blue-green       |
| 7    | 0x0B                | (0, 170, 255)   | bright cyan      |
| 8    | 0x08                | (0, 0, 85)      | dim blue         |
| 9–15 | (same as Palette 1) |                 |                  |

Indices 9–15 are identical between the two palettes; only 1–8 differ. Wizardry preserves the "primary" colors (red, green, blue, magenta, cyan, yellow, light gray) across both palettes and re-uses indices 1–8 for scene-specific accents.

## Cross-validation (Stage 1d task 2, optional)

If a DOSBox screenshot is taken, the 16 unique non-transparent colors visible in a main-game screen should match Palette 1 RGB values. A screen of the dungeon should match Palette 2. (Validation step is documented as optional in the design spec; the binary evidence alone is considered sufficient.)

## Comprehensive scan (2026-05-23)

The 2026-05-23 pass for the per-scene palette work (`docs/superpowers/specs/2026-05-23-per-scene-palette-design.md`) re-scanned every binary for any palette-touching site. Findings in [`findings/palette-loads.json`](findings/palette-loads.json); summary:

**Result: exactly two EGA-palette-write sites total across every binary.** Both are the `INT 10h AX=1002h` calls already documented above (wroot.exe `0x209B` → palette 1, wroot.exe `0x2105` → palette 2). Specifically:

- **Zero** `INT 10h AX=1000h` (set one palette register) sites.
- **Zero** `INT 10h AX=1001h` (set overscan/border) sites.
- **Zero** `INT 10h AX=1003h` (blink/intensity toggle) sites.
- **Zero** direct EGA Attribute Controller port writes (no `MOV DX, 0x3C0`, no `MOV DX, 0x3DA`, no short-form `OUT 0xC0, AL`) in any binary.
- Seven other `INT 10h` sites in `wroot.exe` were decoded; all are video-mode-set (modes 0Dh, 4h, 9h), cursor positioning (AH=02h), video-mode query (AH=0Fh), or CGA palette select (AH=0Bh; CGA-only function, does not touch EGA palette registers).

**Implication.** The engine has exactly two EGA palettes; there is no per-scene palette switching beyond switching between Palette 1 and Palette 2 at scene transitions, and no runtime register tweaking. The empirically-extracted `wiz6-title` palette in `packages/viewer/src/palettes/wiz6-title.ts` is therefore not a third engine palette — its 16 RGB tuples are exactly the standard EGA-default colors, just assigned to permuted file-bit-pattern indices in the `.ega` decoder's lookup. Title-sequence screens render against the BIOS-default EGA palette (the engine has not yet loaded its first palette table when those screens are drawn). The decoder-side bit permutation should be made explicit in the `.ega` decode path and the calibration palette retired.
