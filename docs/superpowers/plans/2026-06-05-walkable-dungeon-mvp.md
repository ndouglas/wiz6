# Walkable Dungeon MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> **Execution model (read first):** This plan mixes two task kinds. **RE tasks** (🔬) are reverse-engineering/discovery passes — you cannot pre-write their exact output code; they specify the *objective*, the *exact starting points* (findings + addresses + tools), and the *byte-exact validation gate*, and they deliver a validated decoder/renderer + a findings JSON (the discipline the whole `docs/re/findings/maze-*.json` arc used). **Impl tasks** (⌨️) are ordinary TDD with complete code. Dispatch RE tasks to capable models; they own the live dosbox-pure session + Ghidra one at a time (shared state — never two in parallel).

**Goal:** Create a party → START NEW GAME → enter the starting dungeon level → turn/step around it engine-faithfully per `(cell, facing)` from the real decoded map, with wall/door collision.

**Architecture:** A from-disk `extract-mazedata` produces the level's `MazeBlock` (committed JSON). A `GameSession` store holds the party `{cell, facing}` + the loaded level. `/game/maze` renders `renderMazeViewport(level.mazeBlock, party)` per position and handles discrete movement keys (turn/step + collision). The maze renderer is finished to draw every discrete view-case byte-exact.

**Tech Stack:** TypeScript (ESM, `.js` imports), zod, vitest, React + react-router-dom (viewer), Playwright (e2e). Live RE via dosbox-pure (`tools/libretro/`) + Ghidra. Spec: `docs/superpowers/specs/2026-06-05-walkable-dungeon-mvp-design.md`.

**Sequencing rationale:** Stage A (map) → Stage B (wiring; walk with the *current* corridor renderer, graceful on unhandled cells) → Stage C (renderer completion). This lands an *actually walkable* dungeon early (B), then improves fidelity (C) — the user endorsed ordering flexibility, and the scripted-intro ordering is pinned in B.

---

## Pre-flight (read before starting)

- Spec: `docs/superpowers/specs/2026-06-05-walkable-dungeon-mvp-design.md`.
- Renderer + input contract: `packages/parser/src/maze/render.ts` (`renderMazeViewport(block, party, assets, opts?)`), `packages/data/src/maze/render-schema.ts` (`MazeBlock`, `MazeBlockCell`, `MazeParty`), `packages/parser/src/maze/{classify,build,flush,compositor,background,callist,maze-data,page}.ts`.
- Map/RE foundations: `docs/re/findings/maze-classify-{projection,gating}.json` (cell-wall format, the `gxBase/gyBase` resolver, `cell = region*64 + cellA*8 + cellB`), `maze-asset-loader.json` + `tools/parity/decode-asset.ts` (SCENARIO.DBS + DISK.HDR/MASTER.HDR access), `maze-harness-movement.json` (movement keys, `maze_can_step_in_facing` wmaze 0x3244, the scripted entry narration), `maze-capture-harness.json` (`trace-maze.ts` capture phases; patched core via `build-core.sh`/restore `fetch-core.sh`).
- Session schema: `packages/data/src/schemas/save.ts` (`PositionSchema`, `MazeStateSchema`).
- Flow + stores: `packages/viewer/src/{router.tsx,App.tsx}`, `pages/castle/*` (the `/castle/start-new-game` stub), `pages/game/{MazeView.tsx,compose-maze-frame.ts}`, `src/**/*-store.ts` (the `ActivePartyStore`/`RosterStore` pattern), `main.tsx` (BrowserRouter).
- Tooling caveat: the patched trace core can't unserialize the committed states (`DBPSerialize_CPU` mismatch); capture via `reach`→fresh `CLEAN_STATE`→capture, per `maze-capture-harness.json`. Restore the nightly core after RE.

**Coordinate model (consistency — use throughout):** the session party, the level entrance, and movement all use **global cell coords `{ gx, gy, z, facing }` — identical to `MazeParty`** (`render-schema.ts`: `gx = gxBase[region]+cellB`, `gy = gyBase[region]+cellA`; view-steps move gx/gy ±1 and cross region planes correctly). So `renderMazeViewport(block, sessionParty, assets)` consumes the session party **directly, no conversion**; movement steps gx/gy ±1 along facing; collision resolves `(gx,gy)`→region+cell→the N/W wall field. Do NOT introduce a separate cellA/cellB party type.

**File structure created/modified:**
- `tools/parity/extract-mazedata.ts` (RE decoder, like `decode-asset.ts`) + `packages/cli/src/extractors/maze-level.ts` + `extract` subcommand wiring.
- `extracted/maze/level-<id>.json` (committed level map).
- `packages/data/src/maze/level-schema.ts` (`DungeonLevel` = `{ id, entrance, mazeBlock }`; reuse `MazeBlock`).
- `packages/viewer/src/game/game-session-store.ts` (session store) + `packages/data/src/game/movement.ts` (pure turn/step/collision).
- `packages/viewer/src/pages/castle/StartNewGame*.tsx` (replace the stub) + `packages/viewer/src/pages/game/MazeView.tsx` (rebuilt).
- Parser maze module: finish the view-cases in `classify/build/flush/compositor/callist`.
- Tests under each package's `tests/`; e2e in `packages/viewer/e2e/`.

---

## Stage A — Map extractor (the real level → `MazeBlock`)

### 🔬 Task A1: RE + build the from-disk level-map extractor

**Files:** Create `tools/parity/extract-mazedata.ts`; findings `docs/re/findings/maze-level-extract.json`.

**Objective:** Decode the **starting dungeon level's** cell map from the game files into the exact `MazeBlock` shape `renderMazeViewport` consumes — `{ gxBase[12], gyBase[12], regions: MazeBlockCell[][] }` where `regions[r][cellA*8+cellB]` carries the per-cell N/W 2-bit walls + door/decoration fields (`MazeBlockCellSchema` in `render-schema.ts`). Determine which on-disk file holds the level cell grid (mazedata.ega vs SCENARIO.DBS banks — `decode-asset.ts` already cracked SCENARIO.DBS + DISK.HDR/MASTER.HDR; the maze CELL GRID source must be confirmed) and the layout (the bit-packed coords / the 3-bit field reader noted in `mazedata-investigation.md`, building on the resolver + cell-wall format from `maze-classify-{projection,gating}.json`).

**Starting points:** `tools/parity/decode-asset.ts` (header/bank access), `maze-classify-{projection,gating}.json` (the `MazeBlock` semantics + `gxBase/gyBase` + N/W fields), `mazedata-investigation.md` (cell-grid @ wmaze DGROUP 0x4e08, bit-packed coords). Use the live session to read the in-RAM `MazeBlock` for the starting level (the resolver tiles it into region planes) as the **oracle**.

**Validation gate (byte-exact):** `extractMazeLevel(<startingLevelId>)` output `MazeBlock` == the live in-RAM `MazeBlock` for that level, byte-exact (every region plane + the tables), the same discipline as `decode-asset`'s 24/24 zones. Validate via a `tools/parity/validate-maze-level.ts` that diffs offline-extracted vs live-read.

- [ ] Read the findings + `decode-asset.ts`; identify the level-cell-grid file + layout (live oracle read).
- [ ] Implement `extractMazeLevel(levelId) → MazeBlock` offline from the game files.
- [ ] Validate byte-exact vs the live in-RAM `MazeBlock` for the starting level; iterate until 0 diffs.
- [ ] Write `docs/re/findings/maze-level-extract.json` (the format, asm/file anchors, the byte-exact result). Restore the nightly core.
- [ ] Commit: `git add tools/parity/extract-mazedata.ts tools/parity/validate-maze-level.ts docs/re/findings/maze-level-extract.json && git commit -m "re(dungeon): from-disk maze-level extractor (byte-exact vs live MazeBlock)"`

> If the from-disk decode stalls (e.g. an undeciphered bit-packing), FALL BACK: capture the live `MazeBlock` for the starting level and commit it as a fixture (`extracted/maze/level-<id>.json`), and note the extractor as a follow-up — Stages B/C only need the committed level JSON, not the extractor. Report which path you took.

### ⌨️ Task A2: `@wiz6/data` level schema + `@wiz6/cli` extract subcommand + committed level

**Files:** Create `packages/data/src/maze/level-schema.ts`; modify the `@wiz6/data` barrel; create `packages/cli/src/extractors/maze-level.ts` + wire into `packages/cli/src/commands/extract.ts`; output `extracted/maze/level-<id>.json`; test `packages/data/tests/maze/level-schema.test.ts`.

- [ ] **Step 1: failing test** `level-schema.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { DungeonLevelSchema, type DungeonLevel } from '@wiz6/data';

describe('DungeonLevel schema', () => {
  it('parses a level with an entrance + a MazeBlock', () => {
    const lvl: DungeonLevel = DungeonLevelSchema.parse({
      id: 0,
      entrance: { gx: 0, gy: 0, z: 0, facing: 0 },
      mazeBlock: { gxBase: new Array(12).fill(0), gyBase: new Array(12).fill(0), regions: [[]] },
    });
    expect(lvl.entrance.facing).toBe(0);
  });
});
```
- [ ] **Step 2: run → FAIL** `pnpm --filter @wiz6/data exec vitest run tests/maze/level-schema.test.ts`
- [ ] **Step 3: implement** `level-schema.ts`:
```ts
import { z } from 'zod';
import { MazeBlockSchema } from './render-schema.js';

// Global cell coords (= MazeParty without the runtime fields); where START NEW GAME drops the party.
export const DungeonEntranceSchema = z.object({
  gx: z.number().int().min(0), gy: z.number().int().min(0),
  z: z.number().int().min(0), facing: z.number().int().min(0).max(3),
});
export const DungeonLevelSchema = z.object({
  id: z.number().int().min(0),
  entrance: DungeonEntranceSchema,
  mazeBlock: MazeBlockSchema,
});
export type DungeonLevel = z.infer<typeof DungeonLevelSchema>;
```
Re-export from the `@wiz6/data` barrel.
- [ ] **Step 4: run → PASS.**
- [ ] **Step 5:** write the `@wiz6/cli` `maze-level` extractor (calls the Task-A1 `extractMazeLevel`, wraps with the entrance, validates against `DungeonLevelSchema`, writes `extracted/maze/level-<id>.json`), wire the `extract` subcommand, run it to produce the committed level JSON. Add a test that loads `extracted/maze/level-<id>.json` and validates it + checks a known cell's wall matches the Task-A1 oracle.
- [ ] **Step 6: commit** the schema + extractor + committed level JSON + tests.

> The **entrance** (cell + facing where START NEW GAME drops the party) is discovered from the engine in Task B3; for A2 use a placeholder entrance and refine it in B3, or read it live now if known. Note which.

---

## Stage B — Traversal wiring (walkable with the current renderer)

### ⌨️ Task B1: `GameSession` store

**Files:** Create `packages/viewer/src/game/game-session-store.ts`; test `packages/viewer/tests/game/game-session-store.test.ts`.

- [ ] **Step 1: failing test:**
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { initGameSession, readGameSession, updateParty, clearGameSession } from '../../src/game/game-session-store.js';
import type { DungeonLevel } from '@wiz6/data';

const LEVEL: DungeonLevel = { id: 0, entrance: { gx: 2, gy: 3, z: 0, facing: 0 },
  mazeBlock: { gxBase: new Array(12).fill(0), gyBase: new Array(12).fill(0), regions: [[]] } };

describe('GameSession store', () => {
  beforeEach(() => clearGameSession());
  it('init places the party at the level entrance; read returns it', () => {
    initGameSession(LEVEL);
    const s = readGameSession();
    expect(s?.party).toEqual({ gx: 2, gy: 3, z: 0, facing: 0 });
    expect(s?.level.id).toBe(0);
  });
  it('updateParty mutates + persists the party', () => {
    initGameSession(LEVEL);
    updateParty({ facing: 1 });
    expect(readGameSession()?.party.facing).toBe(1);
  });
  it('read returns null when no session', () => { expect(readGameSession()).toBeNull(); });
});
```
- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3: implement** the store (mirror `active-party-store.ts`: a zod `GameSessionSchema = { schemaVersion: 1, level: DungeonLevelSchema, party: { cellA, cellB, z, facing } }`, localStorage key `wiz6:session`, `initGameSession(level)` seeds party from `level.entrance`, `readGameSession()` nullable + schema-validated, `updateParty(partial)`, `clearGameSession()`).
- [ ] **Step 4: run → PASS. Step 5: commit.**

### ⌨️ Task B2: pure movement (turn / step / collision) in `@wiz6/data`

**Files:** Create `packages/data/src/game/movement.ts`; test `packages/data/tests/game/movement.test.ts`.

The collision rule comes from `maze_can_step_in_facing` (wmaze 0x3244, `maze-harness-movement.json`): a forward step is allowed iff the wall in the facing direction of the current cell is open. Read the per-cell N/W walls from the `MazeBlock` via the resolver (the cell-edge read is the same per-facing selector cracked in `maze-classify-determinism.json`: forward edge = N(cell) for facing 0, W(cell) for facing 1, N(south-neighbour) for facing 2, W(west-neighbour) for facing 3).

- [ ] **Step 1: failing test:**
```ts
import { describe, it, expect } from 'vitest';
import { turn, tryStepForward } from '../../src/game/movement.js';
import type { MazeBlock } from '@wiz6/data';

describe('movement (global gx/gy cell coords)', () => {
  it('turn wraps facing mod 4', () => {
    expect(turn({ gx:0,gy:0,z:0,facing:0 }, 'left').facing).toBe(3);
    expect(turn({ gx:0,gy:0,z:0,facing:3 }, 'right').facing).toBe(0);
  });
  it('step forward is blocked by a wall (no-op), allowed when open', () => {
    // facing 0 steps +gy (per the classify FORWARD_STEP + harness finding: facing-0 forward
    // moved gy 121->122). Build a block where the cell at (gx0,gy0) has a SOLID forward
    // (north) edge and (gx0,gy1) has an OPEN forward edge.
    const block: MazeBlock = makeTestBlock(); // helper builds gxBase/gyBase + the regions plane
    const blocked = tryStepForward({ gx:0,gy:0,z:0,facing:0 }, block);
    expect(blocked).toEqual({ gx:0,gy:0,z:0,facing:0 }); // unchanged (wall ahead)
    const open = tryStepForward({ gx:0,gy:1,z:0,facing:0 }, block);
    expect(open.gy).toBe(2); // advanced +gy (open ahead)
  });
});
```
(Write `makeTestBlock()` inline with concrete `gxBase`/`gyBase` + a `regions` plane setting the two cells' `north` fields, resolving `(gx,gy)`→region+cell the same way `classify.ts` does.)
- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3: implement** `turn(party, dir)` (facing ±1 mod 4) and `tryStepForward(party, block)`: use the **same `FORWARD_STEP` per-facing `(dgx,dgy)` deltas + the forward-edge selector** as `packages/parser/src/maze/classify.ts` (export + reuse them — DRY; do NOT re-derive a second copy). Resolve the current cell's forward edge via the resolver; if solid → return the party unchanged; else advance `(gx,gy)` by the facing delta. NO back-step (down is a no-op — don't implement it). The party shape is `MazeParty` (`{ gx, gy, z, facing }`).
- [ ] **Step 4: run → PASS. Step 5: commit.**

### ⌨️ Task B3: real START NEW GAME handler + the scripted intro

**Files:** Modify `packages/viewer/src/pages/castle/` (the `/castle/start-new-game` stub) + `router.tsx`; create the handler. RE the scripted-intro ordering live first.

- [ ] **Step 1 (discover):** drive the engine through START NEW GAME (`tools/libretro/trace-maze.ts reach` + observe) to pin the ordering: scenario pick → the scripted entry narration → the first controllable frame + the **entrance** `(cell, facing)`. Update `extracted/maze/level-<id>.json`'s `entrance` (Task A2) to the real value. Record in `docs/re/findings/maze-start-new-game.json`.
- [ ] **Step 2 (impl):** replace the `/castle/start-new-game` stub with a handler that: requires a non-empty active party (else a message), loads the committed `DungeonLevel`, `initGameSession(level)`, optionally shows the scripted-intro step (a text/frame screen dismissed by ENTER — match the engine ordering from Step 1; keep minimal for the MVP), then navigates to `/game/maze`.
- [ ] **Step 3:** test — a component/unit test that START NEW GAME with a party initializes the session (entrance party) and routes to `/game/maze`; without a party, it doesn't.
- [ ] **Step 4: commit.**

### ⌨️ Task B4: `/game/maze` — render-per-position + movement keys (walkable!)

**Files:** Rewrite `packages/viewer/src/pages/game/MazeView.tsx`; keep `compose-maze-frame.ts` for the chrome.

- [ ] **Step 1 (impl):** rebuild `MazeView` to: read `readGameSession()` (redirect to `/castle` if null); each render, call `renderMazeViewport(session.level.mazeBlock, session.party, assets)` → indices → RGBA → blit into the viewport region of the chrome (reuse `composeMazeFrame`'s chrome + `MAZE_VIEWPORT` placement) → present. Add a `keydown` listener: `ArrowLeft`→`updateParty(turn(party,'left'))`, `ArrowRight`→`turn right`, `ArrowUp`→`updateParty(tryStepForward(party, block))`; re-render on change. **Graceful on unhandled view-cases:** the current renderer is corridor-validated; for now, render whatever it produces (don't crash) — Stage C makes off-corridor views byte-exact. Add a guard so an unhandled cell renders a blank/partial viewport rather than throwing.
- [ ] **Step 2 (manual smoke):** `pnpm dev:viewer` → create a party → START NEW GAME → confirm you can turn + step (corridors render; junctions may look wrong — expected pre-Stage-C). **This is the "walkable" milestone.**
- [ ] **Step 3:** commit. (Pixel-parity comes in Stage C; here just movement + per-position render wired.)

---

## Stage C — Renderer completion (every discrete view-case byte-exact)

> RE-heavy; the banked maze-arc tail, now finite-bounded because the starting level has a finite set of distinct view-cases. Execute as RE passes (capable model, owns live+Ghidra). Each case gated byte-exact.

### 🔬 Task C1: enumerate the starting level's distinct view-cases + capture engine fixtures

**Objective:** From the decoded `DungeonLevel` (Stage A), compute the local view-config for every `(cell, facing)` and **dedupe** → the finite set of distinct view-cases the level exercises (corridor variants, junctions, corners, doors, dead-ends, open sides). For each distinct case, capture the engine's framebuffer (`tools/libretro/trace-maze.ts` capture, patched core) + the per-case wall/background call data, committed under `tools/parity/fixtures/engine/maze-view-<case>.idx.gz`. Deliver the case list + fixtures + `docs/re/findings/maze-view-cases.json`.

- [ ] Compute + dedupe the distinct view-configs from the level map.
- [ ] Drive/capture the engine frame + call data per distinct case; commit fixtures. Restore the nightly core.
- [ ] Commit fixtures + findings.

### 🔬 Task C2: port the remaining wall view-cases (junction/corner/front-wall/far-shape)

**Objective:** Extend `classify`/`build`/`flush`/`compositor` to emit the wall pieces for the non-corridor cases from C1, porting the statically-decoded jump-table handlers (`maze-classify-gating.json` quad table 0x449e + corner table 0x4776; `maze-span-build.json`). Gate each case's WALL pixels byte-exact vs its C1 fixture.

- [ ] Per case: port the handler, gate byte-exact, commit. (Iterate over the C1 case set.)

### 🔬 Task C3: background call-lists per depth/opening config

**Objective:** Key the floor/ceiling/window background call-lists by the finite depth/opening configs from C1 (capture each via the harness — the decompiler-blocked *generation* sidestep, `maze-callist-generation.json`), integrate into `renderMazeViewport` so the full viewport (background + walls) composes from `(mazeBlock, party)`. Decoders are done (`maze-{expander,masked-mirror,floor-ceiling-decoder}.json`).

- [ ] Capture + key the background call-lists per config; integrate; commit.

### ⌨️ Task C4: full per-(cell,facing) pixel-parity gate + e2e

**Files:** `packages/parser/tests/maze/maze-level-parity.test.ts`; `packages/viewer/e2e/walkable-dungeon.spec.ts`.

- [ ] **Parity gate:** for each distinct view-case (C1), `renderMazeViewport(mazeBlock, partyForCase, assets)` → viewport RGBA == the C1 engine fixture, tolerance 0. All cases pass.
- [ ] **e2e:** create a party → START NEW GAME → step/turn through several cells, pixel-asserting the canvas vs the engine fixtures at each. (Reuse the e2e pattern in `packages/viewer/e2e/`.)
- [ ] Run full suites (`pnpm --filter @wiz6/{data,parser,viewer} exec vitest run` + e2e) — no regressions. Commit. **This is the engine-faithful walkable milestone.**

---

## Final verification

- [ ] `pnpm --filter @wiz6/data run typecheck && pnpm --filter @wiz6/parser run typecheck && pnpm --filter @wiz6/viewer run typecheck`
- [ ] All maze + game tests green; the per-view-case parity gates at 100%.
- [ ] Manual: `pnpm dev:viewer` → create party → START NEW GAME → walk the starting level; views look engine-faithful at corridors/junctions/corners/doors.
- [ ] Update `TODO.md` (#076 progress) + the spec/plan Outcome with what shipped vs deferred.
