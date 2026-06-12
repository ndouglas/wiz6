# Dungeon Interior Capture — faithful movement + byte-exact render past forced doors (#091)

**Status:** design approved 2026-06-12. Next: implementation plan (writing-plans).

## 1. Goal & scope

The #089 FORCE/PICK door feature shipped — and walking through a forced door drops the
party off the captured 74-cell **entrance island** into the dungeon **interior**, which
the port has never charted. Manual-smoke symptom (2026-06-12): *"garbled / wrong walls,
worse as you move."*

**Diagnosis (confirmed with data):** the door at global (124,121) faces north and opens
to (124,120), which is **not** in `maze-reachability.json`'s 74-cell set (captured with
doors *closed*: gx=124 reaches gy 121/122/123, never 120/119). Past the door:
- **Movement** has no passability entries → falls back to the over-permissive `isSolid`
  wall model = the engine-unfaithful collision model (**#087**, ~37% disagreement past
  region 0) → walking through walls, compounding into nonsense.
- **Render** uses the *generated* path, validated only on captured cells = the uncracked
  generation law (**#077/#084**). The door correctly *gates* the interior; the port just
  hasn't captured/validated it.

**This spec covers two pieces in one effort, sequenced movement-first:**

| Piece | Scope | Risk |
|---|---|---|
| **A — Movement capture** | Re-capture engine reachability/passability with doors *open* → faithful interior navigation. Interior-specific, bounded. | Low |
| **B — Byte-exact render (#077 endgame)** | Port the engine's deferred two-phase renderer + crack the residual draw-path so the maze renders pixel-exact (whole-maze, not interior-specific). | High — the longest-open RE problem |

Movement-first: Piece A is the bounded win that directly fixes the symptom and ships an
explorable interior; it also produces the interior captures that gate Piece B.

**Success criteria:**
- A: the party can force a door, walk into the interior, and navigate it with engine-faithful
  collision (no walking through walls); `maze-faithful-movement-parity` reaches the
  door-connected interior component.
- B: `maze-freeroam-parity` entrance views reach **100%** (closing the #077 gap), and a
  representative sample of interior viewport fixtures render byte-exact.

## 2. Piece A — Movement capture (faithful interior navigation)

**Mechanism:** extend the engine reachability BFS (`tools/libretro/trace-maze.ts` `collmap`
mode, ~L4000) to **poke every type-7 door open before the BFS**:
1. Decode the door records live (reuse `decodeDoorRecords`' offsets: special-record table
   base at DGROUP `[0x4fa8]`, per-record `+0x240` wall-plane word, `+0x360` type==7).
2. For each door, memory-write the 2-bit edge code at the door's facing to **0 (open)** in
   the live table (the `w16` HostClient write helper already exists in `trace-maze.ts`).
3. Run the existing free-roam BFS from the entrance — `maze_can_step_in_facing` (wmaze
   0x3244) now lets it traverse the opened doors → reaches the interior.

**Outputs:** expanded `tools/parity/fixtures/engine/maze-reachability.json` →
`tools/parity/build-passability.ts` → expanded `extracted/maze/passability.json`.

**Runtime reconciliation (no double-counting):** the table is captured with doors *open*,
so door-edge verdicts read "passable." But a door is only passable in-game after the player
forces it. This is already handled: MazeView's ArrowUp gate checks the `DoorStateOverlay`
(`isWelded`/`isOpen`) **before** the passability table for the party's facing edge (Task
4.4). So door edges stay overlay-gated; the re-capture only fills in the **interior
non-door** verdicts. (If any door-edge table entry could leak through, exclude door edges
from the built table — but the overlay-first ordering already shadows them.)

**Wiring:** none new — MazeView already loads `passability.json`; the expanded table covers
the interior automatically.

**Gate:** update `packages/parser/tests/maze/maze-faithful-movement-parity.test.ts` — the
BFS now reaches far more than 74 cells; assert it reaches the door-connected interior
component and that verdict parity holds over the expanded set.

## 3. Piece B — Deferred-renderer port (#077 endgame)

**Why the current renderer caps at 84–99%** (`docs/re/findings/maze-headon-recess-emit.json`):
the engine is a **two-phase deferred renderer** — BUILD (depth-loop 0x4ad7/0x4c60 queues
11-byte spans @ DGROUP 0x50d0) → FLUSH (0x51f4, draws spans **back-to-front**, depth 4→0,
all via `FUN_1c94` per-column REPLACE/cover). Our port is an **OR-background approximation**
(`FUN_0a93`, additive) + a FUN_1c94-walls approximation. Additive OR **cannot layer**
(`a|b == b|a`), so it can't cover the corridor-behind with the nearer gate → the ceiling is
~98%.

**Starting point:** resume `feat/deferred-maze-renderer` — it already did the BUILD→FLUSH
two-pass rewrite and is proven *pixel-identical-but-doesn't-close-the-gap* on the 10 gated
views. That proves the architecture is no-regression; it also proves **the architecture
alone is not the fix** — the residual is the **draw-path detail**:
- `FUN_1c94`'s exact per-column **cover/REPLACE** semantics (vs our OR-merge).
- The **masked-branch** piece generation (the masked-mirror law `srcX+dstX+w==40`, partially
  in hand — `maze-masked-mirror.json`, `maze-doorrecess-source.json`); the gap is the exact
  per-piece (src, dst, mode) list for settled frames.
- The **dither phase** (texture noise; caps several views at ~84%).

**Approach (staged, checkpointed — this is uncertain research):**
1. Resume the branch; confirm no-regression on the current gated views.
2. Crack `FUN_1c94` cover/REPLACE on **one** #077 gate view (the gy121-f2 gate look-back,
   currently ~97.9%) → drive it to **100%** via the deferred span-queue (not OR). This is
   the make-or-break checkpoint.
3. Generalize to all entrance fixtures (`maze-freeroam-parity` → 100%).
4. Validate on the interior sample (§4).

**Decompiler-resistant residual:** the slot-helper generation law (wmaze 0x3828/0x3c11/
0x3dce/0x4892) + the settled-frame masked piece list have resisted the decompiler — expect
live instruction-tracing (`trace-maze.ts` `doorturn`/`gatecaplist`/`depthemit`) and
frame-isolated captures, not a clean static read.

## 4. Interior capture (gates both pieces)

The §2 door-poke drive also captures a **representative sample** of interior viewport
fixtures (engine framebuffer per interior `(cell, facing)`) — the ground truth that gates
the render in the interior. **Not** all interior cells (that's a huge live capture) — a
sample chosen to exercise distinct geometry (corridors, junctions, doors-from-the-far-side,
dead-ends) past the entrance, enough to prove the renderer generalizes. Committed as
`maze-interior-*.idx.gz` (+ recipes in `tools/dosbox/state-catalog.ts`).

Caveat (recorded in #091): the engine reachability/viewport capture is live-driven; door
edges are poked open for the BFS but interior viewport fixtures should be captured with the
door states the player would actually see (force the specific door, then screenshot).

## 5. Testing & gates

- **Movement (A):** `maze-faithful-movement-parity.test.ts` — BFS reaches the interior
  component; per-(cell,facing) verdict parity over the expanded reachable set.
- **Render (B):** `maze-freeroam-parity.test.ts` entrance views at **100%** (the #077 win);
  a new `maze-interior-parity.test.ts` (or extended cases) gating the sampled interior
  fixtures at 100%.
- **e2e:** extend the door-walkthrough path — force a door, walk into the interior, navigate;
  assert the viewport stays byte-exact vs interior fixtures (the convergence gate).
- Also fold in the small **closed-door render gap** found during diagnosis: the free-roam
  renderer draws a closed door as a plain wall (no door graphic) at the door cell facing the
  door — the engine shows a wooden door. Fix in the render slice.

## 6. Risk & staging

- **Piece A** is low-risk and bounded — implement first; it ships the explorable interior
  and directly resolves the "worse as you move" symptom.
- **Piece B** is the project's hardest, longest-open problem. Stage with hard checkpoints
  (resume branch → one view 100% via the deferred path → generalize → interior). **If B
  stalls** at the draw-path crack (it has resisted ~10 prior passes), the **fallback ship is
  movement-faithful + recognizable render** (the probe showed interior cells render
  recognizably), with B continuing as a research thread under #077. The plan should make B's
  checkpoints explicit stop-and-reassess points, not an all-or-nothing.

## Cross-references

- TODO **#091** (this effort), **#087** (collision model / collmap engine-oracle navigator —
  already built), **#086** (coverage sweep tooling), **#077 / #084** (render generation law).
- RE: `docs/re/findings/maze-headon-recess-emit.json` (deferred-renderer conceptual law),
  `maze-masked-mirror.json`, `maze-doorrecess-source.json`, `maze-deepdoor-drawpath.json`,
  `maze-collision-model.json`.
- Tooling: `tools/libretro/trace-maze.ts` (`collmap`, `doorturn`, `gatecaplist`, `depthemit`,
  `w16`), `tools/parity/build-passability.ts`, `tools/parity/build-viewport-oracles.ts`.
- Branch to resume for Piece B: `feat/deferred-maze-renderer`.
