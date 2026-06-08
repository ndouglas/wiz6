# Implementation Plan — Dungeon renderer: crack the placement-generation law (pixel-parity)

**Goal:** The first-person maze viewport renders the floor/ceiling background AND decorations
(fountains/windows/etc.) correctly for ANY `(cell, facing)` — fixing "mostly black" + "wrong angles" —
at pixel-parity. Root cause: the engine's **placement-generation law** (which background/decoration piece
is drawn where, per cell/facing/depth) is uncracked, so the live renderer only has a captured call-list
for one frame (gy=121) + walls-over-black elsewhere.

**Direction (user-confirmed 2026-06-08):** resolve the capture tooling wall by RE-MINTING maze fixtures on
the patched trace-core (the old committed `.idx.gz` can't load there), then crack the generation law via
live capture, wire it into `renderMazeViewport`, and re-establish pixel-parity vs the new fixtures.

**Prior RE (build on, don't redo):** renderer is in ega.drv (#076); wall rasterizer algorithm fully RE'd;
classify/projection law largely pinned (`maze-classify-projection.json`); from-asset background 99.9% for
gy=121 via a CAPTURED call-list (#077); the generation (emit) law + decoration placement-selection are the
open pieces (`maze-callist-generation.json`, `maze-placement-selection.json`). Tooling-wall root cause:
`maze-piece-inventory.json` (patched core can't unserialize the committed nightly-format states).

## Stage 1: Re-mint a maze fixture SET on the patched core (resolve the capture wall)
**Goal:** A committed set of maze states + framebuffers, all on the patched (traceable) core, spanning
views that exercise the generation law (entrance, straight corridor at multiple depths, junctions, and
decoration cells — the fountain/window).
**Deliverables:** `tools/dosbox/state-catalog.ts` recipes (or a mint harness) that drive to each position;
committed `test-fixtures/states/maze-*.state.gz` (patched format) + `tools/parity/fixtures/engine/maze-*.idx.gz`(+png);
a per-fixture record of `(cell, facing, z)` + the level-0 cell data at/around it.
**Success:** every new state unserializes on the patched core + re-renders byte-exact to its committed
`.idx.gz`; the set covers ≥1 decoration view (fountain) + multiple corridor depths.
**Status:** FOUNDATION + ARBITRARY-VIEW CAPTURE PROVEN.
  (a) `trace-maze reach` drives to the maze + serializes a patched-core state; `trace-maze calibrate`
      RELOADS it in a FRESH process + redraws (re-mint resolves the capture wall).
  (b) **Party-POKE capture works** (`tools/libretro/probe-maze-poke.ts`): writing the DGROUP party fields
      (facing 0x4f9a / z 0x4f9c / cellA 0x4f9e / cellB 0x4fa0 / gy 0x4fa2 / gx 0x4fa4) + step(4) re-renders
      ANY (cell,facing,z) view (pokes STICK — not snapped back by the scripted entry; the maze rebuilds
      every frame). Region-0 mapping: cellA = gy−116 (×8 axis), cellB = gx−120 (×1 axis), gxBase=120
      gyBase=116. This SIDESTEPS the unreliable free-roam navigation (driveToMaze lands mid-scripted-entry
      gy~120 where arrow-turns are inert). 6 views captured (/tmp/pk-*.png).
  REMAINING: poke a SET of views spanning depths/junctions + the decoration cells (level-0 has 73
  special4≠0 cells; special4=7 column at gx126 just W of entry — IDENTIFY which special4 is the fountain
  by poking head-on views + eyeballing), commit framebuffers as `maze-*.idx.gz` + a `(cell,facing,z)`+
  level-data catalog.

## Stage 2: Capture the placement call-lists + classify state across the set
**Goal:** For each fixture, the per-frame OR/masked placement call-list (`trace-maze` placements capture)
+ the classify/projection state (slot codes, depth, orient2/special4 planes).
**Deliverables:** committed captured call-lists per fixture; a table mapping `(cell-data, facing, depth)` →
emitted placements; findings JSON `docs/re/findings/maze-generation-law.json` (evidence-anchored).
**Success:** the captured data is reproducible (re-run the capture → same calls) for each fixture.
**Status:** DONE (capture tool + initial dataset). `trace-maze pokeview <gx> <gy> <facing>` (NEW phase,
verified) captures a reproducible blit call-list for ANY zone-0 view (poke party → serialize → in-place
turn recompose at ega.drv FUN_0a93). 4 views captured + committed (`docs/re/findings/maze-views/v1..v4.json`):
gy121f0 (31 calls, == committed oracle list), gy119f0 (34), gx127f3 (decoration), gx126gy117f0 (occluded).
CAVEAT: parity-EVEN open views are byte-reproducible; parity-ODD/blocked masked PAIRINGS oscillate run-to-run
(only the placement-index SET + pass length + OR list + mirror law are deterministic there).
**Findings:** `docs/re/findings/maze-generation-law.json`.

## Stage 3: Derive the generation law (the deep RE)
**Goal:** A pure function `(MazeBlock, party) → call-list` that reproduces the captured placements for every
fixture — the depth-banked piece selection + projection. Static-RE the wmaze depth loop (0x4c60) + slot
helpers (0x3828/0x3c11/0x3dce/0x4892) where the decompiler allows, cross-checked against the captures.
**Deliverables:** `packages/parser/src/maze/callist-gen.ts` (pure) + unit tests vs the captured lists;
findings promoted to prose.
**Success:** generated call-list == captured call-list for all Stage-1 fixtures (byte-exact).
**Status:** INDEX ARITHMETIC CRACKED (`maze-index-arithmetic.json`, byte-exact, 6 views). Laws pinned across two passes:
(1) frame parity `(gx+gy+facing)%2` selects the blit BRANCH — even → direct forward OR blits, odd →
whole-frame MASKED MIRROR; (2) the masked branch is a horizontal MIRROR about page col 20 / screen px 160
(`src.destX + dst.destX + dst.w == 40`); (3) depth-bank structure (ceiling 122.., floor = ceiling+28,
per-depth wall/corner/door families back-to-front + 6 constant top-strips 346..361); (4) per-depth cell-data
(forward-edge code + side solidity + special4) selects the piece FAMILIES.
**THE CRACK:** `placementIndex = base + depth`, where `base` is a COMPILE-TIME IMMEDIATE pushed at each emit
call site (NOT slot-code table arithmetic — which is why the decompiler's table-lookup hunt failed; there is
no table). Found by hand-disasm of the emit fns `wall_emit_quad` 0x406c / `wall_emit_corner` 0x45b4 /
`top_strip_emit` 0x4a15 (the slot helpers only classify + seed gates). Implemented as `EMIT_BASES` +
`placementIndex(base,depth)` + `generateSkeletonIndices(visibleDepths)` in `callist.ts`; gated by
`tests/maze/index-arithmetic.test.ts` (33 tests, byte-exact vs v1/v2/v5/v6 captures).
GATE-SEEDING — OCCLUSION-STOP CRACKED (`maze-gate-seeding.json`, byte-exact ceiling/floor skeleton, all 4 views):
the per-depth VISIBILITY gate [0x5042] (wmaze 0x407d gates ceiling/floor inside wall_emit_quad) is clear for
depths `[0..stop]`, where `stop` = first depth whose FORWARD edge OCCLUDES:
`front==2 (solid) OR (front==3 AND cornerL solid AND cornerR solid)` (a CLOSED doorway). A plain door with ≥1
OPEN corner is see-through and does NOT cap. This resolves the v1-vs-v2 door puzzle exactly (v1 door@d2 closed
→ caps `[0,1,2]`; v2 door@d1 has an open corner → no cap `[0,1,2,3]`; v5 solid@d1 → `[0,1]`; v6 closed-door@d0
→ `[0]`). Implemented as `frontOccludes`/`computeVisibleDepths`/`generateCallist(block,party)` in `callist.ts`
(derived from block+party, NO captured frame) + 33-test gate. `cornerL`/`cornerR` DRY-moved to maze-geometry.ts.
WALL-FAMILY SEEDING — PARTIAL (`maze-wall-family-seeding.json`): two sub-families now byte-exact:
(a) CLOSED-FRONT NEAR-WALL (when computeVisibleDepths==[0], the capped view fills with NEAR_WALL idx0 +
corner-L 83 + corner-R 87) → v6's FULL OR set now generated byte-exact; (b) SIDE-WALL surface LADDER index
arithmetic (slot Δp emits LEFT {134−4Δp, 134−4(Δp−1)}, RIGHT {138,142}) — byte-exact vs v1's left/right runs.
DECISIVE STRUCTURAL FINDING: side-wall surfaces are NOT capped by the front occlusion stop (v5 front-caps at
depth 1 yet its left wall renders all 4 perspective slots) — the ceiling/floor walk and the side-wall surface
walk are INDEPENDENT. RESIDUE (the LAST piece): the per-side surface EXTENT (which perspective slots each side
wall spans) — the engine's perspective ray-march / classifier post-pass (wmaze 0x3931/0x3946/0x3951 seeding
[0x5072..0x50a2]). BLOCKER FOUND: pokeview does NOT re-run the BUILD loop (only a genuine party MOVE does;
write-watches on the span list 0x50d0 + slot array 0x5220 saw ZERO writes on a poked turn) — so the
depth-keyed `depthemit` trace reads stale garbage. Unblock = a navigation-reach harness (real moves to each
geometry) OR data-driven extent inference (pokeview CAPTURE still works — decompose many side-wall captures →
the extent law). Hypothesis to test: extent == the contiguous solid-side-cell run. Ceiling/floor + v6 DONE.

## Stage 4: Wire generation into `renderMazeViewport` + decorations
**Goal:** The live renderer builds the background page (floor/ceiling) AND decorations from the generated
call-list, under the walls — no more "mostly black", fountains at correct angles.
**Deliverables:** `renderMazeViewport` uses `callist-gen` + `composeBackgroundFromAsset`; MazeView wires it.
**Success:** `pnpm dev:viewer` → dungeon shows floor/ceiling + decorations; manual smoke across views.
**Status:** Not Started

## Stage 5: Pixel-parity gate
**Goal:** Full-viewport byte-exact parity vs the re-minted fixtures, promoted from diagnostic to gate.
**Deliverables:** `maze-view-parity.test.ts` (tol 0) over the Stage-1 fixture set; e2e drive sampling a few.
**Success:** gate-tier parity green in CI across the fixture set.
**Status:** Not Started
