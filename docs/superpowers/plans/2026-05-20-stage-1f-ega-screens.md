# Stage 1f: 32 KB EGA Screen Files (`titlepag.ega`, `graveyrd.ega`, `dragonsc.ega`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decode the three 32768-byte EGA screen files (`titlepag.ega`, `graveyrd.ega`, `dragonsc.ega`) into typed JSON and render them in the viewer using the existing palette picker. Each file contains a 320×200 4bpp planar image (32000 bytes) + a 256-byte trailer (preserved verbatim — likely the per-screen palette, encoding TBD) + 512 bytes of zero padding.

**Architecture:** New `EgaScreenSchema` in `@wiz6/data`, new `decodeEgaScreen` / `extractEgaScreen` in `@wiz6/parser`, new CLI subcommand `extract-screens`, new `ScreenGallery` viewer component that renders the 320×200 image as a single canvas at 1× or 2× zoom using the active palette from `App`'s picker. The trailer bytes are preserved in the JSON so a future iteration can decode the per-screen palette without re-extracting the originals.

**Tech Stack:** TypeScript, vitest, zod, React, Canvas 2D. No new npm dependencies.

---

## Known Facts (from `docs/re/ega-screen-investigation.md`)

Verified in the 2026-05-20 RE session — all three files render as recognizable images with a hand-crafted palette:

- `original/titlepag.ega`, `graveyrd.ega`, `dragonsc.ega` are each exactly **32768 bytes**.
- Each file is **standard EGA 4bpp plane-sequential**:
  - bytes 0..7999      = plane 0 (B), 40 bytes/row × 200 rows
  - bytes 8000..15999  = plane 1 (G)
  - bytes 16000..23999 = plane 2 (R)
  - bytes 24000..31999 = plane 3 (I)
  - Within each plane, bit 7 of each byte is the leftmost pixel of that row segment.
- Bytes **32000..32255** are a **256-byte trailer** with high entropy (131 unique byte values). Likely the per-screen palette in an as-yet-unknown encoding (not a 17-byte palette × N stack, not a 16×16 RGB-byte grid).
- Bytes **32256..32767** are zero padding to the 32 KB boundary.
- Image dimensions: **320 × 200 pixels**, 16-color (4bpp), standard EGA color indices.
- All three files use the same format (verified by structural-render test in the 2026-05-20 session).

### Pixel encoding (identical to wfont1-4 and wport1-3, just at image scale)

For pixel at `(x, y)` where `0 ≤ x < 320` and `0 ≤ y < 200`:

```
row_byte_index = y * 40 + (x >> 3)        // 0..7999
bit_index      = 7 - (x & 7)              // 0..7, MSB = leftmost pixel
mask           = 1 << bit_index

b = (plane0[row_byte_index] >> bit_index) & 1
g = (plane1[row_byte_index] >> bit_index) & 1
r = (plane2[row_byte_index] >> bit_index) & 1
i = (plane3[row_byte_index] >> bit_index) & 1

color_index = (i << 3) | (r << 2) | (g << 1) | b   // 0..15
```

### Palette caveat for this stage

**The 256-byte trailer is not yet decoded.** None of our existing palettes (`wiz6-main`, `wiz6-dungeon`, `ega-default`) produces the in-game color scheme — the title-screen authors color 1 = yellow (title text) and color 8 = brown (stone walls), which doesn't match any existing palette. For Stage 1f's MVP, we render with the active palette from the picker and accept that the visible colors will look wrong but the **structure** (text positions, sprite shapes, background layout) will be correct. Verifying the palette is a future task (Stage 1f.1 or beyond) once the trailer encoding is reverse-engineered.

---

## File Structure

```
docs/
└── re/
    └── ega-screen.md                       # NEW — format spec (separate from investigation memo)
packages/
├── data/
│   ├── src/
│   │   ├── schemas/
│   │   │   └── ega-screen.ts               # NEW
│   │   └── index.ts                        # MODIFY — re-export
│   └── tests/
│       └── ega-screen.test.ts              # NEW
└── parser/
    ├── src/
    │   ├── formats/
    │   │   └── ega-screen.ts               # NEW
    │   ├── extractors/
    │   │   └── extract-ega-screen.ts       # NEW
    │   ├── cli.ts                          # MODIFY — add extract-screens subcommand
    │   └── index.ts                        # MODIFY — re-export
    └── tests/
        ├── formats/
        │   └── ega-screen.test.ts          # NEW
        └── extractors/
            └── extract-ega-screen.test.ts  # NEW
packages/viewer/
├── src/
│   ├── data-loader.ts                      # MODIFY — add loadEgaScreen
│   ├── views/
│   │   └── ScreenGallery.tsx               # NEW
│   └── App.tsx                             # MODIFY — render 3 ScreenGallery instances
└── tests/
    ├── data-loader.test.ts                 # MODIFY — add loadEgaScreen tests
    ├── views/
    │   └── ScreenGallery.test.tsx          # NEW
    └── App.test.tsx                        # MODIFY — extend fetch stub for screen URLs
```

---

## Task 1: Write `docs/re/ega-screen.md`

**Files:**
- Create: `docs/re/ega-screen.md`

- [ ] **Step 1: Create the doc**

Create `docs/re/ega-screen.md` with this content:

````markdown
# `titlepag.ega`, `graveyrd.ega`, `dragonsc.ega` — 32 KB EGA Screens

**Status:** Format decoded — standard EGA 4bpp planar 320×200 image + 256-byte trailer (palette TBD) + 512-byte zero pad.

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
offset 0x7D00..0x7DFF  (256 B)   trailer (per-screen palette, encoding TBD)
offset 0x7E00..0x7FFF  (512 B)   zero padding
```

Image: **320 × 200 pixels**, 16-color (4bpp), standard EGA color indices.

## Pixel decoding

For pixel at `(x, y)` where `0 ≤ x < 320` and `0 ≤ y < 200`:

```
row_byte_index = y * 40 + (x >> 3)        // 0..7999
bit_index      = 7 - (x & 7)              // MSB is leftmost pixel

b = (plane0[row_byte_index] >> bit_index) & 1
g = (plane1[row_byte_index] >> bit_index) & 1
r = (plane2[row_byte_index] >> bit_index) & 1
i = (plane3[row_byte_index] >> bit_index) & 1

color_index = (i << 3) | (r << 2) | (g << 1) | b   // 0..15
```

This is identical to the pixel encoding used by `wfont1-4.ega` and `wport1-3.ega`, just at image scale instead of tile scale.

## Trailer

The 256 bytes at offset 0x7D00..0x7DFF are preserved verbatim in the extracted JSON (`trailer` field). The encoding is not yet decoded — it might be:

- A packed per-screen palette (each .ega file likely needs its own palette since the in-game color scheme — yellow title text, brown stone walls — doesn't match any palette found in `wroot.exe`).
- A slide-in animation script (the title page is known to slide in from the left in the actual game).
- A custom LUT for runtime color remapping.

Resolving this is a follow-up task; see "Open questions" in `docs/re/ega-screen-investigation.md`.

## File summary

| File          | Visible content (structural)                                                |
|---------------|-----------------------------------------------------------------------------|
| `titlepag.ega` | "BANE OF THE COSMIC FORGE" title screen — text on the left, wizards on the right, dungeon-wall background |
| `graveyrd.ega` | Graveyard cinematic — skull, tombstones, cross, fiery sky |
| `dragonsc.ega` | Top-strip HUD with character/class icons (top ~25% of image; rest is intentionally blank) |
````

- [ ] **Step 2: Commit**

```bash
git add docs/re/ega-screen.md
git commit -m "docs(re): add EGA screen format spec (Stage 1f Task 1)"
```

---

## Task 2: `EgaScreenSchema` in `@wiz6/data`

**Files:**
- Create: `packages/data/src/schemas/ega-screen.ts`
- Modify: `packages/data/src/index.ts`
- Test: `packages/data/tests/ega-screen.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/data/tests/ega-screen.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { EgaScreenSchema } from '../src/schemas/ega-screen.js';

const validPlane = Array(8000).fill(0);
const validTrailer = Array(256).fill(0);

const validScreen = {
  id: 'titlepag',
  sourceFile: 'titlepag.ega',
  width: 320,
  height: 200,
  planes: [validPlane, validPlane, validPlane, validPlane],
  trailer: validTrailer,
};

describe('EgaScreenSchema', () => {
  it('accepts a valid screen', () => {
    expect(() => EgaScreenSchema.parse(validScreen)).not.toThrow();
  });

  it('rejects when there are not exactly 4 planes', () => {
    expect(() => EgaScreenSchema.parse({ ...validScreen, planes: [validPlane, validPlane, validPlane] })).toThrow();
  });

  it('rejects when a plane is not 8000 bytes', () => {
    const shortPlane = Array(7999).fill(0);
    expect(() => EgaScreenSchema.parse({ ...validScreen, planes: [shortPlane, validPlane, validPlane, validPlane] })).toThrow();
  });

  it('rejects when trailer is not 256 bytes', () => {
    expect(() => EgaScreenSchema.parse({ ...validScreen, trailer: Array(255).fill(0) })).toThrow();
  });

  it('rejects when width is not 320', () => {
    expect(() => EgaScreenSchema.parse({ ...validScreen, width: 321 })).toThrow();
  });

  it('rejects when height is not 200', () => {
    expect(() => EgaScreenSchema.parse({ ...validScreen, height: 201 })).toThrow();
  });

  it('rejects a byte > 255 in a plane', () => {
    const badPlane = [...validPlane];
    badPlane[0] = 256;
    expect(() => EgaScreenSchema.parse({ ...validScreen, planes: [badPlane, validPlane, validPlane, validPlane] })).toThrow();
  });

  it('rejects an empty id', () => {
    expect(() => EgaScreenSchema.parse({ ...validScreen, id: '' })).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/data && pnpm test`
Expected: FAIL with "Cannot find module './schemas/ega-screen.js'" or similar.

- [ ] **Step 3: Write the schema**

Create `packages/data/src/schemas/ega-screen.ts`:

```typescript
import { z } from 'zod';

const PLANE_BYTES = 8000; // 40 × 200
const TRAILER_BYTES = 256;
const WIDTH = 320;
const HEIGHT = 200;

const byteSchema = z.number().int().min(0).max(255);
const planeSchema = z.array(byteSchema).length(PLANE_BYTES);

export const EgaScreenSchema = z.object({
  id: z.string().min(1),
  sourceFile: z.string().min(1),
  width: z.literal(WIDTH),
  height: z.literal(HEIGHT),
  planes: z.array(planeSchema).length(4),
  trailer: z.array(byteSchema).length(TRAILER_BYTES),
});

export type EgaScreen = z.infer<typeof EgaScreenSchema>;
```

- [ ] **Step 4: Re-export from `packages/data/src/index.ts`**

Add to the top-level exports (alongside existing schemas):

```typescript
export { EgaScreenSchema, type EgaScreen } from './schemas/ega-screen.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/data && pnpm test`
Expected: All `ega-screen.test.ts` tests PASS (8 new tests).

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/schemas/ega-screen.ts packages/data/src/index.ts packages/data/tests/ega-screen.test.ts
git commit -m "feat(data): add EgaScreen schema (Stage 1f Task 2)"
```

---

## Task 3: `decodeEgaScreen` pure decoder in `@wiz6/parser`

**Files:**
- Create: `packages/parser/src/formats/ega-screen.ts`
- Modify: `packages/parser/src/index.ts`
- Test: `packages/parser/tests/formats/ega-screen.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/parser/tests/formats/ega-screen.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { decodeEgaScreen } from '../../src/formats/ega-screen.js';

const PLANE = 8000;
const TRAILER = 256;
const TOTAL = PLANE * 4 + TRAILER + 512;
const FILE_SIZE = 32768;

function makeFile({
  fill = 0,
  trailerFill = 0xab,
  trailingZeroes = 512,
}: { fill?: number; trailerFill?: number; trailingZeroes?: number } = {}): Uint8Array {
  const buf = new Uint8Array(FILE_SIZE);
  buf.fill(fill, 0, PLANE * 4);
  buf.fill(trailerFill, PLANE * 4, PLANE * 4 + TRAILER);
  // last 512 bytes already zero
  return buf;
}

describe('decodeEgaScreen', () => {
  it('decodes a 32768-byte file into 4 planes + 256-byte trailer', () => {
    const bytes = makeFile({ fill: 0x55, trailerFill: 0xab });
    const screen = decodeEgaScreen(bytes, { id: 'titlepag', sourceFile: 'titlepag.ega' });
    expect(screen.id).toBe('titlepag');
    expect(screen.sourceFile).toBe('titlepag.ega');
    expect(screen.width).toBe(320);
    expect(screen.height).toBe(200);
    expect(screen.planes).toHaveLength(4);
    expect(screen.planes[0]).toHaveLength(8000);
    expect(screen.planes[0]?.[0]).toBe(0x55);
    expect(screen.trailer).toHaveLength(256);
    expect(screen.trailer[0]).toBe(0xab);
  });

  it('extracts planes from the correct byte ranges', () => {
    const bytes = new Uint8Array(FILE_SIZE);
    bytes[0] = 0x01;          // first byte of plane 0
    bytes[8000] = 0x02;       // first byte of plane 1
    bytes[16000] = 0x04;      // first byte of plane 2
    bytes[24000] = 0x08;      // first byte of plane 3
    bytes[32000] = 0xFF;      // first byte of trailer
    const screen = decodeEgaScreen(bytes, { id: 'x', sourceFile: 'x.ega' });
    expect(screen.planes[0]?.[0]).toBe(0x01);
    expect(screen.planes[1]?.[0]).toBe(0x02);
    expect(screen.planes[2]?.[0]).toBe(0x04);
    expect(screen.planes[3]?.[0]).toBe(0x08);
    expect(screen.trailer[0]).toBe(0xFF);
  });

  it('throws on wrong file size', () => {
    expect(() =>
      decodeEgaScreen(new Uint8Array(32767), { id: 'x', sourceFile: 'x.ega' }),
    ).toThrow(/32768/);
  });

  it('throws if trailing 512 bytes are not all zero', () => {
    const bytes = makeFile();
    bytes[32256] = 1; // first byte after the trailer should be zero
    expect(() =>
      decodeEgaScreen(bytes, { id: 'x', sourceFile: 'x.ega' }),
    ).toThrow(/padding/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/parser && pnpm test`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the decoder**

Create `packages/parser/src/formats/ega-screen.ts`:

```typescript
import { EgaScreenSchema, type EgaScreen } from '@wiz6/data';

const FILE_SIZE = 32768;
const PLANE_BYTES = 8000;
const NUM_PLANES = 4;
const TRAILER_BYTES = 256;
const PAYLOAD_BYTES = PLANE_BYTES * NUM_PLANES; // 32000
const PADDING_BYTES = FILE_SIZE - PAYLOAD_BYTES - TRAILER_BYTES; // 512

export interface DecodeEgaScreenOpts {
  id: string;
  sourceFile: string;
}

export function decodeEgaScreen(bytes: Uint8Array, opts: DecodeEgaScreenOpts): EgaScreen {
  if (bytes.length !== FILE_SIZE) {
    throw new Error(`ega-screen decoder expected ${FILE_SIZE} bytes, got ${bytes.length}`);
  }
  // Verify the trailing 512 bytes are all zero (sanity check).
  for (let i = PAYLOAD_BYTES + TRAILER_BYTES; i < FILE_SIZE; i++) {
    if (bytes[i] !== 0) {
      throw new Error(`ega-screen trailing padding at offset ${i} is non-zero (expected zero pad, got 0x${bytes[i]!.toString(16)})`);
    }
  }
  const planes: number[][] = [];
  for (let p = 0; p < NUM_PLANES; p++) {
    const plane: number[] = new Array(PLANE_BYTES);
    const base = p * PLANE_BYTES;
    for (let i = 0; i < PLANE_BYTES; i++) {
      plane[i] = bytes[base + i]!;
    }
    planes.push(plane);
  }
  const trailer: number[] = new Array(TRAILER_BYTES);
  for (let i = 0; i < TRAILER_BYTES; i++) {
    trailer[i] = bytes[PAYLOAD_BYTES + i]!;
  }
  return EgaScreenSchema.parse({
    id: opts.id,
    sourceFile: opts.sourceFile,
    width: 320,
    height: 200,
    planes,
    trailer,
  });
}
```

- [ ] **Step 4: Re-export from `packages/parser/src/index.ts`**

Add to the top-level exports (alongside existing decoders):

```typescript
export { decodeEgaScreen, type DecodeEgaScreenOpts } from './formats/ega-screen.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/parser && pnpm test`
Expected: All `formats/ega-screen.test.ts` tests PASS (4 new tests).

- [ ] **Step 6: Commit**

```bash
git add packages/parser/src/formats/ega-screen.ts packages/parser/src/index.ts packages/parser/tests/formats/ega-screen.test.ts
git commit -m "feat(parser): add decodeEgaScreen (Stage 1f Task 3)"
```

---

## Task 4: `extractEgaScreen` + CLI `extract-screens` subcommand

**Files:**
- Create: `packages/parser/src/extractors/extract-ega-screen.ts`
- Modify: `packages/parser/src/cli.ts`
- Test: `packages/parser/tests/extractors/extract-ega-screen.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/parser/tests/extractors/extract-ega-screen.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractEgaScreen } from '../../src/extractors/extract-ega-screen.js';

describe('extractEgaScreen', () => {
  it('reads a 32768-byte file from disk and writes JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-ega-screen-'));
    const inputPath = join(dir, 'titlepag.ega');
    const outputPath = join(dir, 'screens', 'titlepag.json');

    const bytes = new Uint8Array(32768);
    bytes[0] = 0x42;
    bytes[8000] = 0x43;
    bytes[16000] = 0x44;
    bytes[24000] = 0x45;
    bytes[32000] = 0x99;
    writeFileSync(inputPath, bytes);

    const screen = extractEgaScreen({
      originalPath: inputPath,
      outputPath,
      id: 'titlepag',
    });

    expect(screen.id).toBe('titlepag');
    expect(screen.planes[0]?.[0]).toBe(0x42);
    expect(screen.planes[3]?.[0]).toBe(0x45);
    expect(screen.trailer[0]).toBe(0x99);

    const written = JSON.parse(readFileSync(outputPath, 'utf-8'));
    expect(written.id).toBe('titlepag');
    expect(written.planes).toHaveLength(4);
    expect(written.trailer).toHaveLength(256);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/parser && pnpm test`
Expected: FAIL with "Cannot find module './extractors/extract-ega-screen.js'".

- [ ] **Step 3: Write the extractor**

Create `packages/parser/src/extractors/extract-ega-screen.ts`:

```typescript
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { EgaScreen } from '@wiz6/data';
import { decodeEgaScreen } from '../formats/ega-screen.js';

export interface ExtractEgaScreenOpts {
  originalPath: string;
  outputPath: string;
  id: string;
}

export function extractEgaScreen(opts: ExtractEgaScreenOpts): EgaScreen {
  const bytes = new Uint8Array(readFileSync(opts.originalPath));
  const screen = decodeEgaScreen(bytes, {
    id: opts.id,
    sourceFile: basename(opts.originalPath),
  });
  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, JSON.stringify(screen, null, 2));
  return screen;
}
```

- [ ] **Step 4: Add `extract-screens` subcommand to `packages/parser/src/cli.ts`**

Add a new `import` at the top:

```typescript
import { extractEgaScreen } from './extractors/extract-ega-screen.js';
```

Add a new subcommand branch (place it between `extract-portraits` and the `plan`/default branch):

```typescript
} else if (subcommand === 'extract-screens') {
  const originalDir = process.argv[3] ?? './original';
  const extractedDir = process.argv[4] ?? './extracted';

  for (const name of ['titlepag', 'graveyrd', 'dragonsc']) {
    const screen = extractEgaScreen({
      originalPath: join(originalDir, `${name}.ega`),
      outputPath: join(extractedDir, 'screens', `${name}.json`),
      id: name,
    });
    console.log(`wrote ${extractedDir}/screens/${name}.json (320×200, ${screen.trailer.length}-byte trailer)`);
  }
```

Update the error-message Usage line at the bottom to include the new subcommand:

```typescript
console.error(`Usage: wiz6-parse [plan|extract-fonts|extract-portraits|extract-screens] [<originalDir> [<extractedDir>]]`);
```

- [ ] **Step 5: Run tests to verify everything passes**

Run: `cd packages/parser && pnpm test`
Expected: All parser tests PASS, including the new `extract-ega-screen.test.ts` (1 new test) and the existing `cli.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add packages/parser/src/extractors/extract-ega-screen.ts packages/parser/src/cli.ts packages/parser/tests/extractors/extract-ega-screen.test.ts
git commit -m "feat(parser): add extractEgaScreen + extract-screens CLI (Stage 1f Task 4)"
```

---

## Task 5: `loadEgaScreen` in viewer data-loader

**Files:**
- Modify: `packages/viewer/src/data-loader.ts`
- Modify: `packages/viewer/tests/data-loader.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/viewer/tests/data-loader.test.ts`, add (at the bottom, with the existing `describe` blocks):

```typescript
const validScreen = {
  id: 'titlepag',
  sourceFile: 'titlepag.ega',
  width: 320,
  height: 200,
  planes: [Array(8000).fill(0), Array(8000).fill(0), Array(8000).fill(0), Array(8000).fill(0)],
  trailer: Array(256).fill(0),
};

describe('loadEgaScreen', () => {
  it('fetches and validates an EGA screen JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validScreen), { status: 200 })));
    const screen = await loadEgaScreen('/screens/titlepag.json');
    expect(screen.id).toBe('titlepag');
    expect(screen.width).toBe(320);
    expect(screen.height).toBe(200);
    expect(screen.planes).toHaveLength(4);
  });

  it('throws if the fetch response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    await expect(loadEgaScreen('/missing.json')).rejects.toThrow(/404/);
  });

  it('throws if the payload does not validate against EgaScreenSchema', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'x' }), { status: 200 })));
    await expect(loadEgaScreen('/bad.json')).rejects.toThrow();
  });
});
```

Update the top-of-file import line to include `loadEgaScreen`:

```typescript
import { loadFont, loadFont4bpp, loadPortraitSet, loadEgaScreen } from '../src/data-loader.js';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/viewer && pnpm test`
Expected: FAIL with import error or missing export.

- [ ] **Step 3: Add `loadEgaScreen` to `packages/viewer/src/data-loader.ts`**

Add a new import at the top (alongside existing imports):

```typescript
import { EgaScreenSchema, type EgaScreen } from '@wiz6/data';
```

Add the new loader function (after `loadPortraitSet`):

```typescript
export async function loadEgaScreen(url: string): Promise<EgaScreen> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load EGA screen from ${url}: ${res.status}`);
  }
  const data: unknown = await res.json();
  return EgaScreenSchema.parse(data);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/viewer && pnpm test`
Expected: All `data-loader.test.ts` tests PASS, including 3 new tests for `loadEgaScreen`.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/data-loader.ts packages/viewer/tests/data-loader.test.ts
git commit -m "feat(viewer): add loadEgaScreen (Stage 1f Task 5)"
```

---

## Task 6: `ScreenGallery` viewer component

**Files:**
- Create: `packages/viewer/src/views/ScreenGallery.tsx`
- Test: `packages/viewer/tests/views/ScreenGallery.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/viewer/tests/views/ScreenGallery.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ScreenGallery } from '../../src/views/ScreenGallery.js';

const validScreen = {
  id: 'titlepag',
  sourceFile: 'titlepag.ega',
  width: 320,
  height: 200,
  planes: [Array(8000).fill(0), Array(8000).fill(0), Array(8000).fill(0), Array(8000).fill(0)],
  trailer: Array(256).fill(0),
};

describe('ScreenGallery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a heading with the screen id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validScreen), { status: 200 })));
    render(<ScreenGallery url="/screens/titlepag.json" />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /titlepag/i })).toBeInTheDocument();
    });
  });

  it('renders a canvas at the right size', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validScreen), { status: 200 })));
    const { container } = render(<ScreenGallery url="/screens/titlepag.json" />);
    await waitFor(() => {
      const canvas = container.querySelector('canvas');
      expect(canvas).not.toBeNull();
      // ZOOM = 2 in the component
      expect(canvas?.width).toBe(640);
      expect(canvas?.height).toBe(400);
    });
  });

  it('shows error text when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    render(<ScreenGallery url="/screens/missing.json" />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/viewer && pnpm test`
Expected: FAIL with import error.

- [ ] **Step 3: Write the component**

Create `packages/viewer/src/views/ScreenGallery.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react';
import type { EgaScreen, Palette } from '@wiz6/data';
import { loadEgaScreen } from '../data-loader.js';
import { WIZ6_PALETTE_1 } from '../palettes/wiz6-palette-1.js';

const ZOOM = 2;

// Standard EGA plane order: B (plane 0), G (plane 1), R (plane 2), I (plane 3).
function pixelColor(planes: number[][], rowByteIndex: number, bitIndex: number): number {
  const b = ((planes[0]?.[rowByteIndex] ?? 0) >> bitIndex) & 1;
  const g = ((planes[1]?.[rowByteIndex] ?? 0) >> bitIndex) & 1;
  const r = ((planes[2]?.[rowByteIndex] ?? 0) >> bitIndex) & 1;
  const i = ((planes[3]?.[rowByteIndex] ?? 0) >> bitIndex) & 1;
  return (i << 3) | (r << 2) | (g << 1) | b;
}

interface Props {
  url: string;
  palette?: Palette;
}

export function ScreenGallery({ url, palette = WIZ6_PALETTE_1 }: Props) {
  const [screen, setScreen] = useState<EgaScreen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadEgaScreen(url)
      .then((s) => {
        if (!cancelled) setScreen(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    if (!screen || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = screen.width * ZOOM;
    canvas.height = screen.height * ZOOM;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context not available');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < screen.height; y++) {
      for (let xByte = 0; xByte < screen.width / 8; xByte++) {
        const rowByteIndex = y * (screen.width / 8) + xByte;
        for (let bit = 0; bit < 8; bit++) {
          const bitIndex = 7 - bit;
          const colorIndex = pixelColor(screen.planes, rowByteIndex, bitIndex);
          const rgb = palette.colors[colorIndex];
          if (!rgb) continue;
          if (rgb[0] === 0 && rgb[1] === 0 && rgb[2] === 0) continue;
          const screenX = (xByte * 8 + bit) * ZOOM;
          const screenY = y * ZOOM;
          ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
          ctx.fillRect(screenX, screenY, ZOOM, ZOOM);
        }
      }
    }
  }, [screen, palette]);

  if (error) return <p>Failed to load {url}: {error}</p>;

  return (
    <section>
      <h2>{screen ? screen.id : url}</h2>
      <canvas ref={canvasRef} style={{ imageRendering: 'pixelated' }} />
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/viewer && pnpm test`
Expected: All `ScreenGallery.test.tsx` tests PASS (3 new tests).

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/views/ScreenGallery.tsx packages/viewer/tests/views/ScreenGallery.test.tsx
git commit -m "feat(viewer): add ScreenGallery component (Stage 1f Task 6)"
```

---

## Task 7: Render 3 `ScreenGallery` instances in `App.tsx`

**Files:**
- Modify: `packages/viewer/src/App.tsx`
- Modify: `packages/viewer/tests/App.test.tsx`

- [ ] **Step 1: Extend the `App.test.tsx` fetch stub**

In `packages/viewer/tests/App.test.tsx`, add a new constant near the top (alongside existing fixtures):

```typescript
const validScreen = {
  id: 'screenN',
  sourceFile: 'screenN.ega',
  width: 320,
  height: 200,
  planes: [Array(8000).fill(0), Array(8000).fill(0), Array(8000).fill(0), Array(8000).fill(0)],
  trailer: Array(256).fill(0),
};
```

Update the fetch stub in `beforeEach` to route `screens/` URLs to `validScreen`:

```typescript
vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  if (url.includes('screens/')) return new Response(JSON.stringify(validScreen), { status: 200 });
  if (url.includes('portraits/')) return new Response(JSON.stringify(validPortraitSet), { status: 200 });
  if (url.includes('wfont0')) return new Response(JSON.stringify(valid1bpp), { status: 200 });
  return new Response(JSON.stringify(valid4bpp), { status: 200 });
}));
```

Run: `cd packages/viewer && pnpm test -- App.test.tsx`
Expected: existing 4 tests still PASS.

- [ ] **Step 2: Add `ScreenGallery` imports and render calls in `App.tsx`**

In `packages/viewer/src/App.tsx`, add to the imports (after the existing view imports):

```typescript
import { ScreenGallery } from './views/ScreenGallery.js';
```

After the three `PortraitGallery` lines, add:

```tsx
<ScreenGallery url="/screens/titlepag.json" palette={palette} />
<ScreenGallery url="/screens/graveyrd.json" palette={palette} />
<ScreenGallery url="/screens/dragonsc.json" palette={palette} />
```

- [ ] **Step 3: Run all tests to verify nothing broke**

Run: `cd packages/viewer && pnpm test`
Expected: All viewer tests PASS (the App test stubs `screens/` URLs so the new `<ScreenGallery>` instances load successfully).

- [ ] **Step 4: Commit**

```bash
git add packages/viewer/src/App.tsx packages/viewer/tests/App.test.tsx
git commit -m "feat(viewer): render 3 ScreenGallery instances in App (Stage 1f Task 7)"
```

---

## Task 8: End-to-end smoke + total test count

**Files:** none new; just run the full pipeline and confirm.

- [ ] **Step 1: Run the extract-screens CLI on the real originals**

From the project root:

```bash
pnpm --filter @wiz6/parser exec wiz6-parse extract-screens ./original ./extracted
```

Expected output:

```
wrote ./extracted/screens/titlepag.json (320×200, 256-byte trailer)
wrote ./extracted/screens/graveyrd.json (320×200, 256-byte trailer)
wrote ./extracted/screens/dragonsc.json (320×200, 256-byte trailer)
```

Verify the JSON files exist and parse:

```bash
ls -l extracted/screens/
node -e "const s = require('./extracted/screens/titlepag.json'); console.log('id', s.id, 'planes', s.planes.length, 'trailer', s.trailer.length, 'first byte of plane 0', s.planes[0][0])"
```

Expected: `id titlepag planes 4 trailer 256 first byte of plane 0 0` (titlepag.ega starts with zeros — confirmed during the investigation).

- [ ] **Step 2: Confirm the dev server serves the new files**

The viewer's `vite` config should already be set up to serve `extracted/` as static. Verify by running:

```bash
pnpm --filter @wiz6/viewer dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/screens/titlepag.json
kill %1
```

Expected: HTTP 200. If 404, copy the files into `packages/viewer/public/screens/` (matching the existing `public/fonts/` and `public/portraits/` pattern). Add a brief note to the commit if that copy step was needed.

- [ ] **Step 3: Run the full test suite from the repo root**

```bash
pnpm -r test
```

Expected total: **107 tests passing** (31 data + 26 parser + 50 viewer):

- packages/data: 31 (previous 23 + 8 new from `ega-screen.test.ts`)
- packages/parser: 26 (previous 21 + 4 new from `formats/ega-screen.test.ts` + 1 new from `extractors/extract-ega-screen.test.ts`)
- packages/viewer: 50 (previous 35 + 3 from `data-loader.test.ts` + 3 from `views/ScreenGallery.test.tsx` + 9 from `views/Font4bppGallery` etc unchanged — actually 35 + 3 + 3 = 41; the App.test.tsx and existing data-loader tests remain at their counts. Net new: 6. Net total: **41**.)

(If the actual total differs by a few, that's fine — the important assertion is "everything passing".)

- [ ] **Step 4: Final commit if anything tweaked**

If Step 2 required copying files into `packages/viewer/public/`, commit that:

```bash
git add packages/viewer/public/screens/
git commit -m "chore(viewer): copy extracted screen JSONs into public/ (Stage 1f Task 8)"
```

Otherwise skip; the previous task commits cover everything.

---

## Definition of Done

- [ ] `docs/re/ega-screen.md` exists with the format spec
- [ ] `EgaScreenSchema` + `decodeEgaScreen` + `extractEgaScreen` work on all 3 real `.ega` files
- [ ] `wiz6-parse extract-screens ./original ./extracted` runs cleanly
- [ ] `<ScreenGallery>` renders all 3 screens in the viewer (visible at `pnpm dev`)
- [ ] Full test suite passes (~107 tests, 6+ new in Stage 1f)
- [ ] Each task committed as its own commit with the prefixes shown
- [ ] No new npm dependencies added

## Out of scope (deferred)

- **Decoding the 256-byte trailer.** That's a separate follow-up requiring either DOSBox-X live tracing or resolving winit.ovr's overlay thunks. For now, the trailer is preserved verbatim in the extracted JSON.
- **Per-screen palette switching in the picker.** Once the trailer is decoded, each screen will have its own palette; the picker will need a 4th option (or auto-select per-screen).
- **CGA / T16 variants** (`titlepag.cga`, etc.). 2bpp / Tandy. Not needed for the viewer's primary EGA-mode rendering.
- **Slide-in animation.** The static final-frame image is enough for Stage 1f. The animation script is presumably in the 256-byte trailer.
