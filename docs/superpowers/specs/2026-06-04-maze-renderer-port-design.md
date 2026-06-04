# Maze Renderer Port — Design (Scope B: general renderer, typed cell input)

**Date:** 2026-06-04
**Status:** Approved (design); implementation plan to follow.
**Branch:** `re/maze-general-renderer`

## Goal

Productionize the reverse-engineered first-person maze renderer as a **general,
from-geometry** renderer: given the maze cell-wall data around the party plus the
party's facing/position, produce the 176×112 dungeon viewport, pixel-exact to the
original engine. Replace the viewer's current **extraction** path (which blits
pre-extracted tiles from a committed fixture and only works for the one captured
corridor) with the from-geometry renderer.

The entire pipeline is reverse-engineered and validated byte-exact (see
`docs/re/findings/maze-{texture-decode,planar-transform,stage1-compositor,span-build,
harness-movement}.json` and `egadrv-blit-internals.json`). A working prototype lives at
`tools/parity/render-maze-frame.ts`. This port moves that logic into the package
structure with a typed input boundary and a multi-frame pixel-parity gate.

## Scope

**In scope (B):**

- A pure `@wiz6/parser` renderer that takes a typed maze cell-wall input + party and
  produces the viewport indices/RGBA. It internally runs the RE'd projection
  (classify) → build spans → flush call-list → 4-plane compositor → decode viewport.
- A `@wiz6/data` schema for the renderer's **input** (`MazeCellWalls` + `Party`) and
  for the **render assets** (texture atlas + piece descriptors), plus the RE'd static
  tables as typed constants.
- Committed render assets (extracted offline where the decode is RE'd; engine-capture
  fixture otherwise).
- Viewer integration: `/game/maze` renders the viewport from geometry (chrome stays
  static).
- A multi-frame pixel-parity gate (corridor y3 + turn-left + looking-back).

**Out of scope (deferred to a later "Scope C" pass):**

- Decoding the **on-disk dungeon-grid** (the bit-packed 8×8 cell grid + the 3-bit field
  reader `func_0xe3c1`) into a maze-level. Until then, test cell-walls are hand-authored
  or derived from captured frames; the `MazeCellWalls` schema is designed to be the
  target of that future decoder.
- Door / turn-corner / far-depth **shape variants** beyond what the validation frames
  exercise (the jump-table handlers are statically decoded but only solid-wall walltypes
  0/2 are validated; additional shapes are added as frames that exercise them become
  available).
- Floor/ceiling/side **background OR-blit** as a from-geometry layer (the wall path is
  the validated 100%; the background is supplied by the committed page/chrome for now).

## Architecture

Three packages, one data flow. Each unit has one purpose and a typed interface.

```
@wiz6/data        @wiz6/parser (pure)                         @wiz6/viewer
─────────         ──────────────────                          ────────────
MazeCellWalls ─┐
Party          ├─▶ renderMazeViewport(cellWalls, party,       composeMazeFrame:
MazeRenderAssets┘     assets) : Uint8Array (176×112 indices)    keep static chrome blit;
+ static tables          │                                      viewport = parser.render…
(convergence,            ├ classify: cells → slot-walltypes     → indices→RGBA→blit under
 seam x0/x1,             │   (cell = z·64 + y·8 + x; 2-bit       chrome → canvas
 corner-seamIdx)         │    N/W wall fields; facing rotation)
                         ├ build: slot-walltypes → spans
                         ├ flush: spans → call-list
                         ├ compositor: call-list → 4-plane page
                         └ decode: page → viewport indices
```

### `@wiz6/data` (schemas + RE'd constants)

- **`MazeCellWalls`** — the typed input describing the wall data the projection reads.
  Models what the engine reads per cell: the 2-bit N/W wall fields (+ pit flag), indexed
  by `cell = z·64 + y·8 + x`, for the local window the depth loop walks. Exact shape
  (full local grid vs. the minimal visible window) finalized in the plan from the
  classifier disasm; it must be sufficient for the projection and be the natural target
  of the future dungeon-grid decoder.
- **`Party`** — `{ x, y, z, facing }` (facing ∈ 0..3).
- **`MazeRenderAssets`** — `{ atlas: bytes, pieceDescriptors: PieceDescriptor[] }` where
  `PieceDescriptor = { srcPtr, w, h, presenceBitmap }` (1-indexed piece bytes).
- **Static RE'd tables as typed constants** (currently hardcoded in
  `tools/parity/maze-generator.test.ts` / `render-maze-frame.ts`): per-depth convergence
  arrays `{0,104,128,144}` (left) / `{0,216,192,176}` (right); seam tables `x0`/`x1`
  (DGROUP 0x36e4/0x3717, stride 0x13a per walltype); corner-seamIdx base `{left:12,
  right:10}`. Existing geometry constants live in `packages/data/src/maze/
  corridor-geometry.ts` (`MAZE_VIEWPORT`, converge columns) — extend that area.
- Zod-schema-as-source-of-truth; types via `z.infer`.

### `@wiz6/parser` (pure, no I/O)

A new `packages/parser/src/formats/` (or `.../maze/`) module porting
`tools/parity/render-maze-frame.ts`:

- `renderMazeViewport(cellWalls, party, assets) → Uint8Array` (176×112 palette indices).
- Internal stages (each independently unit-testable), ported 1:1 from the prototype +
  the classifier:
  1. **classify** — cells + facing → per-depth/per-side slot-walltypes (the projection:
     `view_step_forward_by_facing` rotation, `cell = z·64+y·8+x`, 2-bit N/W fields,
     classifier 0/2). *(New code; prototype currently starts from spans.)*
  2. **build** — slot-walltypes → spans (`deriveCorridorSpans` + `cornerSolidSeamIdx`;
     seam refinement `x0 += 2·seam`, `x1 += 1·seam`).
  3. **flush** — spans → call-list (`generateCallList`: depth 4→0, one FUN_1c94 call per
     `walltype != 0xff` span).
  4. **compositor** — call-list + assets → 4-plane page (`renderFrameFromGeometry` /
     `renderPieceCall` / `decodePieceToComposeBuffer`: per-column `shr`/mask merge).
  5. **decode** — page → viewport indices (`render-maze-page.ts` `decodePageIndex`).
- Pure: no disk reads. Assets passed in. Mirrors `pic.ts`/`ega-screen.ts` conventions
  (`Uint8Array` in, typed out; `.js` ESM imports; schema validation at the boundary).

### Assets (committed)

- The atlas (4-plane 8×8 texture cells) and piece descriptors are produced **offline**
  from `mazedata.ega` via the RE'd decode (`tools/parity/decode-mazedata.ts` +
  the `.pic` RLE decoder) where that path is complete; for any portion not yet
  offline-reproducible, a committed **engine-capture fixture** is used and clearly
  marked as such. The asset bytes load via the `MazeRenderAssets` schema. A small
  extractor under `packages/cli/src/extractors/` (or `tools/parity/`) generates the
  committed asset, following the existing extractor pattern.

### `@wiz6/viewer` (`/game/maze`)

- `compose-maze-frame.ts`: keep the static **chrome** blit (the in-dungeon UI frame).
- Replace `compose-maze-view.ts`'s 7-tile **extraction** with a call to
  `parser.renderMazeViewport(...)`, converting the returned indices → RGBA via the EGA
  palette and blitting at `MAZE_VIEWPORT` (72,32). One code path.
- `MazeView.tsx` route unchanged in shape (RAF → compose → canvas); its data source for
  the viewport changes from the fixture tiles to the from-geometry renderer.

## Parity gate (definition of done)

The from-geometry **viewport** must equal the engine framebuffer at **tolerance 0** via
`compareRgba` (`tools/parity/diff-image.ts`), across three frames:

1. **corridor y3** — existing `tools/parity/fixtures/engine/maze-corridor.idx.gz`
   (target 100%).
2. **turn-left corridor** — from `tools/libretro/states/maze-corridor-turn-left.state`
   (capture a committed `.idx.gz` fixture).
3. **looking-back multi-span frame** — from the reverse-via-180 demo (capture a fixture).

Each fixture is captured once via the `trace-maze.ts` tooling and committed under
`tools/parity/fixtures/engine/`. The multi-frame gate is also what **confirms the two
open medium-confidence RE items** — the seamIdx `{left:12, right:10}` base and the
classification/projection — now that harness movement is unblocked (arrow keys turn/step;
see `docs/re/findings/maze-harness-movement.json`). If a frame falls below 100%, that is a
real RE gap to resolve before claiming the renderer general (not a tolerance to widen).

## Testing

Per project conventions (`*.test.ts` = gate):

- **Parser unit tests** — each pipeline stage independently (classify, build, flush,
  compositor, decode), reusing/relocating the existing `tools/parity/maze-generator.test.ts`
  cases (call-list generation, seam refinement, the seamIdx law).
- **Pixel-parity gates** — `*-parity.test.ts` comparing `renderMazeViewport` output to
  each of the three engine fixtures at tolerance 0.
- **Viewer integration** — the existing viewport parity test
  (`packages/viewer/tests/game/compose-maze-view.test.ts`) updated to drive the
  from-geometry path; the full-frame `maze-corridor-parity.test.ts` stays green.
- **Manual smoke** — `pnpm dev:viewer` → `/game/maze`, eyeball the corridor + a turn.

## Open items confirmed during implementation (not blockers)

- **seamIdx base `{12,10}`** — currently empirically fitted to 2 frames (static call-sites
  read `{4,7}`, unreconciled). The turn-left + looking-back frames provide additional
  data points; if they pass at 100% with `{12,10}`, confidence rises to high. If a frame
  disagrees, re-RE the seamIdx source (now capturable with movement unblocked).
- **Projection (classify)** — characterized at medium confidence; the multi-frame gate
  validates it. Edge cases (turn corners, open vs solid ahead) are exercised by the new
  frames.

## References

- RE findings: `docs/re/findings/maze-{texture-decode,planar-transform,stage1-compositor,
  span-build,harness-movement}.json`, `egadrv-blit-internals.json`.
- Prototype: `tools/parity/render-maze-frame.ts`, `render-maze-page.ts`,
  `decode-mazedata.ts`, `maze-generator.test.ts`.
- Existing viewer: `packages/viewer/src/pages/game/{MazeView.tsx,compose-maze-frame.ts,
  compose-maze-view.ts}`, `packages/viewer/src/data/maze-corridor-tiles.json`.
- Existing constants/fixtures: `packages/data/src/maze/corridor-geometry.ts`,
  `tools/parity/fixtures/engine/maze-corridor.idx.gz`, `tools/parity/diff-image.ts`.
- Harness drive: `tools/libretro/trace-maze.ts` (`reach`, `move`, `geomgen`),
  `tools/libretro/states/maze-corridor{,-turn-left}.state`.
