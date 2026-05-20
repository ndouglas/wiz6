# Stage 1e: Portraits (`wport1-3.ega`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decode the three 4096-byte portrait files (`wport1.ega`, `wport2.ega`, `wport3.ega`) into typed JSON, render them in the viewer using the existing `WIZ6_PALETTE_1` from Stage 1d. Each file contains 8 portraits of 32×32 pixels at 4bpp, composed of 16 contiguous 8×8 tiles in row-major 4×4 arrangement.

**Architecture:** Reuse the 8×8 4bpp tile primitive established in Stage 1c (`Font4bppGlyph` = 32 bytes plane-sequential). A `PortraitSet` is 8 `Portrait`s; each `Portrait` is 16 tiles arranged 4×4 row-major. New `PortraitSetSchema` in `@wiz6/data`, new `decodeWport` / `extractWport` in `@wiz6/parser`, new CLI subcommand `extract-portraits`, new `PortraitGallery` viewer component that draws each portrait as a 32×32 canvas using the active palette from `App`'s picker.

**Tech Stack:** TypeScript, vitest, zod, React, Canvas 2D. No new npm dependencies.

---

## Known Facts (from investigation)

Verified by hex inspection + rendering wport1.ega and wport2.ega at 4× zoom with `WIZ6_PALETTE_1` — recognizable character-head shapes appeared with the 4×4 row-major arrangement:

- `original/wport1.ega`, `wport2.ega`, `wport3.ega` are each exactly **4096 bytes**.
- The last **64 bytes** of each file are all zeros (4032 active + 64 padding to 4KB).
- Each file holds **128 × 32-byte tiles** = same primitive as `wfont1-4`:
  - Plane-sequential within each tile: bytes 0–7 = plane 0 (blue), 8–15 = plane 1 (green), 16–23 = plane 2 (red), 24–31 = plane 3 (intensity).
  - Bit 7 of each plane byte is the leftmost pixel.
- The 128 tiles compose into **8 portraits of 32 × 32 pixels each** = 16 tiles per portrait.
- Within a portrait, the 16 tiles are arranged **4 × 4 row-major** (tile 0 = top-left, tile 1 = next-to-top-left, tile 3 = top-right, tile 4 = second-row leftmost, …, tile 15 = bottom-right).
- 8 portraits × 16 tiles × 32 bytes = 4096 bytes (matches file size).
- The corresponding `.cga` files (`wport1.cga` 2048 bytes, etc.) are 2bpp variants; out of scope here.
- `wport1.ega` and `wport2.ega` render as character-head-like content (the "portrait" interpretation). `wport3.ega` renders as more abstract/icon-like content but with the same byte layout — possibly NPC portraits, monster heads, or items; we render and let the human-eye decide what's what.

**Uncertainty:** the tile-arrangement-within-portrait might not be exactly row-major. The investigation render showed recognizable shapes but some seams were visible. If after Step 7's visual verification the portraits look wrong in a *structural* way (e.g., features misaligned between adjacent tiles), iterate by trying column-major (tile 0 top-left, tile 1 second-from-top-leftmost, … tile 4 second-column top), then refer back to the spec for further iteration. Do NOT alter the tile primitive or plane order — those are settled.

---

## File Structure

```
docs/
└── re/
    └── wport.md                            # NEW
packages/
├── data/
│   ├── src/
│   │   ├── schemas/
│   │   │   └── portrait.ts                 # NEW
│   │   └── index.ts                        # MODIFY — re-export
│   └── tests/
│       └── portrait.test.ts                # NEW
└── parser/
    ├── src/
    │   ├── formats/
    │   │   └── wport.ts                    # NEW
    │   ├── extractors/
    │   │   └── extract-wport.ts            # NEW
    │   ├── cli.ts                          # MODIFY — add extract-portraits subcommand
    │   └── index.ts                        # MODIFY — re-export
    └── tests/
        ├── formats/
        │   └── wport.test.ts               # NEW
        └── extractors/
            └── extract-wport.test.ts       # NEW
packages/viewer/
├── src/
│   ├── data-loader.ts                      # MODIFY — add loadPortraitSet
│   ├── views/
│   │   └── PortraitGallery.tsx             # NEW
│   └── App.tsx                             # MODIFY — render 3 PortraitGallery instances
└── tests/
    ├── data-loader.test.ts                 # MODIFY — add loadPortraitSet tests
    ├── views/
    │   └── PortraitGallery.test.tsx        # NEW
    └── App.test.tsx                        # MODIFY — extend fetch stub for portrait URLs
```

---

## Task 1: Write `docs/re/wport.md`

**Files:**
- Create: `docs/re/wport.md`

- [ ] **Step 1: Create the doc**

Create `docs/re/wport.md` with this content:

````markdown
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
````

- [ ] **Step 2: Commit**

```bash
git add docs/re/wport.md
git commit -m "docs(re): document wport1-3.ega 8x32x32 4bpp portrait format"
```

---

## Task 2: Add `Portrait` + `PortraitSet` schemas to `@wiz6/data`

**Files:**
- Create: `packages/data/src/schemas/portrait.ts`
- Create: `packages/data/tests/portrait.test.ts`
- Modify: `packages/data/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/data/tests/portrait.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  PortraitSchema,
  PortraitSetSchema,
  type Portrait,
  type PortraitSet,
} from '../src/index.js';

const blankTile = Array(32).fill(0);

const validPortrait: Portrait = {
  index: 0,
  tiles: Array.from({ length: 16 }, () => [...blankTile]),
};

const validSet: PortraitSet = {
  id: 'wport1',
  sourceFile: 'wport1.ega',
  portraitCount: 8,
  portraits: Array.from({ length: 8 }, (_, i) => ({
    index: i,
    tiles: Array.from({ length: 16 }, () => [...blankTile]),
  })),
};

describe('PortraitSchema', () => {
  it('accepts a portrait with index 0 and 16 32-byte tiles', () => {
    expect(() => PortraitSchema.parse(validPortrait)).not.toThrow();
  });

  it('rejects a portrait with fewer than 16 tiles', () => {
    const bad = { ...validPortrait, tiles: validPortrait.tiles.slice(0, 15) };
    expect(() => PortraitSchema.parse(bad)).toThrow();
  });

  it('rejects a portrait whose tile is not 32 bytes', () => {
    const bad = {
      ...validPortrait,
      tiles: validPortrait.tiles.map((t, i) => (i === 0 ? t.slice(0, 31) : t)),
    };
    expect(() => PortraitSchema.parse(bad)).toThrow();
  });

  it('rejects a negative index', () => {
    expect(() => PortraitSchema.parse({ ...validPortrait, index: -1 })).toThrow();
  });
});

describe('PortraitSetSchema', () => {
  it('accepts a valid 8-portrait set', () => {
    expect(() => PortraitSetSchema.parse(validSet)).not.toThrow();
  });

  it('rejects a set whose portraitCount disagrees with portraits.length', () => {
    const bad = { ...validSet, portraitCount: 7 };
    expect(() => PortraitSetSchema.parse(bad)).toThrow();
  });

  it('rejects a set missing the sourceFile field', () => {
    const { sourceFile, ...incomplete } = validSet;
    void sourceFile;
    expect(() => PortraitSetSchema.parse(incomplete)).toThrow();
  });
});
```

- [ ] **Step 2: Run the test (should fail)**

```bash
pnpm --filter @wiz6/data test
```

Expected: FAIL — schemas not exported.

- [ ] **Step 3: Implement the schemas**

Create `packages/data/src/schemas/portrait.ts`:

```ts
import { z } from 'zod';
import { Font4bppGlyphSchema } from './font-4bpp.js';

export const PortraitSchema = z.object({
  index: z.number().int().nonnegative(),
  tiles: z.array(Font4bppGlyphSchema).length(16),
});

export const PortraitSetSchema = z
  .object({
    id: z.string().min(1),
    sourceFile: z.string().min(1),
    portraitCount: z.number().int().positive(),
    portraits: z.array(PortraitSchema),
  })
  .refine((s) => s.portraitCount === s.portraits.length, {
    message: 'portraitCount must equal portraits.length',
    path: ['portraitCount'],
  });

export type Portrait = z.infer<typeof PortraitSchema>;
export type PortraitSet = z.infer<typeof PortraitSetSchema>;
```

Modify `packages/data/src/index.ts` — add the new exports at the end. The full file should be:

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
export {
  PortraitSchema,
  PortraitSetSchema,
  type Portrait,
  type PortraitSet,
} from './schemas/portrait.js';
```

- [ ] **Step 4: Run the test (should pass)**

```bash
pnpm --filter @wiz6/data test
```

Expected: PASS — **31 tests** in @wiz6/data (24 prior + 7 new portrait tests).

- [ ] **Step 5: Typecheck + lint**

```bash
pnpm --filter @wiz6/data typecheck
pnpm lint
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add packages/data
git commit -m "feat(data): add Portrait and PortraitSet schemas (reuse Font4bppGlyph tiles)"
```

---

## Task 3: Implement pure `decodeWport` in `@wiz6/parser`

**Files:**
- Create: `packages/parser/src/formats/wport.ts`
- Create: `packages/parser/tests/formats/wport.test.ts`
- Modify: `packages/parser/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/parser/tests/formats/wport.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decodeWport } from '../../src/formats/wport.js';

const ALL_ZEROES = new Uint8Array(4096);

const oneTilePattern = (() => {
  // Synthetic: portrait 0, tile 0, plane 0 byte 0 = 0xff;
  // tile 1 (portrait 0), plane 0 byte 0 = 0xaa;
  // tile 16 (portrait 1), plane 0 byte 0 = 0x55.
  const bytes = new Uint8Array(4096);
  bytes[0] = 0xff;        // portrait 0 tile 0 plane 0 byte 0
  bytes[32 + 0] = 0xaa;   // portrait 0 tile 1 plane 0 byte 0
  bytes[16 * 32 + 0] = 0x55; // portrait 1 tile 0 plane 0 byte 0
  return bytes;
})();

describe('decodeWport', () => {
  it('rejects input that is not exactly 4096 bytes', () => {
    expect(() => decodeWport(new Uint8Array(4095), { id: 'x', sourceFile: 'x' })).toThrow(/4096/);
    expect(() => decodeWport(new Uint8Array(4097), { id: 'x', sourceFile: 'x' })).toThrow(/4096/);
  });

  it('produces 8 portraits with 16 tiles each, all zero for an all-zero input', () => {
    const set = decodeWport(ALL_ZEROES, { id: 'wport1', sourceFile: 'wport1.ega' });
    expect(set.portraitCount).toBe(8);
    expect(set.portraits).toHaveLength(8);
    for (let p = 0; p < 8; p++) {
      expect(set.portraits[p]!.index).toBe(p);
      expect(set.portraits[p]!.tiles).toHaveLength(16);
      for (const tile of set.portraits[p]!.tiles) {
        expect(tile).toEqual(Array(32).fill(0));
      }
    }
  });

  it('reads the synthetic fixture bytes into the correct portrait/tile slots', () => {
    const set = decodeWport(oneTilePattern, { id: 'wport1', sourceFile: 'wport1.ega' });
    expect(set.portraits[0]!.tiles[0]![0]).toBe(0xff);
    expect(set.portraits[0]!.tiles[1]![0]).toBe(0xaa);
    expect(set.portraits[1]!.tiles[0]![0]).toBe(0x55);
  });

  it('preserves id and sourceFile in the output', () => {
    const set = decodeWport(ALL_ZEROES, { id: 'wport1', sourceFile: 'wport1.ega' });
    expect(set.id).toBe('wport1');
    expect(set.sourceFile).toBe('wport1.ega');
  });
});
```

- [ ] **Step 2: Run the test (should fail)**

```bash
pnpm --filter @wiz6/parser test
```

Expected: FAIL — `decodeWport` not found.

- [ ] **Step 3: Implement `decodeWport`**

Create `packages/parser/src/formats/wport.ts`:

```ts
import { PortraitSetSchema, type PortraitSet } from '@wiz6/data';

const EXPECTED_SIZE = 4096;
const PORTRAITS_PER_FILE = 8;
const TILES_PER_PORTRAIT = 16;
const TILE_BYTES = 32;

export interface DecodeWportOpts {
  id: string;
  sourceFile: string;
}

export function decodeWport(bytes: Uint8Array, opts: DecodeWportOpts): PortraitSet {
  if (bytes.length !== EXPECTED_SIZE) {
    throw new Error(`wport decoder expected ${EXPECTED_SIZE} bytes, got ${bytes.length}`);
  }
  const portraits = [];
  for (let p = 0; p < PORTRAITS_PER_FILE; p++) {
    const tiles: number[][] = [];
    for (let t = 0; t < TILES_PER_PORTRAIT; t++) {
      const tileBase = (p * TILES_PER_PORTRAIT + t) * TILE_BYTES;
      const tile: number[] = [];
      for (let b = 0; b < TILE_BYTES; b++) {
        const byte = bytes[tileBase + b];
        if (byte === undefined) {
          throw new Error(`unreachable: missing byte at offset ${tileBase + b}`);
        }
        tile.push(byte);
      }
      tiles.push(tile);
    }
    portraits.push({ index: p, tiles });
  }
  return PortraitSetSchema.parse({
    id: opts.id,
    sourceFile: opts.sourceFile,
    portraitCount: PORTRAITS_PER_FILE,
    portraits,
  });
}
```

Modify `packages/parser/src/index.ts` — add the new export. The full file should be:

```ts
import type { Manifest } from '@wiz6/data';

export { decodeWfont, type DecodeWfontOpts } from './formats/wfont.js';
export { extractWfont, type ExtractWfontOpts } from './extractors/extract-wfont.js';
export { decodeWfont4bpp, type DecodeWfont4bppOpts } from './formats/wfont-4bpp.js';
export { extractWfont4bpp, type ExtractWfont4bppOpts } from './extractors/extract-wfont-4bpp.js';
export { decodeWport, type DecodeWportOpts } from './formats/wport.js';

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

Expected: PASS — **19 tests** in @wiz6/parser (15 prior + 4 new wport).

- [ ] **Step 5: Typecheck + lint**

```bash
pnpm --filter @wiz6/parser typecheck
pnpm lint
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add packages/parser
git commit -m "feat(parser): add pure decodeWport for 8x32x32 4bpp portrait set format"
```

---

## Task 4: Implement `extractWport` and extend the CLI

**Files:**
- Create: `packages/parser/src/extractors/extract-wport.ts`
- Create: `packages/parser/tests/extractors/extract-wport.test.ts`
- Modify: `packages/parser/src/cli.ts`
- Modify: `packages/parser/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/parser/tests/extractors/extract-wport.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PortraitSetSchema } from '@wiz6/data';
import { extractWport } from '../../src/extractors/extract-wport.js';

describe('extractWport', () => {
  it('reads bytes, decodes, writes valid JSON', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wiz6-extract-wport-'));
    try {
      const originalDir = join(tmp, 'original');
      const extractedDir = join(tmp, 'extracted');
      mkdirSync(originalDir, { recursive: true });

      const inputBytes = new Uint8Array(4096);
      for (let i = 0; i < 4096; i++) inputBytes[i] = i & 0xff;
      writeFileSync(join(originalDir, 'wport1.ega'), inputBytes);

      const result = extractWport({
        originalPath: join(originalDir, 'wport1.ega'),
        outputPath: join(extractedDir, 'portraits', 'wport1.json'),
        id: 'wport1',
      });

      expect(() => PortraitSetSchema.parse(result)).not.toThrow();
      expect(result.portraitCount).toBe(8);
      // Portrait 0 tile 0 = bytes 0..31, so tile[0][0] = 0, tile[0][1] = 1, etc.
      expect(result.portraits[0]!.tiles[0]![0]).toBe(0);
      expect(result.portraits[0]!.tiles[0]![1]).toBe(1);

      const onDisk = JSON.parse(readFileSync(join(extractedDir, 'portraits', 'wport1.json'), 'utf8'));
      expect(() => PortraitSetSchema.parse(onDisk)).not.toThrow();
      expect(onDisk.id).toBe('wport1');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('creates parent directories for the output path', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wiz6-extract-wport-mkdir-'));
    try {
      const originalPath = join(tmp, 'wport1.ega');
      const outputPath = join(tmp, 'a', 'b', 'c', 'wport1.json');
      writeFileSync(originalPath, new Uint8Array(4096));
      extractWport({ originalPath, outputPath, id: 'wport1' });
      expect(JSON.parse(readFileSync(outputPath, 'utf8')).id).toBe('wport1');
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

Expected: FAIL — `extractWport` not found.

- [ ] **Step 3: Implement `extractWport`**

Create `packages/parser/src/extractors/extract-wport.ts`:

```ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { PortraitSet } from '@wiz6/data';
import { decodeWport } from '../formats/wport.js';

export interface ExtractWportOpts {
  originalPath: string;
  outputPath: string;
  id: string;
}

export function extractWport(opts: ExtractWportOpts): PortraitSet {
  const bytes = new Uint8Array(readFileSync(opts.originalPath));
  const set = decodeWport(bytes, {
    id: opts.id,
    sourceFile: basename(opts.originalPath),
  });
  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, JSON.stringify(set, null, 2));
  return set;
}
```

Modify `packages/parser/src/index.ts` — add the new export alongside the existing ones:

```ts
export { extractWport, type ExtractWportOpts } from './extractors/extract-wport.js';
```

(Insert immediately after the `extractWfont4bpp` export line.)

- [ ] **Step 4: Run the test (should pass)**

```bash
pnpm --filter @wiz6/parser test
```

Expected: PASS — **21 tests** in @wiz6/parser (19 prior + 2 new extract-wport).

- [ ] **Step 5: Add an `extract-portraits` CLI subcommand**

Modify `packages/parser/src/cli.ts`. The new full file:

```ts
#!/usr/bin/env node
import { join } from 'node:path';
import { describePlan } from './index.js';
import { extractWfont } from './extractors/extract-wfont.js';
import { extractWfont4bpp } from './extractors/extract-wfont-4bpp.js';
import { extractWport } from './extractors/extract-wport.js';

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
} else if (subcommand === 'extract-portraits') {
  const originalDir = process.argv[3] ?? './original';
  const extractedDir = process.argv[4] ?? './extracted';

  for (const n of [1, 2, 3]) {
    const set = extractWport({
      originalPath: join(originalDir, `wport${n}.ega`),
      outputPath: join(extractedDir, 'portraits', `wport${n}.json`),
      id: `wport${n}`,
    });
    console.log(`wrote ${extractedDir}/portraits/wport${n}.json (${set.portraitCount} portraits)`);
  }
} else if (subcommand === 'plan' || subcommand === undefined) {
  const originalDir = process.argv[3] ?? './original';
  const plan = describePlan({ originalDir });
  console.log(JSON.stringify(plan, null, 2));
} else {
  console.error(`Unknown subcommand: ${subcommand}`);
  console.error(`Usage: wiz6-parse [plan|extract-fonts|extract-portraits] [<originalDir> [<extractedDir>]]`);
  process.exit(2);
}
```

- [ ] **Step 6: Smoke-run the CLI against real game data**

```bash
pnpm exec tsx packages/parser/src/cli.ts extract-portraits ./original ./extracted
```

Expected output:

```
wrote ./extracted/portraits/wport1.json (8 portraits)
wrote ./extracted/portraits/wport2.json (8 portraits)
wrote ./extracted/portraits/wport3.json (8 portraits)
```

And three JSON files now exist under `./extracted/portraits/`.

- [ ] **Step 7: Inspect one extracted file**

```bash
node -e "const s = JSON.parse(require('fs').readFileSync('./extracted/portraits/wport1.json')); console.log('id:', s.id, '· portraitCount:', s.portraitCount, '· portrait 0 tile 0 first 4 bytes:', s.portraits[0].tiles[0].slice(0, 4));"
```

Expected: `id: wport1 · portraitCount: 8 · portrait 0 tile 0 first 4 bytes: [ 248, 224, 224, 194 ]` (decimal of `f8 e0 e0 c2` — the real-file bytes confirmed during plan investigation).

- [ ] **Step 8: Typecheck + lint**

```bash
pnpm --filter @wiz6/parser typecheck
pnpm lint
```

Expected: both pass.

- [ ] **Step 9: Commit**

```bash
git add packages/parser
git commit -m "feat(parser): add extract-portraits CLI subcommand using wport decoder"
```

---

## Task 5: Add `loadPortraitSet` to the viewer's data loader

**Files:**
- Modify: `packages/viewer/src/data-loader.ts`
- Modify: `packages/viewer/tests/data-loader.test.ts`

- [ ] **Step 1: Append failing tests to `tests/data-loader.test.ts`**

First, update the existing import line at the top of `packages/viewer/tests/data-loader.test.ts` from:

```ts
import { loadFont, loadFont4bpp } from '../src/data-loader.js';
```

to:

```ts
import { loadFont, loadFont4bpp, loadPortraitSet } from '../src/data-loader.js';
```

Then append (after the existing `describe('loadFont4bpp', ...)` block — keep that block and all earlier code as-is) the following block. Do **not** re-import `loadPortraitSet` here — it's on the top-of-file import line per the change above.

```ts
const validPortraitSet = {
  id: 'wport1',
  sourceFile: 'wport1.ega',
  portraitCount: 1,
  portraits: [
    {
      index: 0,
      tiles: Array.from({ length: 16 }, () => Array(32).fill(0)),
    },
  ],
};

describe('loadPortraitSet', () => {
  it('fetches and validates a portrait set JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validPortraitSet), { status: 200 })));
    const set = await loadPortraitSet('/portraits/wport1.json');
    expect(set.id).toBe('wport1');
    expect(set.portraitCount).toBe(1);
  });

  it('throws if the fetch response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    await expect(loadPortraitSet('/missing.json')).rejects.toThrow(/404/);
  });

  it('throws if the payload does not validate against PortraitSetSchema', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'x' }), { status: 200 })));
    await expect(loadPortraitSet('/bad.json')).rejects.toThrow();
  });
});
```

(`describe`, `expect`, `it`, `vi`, `beforeEach` are already imported at the top of the existing file — no need to re-import.)

- [ ] **Step 2: Run the tests (should fail)**

```bash
pnpm --filter @wiz6/viewer test
```

Expected: FAIL — `loadPortraitSet` not exported.

- [ ] **Step 3: Implement `loadPortraitSet`**

Replace `packages/viewer/src/data-loader.ts` with:

```ts
import {
  FontSchema,
  Font4bppSchema,
  PortraitSetSchema,
  type Font,
  type Font4bpp,
  type PortraitSet,
} from '@wiz6/data';

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

export async function loadPortraitSet(url: string): Promise<PortraitSet> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  }
  const json: unknown = await response.json();
  return PortraitSetSchema.parse(json);
}
```

- [ ] **Step 4: Run the tests (should pass)**

```bash
pnpm --filter @wiz6/viewer test
```

Expected: PASS — **32 viewer tests** (29 prior + 3 new loadPortraitSet).

- [ ] **Step 5: Typecheck + lint**

```bash
pnpm --filter @wiz6/viewer typecheck
pnpm lint
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add packages/viewer
git commit -m "feat(viewer): add loadPortraitSet to data-loader"
```

---

## Task 6: Add `PortraitGallery` viewer component

**Files:**
- Create: `packages/viewer/src/views/PortraitGallery.tsx`
- Create: `packages/viewer/tests/views/PortraitGallery.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/views/PortraitGallery.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PortraitGallery } from '../../src/views/PortraitGallery.js';
import { EGA_PALETTE } from '../../src/palettes/index.js';

const blankTile = Array(32).fill(0);

const tinyPortraitSet = {
  id: 'wport1',
  sourceFile: 'wport1.ega',
  portraitCount: 2,
  portraits: [
    { index: 0, tiles: Array.from({ length: 16 }, () => [...blankTile]) },
    {
      index: 1,
      tiles: Array.from({ length: 16 }, (_, t) =>
        // Sparse: only first byte of tile is non-zero, varying per tile
        Array(32).fill(0).map((_, b) => (b === 0 ? (t + 1) & 0xff : 0)),
      ),
    },
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('PortraitGallery', () => {
  it('renders a loading state then the canvas after fetch resolves', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(tinyPortraitSet), { status: 200 })));
    render(<PortraitGallery url="/portraits/wport1.json" />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('img', { name: /portrait set/i })).toBeInTheDocument());
    expect(screen.getAllByText(/wport1/).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 portraits/)).toBeInTheDocument();
  });

  it('accepts and renders with a custom palette prop', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(tinyPortraitSet), { status: 200 })));
    render(<PortraitGallery url="/portraits/wport1.json" palette={EGA_PALETTE} />);
    await waitFor(() => expect(screen.getByRole('img', { name: /portrait set/i })).toBeInTheDocument());
  });

  it('renders an error message if loading fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    render(<PortraitGallery url="/portraits/wport1.json" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/500/));
  });
});
```

- [ ] **Step 2: Run the test (should fail)**

```bash
pnpm --filter @wiz6/viewer test
```

Expected: FAIL — `PortraitGallery` not found.

- [ ] **Step 3: Implement `PortraitGallery`**

Create `packages/viewer/src/views/PortraitGallery.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import type { Palette, PortraitSet } from '@wiz6/data';
import { loadPortraitSet } from '../data-loader.js';
import { WIZ6_PALETTE_1 } from '../palettes/wiz6-palette-1.js';

const TILE_PX = 8;
const TILES_PER_SIDE = 4;
const PORTRAIT_PX = TILE_PX * TILES_PER_SIDE; // 32
const ZOOM = 4;
const COLS = 4; // 4 portraits per display row

// Standard EGA plane order: B (plane 0), G (plane 1), R (plane 2), I (plane 3).
function pixelColor(tile: number[], row: number, col: number): number {
  const blue = (tile[row] ?? 0) >> (7 - col) & 1;
  const green = (tile[8 + row] ?? 0) >> (7 - col) & 1;
  const red = (tile[16 + row] ?? 0) >> (7 - col) & 1;
  const intensity = (tile[24 + row] ?? 0) >> (7 - col) & 1;
  return (intensity << 3) | (red << 2) | (green << 1) | blue;
}

interface Props {
  url: string;
  palette?: Palette;
}

export function PortraitGallery({ url, palette = WIZ6_PALETTE_1 }: Props) {
  const [set, setSet] = useState<PortraitSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPortraitSet(url)
      .then((s) => {
        if (!cancelled) setSet(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    if (!set || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const dispRows = Math.ceil(set.portraitCount / COLS);
    canvas.width = COLS * PORTRAIT_PX * ZOOM;
    canvas.height = dispRows * PORTRAIT_PX * ZOOM;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context not available');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let p = 0; p < set.portraitCount; p++) {
      const portrait = set.portraits[p];
      if (!portrait) continue;
      const px = (p % COLS) * PORTRAIT_PX;
      const py = Math.floor(p / COLS) * PORTRAIT_PX;
      for (let ty = 0; ty < TILES_PER_SIDE; ty++) {
        for (let tx = 0; tx < TILES_PER_SIDE; tx++) {
          const tile = portrait.tiles[ty * TILES_PER_SIDE + tx];
          if (!tile) continue;
          for (let r = 0; r < TILE_PX; r++) {
            for (let c = 0; c < TILE_PX; c++) {
              const colorIndex = pixelColor(tile, r, c);
              const rgb = palette.colors[colorIndex];
              if (!rgb) continue;
              const screenX = (px + tx * TILE_PX + c) * ZOOM;
              const screenY = (py + ty * TILE_PX + r) * ZOOM;
              ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
              ctx.fillRect(screenX, screenY, ZOOM, ZOOM);
            }
          }
        }
      }
    }
  }, [set, palette]);

  if (error) {
    return <div role="alert">Error: {error}</div>;
  }
  if (!set) {
    return <p>Loading…</p>;
  }
  return (
    <section>
      <h2>{set.id}</h2>
      <p>
        Source: <code>{set.sourceFile}</code> · {set.portraitCount} portraits · 32 × 32 4bpp · palette: <code>{palette.name}</code>
      </p>
      <canvas ref={canvasRef} role="img" aria-label="Portrait set" />
    </section>
  );
}
```

- [ ] **Step 4: Run the test (should pass)**

```bash
pnpm --filter @wiz6/viewer test
```

Expected: PASS — **35 viewer tests** (32 prior + 3 new PortraitGallery).

- [ ] **Step 5: Typecheck + lint**

```bash
pnpm --filter @wiz6/viewer typecheck
pnpm lint
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add packages/viewer
git commit -m "feat(viewer): add PortraitGallery rendering 32x32 portraits via row-major tile grid"
```

---

## Task 7: Render the three portrait sets in `App.tsx`

**Files:**
- Modify: `packages/viewer/src/App.tsx`
- Modify: `packages/viewer/tests/App.test.tsx`

- [ ] **Step 1: Update the App fetch stub to handle portrait URLs**

Modify `packages/viewer/tests/App.test.tsx`. Replace the file with:

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

const validPortraitSet = {
  id: 'wportN',
  sourceFile: 'wportN.ega',
  portraitCount: 1,
  portraits: [
    {
      index: 0,
      tiles: Array.from({ length: 16 }, () => Array(32).fill(0)),
    },
  ],
};

describe('App', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('portraits/')) return new Response(JSON.stringify(validPortraitSet), { status: 200 });
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

- [ ] **Step 2: Modify `App.tsx` to render the three PortraitGallery instances**

Replace `packages/viewer/src/App.tsx` with:

```tsx
import { useState } from 'react';
import type { Palette } from '@wiz6/data';
import { FontGallery } from './views/FontGallery.js';
import { Font4bppGallery } from './views/Font4bppGallery.js';
import { PortraitGallery } from './views/PortraitGallery.js';
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
      <PortraitGallery url="/portraits/wport1.json" palette={palette} />
      <PortraitGallery url="/portraits/wport2.json" palette={palette} />
      <PortraitGallery url="/portraits/wport3.json" palette={palette} />
    </main>
  );
}
```

- [ ] **Step 3: Run the App tests (should pass — fetch stub now handles portrait URLs)**

```bash
pnpm --filter @wiz6/viewer test
```

Expected: PASS — **35 viewer tests** (App test count unchanged; the new stub returns appropriate responses for the additional portrait URLs).

- [ ] **Step 4: Typecheck + lint**

```bash
pnpm --filter @wiz6/viewer typecheck
pnpm lint
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer
git commit -m "feat(viewer): render wport1-3 PortraitGallery instances in App"
```

---

## Task 8: End-to-end smoke + verify

**Files:** None. Verification only.

- [ ] **Step 1: Re-extract everything**

```bash
pnpm exec tsx packages/parser/src/cli.ts extract-fonts ./original ./extracted
pnpm exec tsx packages/parser/src/cli.ts extract-portraits ./original ./extracted
```

Expected: 5 "wrote" font lines + 3 "wrote" portrait lines.

- [ ] **Step 2: Run full verify**

```bash
pnpm verify
```

Expected counts (all pass):
- `@wiz6/data`: 24 prior + 7 portrait = **31 tests**
- `@wiz6/parser`: 15 prior + 4 wport decoder + 2 wport extractor = **21 tests**
- `@wiz6/viewer`: 29 prior + 3 loadPortraitSet + 3 PortraitGallery = **35 tests**
- **Total: 87 tests**

- [ ] **Step 3: Start the viewer**

```bash
pnpm --filter @wiz6/viewer dev &
```

- [ ] **Step 4: Manually verify in browser**

Open the URL Vite prints (default http://localhost:5173/). With the **wiz6-main** picker option (default), confirm:

- Below the existing font galleries, three new portrait gallery sections appear: `wport1`, `wport2`, `wport3`.
- Each shows a 4 × 2 grid of 32 × 32 portraits at 4× zoom (= 128 px per portrait, 512 × 256 px total grid).
- `wport1` and `wport2` show character-head-style content (faces, hair, headgear).
- `wport3` shows different content (possibly NPC/monster heads or item icons).
- Colors look right under `wiz6-main` (skin tones, hair colors, etc.).
- Toggling to `ega-default` shifts colors as expected.
- Toggling to `wiz6-dungeon` shifts colors for indices 1–8 only (9–15 unchanged).

**If portraits look structurally wrong** (e.g., features misaligned between adjacent tiles, the bottom half doesn't match the top, etc.), report the observation — the tile-arrangement-within-portrait assumption (row-major) may need to be column-major or a different ordering. We iterate before declaring the stage done.

- [ ] **Step 5: Stop the dev server**

```bash
pkill -f vite || true
```

- [ ] **Step 6: Push**

```bash
git push origin main
```

---

## Stage 1e Completion Checklist

After Task 8:

- [ ] `docs/re/wport.md` exists and documents the format precisely.
- [ ] `@wiz6/data` exports `PortraitSchema`, `PortraitSetSchema`, `Portrait`, `PortraitSet`.
- [ ] `@wiz6/parser` exports `decodeWport`, `extractWport`; CLI supports `extract-portraits`.
- [ ] `extracted/portraits/wport{1,2,3}.json` exist locally (gitignored) and validate against `PortraitSetSchema`.
- [ ] `@wiz6/viewer` exports `PortraitGallery` and `loadPortraitSet`.
- [ ] App renders three `PortraitGallery` instances.
- [ ] `pnpm verify` passes with **87 tests** across three packages.
- [ ] Visual verification by the user: `wport1` and `wport2` show recognizable character portraits under the wiz6-main palette.

When all green, Stage 1e is done. Stage 1f options after this: the title page (`titlepag.ega`, has the 256-byte header + non-obvious plane layout still to figure out), or `mazedata.ega` (102 KB, the dungeon wall tile set).
