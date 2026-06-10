# Faithful dungeon movement (level-0) — design

**Date:** 2026-06-10
**Status:** approved (brainstorming) → ready for implementation plan
**Sub-project of:** "complete the dungeon" (gameplay layer). This is the FIRST sub-project;
stairs, camp/save, items, and combat are separate later specs.

## Problem

The walkable-dungeon MVP gates forward movement with `movement.ts`'s
`isSolid(forwardEdge)` — the same render-classify edge selector. That model is
**over-permissive vs the engine**: a `collmap` BFS (the model-independent engine-truth
navigator) shows the engine reaches only **74 cells / 293 (cell,facing) views** from the
entrance, while our model marks **303 cells** reachable. So the player can walk through
walls the engine blocks and wander off the byte-exact rendered area (the capture-replay
oracles only cover the 266 engine-reachable configs; off-set cells fall back to the
broadly-broken generation path). Faithful rendering (just shipped) needs faithful
movement to stay on it.

The exact engine collision law is the un-cracked render-classify pass (#087) — a
multi-session RE. We do **not** need it: we already have the engine's ground-truth
forward-passability for the complete reachable set.

## Goal

Level-0 movement matches the engine exactly: the player can only go where the engine
goes (the 74-cell / 293-view reachable graph). No collision-law crack.

## Approach — captured passability gate

Mirror the capture-replay rendering: commit the engine's forward-passability verdicts
and have `movement.ts` consult them, falling back to the model where uncaptured.

Ground truth (already captured this session): `collmap` recorded, per reachable
`(gx,gy,facing)`, a forward verdict — **188 open, 104 blocked, 1 encounter** (the single
encounter is `131,121,f3`). The BFS ran to completion (frontier emptied), so this is the
**complete** engine-reachable set.

### Components

1. **Committed engine-truth source — `tools/parity/fixtures/engine/maze-reachability.json`**
   The canonical reachable-set + forward-verdict data, committed as an engine fixture
   (the `collmap` output: `{ entrance, reachableViews, reachableCells, complete, forward:
   [{gx,gy,facing,forward}], reachable: [{gx,gy,facing}] }`). Regenerated deliberately via
   `pnpm tsx tools/libretro/trace-maze.ts collmap` (the dosbox-pure engine BFS) — same
   "engine fixtures are committed ground truth, regenerated via the harness" convention as
   `build-state.ts`. This session's `/tmp/wiz6-sweep/collmap-full.json` is copied here as
   the initial commit.

2. **Asset builder — `tools/parity/build-passability.ts`**
   Reads the committed `maze-reachability.json` and emits the viewer-shaped asset:
   - `extracted/maze/passability.json` (served via Vite publicDir), and
   - `tools/parity/fixtures/engine/maze-passability.json` (the parity-test copy).

   Shape: `{ entrance: {gx,gy,facing}, cells: [{gx, gy, facing, forward: 'open'|'blocked'|'encounter'}] }`.
   ~293 entries (a few KB; plain JSON, no compression needed). Pure transform of the
   committed source — reproducible without the harness.

3. **Parser — `movement.ts`**
   - `tryStepForward(party, block, opts?)` gains `opts?: { passability?: Map<string, 'open'|'blocked'|'encounter'> }`, keyed by `passabilityKey(party)` = `"${gx},${gy},${facing}"`.
   - Lookup behavior:
     - verdict `open` → advance one cell (the existing `step()` delta).
     - verdict `blocked` or `encounter` → no-op (return party unchanged). `encounter`
       is kept DISTINCT (not collapsed to `blocked`) so wiring combat later is a one-line
       change: `encounter` → trigger the encounter instead of no-op.
     - **no entry for this key** → fall back to the current `isSolid(forwardEdge)` model
       (so uncaptured levels / off-set positions still move via the model).
   - Add a tiny pure helper `passabilityFromTable(table) → Map` (decode the committed
     JSON into the runtime map) so the viewer and tests build it identically.
   - `turn()` is unchanged — the engine always allows turning.
   - Pure + total: a missing/malformed table never throws.

4. **Viewer — `MazeView` + `data-loader.ts`**
   - `loadMazePassability()` fetches `/maze/passability.json`, builds the `Map` via
     `passabilityFromTable`. Non-fatal: returns `null` on failure (movement falls back to
     the model).
   - `MazeView` loads it into a ref alongside the existing assets and passes
     `{ passability }` to `tryStepForward` in the movement handler.

### Data flow

```
collmap (engine BFS) → maze-reachability.json (committed engine-truth fixture)
  → build-passability.ts → passability.json (viewer asset + parity fixture)
  → viewer loadMazePassability → Map
  → movement.ts tryStepForward(opts.passability) → faithful step/no-op
```

## Error handling

- Missing / malformed passability table → `tryStepForward` falls back to the model;
  never throws (graceful, matches the `capturedSpans`/`capturedViewports` pattern).
- `encounter` verdict → no-op now; documented combat hook for later.
- A key absent from the table (a cell the engine never reached) → model fallback. Under
  the gate the player can't reach such cells from the entrance, so this only matters for
  robustness (e.g. a future level without captured data).

## Testing

- **Verdict parity (parser unit, gate):** for all 293 captured `(cell,facing)`,
  `tryStepForward` with the map reproduces the engine verdict — `open` advances to the
  cell `step()` computes; `blocked`/`encounter` leave the party unchanged.
- **Reachability (parser unit, gate):** a BFS from the entrance using gated movement
  (`turn` + gated `tryStepForward`) reaches **exactly** the engine set — 74 distinct
  cells / 293 views — and never a cell outside it (asserts against the committed
  reachable list). Confirms the over-permissive 303/862 set is closed off.
- **Manual smoke:** `pnpm dev:viewer`, walk level-0, confirm movement can't leave the
  faithful (rendered) area and turning still works everywhere.

## Scope / deferred (YAGNI)

- **Level-0 only** — matches the rendering scope; other levels each need their own
  `collmap` capture (and their own extraction). Out of scope here.
- **No collision-law crack** (#087) — the captured gate is the pragmatic faithful path;
  the general law is only needed for arbitrary geometry / un-captured levels.
- **No combat** — the `encounter` verdict is a no-op now (distinct verdict + a hook).
- **Turns, rendering, save/stairs/items** — untouched / separate sub-projects.

## References

- Capture-replay rendering (the sibling pattern): `tools/parity/build-viewport-oracles.ts`,
  `renderMazeViewport`'s `capturedViewports`, `maze-capture-replay-parity.test.ts`.
- Engine reachability + verdicts: `trace-maze.ts collmap`; findings
  `docs/re/findings/maze-collision-model.json` (why the model diverges; the verdict is a
  byproduct of the per-frame render-classify), `maze-generation-fidelity-map.json`
  (the 74-vs-303 reachability inflation). TODO #087 (the deferred collision-law crack).
