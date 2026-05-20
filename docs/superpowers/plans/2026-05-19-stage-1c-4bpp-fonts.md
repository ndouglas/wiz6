# Stage 1c: 4bpp Bitmap Fonts (`wfont1-4.ega`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second format to the data pipeline: the 4096-byte 4bpp planar font files (`wfont1.ega` through `wfont4.ega`). Establishes 4bpp planar EGA infrastructure (palette handling, plane composition) on the simplest possible target before Stage 1d tackles portraits.

**Architecture:** Mirrors Stage 1b's three-layer parser pattern. New format module `packages/parser/src/formats/wfont-4bpp.ts` (pure decoder), new extractor `packages/parser/src/extractors/extract-wfont-4bpp.ts` (file I/O wrapper), new schema `packages/data/src/schemas/font-4bpp.ts`, new viewer component `packages/viewer/src/views/Font4bppGallery.tsx`. The existing 1bpp pipeline from Stage 1b is left untouched; the new types live alongside it. The CLI's `extract-fonts` subcommand grows to extract both the 1bpp and 4bpp font files in one invocation.

**Tech Stack:** TypeScript, vitest, zod, React, Canvas 2D. No new npm dependencies.

---

## Known Facts About the Format (from investigation)

Verified by decoding `wfont1.ega` and visually identifying "FIGMAGPRI" (Fighter/Mage/Priest), "THIRANALCBARPSIVALBISLOR" (Thief/Ranger/Alchemist/Bard/Psionic/Valkyrie/Bishop/Lord), "SAMMONNIN" (Samurai/Monk/Ninja), and various decorative icons in the resulting glyph grid:

- Each of `wfont1.ega`, `wfont2.ega`, `wfont3.ega`, `wfont4.ega` is exactly **4096 bytes**.
- Contains **128 glyphs**, each **32 bytes** = **4 planes × 8 rows × 1 byte/row**.
- **Plane-sequential per glyph**: `glyph[g]` occupies bytes `[g*32, g*32+32)`. Within those 32 bytes, plane 0 is rows 0–7, plane 1 is rows 8–15, plane 2 is rows 16–23, plane 3 is rows 24–31.
- **Bit order within each plane byte**: bit 7 (MSB) is the leftmost pixel; bit 0 is the rightmost. Same as `wfont0`.
- **Pixel color**: combine the corresponding bit from each plane: `color = plane3_bit << 3 | plane2_bit << 2 | plane1_bit << 1 | plane0_bit`. Color values are 4-bit palette indices (0–15).
- **Palette**: the file does not contain its own palette. Renderers should use the standard 16-color EGA palette (verified to produce readable text and reasonable colors in our investigation render).
- No header, no padding within the file. Glyph 0 starts at byte 0.

The four files (`wfont1` through `wfont4`) all share this format. They contain different glyph sets (presumably different fonts the game uses for different UI surfaces); we extract each as a separate JSON. Stage 1c does not investigate which Wizardry character/class each glyph index represents — that's a code-page exercise deferred to a later stage (same deferral noted in `docs/re/wfont.md` for the 1bpp font).

---

## File Structure

After this stage:

```
docs/
└── re/
    └── wfont-4bpp.md                          # NEW — format spec
packages/
├── data/
│   └── src/
│       ├── schemas/
│       │   └── font-4bpp.ts                   # NEW — Font4bppSchema, Font4bppGlyphSchema
│       └── index.ts                           # MODIFY — re-export
├── parser/
│   └── src/
│       ├── formats/
│       │   └── wfont-4bpp.ts                  # NEW — decodeWfont4bpp (pure)
│       ├── extractors/
│       │   └── extract-wfont-4bpp.ts          # NEW — file I/O wrapper
│       ├── cli.ts                             # MODIFY — extract-fonts also handles 4bpp files
│       └── index.ts                           # MODIFY — export new functions
├── parser/
│   └── tests/
│       ├── formats/
│       │   └── wfont-4bpp.test.ts             # NEW — pure decoder tests
│       └── extractors/
│           └── extract-wfont-4bpp.test.ts     # NEW — tmp-dir extraction test
└── viewer/
    └── src/
        ├── views/
        │   └── Font4bppGallery.tsx            # NEW — palette-rendered glyph grid
        ├── ega-palette.ts                     # NEW — shared 16-color EGA palette constant
        └── App.tsx                            # MODIFY — render both galleries
```

**Key responsibilities:**

- `packages/data/src/schemas/font-4bpp.ts` — `Font4bppGlyphSchema` is an array of exactly 32 bytes (in [0,255]); `Font4bppSchema` has the same shape as `FontSchema` (id, sourceFile, glyphCount, glyphs) but with the 32-byte glyph constraint and no schema cross-reference with the 1bpp variant. Independent types keep Stage 1b unchanged.
- `packages/parser/src/formats/wfont-4bpp.ts` — pure decoder: takes a Uint8Array (must be 4096 bytes), returns a `Font4bpp` validated through `Font4bppSchema`. Stores raw bytes; pixel composition happens at render time.
- `packages/parser/src/extractors/extract-wfont-4bpp.ts` — I/O wrapper analogous to `extractWfont`.
- `packages/viewer/src/ega-palette.ts` — shared standard 16-color EGA palette as a `readonly` tuple-of-tuples. Used by `Font4bppGallery` now and by future viewer components (Stage 1d portraits, eventual title-page rendering).
- `packages/viewer/src/views/Font4bppGallery.tsx` — React component that fetches a 4bpp font JSON, validates it, and renders the glyph grid to a Canvas using the EGA palette to color each pixel.

---

## Task 1: Document the 4bpp wfont format

**Files:**
- Create: `docs/re/wfont-4bpp.md`

- [ ] **Step 1: Create `docs/re/wfont-4bpp.md`**

Write the file with this exact content:

````markdown
# `wfont1-4.ega` — 8×8 4bpp Planar Bitmap Fonts

**Status:** Format fully documented. Used by Wizardry VI for class/race icon fonts and other small 16-color glyphs.

## Files

`original/wfont1.ega`, `original/wfont2.ega`, `original/wfont3.ega`, `original/wfont4.ega` — each exactly **4096 bytes**. The four files share the same format but contain different glyph sets.

The corresponding `.cga` variants are 2048 bytes (2bpp) and `.t16` variants are 4096 bytes (different bit-packing for Tandy 16-color). Both are out of scope here.

`wfont0.ega` (1024 bytes, 1bpp) is documented separately in `wfont.md`.

## Layout

```
offset  size   contents
------  -----  -------------------------------------------------------
0x000   32     Glyph 0, four planes of 8 rows each (plane-sequential).
0x020   32     Glyph 1, four planes of 8 rows each.
...
0xFE0   32     Glyph 127, four planes of 8 rows each.
```

Total: 128 glyphs × 32 bytes = 4096 bytes.

## Glyph encoding

Each 32-byte glyph is **plane-sequential**:

- Bytes 0–7 hold **plane 0**, one byte per row (top to bottom).
- Bytes 8–15 hold **plane 1**, same row order.
- Bytes 16–23 hold **plane 2**.
- Bytes 24–31 hold **plane 3**.

Within each plane byte, **bit 7 (MSB) is the leftmost pixel**, same as `wfont0`. A pixel's 4-bit color index is the concatenation of its bit in each plane (plane 3 = MSB of color, plane 0 = LSB):

```text
b0 = (plane_0_byte >> (7 - c)) & 1
b1 = (plane_1_byte >> (7 - c)) & 1
b2 = (plane_2_byte >> (7 - c)) & 1
b3 = (plane_3_byte >> (7 - c)) & 1
color = (b3 << 3) | (b2 << 2) | (b1 << 1) | b0
```

The color is a 4-bit palette index (0–15). The file does **not** carry its own palette; renderers should use the standard 16-color EGA palette.

## Standard EGA palette (used for rendering)

```text
 0 (0,   0,   0)    black
 1 (0,   0,   170)  blue
 2 (0,   170, 0)    green
 3 (0,   170, 170)  cyan
 4 (170, 0,   0)    red
 5 (170, 0,   170)  magenta
 6 (170, 85,  0)    brown
 7 (170, 170, 170)  light gray
 8 (85,  85,  85)   dark gray
 9 (85,  85,  255)  light blue
10 (85,  255, 85)   light green
11 (85,  255, 255)  light cyan
12 (255, 85,  85)   light red
13 (255, 85,  255)  light magenta
14 (255, 255, 85)   yellow
15 (255, 255, 255)  white
```

## Glyph index mapping

Same as `wfont0`: the precise glyph-to-character mapping is Wizardry-specific and **out of scope**. Visual inspection of `wfont1.ega` reveals abbreviated class names ("FIG", "MAG", "PRI", "THI", "RAN", "ALC", "BAR", "PSI", "VAL", "BIS", "LOR", "SAM", "MON", "NIN") and various decorative icons (crosses, X-marks, frames) — strongly suggesting `wfont1.ega` is the class/race icon font.

`wfont2.ega`, `wfont3.ega`, `wfont4.ega` contain different glyph sets in the same format; their specific contents are not catalogued here.

## Reference fixture (used by decoder tests)

Bytes 0x00–0x1F of `wfont1.ega` (glyph 0):

```text
f8 e0 e0 c2 80 80 80 c0   plane 0 (rows 0..7)
f8 e0 e0 c0 80 80 80 c0   plane 1 (rows 0..7)
f8 e0 e0 c0 80 80 80 c1   plane 2 (rows 0..7)
0d 0a 29 1a 25 4a 6b 13   plane 3 (rows 0..7)
```

Pixel readings for glyph 0:
- Row 0, column 0 → b0=1, b1=1, b2=1, b3=0 → color **7** (light gray)
- Row 0, column 7 → b0=0, b1=0, b2=0, b3=1 → color **8** (dark gray)
- Row 1, column 0 → b0=1, b1=1, b2=1, b3=0 → color **7** (light gray)
- Row 7, column 0 → b0=1, b1=1, b2=1, b3=0 → color **7** (light gray)

Pixel arithmetic (synthetic):
- Plane bits at row 0, col 0: f8 >> 7 = 1, f8 >> 7 = 1, f8 >> 7 = 1, 0d >> 7 = 0.
- Combined color: `0<<3 | 1<<2 | 1<<1 | 1` = `0b0111` = `7`.

## Validation

`packages/parser/tests/formats/wfont-4bpp.test.ts` asserts the decoder produces the expected glyph bytes for these fixture cases.
````

- [ ] **Step 2: Commit**

```bash
git add docs/re/wfont-4bpp.md
git commit -m "docs(re): document wfont1-4.ega 8x8 4bpp planar font format"
```

---

## Task 2: Add 4bpp Font schemas to `@wiz6/data`

**Files:**
- Create: `packages/data/src/schemas/font-4bpp.ts`
- Create: `packages/data/tests/font-4bpp.test.ts`
- Modify: `packages/data/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/data/tests/font-4bpp.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Font4bppSchema, Font4bppGlyphSchema, type Font4bpp } from '../src/index.js';

describe('Font4bppGlyphSchema', () => {
  it('accepts an array of exactly 32 bytes', () => {
    const glyph = Array.from({ length: 32 }, (_, i) => i);
    expect(() => Font4bppGlyphSchema.parse(glyph)).not.toThrow();
  });

  it('rejects an array of 31 bytes', () => {
    expect(() => Font4bppGlyphSchema.parse(Array(31).fill(0))).toThrow();
  });

  it('rejects an array of 33 bytes', () => {
    expect(() => Font4bppGlyphSchema.parse(Array(33).fill(0))).toThrow();
  });

  it('rejects values outside 0..255', () => {
    const bad = Array(32).fill(0);
    bad[5] = 256;
    expect(() => Font4bppGlyphSchema.parse(bad)).toThrow();
  });
});

describe('Font4bppSchema', () => {
  const validFont: Font4bpp = {
    id: 'wfont1',
    sourceFile: 'wfont1.ega',
    glyphCount: 128,
    glyphs: Array.from({ length: 128 }, () => Array(32).fill(0)),
  };

  it('accepts a valid 128-glyph 4bpp font', () => {
    expect(() => Font4bppSchema.parse(validFont)).not.toThrow();
  });

  it('rejects a font whose glyphCount disagrees with glyphs.length', () => {
    const bad = { ...validFont, glyphCount: 127 };
    expect(() => Font4bppSchema.parse(bad)).toThrow();
  });

  it('rejects a font missing the sourceFile field', () => {
    const { sourceFile, ...incomplete } = validFont;
    expect(() => Font4bppSchema.parse(incomplete)).toThrow();
  });
});
```

- [ ] **Step 2: Run the test (should fail)**

```bash
pnpm --filter @wiz6/data test
```

Expected: FAIL — `Font4bppSchema` / `Font4bppGlyphSchema` / `Font4bpp` not exported from `@wiz6/data`.

- [ ] **Step 3: Implement the schemas**

Create `packages/data/src/schemas/font-4bpp.ts`:

```ts
import { z } from 'zod';

const ByteSchema = z.number().int().min(0).max(255);

export const Font4bppGlyphSchema = z.array(ByteSchema).length(32);

export const Font4bppSchema = z
  .object({
    id: z.string().min(1),
    sourceFile: z.string().min(1),
    glyphCount: z.number().int().positive(),
    glyphs: z.array(Font4bppGlyphSchema),
  })
  .refine((f) => f.glyphCount === f.glyphs.length, {
    message: 'glyphCount must equal glyphs.length',
    path: ['glyphCount'],
  });

export type Font4bppGlyph = z.infer<typeof Font4bppGlyphSchema>;
export type Font4bpp = z.infer<typeof Font4bppSchema>;
```

Modify `packages/data/src/index.ts` to add the new exports. The full file should be:

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
```

- [ ] **Step 4: Run the test (should pass)**

```bash
pnpm --filter @wiz6/data test
```

Expected: PASS — 10 existing tests + 7 new font-4bpp tests = 17 tests total.

- [ ] **Step 5: Run typecheck + lint**

```bash
pnpm --filter @wiz6/data typecheck
pnpm lint
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add packages/data
git commit -m "feat(data): add Font4bpp and Font4bppGlyph schemas"
```

---

## Task 3: Implement pure `decodeWfont4bpp` in `@wiz6/parser`

**Files:**
- Create: `packages/parser/src/formats/wfont-4bpp.ts`
- Create: `packages/parser/tests/formats/wfont-4bpp.test.ts`
- Modify: `packages/parser/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/parser/tests/formats/wfont-4bpp.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decodeWfont4bpp } from '../../src/formats/wfont-4bpp.js';

const ALL_ZEROES = new Uint8Array(4096);

const oneGlyphPattern = (() => {
  const bytes = new Uint8Array(4096);
  // Glyph 0 — synthetic plane bytes for testing plane decomposition.
  // Plane 0: 0xff in row 0, zeros elsewhere
  bytes[0] = 0xff;
  // Plane 1: 0xff in row 1
  bytes[8 + 1] = 0xff;
  // Plane 2: 0xff in row 2
  bytes[16 + 2] = 0xff;
  // Plane 3: 0xff in row 3
  bytes[24 + 3] = 0xff;
  return bytes;
})();

describe('decodeWfont4bpp', () => {
  it('rejects input that is not exactly 4096 bytes', () => {
    expect(() => decodeWfont4bpp(new Uint8Array(4095), { id: 'x', sourceFile: 'x' })).toThrow(/4096/);
    expect(() => decodeWfont4bpp(new Uint8Array(4097), { id: 'x', sourceFile: 'x' })).toThrow(/4096/);
  });

  it('produces 128 glyphs', () => {
    const font = decodeWfont4bpp(ALL_ZEROES, { id: 'wfont1', sourceFile: 'wfont1.ega' });
    expect(font.glyphCount).toBe(128);
    expect(font.glyphs).toHaveLength(128);
  });

  it('all-zero input produces all-zero glyphs', () => {
    const font = decodeWfont4bpp(ALL_ZEROES, { id: 'wfont1', sourceFile: 'wfont1.ega' });
    for (const glyph of font.glyphs) {
      expect(glyph).toEqual(Array(32).fill(0));
    }
  });

  it('reads glyph 0 with the synthetic plane fixture bytes', () => {
    const font = decodeWfont4bpp(oneGlyphPattern, { id: 'wfont1', sourceFile: 'wfont1.ega' });
    const expected = Array(32).fill(0);
    expected[0] = 0xff;
    expected[9] = 0xff;
    expected[18] = 0xff;
    expected[27] = 0xff;
    expect(font.glyphs[0]).toEqual(expected);
  });

  it('preserves id and sourceFile in the output', () => {
    const font = decodeWfont4bpp(ALL_ZEROES, { id: 'wfont1', sourceFile: 'wfont1.ega' });
    expect(font.id).toBe('wfont1');
    expect(font.sourceFile).toBe('wfont1.ega');
  });
});
```

- [ ] **Step 2: Run the test (should fail)**

```bash
pnpm --filter @wiz6/parser test
```

Expected: FAIL — `decodeWfont4bpp` not found.

- [ ] **Step 3: Implement `decodeWfont4bpp`**

Create `packages/parser/src/formats/wfont-4bpp.ts`:

```ts
import { Font4bppSchema, type Font4bpp } from '@wiz6/data';

const EXPECTED_SIZE = 4096;
const GLYPH_COUNT = 128;
const GLYPH_BYTES = 32;

export interface DecodeWfont4bppOpts {
  id: string;
  sourceFile: string;
}

export function decodeWfont4bpp(bytes: Uint8Array, opts: DecodeWfont4bppOpts): Font4bpp {
  if (bytes.length !== EXPECTED_SIZE) {
    throw new Error(
      `wfont-4bpp decoder expected ${EXPECTED_SIZE} bytes, got ${bytes.length}`,
    );
  }
  const glyphs: number[][] = [];
  for (let g = 0; g < GLYPH_COUNT; g++) {
    const glyph: number[] = [];
    for (let b = 0; b < GLYPH_BYTES; b++) {
      const byte = bytes[g * GLYPH_BYTES + b];
      if (byte === undefined) {
        throw new Error(`unreachable: missing byte at offset ${g * GLYPH_BYTES + b}`);
      }
      glyph.push(byte);
    }
    glyphs.push(glyph);
  }
  return Font4bppSchema.parse({
    id: opts.id,
    sourceFile: opts.sourceFile,
    glyphCount: GLYPH_COUNT,
    glyphs,
  });
}
```

Modify `packages/parser/src/index.ts` to add the new export. The full file should be:

```ts
import type { Manifest } from '@wiz6/data';

export { decodeWfont, type DecodeWfontOpts } from './formats/wfont.js';
export { extractWfont, type ExtractWfontOpts } from './extractors/extract-wfont.js';
export { decodeWfont4bpp, type DecodeWfont4bppOpts } from './formats/wfont-4bpp.js';

export interface Plan {
  originalDir: string;
  schemaVersion: Manifest['schemaVersion'];
  steps: string[];
}

export function describePlan(opts: { originalDir: string }): Plan {
  return {
    originalDir: opts.originalDir,
    schemaVersion: 1,
    steps: [],
  };
}
```

- [ ] **Step 4: Run the test (should pass)**

```bash
pnpm --filter @wiz6/parser test
```

Expected: PASS — 8 existing tests + 5 new wfont-4bpp tests = 13 tests in parser.

- [ ] **Step 5: Typecheck + lint**

```bash
pnpm --filter @wiz6/parser typecheck
pnpm lint
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add packages/parser
git commit -m "feat(parser): add pure decodeWfont4bpp for 8x8 4bpp planar font format"
```

---

## Task 4: Implement `extractWfont4bpp` + extend the CLI to extract 4bpp fonts

**Files:**
- Create: `packages/parser/src/extractors/extract-wfont-4bpp.ts`
- Create: `packages/parser/tests/extractors/extract-wfont-4bpp.test.ts`
- Modify: `packages/parser/src/cli.ts`
- Modify: `packages/parser/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/parser/tests/extractors/extract-wfont-4bpp.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Font4bppSchema } from '@wiz6/data';
import { extractWfont4bpp } from '../../src/extractors/extract-wfont-4bpp.js';

describe('extractWfont4bpp', () => {
  it('reads bytes, decodes, writes valid JSON', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wiz6-extract-wfont-4bpp-'));
    try {
      const originalDir = join(tmp, 'original');
      const extractedDir = join(tmp, 'extracted');
      mkdirSync(originalDir, { recursive: true });

      const inputBytes = new Uint8Array(4096);
      for (let i = 0; i < 4096; i++) inputBytes[i] = i & 0xff;
      writeFileSync(join(originalDir, 'wfont1.ega'), inputBytes);

      const result = extractWfont4bpp({
        originalPath: join(originalDir, 'wfont1.ega'),
        outputPath: join(extractedDir, 'fonts', 'wfont1.json'),
        id: 'wfont1',
      });

      expect(() => Font4bppSchema.parse(result)).not.toThrow();
      expect(result.glyphCount).toBe(128);
      expect(result.glyphs[0]).toEqual(Array.from({ length: 32 }, (_, i) => i));

      const onDisk = JSON.parse(readFileSync(join(extractedDir, 'fonts', 'wfont1.json'), 'utf8'));
      expect(() => Font4bppSchema.parse(onDisk)).not.toThrow();
      expect(onDisk.id).toBe('wfont1');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('creates parent directories for the output path', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wiz6-extract-wfont-4bpp-mkdir-'));
    try {
      const originalPath = join(tmp, 'wfont1.ega');
      const outputPath = join(tmp, 'a', 'b', 'c', 'wfont1.json');
      writeFileSync(originalPath, new Uint8Array(4096));
      extractWfont4bpp({ originalPath, outputPath, id: 'wfont1' });
      expect(JSON.parse(readFileSync(outputPath, 'utf8')).id).toBe('wfont1');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the test (should fail)**

```bash
pnpm --filter @wiz6/parser test
```

Expected: FAIL — `extractWfont4bpp` not found.

- [ ] **Step 3: Implement `extractWfont4bpp`**

Create `packages/parser/src/extractors/extract-wfont-4bpp.ts`:

```ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { Font4bpp } from '@wiz6/data';
import { decodeWfont4bpp } from '../formats/wfont-4bpp.js';

export interface ExtractWfont4bppOpts {
  originalPath: string;
  outputPath: string;
  id: string;
}

export function extractWfont4bpp(opts: ExtractWfont4bppOpts): Font4bpp {
  const bytes = new Uint8Array(readFileSync(opts.originalPath));
  const font = decodeWfont4bpp(bytes, {
    id: opts.id,
    sourceFile: basename(opts.originalPath),
  });
  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, JSON.stringify(font, null, 2));
  return font;
}
```

Add the new export to `packages/parser/src/index.ts`. After the existing exports, add:

```ts
export { extractWfont4bpp, type ExtractWfont4bppOpts } from './extractors/extract-wfont-4bpp.js';
```

(So the final `index.ts` re-exports all four pairs of decoder/extractor functions.)

- [ ] **Step 4: Run the test (should pass)**

```bash
pnpm --filter @wiz6/parser test
```

Expected: PASS — 13 existing tests + 2 new extractor tests = 15 tests in parser.

- [ ] **Step 5: Extend the CLI `extract-fonts` subcommand to extract all 5 font files**

Replace the contents of `packages/parser/src/cli.ts` with:

```ts
#!/usr/bin/env node
import { join } from 'node:path';
import { describePlan } from './index.js';
import { extractWfont } from './extractors/extract-wfont.js';
import { extractWfont4bpp } from './extractors/extract-wfont-4bpp.js';

const subcommand = process.argv[2];

if (subcommand === 'extract-fonts') {
  const originalDir = process.argv[3] ?? './original';
  const extractedDir = process.argv[4] ?? './extracted';

  const wfont0 = extractWfont({
    originalPath: join(originalDir, 'wfont0.ega'),
    outputPath: join(extractedDir, 'fonts', 'wfont0.json'),
    id: 'wfont0',
  });
  console.log(`wrote ${extractedDir}/fonts/wfont0.json (${wfont0.glyphCount} glyphs, 1bpp)`);

  for (const n of [1, 2, 3, 4]) {
    const font = extractWfont4bpp({
      originalPath: join(originalDir, `wfont${n}.ega`),
      outputPath: join(extractedDir, 'fonts', `wfont${n}.json`),
      id: `wfont${n}`,
    });
    console.log(`wrote ${extractedDir}/fonts/wfont${n}.json (${font.glyphCount} glyphs, 4bpp)`);
  }
} else if (subcommand === 'plan' || subcommand === undefined) {
  const originalDir = process.argv[3] ?? './original';
  const plan = describePlan({ originalDir });
  console.log(JSON.stringify(plan, null, 2));
} else {
  console.error(`Unknown subcommand: ${subcommand}`);
  console.error(`Usage: wiz6-parse [plan|extract-fonts] [<originalDir> [<extractedDir>]]`);
  process.exit(2);
}
```

- [ ] **Step 6: Smoke-run against real game data**

```bash
pnpm exec tsx packages/parser/src/cli.ts extract-fonts ./original ./extracted
```

Expected output (5 lines):

```
wrote ./extracted/fonts/wfont0.json (128 glyphs, 1bpp)
wrote ./extracted/fonts/wfont1.json (128 glyphs, 4bpp)
wrote ./extracted/fonts/wfont2.json (128 glyphs, 4bpp)
wrote ./extracted/fonts/wfont3.json (128 glyphs, 4bpp)
wrote ./extracted/fonts/wfont4.json (128 glyphs, 4bpp)
```

And five JSON files now exist under `./extracted/fonts/`.

- [ ] **Step 7: Inspect one extracted file**

```bash
node -e "const f=JSON.parse(require('fs').readFileSync('./extracted/fonts/wfont1.json'));console.log('id:',f.id,'count:',f.glyphCount,'glyph0[0..3]:',f.glyphs[0].slice(0,4));"
```

Expected: `id: wfont1 count: 128 glyph0[0..3]: [ 248, 224, 224, 194 ]` (decimal of `f8 e0 e0 c2`).

- [ ] **Step 8: Typecheck + lint**

```bash
pnpm --filter @wiz6/parser typecheck
pnpm lint
```

Expected: both pass.

- [ ] **Step 9: Commit**

```bash
git add packages/parser
git commit -m "feat(parser): add extract-wfont-4bpp and extend extract-fonts CLI for wfont1-4"
```

---

## Task 5: Add EGA palette constant in viewer

**Files:**
- Create: `packages/viewer/src/ega-palette.ts`
- Create: `packages/viewer/tests/ega-palette.test.ts`

This palette will be used by the 4bpp font gallery and by future viewer code (Stage 1d portraits, eventual title-page rendering). Lifting it to a shared constant now avoids duplication later.

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/ega-palette.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EGA_PALETTE } from '../src/ega-palette.js';

describe('EGA_PALETTE', () => {
  it('has exactly 16 colors', () => {
    expect(EGA_PALETTE).toHaveLength(16);
  });

  it('color 0 is black', () => {
    expect(EGA_PALETTE[0]).toEqual([0, 0, 0]);
  });

  it('color 15 is white', () => {
    expect(EGA_PALETTE[15]).toEqual([255, 255, 255]);
  });

  it('color 1 is blue (0, 0, 170)', () => {
    expect(EGA_PALETTE[1]).toEqual([0, 0, 170]);
  });

  it('color 7 is light gray (170, 170, 170)', () => {
    expect(EGA_PALETTE[7]).toEqual([170, 170, 170]);
  });

  it('all colors are RGB triples in 0..255', () => {
    for (const [r, g, b] of EGA_PALETTE) {
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

- [ ] **Step 2: Run the test (should fail)**

```bash
pnpm --filter @wiz6/viewer test
```

Expected: FAIL — `EGA_PALETTE` not found.

- [ ] **Step 3: Implement the palette**

Create `packages/viewer/src/ega-palette.ts`:

```ts
// Standard 16-color EGA palette (RGB).
// Used by 4bpp viewer components (font galleries, portraits, etc.).
// Reference: documented in docs/re/wfont-4bpp.md.

export type RGB = readonly [number, number, number];

export const EGA_PALETTE: readonly RGB[] = [
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
];
```

- [ ] **Step 4: Run the test (should pass)**

```bash
pnpm --filter @wiz6/viewer test
```

Expected: PASS — 6 existing viewer tests + 6 new palette tests = 12 viewer tests.

- [ ] **Step 5: Typecheck + lint**

```bash
pnpm --filter @wiz6/viewer typecheck
pnpm lint
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add packages/viewer
git commit -m "feat(viewer): add shared EGA_PALETTE constant for 4bpp rendering"
```

---

## Task 6: Add `Font4bppGallery` viewer component

**Files:**
- Create: `packages/viewer/src/views/Font4bppGallery.tsx`
- Create: `packages/viewer/tests/views/Font4bppGallery.test.tsx`
- Modify: `packages/viewer/src/data-loader.ts` — add `loadFont4bpp` helper
- Modify: `packages/viewer/tests/data-loader.test.ts` — add tests for `loadFont4bpp`
- Modify: `packages/viewer/src/App.tsx` — render the new gallery alongside the 1bpp one

- [ ] **Step 1: Extend the data loader (add `loadFont4bpp`)**

Add tests to `packages/viewer/tests/data-loader.test.ts` (append below the existing `describe('loadFont', ...)` block):

```ts
import { loadFont4bpp } from '../src/data-loader.js';

const valid4bppFont = {
  id: 'wfont1',
  sourceFile: 'wfont1.ega',
  glyphCount: 1,
  glyphs: [Array(32).fill(0)],
};

describe('loadFont4bpp', () => {
  it('fetches and validates a 4bpp font JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(valid4bppFont), { status: 200 })));
    const font = await loadFont4bpp('/fonts/wfont1.json');
    expect(font.id).toBe('wfont1');
    expect(font.glyphCount).toBe(1);
  });

  it('throws if the fetch response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    await expect(loadFont4bpp('/missing.json')).rejects.toThrow(/404/);
  });

  it('throws if the payload does not validate against Font4bppSchema', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'x' }), { status: 200 })));
    await expect(loadFont4bpp('/bad.json')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests (should fail)**

```bash
pnpm --filter @wiz6/viewer test
```

Expected: FAIL — `loadFont4bpp` not found.

- [ ] **Step 3: Implement `loadFont4bpp`**

Replace `packages/viewer/src/data-loader.ts` with:

```ts
import { FontSchema, Font4bppSchema, type Font, type Font4bpp } from '@wiz6/data';

export async function loadFont(url: string): Promise<Font> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  }
  const json: unknown = await response.json();
  return FontSchema.parse(json);
}

export async function loadFont4bpp(url: string): Promise<Font4bpp> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  }
  const json: unknown = await response.json();
  return Font4bppSchema.parse(json);
}
```

- [ ] **Step 4: Write the failing FontGallery test**

Create `packages/viewer/tests/views/Font4bppGallery.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Font4bppGallery } from '../../src/views/Font4bppGallery.js';

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

  it('renders an error message if loading fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    render(<Font4bppGallery url="/fonts/wfont1.json" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/500/));
  });
});
```

- [ ] **Step 5: Run tests (should fail)**

```bash
pnpm --filter @wiz6/viewer test
```

Expected: FAIL — `Font4bppGallery` not found.

- [ ] **Step 6: Implement `Font4bppGallery`**

Create `packages/viewer/src/views/Font4bppGallery.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import type { Font4bpp } from '@wiz6/data';
import { loadFont4bpp } from '../data-loader.js';
import { EGA_PALETTE } from '../ega-palette.js';

const GLYPH_PX = 8;
const CELL_PX = 8;
const ZOOM = 4;
const COLS = 16;

interface Props {
  url: string;
}

function pixelColor(glyph: number[], row: number, col: number): number {
  const p0 = (glyph[row] ?? 0) >> (7 - col) & 1;
  const p1 = (glyph[8 + row] ?? 0) >> (7 - col) & 1;
  const p2 = (glyph[16 + row] ?? 0) >> (7 - col) & 1;
  const p3 = (glyph[24 + row] ?? 0) >> (7 - col) & 1;
  return (p3 << 3) | (p2 << 2) | (p1 << 1) | p0;
}

export function Font4bppGallery({ url }: Props) {
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
          const rgb = EGA_PALETTE[colorIndex];
          if (!rgb) continue;
          ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
          ctx.fillRect((gx + c) * ZOOM, (gy + r) * ZOOM, ZOOM, ZOOM);
        }
      }
    }
  }, [font]);

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
        Source: <code>{font.sourceFile}</code> · {font.glyphCount} glyphs · 4bpp
      </p>
      <canvas ref={canvasRef} role="img" aria-label="4bpp font glyph grid" />
    </section>
  );
}
```

- [ ] **Step 7: Render the new gallery in App**

Replace `packages/viewer/src/App.tsx` with:

```tsx
import { FontGallery } from './views/FontGallery.js';
import { Font4bppGallery } from './views/Font4bppGallery.js';

export function App() {
  return (
    <main>
      <h1>Wiz6 Viewer</h1>
      <FontGallery url="/fonts/wfont0.json" />
      <Font4bppGallery url="/fonts/wfont1.json" />
      <Font4bppGallery url="/fonts/wfont2.json" />
      <Font4bppGallery url="/fonts/wfont3.json" />
      <Font4bppGallery url="/fonts/wfont4.json" />
    </main>
  );
}
```

- [ ] **Step 8: Harden `App.test.tsx` for the four extra fetch sites**

The App now renders five gallery components, each calling fetch. Update `packages/viewer/tests/App.test.tsx` to stub all five URLs:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
```

- [ ] **Step 9: Run all viewer tests (should pass)**

```bash
pnpm --filter @wiz6/viewer test
```

Expected: 1 App + 6 data-loader (3 existing + 3 new) + 6 palette + 2 FontGallery + 2 Font4bppGallery = 17 viewer tests.

- [ ] **Step 10: Typecheck + lint**

```bash
pnpm --filter @wiz6/viewer typecheck
pnpm lint
```

Expected: both pass.

- [ ] **Step 11: Commit**

```bash
git add packages/viewer
git commit -m "feat(viewer): render 4bpp fonts in Font4bppGallery with EGA palette"
```

---

## Task 7: End-to-end smoke + completion

**Files:** None (verification only).

- [ ] **Step 1: Re-extract all fonts**

```bash
pnpm exec tsx packages/parser/src/cli.ts extract-fonts ./original ./extracted
```

Expected: 5 "wrote" lines (wfont0 through wfont4).

- [ ] **Step 2: Confirm all five JSON files exist and validate**

```bash
node -e "
const fs = require('fs');
for (const n of [0,1,2,3,4]) {
  const f = JSON.parse(fs.readFileSync(\`./extracted/fonts/wfont\${n}.json\`));
  console.log(\`wfont\${n}: \${f.glyphCount} glyphs\`);
}
"
```

Expected: 5 lines, each with `128 glyphs`.

- [ ] **Step 3: Start the viewer**

```bash
pnpm --filter @wiz6/viewer dev &
```

- [ ] **Step 4: Manually verify in browser**

Open the URL Vite prints (default http://localhost:5173/). Confirm:

- The "Wiz6 Viewer" heading.
- Five gallery sections (wfont0 through wfont4), each with its own glyph grid.
- The wfont0 grid (1bpp) is monochrome (the existing white-on-black grid from Stage 1b).
- The wfont1-4 grids (4bpp) are multicolored — the wfont1 grid should show recognizable class-name abbreviations ("FIG", "MAG", "PRI", etc.) using EGA palette colors.

- [ ] **Step 5: Stop the dev server**

```bash
pkill -f vite || true
```

- [ ] **Step 6: Run full verify**

```bash
pnpm verify
```

Expected counts (all pass):
- `@wiz6/data`: 10 existing + 7 new font-4bpp = 17 tests
- `@wiz6/parser`: 8 existing + 5 wfont-4bpp decoder + 2 wfont-4bpp extractor = 15 tests
- `@wiz6/viewer`: 1 App + 3 existing loadFont + 3 new loadFont4bpp + 6 palette + 2 FontGallery + 2 Font4bppGallery = 17 tests
- **Total: 49 tests**

- [ ] **Step 7: Commit any incidental changes**

If nothing changed during smoke-testing, skip. Otherwise commit it.

---

## Stage 1c Completion Checklist

After Task 7 completes, the following are all true:

- [ ] `docs/re/wfont-4bpp.md` exists and documents the format precisely (4 planes, 32 bytes/glyph, MSB-leftmost, EGA palette).
- [ ] `@wiz6/data` exports `Font4bppSchema`, `Font4bppGlyphSchema`, `Font4bpp`, `Font4bppGlyph`.
- [ ] `@wiz6/parser` exports `decodeWfont4bpp` and `extractWfont4bpp` from its public index.
- [ ] `@wiz6/parser` CLI's `extract-fonts` subcommand emits all five JSON files (wfont0 plus wfont1-4).
- [ ] `@wiz6/viewer` exports `EGA_PALETTE` from `src/ega-palette.ts` for future reuse.
- [ ] `@wiz6/viewer` renders all five font galleries in the dev server (manually verified — wfont1 shows class-name abbreviations).
- [ ] `pnpm verify` passes with 49 tests across three packages.

When all green, Stage 1c is done. Stage 1d (portraits — `wport*.ega`, 4096 bytes, 4bpp planar but with non-trivial dimensions and likely a tile atlas) is the next plan to write.
