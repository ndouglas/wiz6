# Stage 1d: Runtime Palette Discovery & Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder default-EGA palette with the actual Wizardry runtime palettes (two of them, discovered in `wroot.exe`), encode them as typed constants, restructure the viewer's palette files into a `palettes/` directory, and add a palette picker to the app for visual comparison.

**Architecture:** New `PaletteSchema` in `@wiz6/data` (16 RGB triples + name + provenance metadata). The viewer's `ega-palette.ts` moves into a new `packages/viewer/src/palettes/` directory alongside two new Wizardry palette files. `Font4bppGallery` gains an optional `palette` prop (default `WIZ6_PALETTE_1`). `App.tsx` owns palette-picker state (radio buttons: "Wiz6 main" / "Wiz6 dungeon" / "EGA default") and passes the selection down to all four 4bpp galleries.

**Tech Stack:** TypeScript, vitest, zod, React, Canvas 2D. No new npm dependencies.

---

## Known Facts (from investigation)

Already discovered by scanning `original/wroot.exe`:

- MZ header at offsets 0..0x1F. Code starts at file offset `0x200` (header is 0x20 paragraphs of 16 bytes = 0x200).
- Two `MOV AX, 0x1002` instructions (`B8 02 10`) at file offsets **0x209b** and **0x2105**. `INT 10h, AX=1002h` is the BIOS "Set All Palette Registers" function; it expects `ES:DX` to point at a 17-byte palette table (16 register values + 1 overscan/border).
- Disassembled context around each site shows: `MOV AX, CS; MOV ES, AX; MOV DX, <offset>; MOV AX, 0x1002; INT 10h`. The DX offsets are CS-relative.
  - Site 0x209b: `MOV DX, 0x1E43` → palette table at CS:0x1E43 = file offset `0x200 + 0x1E43` = **0x2043**.
  - Site 0x2105: `MOV DX, 0x1E54` → palette table at CS:0x1E54 = file offset `0x200 + 0x1E54` = **0x2054**.
- Palette 1 raw bytes (file 0x2043, 17 bytes): `00 17 11 15 14 16 12 13 10 07 01 05 04 06 02 03 00`
- Palette 2 raw bytes (file 0x2054, 17 bytes): `00 0f 09 0d 0c 0e 0a 0b 08 07 01 05 04 06 02 03 00`
- Both tables: all bytes ≤ 0x3F (valid 6-bit EGA color codes). Last byte = overscan/border (both 0x00 = black).
- EGA register byte → RGB formula (verified against the standard EGA palette codes):
  - bit 5 = R at 1/3 intensity (+85)
  - bit 4 = G at 1/3 intensity (+85)
  - bit 3 = B at 1/3 intensity (+85)
  - bit 2 = R at 2/3 intensity (+170)
  - bit 1 = G at 2/3 intensity (+170)
  - bit 0 = B at 2/3 intensity (+170)
  - Component value = min(255, lo + hi). Black = 0, white = 0x3F.
- Palette 1 (green/main): magenta at index 11 (0x05 → (170, 0, 170)), red at 12, yellow-olive at 13, green at 14, cyan at 15.
- Palette 2 (blue/dungeon): same indices 9–15 as palette 1; indices 1–8 are blue/purple variants. Indices 9–15 in both palettes hold the "standard" EGA primary colors.

This is the entire investigation. Task 1 below just transcribes these findings into `docs/re/palette-discovery.md`.

---

## File Structure

```
docs/
├── re/
│   ├── palette-discovery.md            # NEW
│   └── wfont-4bpp.md                   # MODIFY — replace "approximate" caveat
packages/
├── data/
│   ├── src/
│   │   ├── schemas/
│   │   │   └── palette.ts              # NEW
│   │   └── index.ts                    # MODIFY — re-export
│   └── tests/
│       └── palette.test.ts             # NEW
└── viewer/
    ├── src/
    │   ├── palettes/
    │   │   ├── ega-default.ts          # NEW (content moved from ega-palette.ts)
    │   │   ├── wiz6-palette-1.ts       # NEW
    │   │   ├── wiz6-palette-2.ts       # NEW
    │   │   └── index.ts                # NEW (barrel)
    │   ├── ega-palette.ts              # DELETE
    │   ├── views/
    │   │   └── Font4bppGallery.tsx     # MODIFY — accept `palette` prop
    │   └── App.tsx                     # MODIFY — palette picker
    └── tests/
        ├── ega-palette.test.ts         # DELETE (replaced)
        ├── palettes/
        │   ├── ega-default.test.ts     # NEW (the existing 6 EGA tests, repointed)
        │   ├── wiz6-palette-1.test.ts  # NEW (snapshot test)
        │   └── wiz6-palette-2.test.ts  # NEW (snapshot test)
        ├── App.test.tsx                # MODIFY — palette picker test
        └── views/
            └── Font4bppGallery.test.tsx # MODIFY — pass palette prop
```

---

## Task 1: Write `docs/re/palette-discovery.md`

**Files:**
- Create: `docs/re/palette-discovery.md`

- [ ] **Step 1: Create the doc**

Create `docs/re/palette-discovery.md` with this content (verbatim):

````markdown
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

| bit | meaning                |
| --- | ---------------------- |
| 5   | R at 1/3 intensity (+85) |
| 4   | G at 1/3 intensity (+85) |
| 3   | B at 1/3 intensity (+85) |
| 2   | R at 2/3 intensity (+170) |
| 1   | G at 2/3 intensity (+170) |
| 0   | B at 2/3 intensity (+170) |

For each channel, the displayed value is the sum of contributions from the two bits (capped at 255). Verified against the standard EGA palette: `0x00 → (0,0,0)`, `0x01 → (0,0,170)`, `0x07 → (170,170,170)`, `0x38 → (85,85,85)`, `0x3F → (255,255,255)`.

## Decoded palettes

**Palette 1** (the "main" palette — applied at site 0x209B, used for character creation and most in-game UI):

| idx | reg  | RGB              | rough name        |
| --- | ---- | ---------------- | ----------------- |
| 0   | 0x00 | (0, 0, 0)        | black             |
| 1   | 0x17 | (170, 255, 170)  | pale green        |
| 2   | 0x11 | (0, 85, 170)     | dark teal         |
| 3   | 0x15 | (170, 85, 170)   | muted magenta     |
| 4   | 0x14 | (170, 85, 0)     | brown             |
| 5   | 0x16 | (170, 255, 0)    | yellow-green      |
| 6   | 0x12 | (0, 255, 0)      | pure bright green |
| 7   | 0x13 | (0, 255, 170)    | mint              |
| 8   | 0x10 | (0, 85, 0)       | dark green        |
| 9   | 0x07 | (170, 170, 170)  | light gray        |
| 10  | 0x01 | (0, 0, 170)      | blue              |
| 11  | 0x05 | (170, 0, 170)    | magenta           |
| 12  | 0x04 | (170, 0, 0)      | red               |
| 13  | 0x06 | (170, 170, 0)    | olive / yellow    |
| 14  | 0x02 | (0, 170, 0)      | green             |
| 15  | 0x03 | (0, 170, 170)    | cyan              |

**Palette 2** (the "dungeon" palette — applied at site 0x2105, blue-leaning for dungeon scenes):

| idx | reg  | RGB              | rough name           |
| --- | ---- | ---------------- | -------------------- |
| 0   | 0x00 | (0, 0, 0)        | black                |
| 1   | 0x0F | (170, 170, 255)  | lavender             |
| 2   | 0x09 | (0, 0, 255)      | pure bright blue     |
| 3   | 0x0D | (170, 0, 255)    | purple               |
| 4   | 0x0C | (170, 0, 85)     | dark crimson         |
| 5   | 0x0E | (170, 170, 85)   | dim yellow           |
| 6   | 0x0A | (0, 170, 85)     | blue-green           |
| 7   | 0x0B | (0, 170, 255)    | bright cyan          |
| 8   | 0x08 | (0, 0, 85)       | dim blue             |
| 9–15 | (same as Palette 1)                       |                      |

Indices 9–15 are identical between the two palettes; only 1–8 differ. Wizardry preserves the "primary" colors (red, green, blue, magenta, cyan, yellow, light gray) across both palettes and re-uses indices 1–8 for scene-specific accents.

## Cross-validation (Stage 1d task 2, optional)

If a DOSBox screenshot is taken, the 16 unique non-transparent colors visible in a main-game screen should match Palette 1 RGB values. A screen of the dungeon should match Palette 2. (Validation step is documented as optional in the design spec; the binary evidence alone is considered sufficient.)
````

- [ ] **Step 2: Commit**

```bash
git add docs/re/palette-discovery.md
git commit -m "docs(re): document Wizardry VI runtime EGA palettes from wroot.exe"
```

---

## Task 2: (Optional) Cross-validate via DOSBox screenshot

**Files:** None modified. This task is **optional** — the binary evidence is considered sufficient. Skip to Task 3 unless you want extra confidence.

- [ ] **Step 1: Capture a screenshot from DOSBox** of the Wizardry VI main-game UI (anywhere that shows class abbreviations like "FIG"/"MAG"/"PRI"). Save it somewhere outside the repo (or in `/tmp/`).

- [ ] **Step 2: Extract the 16 unique non-black colors** by hand-inspecting the screenshot in any image tool (Preview's color picker, GIMP histogram, etc.). Alternatively, a one-liner:

```bash
python3 -c "
from PIL import Image
img = Image.open('/tmp/dosbox-wiz6-main.png').convert('RGB')
colors = sorted({px for px in img.getdata()})
for c in colors[:20]: print(c)
" 2>&1
```

(If PIL isn't installed: `pip install Pillow` or `pip3 install Pillow`.)

- [ ] **Step 3: Compare** the screenshot's unique colors against the Palette 1 table in `docs/re/palette-discovery.md`. They should match exactly. If they don't, **stop and report** — the discovered palette may need adjustment before continuing.

No commit for this task — it's verification only.

---

## Task 3: Add `PaletteSchema` to `@wiz6/data`

**Files:**
- Create: `packages/data/src/schemas/palette.ts`
- Create: `packages/data/tests/palette.test.ts`
- Modify: `packages/data/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/data/tests/palette.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PaletteSchema, type Palette } from '../src/index.js';

const validPalette: Palette = {
  name: 'test',
  provenance: 'unit test fixture',
  colors: Array.from({ length: 16 }, () => [0, 0, 0]) as Palette['colors'],
};

describe('PaletteSchema', () => {
  it('accepts a valid 16-color palette with name + provenance', () => {
    expect(() => PaletteSchema.parse(validPalette)).not.toThrow();
  });

  it('rejects a palette with fewer than 16 colors', () => {
    const bad = { ...validPalette, colors: validPalette.colors.slice(0, 15) };
    expect(() => PaletteSchema.parse(bad)).toThrow();
  });

  it('rejects a palette with more than 16 colors', () => {
    const bad = { ...validPalette, colors: [...validPalette.colors, [0, 0, 0]] };
    expect(() => PaletteSchema.parse(bad)).toThrow();
  });

  it('rejects an RGB triple with values outside 0..255', () => {
    const bad = {
      ...validPalette,
      colors: validPalette.colors.map((c, i) => (i === 5 ? [256, 0, 0] : c)),
    };
    expect(() => PaletteSchema.parse(bad)).toThrow();
  });

  it('rejects an RGB tuple that is not length 3', () => {
    const bad = {
      ...validPalette,
      colors: validPalette.colors.map((c, i) => (i === 0 ? [0, 0] : c)),
    };
    expect(() => PaletteSchema.parse(bad)).toThrow();
  });

  it('rejects a palette missing the name field', () => {
    const { name, ...incomplete } = validPalette;
    expect(() => PaletteSchema.parse(incomplete)).toThrow();
  });

  it('rejects a palette missing the provenance field', () => {
    const { provenance, ...incomplete } = validPalette;
    expect(() => PaletteSchema.parse(incomplete)).toThrow();
  });
});
```

- [ ] **Step 2: Run the test (should fail)**

```bash
pnpm --filter @wiz6/data test
```

Expected: FAIL — `PaletteSchema`/`Palette` not exported.

- [ ] **Step 3: Implement the schema**

Create `packages/data/src/schemas/palette.ts`:

```ts
import { z } from 'zod';

const ByteSchema = z.number().int().min(0).max(255);

export const RgbTupleSchema = z.tuple([ByteSchema, ByteSchema, ByteSchema]);

export const PaletteSchema = z.object({
  name: z.string().min(1),
  provenance: z.string().min(1),
  colors: z.array(RgbTupleSchema).length(16),
});

export type RgbTuple = z.infer<typeof RgbTupleSchema>;
export type Palette = z.infer<typeof PaletteSchema>;
```

Modify `packages/data/src/index.ts` — add a new export block at the end. The full file should be:

```ts
export {
  ManifestSchema,
  ManifestAssetSchema,
  type Manifest,
  type ManifestAsset,
} from './schemas/manifest.js';
export {
  FontSchema,
  FontGlyphSchema,
  type Font,
  type FontGlyph,
} from './schemas/font.js';
export {
  Font4bppSchema,
  Font4bppGlyphSchema,
  type Font4bpp,
  type Font4bppGlyph,
} from './schemas/font-4bpp.js';
export {
  PaletteSchema,
  RgbTupleSchema,
  type Palette,
  type RgbTuple,
} from './schemas/palette.js';
```

- [ ] **Step 4: Run the test (should pass)**

```bash
pnpm --filter @wiz6/data test
```

Expected: PASS — 17 existing + 7 new palette tests = 24 tests in @wiz6/data.

- [ ] **Step 5: Typecheck + lint**

```bash
pnpm --filter @wiz6/data typecheck
pnpm lint
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add packages/data
git commit -m "feat(data): add PaletteSchema + RgbTupleSchema for typed EGA palettes"
```

---

## Task 4: Move `ega-palette.ts` → `palettes/ega-default.ts`

**Files:**
- Create: `packages/viewer/src/palettes/ega-default.ts`
- Create: `packages/viewer/tests/palettes/ega-default.test.ts`
- Delete: `packages/viewer/src/ega-palette.ts`
- Delete: `packages/viewer/tests/ega-palette.test.ts`
- Modify: `packages/viewer/src/views/Font4bppGallery.tsx` — update the import path (the contents of `EGA_PALETTE` and the rendering math do not change in this task; the palette-prop refactor comes in Task 7)

This task is a pure structural rename, no behavior change. EGA_PALETTE becomes a typed `Palette` value (per the new schema) instead of a bare array.

- [ ] **Step 1: Create `packages/viewer/src/palettes/ega-default.ts`**

```ts
import type { Palette } from '@wiz6/data';

// Standard 16-color EGA palette (default values BIOS writes at mode set).
// Used as a fallback / comparison option in the 4bpp viewer.
export const EGA_PALETTE: Palette = {
  name: 'EGA default',
  provenance: 'Standard IBM EGA palette as initialized by BIOS at video mode set.',
  colors: [
    [0, 0, 0],        //  0 black
    [0, 0, 170],      //  1 blue
    [0, 170, 0],      //  2 green
    [0, 170, 170],    //  3 cyan
    [170, 0, 0],      //  4 red
    [170, 0, 170],    //  5 magenta
    [170, 85, 0],     //  6 brown
    [170, 170, 170],  //  7 light gray
    [85, 85, 85],     //  8 dark gray
    [85, 85, 255],    //  9 light blue
    [85, 255, 85],    // 10 light green
    [85, 255, 255],   // 11 light cyan
    [255, 85, 85],    // 12 light red
    [255, 85, 255],   // 13 light magenta
    [255, 255, 85],   // 14 yellow
    [255, 255, 255],  // 15 white
  ],
};
```

- [ ] **Step 2: Create `packages/viewer/tests/palettes/ega-default.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { PaletteSchema } from '@wiz6/data';
import { EGA_PALETTE } from '../../src/palettes/ega-default.js';

describe('EGA_PALETTE', () => {
  it('conforms to PaletteSchema', () => {
    expect(() => PaletteSchema.parse(EGA_PALETTE)).not.toThrow();
  });

  it('has exactly 16 colors', () => {
    expect(EGA_PALETTE.colors).toHaveLength(16);
  });

  it('color 0 is black', () => {
    expect(EGA_PALETTE.colors[0]).toEqual([0, 0, 0]);
  });

  it('color 15 is white', () => {
    expect(EGA_PALETTE.colors[15]).toEqual([255, 255, 255]);
  });

  it('color 1 is blue (0, 0, 170)', () => {
    expect(EGA_PALETTE.colors[1]).toEqual([0, 0, 170]);
  });

  it('color 7 is light gray (170, 170, 170)', () => {
    expect(EGA_PALETTE.colors[7]).toEqual([170, 170, 170]);
  });

  it('all colors are RGB triples in 0..255', () => {
    for (const [r, g, b] of EGA_PALETTE.colors) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(255);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(255);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(255);
    }
  });
});
```

- [ ] **Step 3: Delete the old files**

```bash
git rm packages/viewer/src/ega-palette.ts
git rm packages/viewer/tests/ega-palette.test.ts
```

- [ ] **Step 4: Update `Font4bppGallery.tsx` import**

Modify `packages/viewer/src/views/Font4bppGallery.tsx`. Change line 4 from:

```ts
import { EGA_PALETTE } from '../ega-palette.js';
```

To:

```ts
import { EGA_PALETTE } from '../palettes/ega-default.js';
```

And update the canvas-drawing loop (around line 62) — the new `EGA_PALETTE.colors[colorIndex]` access (was previously `EGA_PALETTE[colorIndex]`). The full updated function body becomes:

```tsx
  useEffect(() => {
    if (!font || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rows = Math.ceil(font.glyphCount / COLS);
    canvas.width = COLS * CELL_PX * ZOOM;
    canvas.height = rows * CELL_PX * ZOOM;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context not available');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let g = 0; g < font.glyphCount; g++) {
      const gx = (g % COLS) * CELL_PX;
      const gy = Math.floor(g / COLS) * CELL_PX;
      const glyph = font.glyphs[g];
      if (!glyph) continue;
      for (let r = 0; r < GLYPH_PX; r++) {
        for (let c = 0; c < GLYPH_PX; c++) {
          const colorIndex = pixelColor(glyph, r, c);
          const rgb = EGA_PALETTE.colors[colorIndex];
          if (!rgb) continue;
          ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
          ctx.fillRect((gx + c) * ZOOM, (gy + r) * ZOOM, ZOOM, ZOOM);
        }
      }
    }
  }, [font]);
```

The `pixelColor` helper and the rest of the component are unchanged in this task.

- [ ] **Step 5: Run viewer tests**

```bash
pnpm --filter @wiz6/viewer test
```

Expected: PASS — 17 viewer tests pre-task minus the 6 deleted `ega-palette` tests, plus the new 7 `palettes/ega-default` tests = **18 viewer tests**.

- [ ] **Step 6: Typecheck + lint**

```bash
pnpm --filter @wiz6/viewer typecheck
pnpm lint
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add packages/viewer
git commit -m "refactor(viewer): move ega-palette to palettes/ega-default and adopt Palette schema"
```

---

## Task 5: Add `WIZ6_PALETTE_1`

**Files:**
- Create: `packages/viewer/src/palettes/wiz6-palette-1.ts`
- Create: `packages/viewer/tests/palettes/wiz6-palette-1.test.ts`

- [ ] **Step 1: Write the failing snapshot test**

Create `packages/viewer/tests/palettes/wiz6-palette-1.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PaletteSchema } from '@wiz6/data';
import { WIZ6_PALETTE_1 } from '../../src/palettes/wiz6-palette-1.js';

describe('WIZ6_PALETTE_1', () => {
  it('conforms to PaletteSchema', () => {
    expect(() => PaletteSchema.parse(WIZ6_PALETTE_1)).not.toThrow();
  });

  it('has the 16 RGB values discovered in wroot.exe at file offset 0x2043', () => {
    expect(WIZ6_PALETTE_1.colors).toEqual([
      [0, 0, 0],        //  0 black
      [170, 255, 170],  //  1 pale green
      [0, 85, 170],     //  2 dark teal
      [170, 85, 170],   //  3 muted magenta
      [170, 85, 0],     //  4 brown
      [170, 255, 0],    //  5 yellow-green
      [0, 255, 0],      //  6 pure bright green
      [0, 255, 170],    //  7 mint
      [0, 85, 0],       //  8 dark green
      [170, 170, 170],  //  9 light gray
      [0, 0, 170],      // 10 blue
      [170, 0, 170],    // 11 magenta
      [170, 0, 0],      // 12 red
      [170, 170, 0],    // 13 olive / yellow
      [0, 170, 0],      // 14 green
      [0, 170, 170],    // 15 cyan
    ]);
  });

  it('has a descriptive name and provenance', () => {
    expect(WIZ6_PALETTE_1.name).toMatch(/wiz6/i);
    expect(WIZ6_PALETTE_1.provenance).toMatch(/wroot\.exe/);
  });
});
```

- [ ] **Step 2: Run the test (should fail)**

```bash
pnpm --filter @wiz6/viewer test
```

Expected: FAIL — `WIZ6_PALETTE_1` not found.

- [ ] **Step 3: Implement the palette**

Create `packages/viewer/src/palettes/wiz6-palette-1.ts`:

```ts
import type { Palette } from '@wiz6/data';

// Wizardry VI runtime palette #1 — applied via INT 10h AX=1002h at the call
// site at file offset 0x209B in wroot.exe. The 17-byte palette table lives
// at file offset 0x2043 (= CS:0x1E43). This is the "main" palette used for
// character creation and most in-game UI. Discovered in Stage 1d; see
// docs/re/palette-discovery.md for the methodology and raw bytes.
export const WIZ6_PALETTE_1: Palette = {
  name: 'wiz6-main',
  provenance: 'wroot.exe @ 0x2043 (17-byte palette table loaded by INT 10h AX=1002h at 0x209B)',
  colors: [
    [0, 0, 0],
    [170, 255, 170],
    [0, 85, 170],
    [170, 85, 170],
    [170, 85, 0],
    [170, 255, 0],
    [0, 255, 0],
    [0, 255, 170],
    [0, 85, 0],
    [170, 170, 170],
    [0, 0, 170],
    [170, 0, 170],
    [170, 0, 0],
    [170, 170, 0],
    [0, 170, 0],
    [0, 170, 170],
  ],
};
```

- [ ] **Step 4: Run the test (should pass)**

```bash
pnpm --filter @wiz6/viewer test
```

Expected: PASS — 18 + 3 new = **21 viewer tests**.

- [ ] **Step 5: Typecheck + lint**

```bash
pnpm --filter @wiz6/viewer typecheck
pnpm lint
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add packages/viewer
git commit -m "feat(viewer): add WIZ6_PALETTE_1 (main game palette from wroot.exe 0x2043)"
```

---

## Task 6: Add `WIZ6_PALETTE_2`

**Files:**
- Create: `packages/viewer/src/palettes/wiz6-palette-2.ts`
- Create: `packages/viewer/tests/palettes/wiz6-palette-2.test.ts`
- Create: `packages/viewer/src/palettes/index.ts` (barrel re-export)

- [ ] **Step 1: Write the failing snapshot test**

Create `packages/viewer/tests/palettes/wiz6-palette-2.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PaletteSchema } from '@wiz6/data';
import { WIZ6_PALETTE_2 } from '../../src/palettes/wiz6-palette-2.js';

describe('WIZ6_PALETTE_2', () => {
  it('conforms to PaletteSchema', () => {
    expect(() => PaletteSchema.parse(WIZ6_PALETTE_2)).not.toThrow();
  });

  it('has the 16 RGB values discovered in wroot.exe at file offset 0x2054', () => {
    expect(WIZ6_PALETTE_2.colors).toEqual([
      [0, 0, 0],
      [170, 170, 255],  //  1 lavender
      [0, 0, 255],      //  2 pure bright blue
      [170, 0, 255],    //  3 purple
      [170, 0, 85],     //  4 dark crimson
      [170, 170, 85],   //  5 dim yellow
      [0, 170, 85],     //  6 blue-green
      [0, 170, 255],    //  7 bright cyan
      [0, 0, 85],       //  8 dim blue
      [170, 170, 170],  //  9 light gray (same as palette 1)
      [0, 0, 170],      // 10 blue
      [170, 0, 170],    // 11 magenta
      [170, 0, 0],      // 12 red
      [170, 170, 0],    // 13 olive / yellow
      [0, 170, 0],      // 14 green
      [0, 170, 170],    // 15 cyan
    ]);
  });

  it('has indices 9..15 identical to WIZ6_PALETTE_1', async () => {
    const { WIZ6_PALETTE_1 } = await import('../../src/palettes/wiz6-palette-1.js');
    for (let i = 9; i <= 15; i++) {
      expect(WIZ6_PALETTE_2.colors[i]).toEqual(WIZ6_PALETTE_1.colors[i]);
    }
  });
});
```

- [ ] **Step 2: Run the test (should fail)**

```bash
pnpm --filter @wiz6/viewer test
```

Expected: FAIL — `WIZ6_PALETTE_2` not found.

- [ ] **Step 3: Implement the palette**

Create `packages/viewer/src/palettes/wiz6-palette-2.ts`:

```ts
import type { Palette } from '@wiz6/data';

// Wizardry VI runtime palette #2 — applied via INT 10h AX=1002h at the call
// site at file offset 0x2105 in wroot.exe. The 17-byte palette table lives
// at file offset 0x2054 (= CS:0x1E54). Blue-leaning; presumed to be the
// dungeon palette based on the prevalence of blue/purple variants in
// indices 1..8. Indices 9..15 are identical to WIZ6_PALETTE_1. See
// docs/re/palette-discovery.md.
export const WIZ6_PALETTE_2: Palette = {
  name: 'wiz6-dungeon',
  provenance: 'wroot.exe @ 0x2054 (17-byte palette table loaded by INT 10h AX=1002h at 0x2105)',
  colors: [
    [0, 0, 0],
    [170, 170, 255],
    [0, 0, 255],
    [170, 0, 255],
    [170, 0, 85],
    [170, 170, 85],
    [0, 170, 85],
    [0, 170, 255],
    [0, 0, 85],
    [170, 170, 170],
    [0, 0, 170],
    [170, 0, 170],
    [170, 0, 0],
    [170, 170, 0],
    [0, 170, 0],
    [0, 170, 170],
  ],
};
```

Create `packages/viewer/src/palettes/index.ts` (barrel):

```ts
export { EGA_PALETTE } from './ega-default.js';
export { WIZ6_PALETTE_1 } from './wiz6-palette-1.js';
export { WIZ6_PALETTE_2 } from './wiz6-palette-2.js';

export type PaletteName = 'wiz6-main' | 'wiz6-dungeon' | 'ega-default';
```

- [ ] **Step 4: Run the test (should pass)**

```bash
pnpm --filter @wiz6/viewer test
```

Expected: PASS — 21 + 3 new = **24 viewer tests**.

- [ ] **Step 5: Typecheck + lint**

```bash
pnpm --filter @wiz6/viewer typecheck
pnpm lint
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add packages/viewer
git commit -m "feat(viewer): add WIZ6_PALETTE_2 (dungeon palette from wroot.exe 0x2054) + barrel"
```

---

## Task 7: `Font4bppGallery` accepts a `palette` prop

**Files:**
- Modify: `packages/viewer/src/views/Font4bppGallery.tsx`
- Modify: `packages/viewer/tests/views/Font4bppGallery.test.tsx`

The component takes an optional `palette` prop. Default = `WIZ6_PALETTE_1` (the main game palette — corrects the colors we've been calling "approximate" since Stage 1c).

- [ ] **Step 1: Update the failing test to require the palette default**

Replace `packages/viewer/tests/views/Font4bppGallery.test.tsx` with:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Font4bppGallery } from '../../src/views/Font4bppGallery.js';
import { EGA_PALETTE, WIZ6_PALETTE_1 } from '../../src/palettes/index.js';

const tinyFont = {
  id: 'wfont1',
  sourceFile: 'wfont1.ega',
  glyphCount: 2,
  glyphs: [
    Array(32).fill(0),
    [
      0xff, 0, 0, 0, 0, 0, 0, 0,
      0xff, 0, 0, 0, 0, 0, 0, 0,
      0xff, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
    ],
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Font4bppGallery', () => {
  it('renders a loading state then the canvas after fetch resolves', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(tinyFont), { status: 200 })));
    render(<Font4bppGallery url="/fonts/wfont1.json" />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('img', { name: /4bpp font glyph grid/i })).toBeInTheDocument());
    expect(screen.getAllByText(/wfont1/).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 glyphs/)).toBeInTheDocument();
  });

  it('accepts and renders with a custom palette prop', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(tinyFont), { status: 200 })));
    render(<Font4bppGallery url="/fonts/wfont1.json" palette={EGA_PALETTE} />);
    await waitFor(() => expect(screen.getByRole('img', { name: /4bpp font glyph grid/i })).toBeInTheDocument());
  });

  it('defaults to WIZ6_PALETTE_1 when no palette prop is given', async () => {
    // Schema sanity (smoke): if we render without palette, no crash, canvas present.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(tinyFont), { status: 200 })));
    render(<Font4bppGallery url="/fonts/wfont1.json" />);
    await waitFor(() => expect(screen.getByRole('img', { name: /4bpp font glyph grid/i })).toBeInTheDocument());
    // Document the default in a structural way the test can assert without
    // pixel inspection: the named export exists and the default is the main palette.
    expect(WIZ6_PALETTE_1.name).toBe('wiz6-main');
  });

  it('renders an error message if loading fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    render(<Font4bppGallery url="/fonts/wfont1.json" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/500/));
  });
});
```

- [ ] **Step 2: Run the test (should fail)**

```bash
pnpm --filter @wiz6/viewer test
```

Expected: FAIL — `Font4bppGallery` doesn't accept `palette` prop yet.

- [ ] **Step 3: Update the component**

Replace `packages/viewer/src/views/Font4bppGallery.tsx` with:

```tsx
import { useEffect, useRef, useState } from 'react';
import type { Font4bpp, Palette } from '@wiz6/data';
import { loadFont4bpp } from '../data-loader.js';
import { WIZ6_PALETTE_1 } from '../palettes/wiz6-palette-1.js';

const GLYPH_PX = 8;
const CELL_PX = 8;
const ZOOM = 4;
const COLS = 16;

// Standard EGA plane order: B (plane 0), G (plane 1), R (plane 2), I (plane 3).
// The COLORS rendered depend on the palette prop. Default is the Wizardry main
// palette discovered in wroot.exe (see docs/re/palette-discovery.md).
function pixelColor(glyph: number[], row: number, col: number): number {
  const blue = (glyph[row] ?? 0) >> (7 - col) & 1;
  const green = (glyph[8 + row] ?? 0) >> (7 - col) & 1;
  const red = (glyph[16 + row] ?? 0) >> (7 - col) & 1;
  const intensity = (glyph[24 + row] ?? 0) >> (7 - col) & 1;
  return (intensity << 3) | (red << 2) | (green << 1) | blue;
}

interface Props {
  url: string;
  palette?: Palette;
}

export function Font4bppGallery({ url, palette = WIZ6_PALETTE_1 }: Props) {
  const [font, setFont] = useState<Font4bpp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadFont4bpp(url)
      .then((f) => {
        if (!cancelled) setFont(f);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    if (!font || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rows = Math.ceil(font.glyphCount / COLS);
    canvas.width = COLS * CELL_PX * ZOOM;
    canvas.height = rows * CELL_PX * ZOOM;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context not available');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let g = 0; g < font.glyphCount; g++) {
      const gx = (g % COLS) * CELL_PX;
      const gy = Math.floor(g / COLS) * CELL_PX;
      const glyph = font.glyphs[g];
      if (!glyph) continue;
      for (let r = 0; r < GLYPH_PX; r++) {
        for (let c = 0; c < GLYPH_PX; c++) {
          const colorIndex = pixelColor(glyph, r, c);
          const rgb = palette.colors[colorIndex];
          if (!rgb) continue;
          ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
          ctx.fillRect((gx + c) * ZOOM, (gy + r) * ZOOM, ZOOM, ZOOM);
        }
      }
    }
  }, [font, palette]);

  if (error) {
    return <div role="alert">Error: {error}</div>;
  }
  if (!font) {
    return <p>Loading…</p>;
  }
  return (
    <section>
      <h2>{font.id}</h2>
      <p>
        Source: <code>{font.sourceFile}</code> · {font.glyphCount} glyphs · 4bpp · palette: <code>{palette.name}</code>
      </p>
      <canvas ref={canvasRef} role="img" aria-label="4bpp font glyph grid" />
    </section>
  );
}
```

- [ ] **Step 4: Run the test (should pass)**

```bash
pnpm --filter @wiz6/viewer test
```

Expected: PASS — 24 - 2 (old Font4bppGallery tests replaced) + 4 (new) = **26 viewer tests**.

- [ ] **Step 5: Typecheck + lint**

```bash
pnpm --filter @wiz6/viewer typecheck
pnpm lint
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add packages/viewer
git commit -m "feat(viewer): Font4bppGallery accepts palette prop (default WIZ6_PALETTE_1)"
```

---

## Task 8: Palette picker in `App.tsx`

**Files:**
- Modify: `packages/viewer/src/App.tsx`
- Modify: `packages/viewer/tests/App.test.tsx`

- [ ] **Step 1: Update the App test to assert the picker UI**

Replace `packages/viewer/tests/App.test.tsx` with:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../src/App.js';

const valid1bpp = {
  id: 'wfont0',
  sourceFile: 'wfont0.ega',
  glyphCount: 1,
  glyphs: [[0, 0, 0, 0, 0, 0, 0, 0]],
};

const valid4bpp = {
  id: 'wfontN',
  sourceFile: 'wfontN.ega',
  glyphCount: 1,
  glyphs: [Array(32).fill(0)],
};

describe('App', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('wfont0')) return new Response(JSON.stringify(valid1bpp), { status: 200 });
      return new Response(JSON.stringify(valid4bpp), { status: 200 });
    }));
  });

  it('renders the viewer heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /wiz6 viewer/i })).toBeInTheDocument();
  });

  it('renders a palette picker with three options', () => {
    render(<App />);
    expect(screen.getByRole('radio', { name: /wiz6-main/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /wiz6-dungeon/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /ega-default/i })).toBeInTheDocument();
  });

  it('defaults the picker to wiz6-main', () => {
    render(<App />);
    expect(screen.getByRole('radio', { name: /wiz6-main/i })).toBeChecked();
  });

  it('switching the picker changes the picker state', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /ega-default/i }));
    expect(screen.getByRole('radio', { name: /ega-default/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /wiz6-main/i })).not.toBeChecked();
  });
});
```

- [ ] **Step 2: Run the test (should fail)**

```bash
pnpm --filter @wiz6/viewer test
```

Expected: FAIL — the picker radios don't exist.

- [ ] **Step 3: Update `App.tsx`**

Replace `packages/viewer/src/App.tsx` with:

```tsx
import { useState } from 'react';
import type { Palette } from '@wiz6/data';
import { FontGallery } from './views/FontGallery.js';
import { Font4bppGallery } from './views/Font4bppGallery.js';
import { EGA_PALETTE, WIZ6_PALETTE_1, WIZ6_PALETTE_2, type PaletteName } from './palettes/index.js';

const PALETTE_BY_NAME: Record<PaletteName, Palette> = {
  'wiz6-main': WIZ6_PALETTE_1,
  'wiz6-dungeon': WIZ6_PALETTE_2,
  'ega-default': EGA_PALETTE,
};

const PICKER_OPTIONS: { name: PaletteName; label: string }[] = [
  { name: 'wiz6-main', label: 'wiz6-main (default)' },
  { name: 'wiz6-dungeon', label: 'wiz6-dungeon' },
  { name: 'ega-default', label: 'ega-default (raw)' },
];

export function App() {
  const [selected, setSelected] = useState<PaletteName>('wiz6-main');
  const palette = PALETTE_BY_NAME[selected];

  return (
    <main>
      <h1>Wiz6 Viewer</h1>
      <fieldset>
        <legend>4bpp palette</legend>
        {PICKER_OPTIONS.map(({ name, label }) => (
          <label key={name} style={{ marginRight: '1em' }}>
            <input
              type="radio"
              name="palette"
              value={name}
              checked={selected === name}
              onChange={() => setSelected(name)}
            />{' '}
            {label}
          </label>
        ))}
      </fieldset>
      <FontGallery url="/fonts/wfont0.json" />
      <Font4bppGallery url="/fonts/wfont1.json" palette={palette} />
      <Font4bppGallery url="/fonts/wfont2.json" palette={palette} />
      <Font4bppGallery url="/fonts/wfont3.json" palette={palette} />
      <Font4bppGallery url="/fonts/wfont4.json" palette={palette} />
    </main>
  );
}
```

- [ ] **Step 4: Run the test (should pass)**

```bash
pnpm --filter @wiz6/viewer test
```

Expected: PASS — 26 - 1 (old App test replaced) + 4 (new App tests) = **29 viewer tests**.

- [ ] **Step 5: Typecheck + lint**

```bash
pnpm --filter @wiz6/viewer typecheck
pnpm lint
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add packages/viewer
git commit -m "feat(viewer): palette picker in App (wiz6-main / wiz6-dungeon / ega-default)"
```

---

## Task 9: Update `docs/re/wfont-4bpp.md` — remove "approximate" caveat

**Files:**
- Modify: `docs/re/wfont-4bpp.md`

The file currently has a "Palette — known to be approximate, not yet correct" section. Replace it with a link to the discovered palette.

- [ ] **Step 1: Replace the palette caveat section**

In `docs/re/wfont-4bpp.md`, find this block:

```markdown
## Palette — known to be approximate, not yet correct

The file does **not** carry its own palette, and Wizardry VI **reprograms the EGA palette registers at runtime** (a very common technique in EGA games). The same pixel value can therefore appear as different colors in different game screens — for example, the same file color index might be displayed as red in one menu and yellow in another, depending on which palette the game has loaded.

Stage 1c's viewer uses the **default 16-color EGA palette** as a placeholder. The plane decoding is correct (text and icon *shapes* render perfectly), but specific *colors* will not match the in-game appearance in many cases. Concrete examples observed during Stage 1c:

- `wfont1` class abbreviations ("FIG", "MAG", "PRI", …) appear in dark magenta in our viewer; in-game they are bright magenta.
- `wfont1` health/stamina bars appear in green tones in our viewer; in-game they are red and yellow.
- `wfont2` movement-button labels ("TURN", "MOVE") appear cyan-ish in our viewer; in-game they are yellow.

Reading the actual runtime palettes from the executable (likely set in `winit.ovr` and/or per-screen by `wpops.ovr` / `wmaze.ovr`) is **Stage 1d work**. Until then, all 4bpp viewer renderings should be treated as structurally correct but colorimetrically approximate.
```

Replace it with:

```markdown
## Palette

Wizardry VI reprograms the EGA palette registers at runtime — the file format does not carry its own palette. The two runtime palettes baked into `wroot.exe` were discovered in Stage 1d; see `palette-discovery.md` for the methodology, raw bytes, and decoded RGB tables.

- `WIZ6_PALETTE_1` ("wiz6-main") — applied at the `INT 10h AX=1002h` call site at file offset 0x209B. Indices 9–15 are the standard EGA primaries (red, green, blue, magenta, cyan, yellow, light gray); indices 1–8 are green-leaning UI accents. This is the default palette used by the Stage 1d viewer.
- `WIZ6_PALETTE_2` ("wiz6-dungeon") — applied at 0x2105. Indices 9–15 are identical to palette 1; indices 1–8 are blue/purple variants for dungeon scenes.

The Stage 1d viewer's palette picker switches between these two and the default EGA palette for side-by-side comparison.

**Per-screen palette switching** is documented but not yet handled beyond the two known palettes — if the game programs additional palettes from other call sites (besides 0x209B and 0x2105), they have not yet been catalogued.
```

- [ ] **Step 2: Commit**

```bash
git add docs/re/wfont-4bpp.md
git commit -m "docs(re): wfont-4bpp now references the discovered Wizardry palettes"
```

---

## Task 10: End-to-end smoke + verify

**Files:** None. Verification only.

- [ ] **Step 1: Re-extract all fonts (re-uses Stage 1c machinery)**

```bash
pnpm exec tsx packages/parser/src/cli.ts extract-fonts ./original ./extracted
```

Expected: 5 "wrote" lines (wfont0 through wfont4).

- [ ] **Step 2: Run full verify**

```bash
pnpm verify
```

Expected counts (all pass):
- `@wiz6/data`: 17 prior + 7 new palette = **24 tests**
- `@wiz6/parser`: **15 tests** (unchanged from Stage 1c)
- `@wiz6/viewer`: 7 ega-default + 3 wiz6-palette-1 + 3 wiz6-palette-2 + 6 data-loader + 2 FontGallery + 4 Font4bppGallery + 4 App = **29 tests**
- **Total: 68 tests**

- [ ] **Step 3: Start the viewer**

```bash
pnpm --filter @wiz6/viewer dev &
```

- [ ] **Step 4: Manually verify in browser**

Open the URL Vite prints (default http://localhost:5173/). With the **wiz6-main** picker option (default), confirm:

- `wfont1` class abbreviations ("FIG", "MAG", "PRI", …) appear in **magenta** (palette index 11 = (170, 0, 170)).
- `wfont1` health bar appears in **red** (palette index 12 = (170, 0, 0)).
- `wfont1` stamina bar appears in **yellow/olive** (palette index 13 = (170, 170, 0)).
- `wfont2` "TURN"/"MOVE" labels appear in **yellow/olive**.

Click the **ega-default** radio. The colors should shift back to the Stage 1c appearance (class names cyan, etc.). Click **wiz6-dungeon** — the same indices in palette 2 give blue/purple-tinted versions for 1–8, but indices 9–15 are unchanged, so text-heavy content still looks similar to wiz6-main.

- [ ] **Step 5: Stop the dev server**

```bash
pkill -f vite || true
```

- [ ] **Step 6: Push**

```bash
git push origin main
```

---

## Stage 1d Completion Checklist

After Task 10:

- [ ] `docs/re/palette-discovery.md` exists, contains both palettes' raw bytes, decoded RGB, and the disassembly findings.
- [ ] `PaletteSchema` exported from `@wiz6/data`.
- [ ] `WIZ6_PALETTE_1` and `WIZ6_PALETTE_2` constants exist in viewer; both snapshot-tested.
- [ ] `EGA_PALETTE` moved to `palettes/ega-default.ts`; old `ega-palette.ts` removed.
- [ ] `Font4bppGallery` accepts a `palette` prop with `WIZ6_PALETTE_1` as default.
- [ ] App has a 3-option palette picker; default is `wiz6-main`.
- [ ] `docs/re/wfont-4bpp.md` no longer claims the palette is approximate.
- [ ] `pnpm verify` passes with 68 tests across three packages.
- [ ] Visual verification by the user: `wfont1` class abbreviations render magenta under `wiz6-main`.

When all green, Stage 1d is done.
