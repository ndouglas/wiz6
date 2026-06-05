# Maze Renderer Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the reverse-engineered, byte-exact maze renderer prototype (`tools/parity/render-maze-frame.ts`) into the package structure as a pure, general, from-geometry renderer wired into `/game/maze`, gated by multi-frame pixel parity.

**Architecture:** `@wiz6/data` holds the typed input schema (`MazeCellWalls` + `Party`), the render-assets schema, and the RE'd static tables as constants. `@wiz6/parser` exposes a pure `renderMazeViewport(cellWalls, party, assets)` that runs classify → build → flush → compositor → decode (ported 1:1 from the validated prototype, plus a new classifier). `@wiz6/viewer` replaces the 7-tile extraction in `/game/maze` with the from-geometry renderer, keeping the static chrome. Done = three engine frames match at tolerance 0.

**Tech Stack:** TypeScript (ESM, `.js` import extensions), zod (schema-as-source-of-truth), vitest, React (viewer). Reference RE: `docs/re/findings/maze-{texture-decode,planar-transform,stage1-compositor,span-build,harness-movement}.json`.

**Design spec:** `docs/superpowers/specs/2026-06-04-maze-renderer-port-design.md`.

---

## Outcome (2026-06-05) — banked: complete RE teardown; from-geometry rendering decoder-complete, generation-law pending

> This plan ran far past its original 12 tasks. The "Outcome" below supersedes the rest of the
> document, which is the historical task list. Branch: `re/maze-classify-determinism` (landed to main).

**The 3D maze view is fully reverse-engineered — every decoder and blit primitive is cracked byte-exact, and the view is PROVEN deterministic.** What was banked short of: a *general from-geometry* renderer (the per-view call-list *generation* law is decompiler-blocked) and the viewer swap. The viewer keeps its working **extraction** path, so `/game/maze` is unaffected.

**Cracked + validated (all committed):**
- **Determinism proved**, and the f0/f2 "non-geometric" scare *refuted*: the view is a pure function of geometry **including the door-orientation (`orient2`) plane** + a per-facing wall-edge selector. (`maze-classify-determinism.json`.)
- **Wall classification** byte-exact across 11/12 captured frames (orient2-aware `classify` → `build` → `flush`). (`maze-classify-{projection,gating}.json`.)
- **Every decoder:** wall 4-plane tiles + `.pic` RLE; the background **expander** (`mazedata.ega` loaded verbatim + descriptor normalization — NOT a compression); the **OR-blit** walk; the **masked-mirror** blit (bit-reverse LUT + OR/REPLACE, per-call byte-exact). (`maze-{expander,floor-ceiling-decoder,masked-mirror,asset-loader}.json`.)
- **Asset path:** the floor/ceiling/window + the 366 static placement records all live in `mazedata.ega`, decoded byte-exact off the pinned image (`tools/parity/{expand-asset,decode-asset}.ts`; `packages/parser/src/maze/{maze-data,background,callist}.ts`).
- **From-asset background:** composes to **99.909%** of the real `gy=121` viewport (the 18-px residual is the deep door — a wall-path element, not background) using a *captured* call list.
- **Tooling:** a reproducible first-render capture harness + a signature resolver that defeats the relocated-renderer "0-hits" wall (`maze-capture-harness.json`; `trace-maze.ts`).
- **Gates (green):** the engine-page full-viewport gate (`maze-corridor-viewport-parity.test.ts`, 19712/19712); the masked-mirror per-call gate; the classify/build/flush/expander unit gates.

**What's banked (not done) + how to resume:**
- **Background call-list GENERATION** (the last thing between "captured per frame" and "general"): the per-depth placement-index arithmetic lives in slot helpers (`0x3828/0x3c11/0x3dce/0x4892`) that Ghidra's decompiler fails on — needs hand-disassembly. (`maze-callist-generation.json`, TODO #077.)
- **The 18-px deep-door** third draw path (a wall-side element).
- **Wall cases** for non-corridor frames (front/door/far/corner) + the R-up-up df3 residual.
- **Viewer swap** (T12) — deferred; extraction stays.

**Why banked (decision with the user):** ~28 deep RE passes / 40 commits on one screen, asymptoting at 99.9% on a view the viewer already renders via extraction; the remaining generation law is decompiler-blocked manual asm. The genuinely-valuable RE (a complete, byte-exact teardown) is done and committed. See `docs/re/findings/maze-*.json` for the full record.

---

## Pre-flight (read before Task 1)

The executor MUST read these to ground each port:
- `tools/parity/render-maze-frame.ts` — the prototype. Functions to port: `decodePieceToComposeBuffer`, `renderPieceCall`, `applyStore`, `deriveMasks`, `renderFrameFromGeometry`, `generateCallList`, `deriveCorridorSpans`, `cornerSolidSeamIdx`, `refineSpanColumns`. Constants: `PLANE_STRIDE` (0x2000), `PAGE_ROW_BYTES` (40), `SEAMIDX_CORNER_SOLID_BASE` ({left:12,right:10}), `MAZE_FRAME_Y2_SPANS`, `MAZE_FRAME_Y3_SPANS`, the inline seam tables in `tools/parity/maze-generator.test.ts`.
- `tools/parity/render-maze-page.ts` — `decodePageIndex` / `decodePageRgba` (page → indices/RGBA).
- `packages/parser/src/formats/pic.ts` + `packages/data/src/schemas/pic.ts` — the decoder + schema conventions to mirror.
- `packages/data/src/maze/corridor-geometry.ts` — existing maze constants + the `@wiz6/data` barrel export pattern (find the `index.ts` that re-exports `src/maze/*` and `src/schemas/*`).
- `packages/viewer/src/pages/game/{compose-maze-frame.ts,compose-maze-view.ts,MazeView.tsx}` + `packages/viewer/src/data/maze-corridor-tiles.json` — the integration target.
- `tools/parity/diff-image.ts` (`compareRgba`), `tools/parity/maze-corridor-parity.test.ts`, `packages/viewer/tests/game/compose-maze-view.test.ts` — the parity-gate pattern + the committed `tools/parity/fixtures/engine/maze-corridor.idx.gz`.
- `docs/re/findings/maze-span-build.json` — the classifier (`view_render_corridor_frame` 0x4ad7 depth loop; `view_step_forward_by_facing` 0x37a7; `cell = z*64+y*8+x`; 2-bit N/W wall fields at `[0x4faa]+0x60/+0x120` + pit flag `+0x43a`; classifier 0/2) — the source for the NEW classify code in Task 7.
- `docs/re/findings/maze-harness-movement.json` + `tools/libretro/trace-maze.ts` (`reach`, `move`, `geomgen`, `capvp`) + `tools/libretro/states/maze-corridor{,-turn-left}.state` — for fixture capture in Task 9.

**File structure created by this plan:**
- `packages/data/src/maze/render-schema.ts` — zod schemas: `MazeCellWalls`, `Party`, `PieceDescriptor`, `MazeRenderAssets`; types via `z.infer`.
- `packages/data/src/maze/render-tables.ts` — RE'd constants: convergence arrays, seam tables, corner-seamIdx base, `PLANE_STRIDE`, `PAGE_ROW_BYTES`.
- `packages/parser/src/maze/page.ts` — page → indices decode.
- `packages/parser/src/maze/compositor.ts` — call-list + assets → 4-plane page.
- `packages/parser/src/maze/flush.ts` — spans → call-list.
- `packages/parser/src/maze/build.ts` — slot-walltypes → spans.
- `packages/parser/src/maze/classify.ts` — cell-walls + party → slot-walltypes (NEW).
- `packages/parser/src/maze/render.ts` — `renderMazeViewport` (assembles the stages).
- `packages/parser/src/maze/index.ts` — barrel for the above.
- Tests under `packages/parser/tests/maze/*.test.ts`.
- `packages/parser/src/maze/__fixtures__/maze-assets.json` (or `.bin`) — committed atlas + descriptors.
- `tools/parity/fixtures/engine/maze-corridor-turn-left.idx.gz`, `maze-corridor-lookback.idx.gz` — new engine fixtures.
- Parity tests: `packages/parser/tests/maze/maze-render-parity.test.ts`.

> **Port fidelity rule:** where a step says "port `fn` from `render-maze-frame.ts`," copy the function body verbatim and change ONLY: (a) imports to the new schema types/constants, (b) `.js` extensions. Do NOT rewrite the validated logic. Re-running the existing tests is the safety net.

---

## Task 1: `@wiz6/data` — render input + asset schemas

**Files:**
- Create: `packages/data/src/maze/render-schema.ts`
- Modify: the `@wiz6/data` barrel (`packages/data/src/index.ts` or `packages/data/src/maze/index.ts` — match how `corridor-geometry.ts` is exported)
- Test: `packages/data/tests/maze/render-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  MazeCellWallsSchema, PartySchema, PieceDescriptorSchema, MazeRenderAssetsSchema,
  type Party,
} from '@wiz6/data';

describe('maze render schemas', () => {
  it('parses a Party with facing 0..3', () => {
    const p: Party = PartySchema.parse({ x: 7, y: 3, z: 0, facing: 0 });
    expect(p.facing).toBe(0);
    expect(() => PartySchema.parse({ x: 0, y: 0, z: 0, facing: 4 })).toThrow();
  });
  it('parses a PieceDescriptor', () => {
    const d = PieceDescriptorSchema.parse({ srcPtr: 0x2138, w: 4, h: 6, presenceBitmap: new Uint8Array(0x14) });
    expect(d.w).toBe(4);
  });
  it('parses MazeRenderAssets', () => {
    const a = MazeRenderAssetsSchema.parse({ atlas: new Uint8Array(0x4000), pieceDescriptors: [] });
    expect(a.atlas.length).toBe(0x4000);
  });
  it('parses MazeCellWalls (a local wall grid keyed by cell index)', () => {
    const w = MazeCellWallsSchema.parse({ cells: { 195: { north: 2, west: 0, pit: false } } });
    expect(w.cells[195].north).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wiz6/data exec vitest run tests/maze/render-schema.test.ts`
Expected: FAIL ("MazeCellWallsSchema is not exported" / module not found).

- [ ] **Step 3: Write minimal implementation**

In `packages/data/src/maze/render-schema.ts` (mirror the `z.object` + `z.infer` style of `packages/data/src/schemas/pic.ts`):

```ts
import { z } from 'zod';

export const PartySchema = z.object({
  x: z.number().int().min(0), y: z.number().int().min(0), z: z.number().int().min(0),
  facing: z.number().int().min(0).max(3),
});
export type Party = z.infer<typeof PartySchema>;

/** One cell's wall data as the engine stores it (2-bit N/W fields, 0=open 2=solid; + pit). */
export const CellWallsSchema = z.object({
  north: z.number().int(), west: z.number().int(), pit: z.boolean().default(false),
});
export const MazeCellWallsSchema = z.object({
  // keyed by cell index = z*64 + y*8 + x (sparse: only the cells the projection reads).
  cells: z.record(z.coerce.number().int(), CellWallsSchema),
});
export type MazeCellWalls = z.infer<typeof MazeCellWallsSchema>;

export const PieceDescriptorSchema = z.object({
  srcPtr: z.number().int(), w: z.number().int(), h: z.number().int(),
  presenceBitmap: z.instanceof(Uint8Array),
});
export type PieceDescriptor = z.infer<typeof PieceDescriptorSchema>;

export const MazeRenderAssetsSchema = z.object({
  atlas: z.instanceof(Uint8Array),
  pieceDescriptors: z.array(PieceDescriptorSchema),
});
export type MazeRenderAssets = z.infer<typeof MazeRenderAssetsSchema>;
```

Add re-exports to the `@wiz6/data` barrel next to the existing `corridor-geometry` export (use the same relative-import-with-`.js` style already there).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wiz6/data exec vitest run tests/maze/render-schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter @wiz6/data run typecheck
git add packages/data/src/maze/render-schema.ts packages/data/src/index.ts packages/data/tests/maze/render-schema.test.ts
git commit -m "feat(data): maze render input + asset schemas"
```

> If `z.record` with a numeric key behaves unexpectedly under the project's zod version, model `cells` as `z.array(z.object({ cell: z.number().int(), ...CellWalls }))` instead and adjust the test. Verify the chosen shape round-trips before committing.

---

## Task 2: `@wiz6/data` — RE'd static tables as constants

**Files:**
- Create: `packages/data/src/maze/render-tables.ts`
- Modify: the `@wiz6/data` barrel
- Test: `packages/data/tests/maze/render-tables.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  CONVERGE_LEFT_BY_DEPTH, CONVERGE_RIGHT_BY_DEPTH, SEAMIDX_CORNER_SOLID_BASE,
  PLANE_STRIDE, PAGE_ROW_BYTES, SEAM_X0_WT2, SEAM_X1_WT2,
} from '@wiz6/data';

describe('maze render tables', () => {
  it('has the RE-confirmed convergence arrays', () => {
    expect(Array.from(CONVERGE_LEFT_BY_DEPTH)).toEqual([0, 104, 128, 144]);
    expect(Array.from(CONVERGE_RIGHT_BY_DEPTH)).toEqual([0, 216, 192, 176]);
  });
  it('has the corner-seamIdx base + page geometry', () => {
    expect(SEAMIDX_CORNER_SOLID_BASE).toEqual({ left: 12, right: 10 });
    expect(PLANE_STRIDE).toBe(0x2000);
    expect(PAGE_ROW_BYTES).toBe(40);
  });
  it('reproduces the y3 seam values via the wt=2 seam tables', () => {
    // seamIdx 11 (left) -> x0 += 2*seam, seamIdx 14 (right) -> ...; spot-check a known value.
    expect(SEAM_X0_WT2.length).toBeGreaterThan(0x13a / 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wiz6/data exec vitest run tests/maze/render-tables.test.ts`
Expected: FAIL (exports missing).

- [ ] **Step 3: Write minimal implementation**

In `packages/data/src/maze/render-tables.ts`, copy the constant VALUES verbatim from `tools/parity/render-maze-frame.ts` (`PLANE_STRIDE`, `PAGE_ROW_BYTES`, `SEAMIDX_CORNER_SOLID_BASE`) and the inline seam tables (`SEAM_X0_WT2`, `SEAM_X1_WT2`) from `tools/parity/maze-generator.test.ts`. Add the convergence arrays from `docs/re/findings/maze-stage1-compositor.json` (`convergence-seam-tables-are-data-corrected`):

```ts
export const CONVERGE_LEFT_BY_DEPTH = Uint16Array.from([0, 104, 128, 144]);
export const CONVERGE_RIGHT_BY_DEPTH = Uint16Array.from([0, 216, 192, 176]);
export const SEAMIDX_CORNER_SOLID_BASE = { left: 12, right: 10 } as const;
export const PLANE_STRIDE = 0x2000;
export const PAGE_ROW_BYTES = 40;
export const SEAM_X0_WT2 = Uint8Array.from([/* verbatim from maze-generator.test.ts */]);
export const SEAM_X1_WT2 = Uint8Array.from([/* verbatim from maze-generator.test.ts */]);
```

Re-export from the barrel.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wiz6/data exec vitest run tests/maze/render-tables.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter @wiz6/data run typecheck
git add packages/data/src/maze/render-tables.ts packages/data/src/index.ts packages/data/tests/maze/render-tables.test.ts
git commit -m "feat(data): RE'd maze render tables (convergence/seam/corner-seamIdx)"
```

---

## Task 3: `@wiz6/parser` — page → indices decode

**Files:**
- Create: `packages/parser/src/maze/page.ts`
- Test: `packages/parser/tests/maze/page.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { decodePageIndex } from '../../src/maze/page.js';
import { PLANE_STRIDE } from '@wiz6/data';

describe('decodePageIndex', () => {
  it('reads a single set pixel from plane 0 at (x,y)=(0,0)', () => {
    const page = new Uint8Array(4 * PLANE_STRIDE);
    page[0] = 0x80; // plane0, row0, leftmost bit set
    const idx = decodePageIndex(page, 320, 200);
    expect(idx[0]).toBe(1); // plane0 contributes bit 0
  });
  it('combines all 4 planes into a 0..15 index', () => {
    const page = new Uint8Array(4 * PLANE_STRIDE);
    for (let p = 0; p < 4; p++) page[p * PLANE_STRIDE] = 0x80;
    expect(decodePageIndex(page, 320, 200)[0]).toBe(15);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wiz6/parser exec vitest run tests/maze/page.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Port `decodePageIndex` from `tools/parity/render-maze-page.ts` into `packages/parser/src/maze/page.ts` verbatim (formula: `idx(x,y) = Σ_p (page[y*40 + x/8 + p*0x2000] >> (7-(x%8)) & 1) << p`). Import `PLANE_STRIDE`/`PAGE_ROW_BYTES` from `@wiz6/data`. Export `decodePageIndex(page, w, h): Uint8Array`. (Keep `decodePageRgba` too if the prototype has it, taking a palette.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wiz6/parser exec vitest run tests/maze/page.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/parser/src/maze/page.ts packages/parser/tests/maze/page.test.ts
git commit -m "feat(parser): maze page->indices decode (ported from render-maze-page.ts)"
```

---

## Task 4: `@wiz6/data` fixtures — commit the render assets

**Files:**
- Create: `packages/parser/src/maze/__fixtures__/maze-assets.json` (atlas as base64 + descriptors)
- Create: `packages/parser/src/maze/assets.ts` (the `loadMazeAssets()` loader)
- Create: `tools/parity/extract-maze-assets.ts` (one-time generator)
- Test: `packages/parser/tests/maze/assets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { loadMazeAssets } from '../../src/maze/assets.js';
import { MazeRenderAssetsSchema } from '@wiz6/data';

describe('committed maze assets', () => {
  it('load + validate against the schema', () => {
    const a = loadMazeAssets();
    expect(() => MazeRenderAssetsSchema.parse(a)).not.toThrow();
    expect(a.atlas.length).toBeGreaterThan(0);
    expect(a.pieceDescriptors.length).toBeGreaterThan(0);
  });
  it('descriptor for piece 0xb (left wall face) has the RE-confirmed w/h', () => {
    const a = loadMazeAssets();
    // piece bytes are 1-indexed; 0xb => index 10. Confirm against maze-stage1-compositor.json.
    expect(a.pieceDescriptors[0xb - 1].w).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wiz6/parser exec vitest run tests/maze/assets.test.ts`
Expected: FAIL (no fixture / loader).

- [ ] **Step 3: Generate + commit the asset, write the loader**

Write `tools/parity/extract-maze-assets.ts`: drive `trace-maze.ts`-style capture (unserialize `maze-corridor.state`, run the load-compose, capture the atlas segment + read the live piece descriptors) OR — preferred where reproducible — decode offline from `mazedata.ega` via `decode-mazedata.ts` + the `.pic` decoder. Emit `maze-assets.json` (`{ atlasB64, pieceDescriptors: [{srcPtr,w,h,bitmapB64}] }`). Run it once; commit the JSON. Add `loadMazeAssets()` (decode base64 → `Uint8Array`, return a `MazeRenderAssets`). Mark in a header comment whether the atlas is offline-decoded or an engine capture.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wiz6/parser exec vitest run tests/maze/assets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/parser/src/maze/__fixtures__/maze-assets.json tools/parity/extract-maze-assets.ts packages/parser/src/maze/assets.ts packages/parser/tests/maze/assets.test.ts
git commit -m "feat(parser): commit maze render assets (atlas + piece descriptors) + loader"
```

> If the offline atlas decode is not yet fully reproducible (per the spec hedge), capture from the engine and label it clearly. The asset bytes are deterministic once committed.

---

## Task 5: `@wiz6/parser` — compositor (call-list + assets → page)

**Files:**
- Create: `packages/parser/src/maze/compositor.ts`
- Test: `packages/parser/tests/maze/compositor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { renderFrameFromGeometry } from '../../src/maze/compositor.js';
import { loadMazeAssets } from '../../src/maze/assets.js';
import { decodePageIndex } from '../../src/maze/page.js';
import { PLANE_STRIDE } from '@wiz6/data';

describe('compositor', () => {
  it('renders the y3 call-list into a page whose viewport decodes non-blank', () => {
    const assets = loadMazeAssets();
    const page = new Uint8Array(4 * PLANE_STRIDE); // background-less for the unit test
    // The two y3 wall pieces (from maze-stage1-compositor.json): 0xe@x144/row60, 0xb@x147/row59.
    const calls = [
      { piece: 0xe, x0: 144, arg10: 60, tile: 2 },
      { piece: 0xb, x0: 147, arg10: 59, tile: 2 },
    ];
    renderFrameFromGeometry(page, assets.atlas, assets.pieceDescriptors, calls);
    const idx = decodePageIndex(page, 320, 200);
    // a wall column should have written non-zero stone pixels in the viewport band
    let nonZero = 0;
    for (let y = 32; y < 144; y++) for (let x = 136; x < 192; x++) if (idx[y * 320 + x]) nonZero++;
    expect(nonZero).toBeGreaterThan(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wiz6/parser exec vitest run tests/maze/compositor.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Port the compositor**

Port `renderFrameFromGeometry`, `renderPieceCall`, `decodePieceToComposeBuffer`, `applyStore`, `deriveMasks` from `tools/parity/render-maze-frame.ts` into `packages/parser/src/maze/compositor.ts` verbatim. Define/import the `CompositorCall` type (`{ piece, x0, arg10, tile?, flags? }`) — put it in `render-schema.ts` if it should be shared, else local. Import `PLANE_STRIDE`/`PAGE_ROW_BYTES` from `@wiz6/data`, `PieceDescriptor`/`MazeRenderAssets` types from `@wiz6/data`. Change only imports + `.js` extensions.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wiz6/parser exec vitest run tests/maze/compositor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/parser/src/maze/compositor.ts packages/parser/tests/maze/compositor.test.ts
git commit -m "feat(parser): maze compositor (call-list+assets->4-plane page), ported"
```

---

## Task 6: `@wiz6/parser` — flush (spans → call-list)

**Files:**
- Create: `packages/parser/src/maze/flush.ts`
- Test: `packages/parser/tests/maze/flush.test.ts` (port the relevant cases from `tools/parity/maze-generator.test.ts`)

- [ ] **Step 1: Write the failing test** — port the `generateCallList` cases from `tools/parity/maze-generator.test.ts` (single-frame y2 = `[0xf@152/64, 0xc@153/64, 0xd@136/53]`, y3 = `[0xe@144/60, 0xb@147/59]`), importing from `../../src/maze/flush.js`. Copy the exact expected arrays from that file.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wiz6/parser exec vitest run tests/maze/flush.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Port `generateCallList`** from `tools/parity/render-maze-frame.ts` into `packages/parser/src/maze/flush.ts` verbatim (depth `size`→0; one call per `walltype != 0xff` span at matching depthField; `piece = seamIdx`, `tile = walltype`). Import the `MazeSpan`/`CompositorCall` types.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wiz6/parser exec vitest run tests/maze/flush.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/parser/src/maze/flush.ts packages/parser/tests/maze/flush.test.ts
git commit -m "feat(parser): maze flush (spans->call-list), ported"
```

---

## Task 7: `@wiz6/parser` — build (slot-walltypes → spans)

**Files:**
- Create: `packages/parser/src/maze/build.ts`
- Test: `packages/parser/tests/maze/build.test.ts` (port the seam-refine + seamIdx cases from `maze-generator.test.ts`)

- [ ] **Step 1: Write the failing test** — port the `refineSpanColumns` cases (6 wt=2 cases: e.g. `seam 11 -> x0=147,x1=59`; `seam 14 -> x0=144,x1=60`) and the `cornerSolidSeamIdx` cases (`depthField + {left:12,right:10}`: df1 left→13, df2 right→12, df3 left→15, df1 right→11, df2 left→14) from `tools/parity/maze-generator.test.ts`, importing from `../../src/maze/build.js`. Copy the exact values.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wiz6/parser exec vitest run tests/maze/build.test.ts`
Expected: FAIL.

- [ ] **Step 3: Port** `deriveCorridorSpans`, `cornerSolidSeamIdx`, `refineSpanColumns` from `render-maze-frame.ts` into `build.ts` verbatim. Import seam tables + `SEAMIDX_CORNER_SOLID_BASE` from `@wiz6/data`; `MazeSpan` type shared. The build input is the per-depth/per-side solid-side flags (the `sides[][]` arg shape `deriveCorridorSpans` already takes).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wiz6/parser exec vitest run tests/maze/build.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/parser/src/maze/build.ts packages/parser/tests/maze/build.test.ts
git commit -m "feat(parser): maze build (slot-walltypes->spans), ported"
```

---

## Task 8: `@wiz6/parser` — classify (cell-walls + party → per-depth solid-side flags) [NEW]

**Files:**
- Create: `packages/parser/src/maze/classify.ts`
- Test: `packages/parser/tests/maze/classify.test.ts`

This is the one NEW stage (the prototype starts from spans). Derive it from `docs/re/findings/maze-span-build.json` (`build-depth-loop-and-slot-emitters`): from the party `(x,y,z,facing)`, walk depth 0..3 along the facing via `view_step_forward_by_facing` (4-facing rotation), compute `cell = z*64 + y*8 + x` at each step, read the cell's 2-bit N/W wall fields (the side faces relative to facing), and produce the per-depth left/right solid-side flags that `build.deriveCorridorSpans` consumes. The y3 corridor (`maze-corridor.state`) classification is the ground-truth check: it must yield the per-depth solid-side flags that produce the y3 spans (`0xb` left, `0xe` right).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { classifyVisibleWalls } from '../../src/maze/classify.js';
import { deriveCorridorSpans } from '../../src/maze/build.js';
import { generateCallList } from '../../src/maze/flush.js';
import type { MazeCellWalls, Party } from '@wiz6/data';

// The y3 corridor as cell-walls: solid side walls down a straight N corridor.
// Cell-wall values transcribed from the live @0x5220 classification for maze-corridor.state
// (see docs/re/findings/maze-span-build.json). Fill from the finding's reference frame.
const Y3_CORRIDOR: MazeCellWalls = { cells: { /* z*64+y*8+x -> {north,west,pit} for the visible window */ } };
const PARTY: Party = { x: 7, y: 3, z: 0, facing: 0 };

describe('classifyVisibleWalls', () => {
  it('produces solid-side flags that yield the y3 call-list', () => {
    const sides = classifyVisibleWalls(Y3_CORRIDOR, PARTY);
    const spans = deriveCorridorSpans(sides /*, seam tables */);
    const calls = generateCallList(spans);
    const sig = calls.map(c => [c.piece, c.x0, c.arg10].join('/')).sort();
    expect(sig).toEqual(['11/147/59', '14/144/60'].sort());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wiz6/parser exec vitest run tests/maze/classify.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `classifyVisibleWalls(cellWalls, party)`** per the depth-loop law in `maze-span-build.json`. Return the `sides` structure `deriveCorridorSpans` expects (per-depth left/right solid booleans). Use a facing→(dx,dy) table for the 4 facings and the N/W-field-to-side mapping the finding documents. Transcribe the `Y3_CORRIDOR` cell values + the expected wall fields from the finding's reference-frame evidence.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wiz6/parser exec vitest run tests/maze/classify.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/parser/src/maze/classify.ts packages/parser/tests/maze/classify.test.ts
git commit -m "feat(parser): maze classify (cell-walls+party->solid-side flags) [new, from RE]"
```

> If the exact N/W-field→side mapping is ambiguous from the finding, read the live `@0x5220` for `maze-corridor.state` (and `maze-corridor-turn-left.state`) via `trace-maze.ts` / MCP `dosbox_live_read` at base 0xffa0 and reconcile before committing. Mark any comparator you're unsure of with a code comment + a TODO.

---

## Task 9: `@wiz6/parser` — `renderMazeViewport` (assemble the pipeline)

**Files:**
- Create: `packages/parser/src/maze/render.ts`, `packages/parser/src/maze/index.ts` (barrel)
- Modify: `packages/parser` barrel/export so `@wiz6/parser` exposes `renderMazeViewport`
- Test: `packages/parser/tests/maze/render.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { renderMazeViewport } from '../../src/maze/render.js';
import { loadMazeAssets } from '../../src/maze/assets.js';
import type { MazeCellWalls, Party } from '@wiz6/data';

const Y3_CORRIDOR: MazeCellWalls = { cells: { /* same as classify.test.ts */ } };
const PARTY: Party = { x: 7, y: 3, z: 0, facing: 0 };

describe('renderMazeViewport', () => {
  it('returns 176x112 indices with stone walls present', () => {
    const idx = renderMazeViewport(Y3_CORRIDOR, PARTY, loadMazeAssets());
    expect(idx.length).toBe(176 * 112);
    expect(idx.some(v => v !== 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wiz6/parser exec vitest run tests/maze/render.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `renderMazeViewport(cellWalls, party, assets): Uint8Array`** = classify → deriveCorridorSpans → generateCallList → (init a 4-plane page; for the unit test the wall-only page is fine) → renderFrameFromGeometry → decodePageIndex → crop the viewport rect `MAZE_VIEWPORT` (72,32,176,112) to a 176×112 index buffer. Background composition (floor/ceiling) is supplied by the viewer's page init in Task 11; the parity gate (Task 10) uses the engine-page background so walls are what's tested.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wiz6/parser exec vitest run tests/maze/render.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/parser/src/maze/render.ts packages/parser/src/maze/index.ts packages/parser/tests/maze/render.test.ts
git commit -m "feat(parser): renderMazeViewport assembles classify->build->flush->compositor->decode"
```

---

## Task 10: Engine fixtures — capture turn-left + looking-back frames

**Files:**
- Create: `tools/parity/fixtures/engine/maze-corridor-turn-left.idx.gz`, `maze-corridor-lookback.idx.gz`
- (Optional) Reference PNGs alongside.

- [ ] **Step 1: Capture the turn-left frame.** Using `tools/libretro/trace-maze.ts` (`move` / `capvp` phases) and `tools/libretro/states/maze-corridor-turn-left.state`, capture the live 320×200 framebuffer indices and gzip to `maze-corridor-turn-left.idx.gz` (same format as the existing `maze-corridor.idx.gz` — verify by reading how `maze-corridor-parity.test.ts` loads it).

Run (adapt to the actual phase that emits indices): `pnpm tsx tools/libretro/trace-maze.ts capvp` then gzip the captured index buffer to the fixture path.

- [ ] **Step 2: Capture the looking-back frame** via the reverse-via-180 demo in the `move` phase (turn right ×2 from the corridor, step, capture). Save `maze-corridor-lookback.idx.gz`.

- [ ] **Step 3: Sanity-check** each fixture gunzips to 320×200 indices and renders a recognizable corridor (decode to PNG, eyeball).

- [ ] **Step 4: Commit**

```bash
git add tools/parity/fixtures/engine/maze-corridor-turn-left.idx.gz tools/parity/fixtures/engine/maze-corridor-lookback.idx.gz
git commit -m "test(maze): commit turn-left + looking-back engine parity fixtures"
```

> Capture needs the live dosbox-pure session (no other agent should be driving it). The fixtures are deterministic once captured. Record in the commit which `.state` + party `(x,y,z,facing)` each frame is, and transcribe its cell-walls into the parity test in Task 11.

---

## Task 11: Multi-frame pixel-parity gate

**Files:**
- Create: `packages/parser/tests/maze/maze-render-parity.test.ts`

- [ ] **Step 1: Write the failing test** (the gate). For each of the three frames, build the `MazeCellWalls` + `Party` (transcribed from the captured frame / `@0x5220`), render via `renderMazeViewport` over the engine-page background, and compare the viewport to the engine fixture crop at tolerance 0 using `compareRgba` (see `tools/parity/maze-corridor-parity.test.ts` for the fixture-load + crop + palette pattern).

```ts
import { describe, it, expect } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { renderMazeViewport } from '@wiz6/parser';
import { compareRgba } from '../../../../tools/parity/diff-image.js';
// ... load COMPOSED_PALETTE + MAZE_VIEWPORT as maze-corridor-parity.test.ts does ...

const FRAMES = [
  { name: 'y3',        gz: 'maze-corridor.idx.gz',           party: { x: 7, y: 3, z: 0, facing: 0 }, walls: {/*...*/} },
  { name: 'turn-left', gz: 'maze-corridor-turn-left.idx.gz', party: {/*...*/},                       walls: {/*...*/} },
  { name: 'lookback',  gz: 'maze-corridor-lookback.idx.gz',  party: {/*...*/},                       walls: {/*...*/} },
];

describe.each(FRAMES)('maze render parity: $name', ({ gz, party, walls }) => {
  it('viewport matches engine at tolerance 0', () => {
    const eng = /* gunzip fixture -> 320x200 indices -> crop viewport -> RGBA via palette */;
    const ours = /* renderMazeViewport(walls, party, assets) over engine-page bg -> RGBA */;
    const r = compareRgba(ours, eng, { tolerance: 0 });
    expect(r.matchPct).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wiz6/parser exec vitest run tests/maze/maze-render-parity.test.ts`
Expected: FAIL initially (cell-walls/party not yet transcribed, or a real RE gap).

- [ ] **Step 3: Make it pass.** Transcribe each frame's cell-walls/party from the capture. If `turn-left` or `lookback` is below 100%, that is a real RE gap (per the spec, NOT a tolerance to widen): reconcile the classifier / seamIdx against the live frame (`trace-maze.ts`, `@0x5220` read) until the from-geometry render is byte-exact. This is the step that confirms the seamIdx `{12,10}` + projection.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wiz6/parser exec vitest run tests/maze/maze-render-parity.test.ts`
Expected: PASS (3 frames, 100% each).

- [ ] **Step 5: Commit**

```bash
git add packages/parser/tests/maze/maze-render-parity.test.ts
git commit -m "test(maze): multi-frame from-geometry pixel-parity gate (y3/turn-left/lookback, 100%)"
```

---

## Task 12: Viewer integration — replace extraction with from-geometry

**Files:**
- Modify: `packages/viewer/src/pages/game/compose-maze-view.ts` (replace 7-tile extraction)
- Modify: `packages/viewer/src/pages/game/compose-maze-frame.ts` (call the new viewport renderer; keep chrome)
- Modify: `packages/viewer/tests/game/compose-maze-view.test.ts` (drive the from-geometry path)
- (The full-frame `tools/parity/maze-corridor-parity.test.ts` must stay green.)

- [ ] **Step 1: Update the viewport test to expect the from-geometry path.** Keep its assertion (100% vs the engine fixture crop), but source the viewport from `parser.renderMazeViewport(...)` (with the y3 cell-walls/party + assets) instead of `composeMazeViewport(TILES)`.

- [ ] **Step 2: Run it to verify it fails** (still using extraction).

Run: `pnpm --filter @wiz6/viewer exec vitest run tests/game/compose-maze-view.test.ts`
Expected: FAIL (until the composer is switched).

- [ ] **Step 3: Switch the composer.** In `compose-maze-view.ts`, replace the tile-blit body with: call `renderMazeViewport(cellWalls, party, assets)` → indices → RGBA (palette) → return the 176×112 buffer. In `compose-maze-frame.ts`, keep the static chrome blit; the viewport now comes from the from-geometry path; for the live `/game/maze` view, supply the floor/ceiling background page (the committed background / chrome-derived) so walls composite on top. Keep `MAZE_VIEWPORT` placement.

- [ ] **Step 4: Run viewer + full-frame parity tests.**

Run: `pnpm --filter @wiz6/viewer exec vitest run tests/game/compose-maze-view.test.ts`
Run: `pnpm --filter @wiz6/parser exec vitest run --root ../.. tools/parity/maze-corridor-parity.test.ts`
Expected: PASS (both; full-frame stays 100%).

- [ ] **Step 5: Manual smoke + commit.**

Manual: `pnpm dev:viewer` → open `/game/maze`, eyeball the corridor (and, if wired, a turn).

```bash
git add packages/viewer/src/pages/game/compose-maze-view.ts packages/viewer/src/pages/game/compose-maze-frame.ts packages/viewer/tests/game/compose-maze-view.test.ts
git commit -m "feat(viewer): /game/maze renders the viewport from geometry (replaces extraction)"
```

---

## Final verification

- [ ] Run the full suites: `pnpm --filter @wiz6/data run typecheck && pnpm --filter @wiz6/parser run typecheck && pnpm --filter @wiz6/viewer run typecheck`
- [ ] Run all maze tests: `pnpm --filter @wiz6/parser exec vitest run tests/maze` + the viewer game tests + the two `tools/parity/maze-*.test.ts`.
- [ ] Confirm the three parity frames are 100% (the definition of done).
- [ ] Update `tools/parity/maze-generator.test.ts`: if its cases are now duplicated in `packages/parser/tests/maze/`, either delete it or leave a pointer (avoid two sources of truth) — decide based on whether `tools/parity` stays a scratch area.
- [ ] Manual smoke `/game/maze`.
