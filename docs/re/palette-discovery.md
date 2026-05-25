# Wizardry VI EGA Palettes

**Status (2026-05-25, supersedes 2026-05-22 narrative below):** the engine's color system is a two-stage AC→DAC chain, not a single palette. The DAC stays at BIOS default in every captured save state (entries 0..7 = dim colors, 16..23 = bright colors, 8..15 = a duplicate of 16..23 under VGA-emulating-EGA). The 16-byte tables at `wroot.exe` 0x2043 (`wiz6-main`) and 0x2054 (`wiz6-dungeon`) are **AC palette registers**, not RGB triples — they're DAC INDICES that the EGA Attribute Controller uses to remap 4-bit color attributes to DAC entries. `wiz6-main` is the AC active across every captured save (verified by Vga-blob byte match in saves 1, 2, 5, 10, 13).

This corrects two earlier mistakes:

1. `packages/data/src/palettes/wiz6-main.ts` and `wiz6-dungeon.ts` previously shipped the 16 AC bytes 6-bit-expanded as if they were direct RGB triples. They've been corrected to chain `palette.colors[i] = VGA_DEFAULT_DAC[AC[i]]`.

2. `EGA_FILE_INDEX_PERMUTATION` was an empirical workaround that approximated the AC→DAC chain through a DAC index permutation over `EGA_DEFAULT`. It's correct at 14 of 16 file colors and off-by-shade at colors 3 and 11 (where `EGA_FILE_INDEX_PERMUTATION` swaps dim and bright magenta). The renderers (`wfont-4bpp-render`, `ega-screen-render`, `pic-render`) no longer use it — they look up `palette.colors[fileIdx]` directly with `WIZ6_MAIN` as the palette.

See `docs/re/findings/menu-cursor-render-path.json` for the end-to-end chain and `docs/re/findings/state4-runtime-palette.json` for the DAC verification methodology.

## The render path (current, post-fix)

```
.pic / .ega / portrait / font 4-bit file value
  ── (= framebuffer color attribute, written directly by the engine)
  ── WIZ6_MAIN.colors[fileIdx]   (= VGA_DEFAULT_DAC[WIZ6_MAIN_AC[fileIdx]])
  ─→ RGB
```

`.pic` file bit-pattern `15` (all planes set) is still a transparency marker — `ega.drv`'s sprite-blit code special-cases it before the lookup.

## Historical narrative (now superseded)

The text below dates from #002 and described what we thought was happening before the AC→DAC chain was understood. Retained for context.

## Engine palette-load sites (RE-confirmed, not active in current render path)

Both palettes are baked into `original/wroot.exe`. Programmed via the BIOS function `INT 10h, AX=1002h` ("Set All Palette Registers"), which copies a 17-byte table (16 palette register values + 1 overscan/border) from `ES:DX` into the EGA Attribute Controller's palette registers.

MZ header is 0x200 bytes, so file offset = `0x200 + CS:offset`.

| Site (file offset) | DX value (CS-relative) | Palette table (file offset) | Catalog name in `@wiz6/data` |
| ------------------ | ---------------------- | --------------------------- | ---------------------------- |
| 0x209B             | 0x1E43                 | **0x2043**                  | `wiz6-main`                  |
| 0x2105             | 0x1E54                 | **0x2054**                  | `wiz6-dungeon`               |

Instruction sequence at each call site:

```text
8C C8        MOV  AX, CS
8E C0        MOV  ES, AX
BA xx xx     MOV  DX, <table_offset>
B8 02 10     MOV  AX, 0x1002
CD 10        INT  10h
```

## Raw bytes

**`wiz6-main`** at file 0x2043 (17 bytes):
```text
00 17 11 15 14 16 12 13 10 07 01 05 04 06 02 03 00
```

**`wiz6-dungeon`** at file 0x2054 (17 bytes):
```text
00 0f 09 0d 0c 0e 0a 0b 08 07 01 05 04 06 02 03 00
```

## EGA register-byte → RGB decoding

Each byte is a 6-bit EGA color code. Bit layout:

| bit | meaning                   |
| --- | ------------------------- |
| 5   | R at 1/3 intensity (+85)  |
| 4   | G at 1/3 intensity (+85)  |
| 3   | B at 1/3 intensity (+85)  |
| 2   | R at 2/3 intensity (+170) |
| 1   | G at 2/3 intensity (+170) |
| 0   | B at 2/3 intensity (+170) |

Per-channel displayed value = sum of contributions from the two bits (capped at 255). Verified against the standard EGA palette: `0x00 → (0,0,0)`, `0x01 → (0,0,170)`, `0x07 → (170,170,170)`, `0x38 → (85,85,85)`, `0x3F → (255,255,255)`.

## Decoded palettes

**`wiz6-main`** — applied at wroot 0x209B:

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

**`wiz6-dungeon`** — applied at wroot 0x2105 (blue-leaning):

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
| 9–15 | (same as wiz6-main) |                 |                  |

Indices 9–15 are identical between the two engine palettes; only 1–8 differ. Wizardry preserves the "primary" colors (red, green, blue, magenta, cyan, yellow, light gray) across both palettes and re-uses indices 1–8 for whatever scene-specific accents wroot's two load sites are for.

## Comprehensive scan summary (#002, 2026-05-23)

Findings in [`findings/palette-loads.json`](findings/palette-loads.json). Across `wroot.exe` + every `*.ovr` + every `*.drv`:

- Exactly two `INT 10h AX=1002h` palette-write sites total (both listed above).
- Zero `AX=1000h` (set one register), zero `AX=1001h` (set overscan), zero `AX=1003h` (blink toggle).
- Zero direct EGA Attribute Controller port writes (`MOV DX, 0x3C0` / `MOV DX, 0x3DA` / `OUT 0xC0, AL`).
- Seven other `INT 10h` sites in `wroot.exe` are video-mode-set / cursor / mode-query / CGA palette select — none touch EGA palette registers.

## Calibration evidence (#002 follow-up)

During implementation of #002, switching the sprite renderer to use `wiz6-main` or `wiz6-dungeon` produced visibly wrong output (Rebecca rendering dim blue-green instead of intense green; the spaceship's body indices spread across multiple wrong colors). Using `EGA_DEFAULT` + the bit-pattern permutation reproduces the original game's appearance pixel-accurately, confirmed via the in-browser `/explore/calibrate` tool comparing live renders against DOSBox-X screenshots.

This implies that during the gameplay states we currently render, the engine has NOT yet executed either of its two `AX=1002h` calls — the EGA hardware is still at BIOS default. The states that *do* exercise `wiz6-main` and `wiz6-dungeon` haven't been identified; cf. open question below.

## Open question

Which gameplay state(s) actually exercise the `INT 10h AX=1002h` calls at 0x209B and 0x2105? The naming `wiz6-main` and `wiz6-dungeon` in the catalog is heuristic (based on the blue-leaning vs neutral character of the tables, plus the original Stage 1d guess). A runtime trace via DOSBox-X with `int10 = debug` logging, walked through every game state, would resolve this. Until then, both palettes remain in `@wiz6/data`'s catalog as RE artifacts but are unused by the standard render path.
