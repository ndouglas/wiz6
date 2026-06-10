# Deferred maze renderer — design

**Date:** 2026-06-09
**Status:** approved (brainstorm); pending implementation plan
**Tracks:** #085 (see-through gate), #084/#077 (renderer residuals — partially)

## Problem

The first-person maze renderer is an *approximation* of the engine's renderer, and the approximation has hit its ceiling on see-through door views.

Our renderer composites in two independent steps: an **OR background** (`FUN_0a93` — additive OR/masked blits of `mazedata.ega` placements: floor, ceiling, side panels, portcullis) plus a **wall pass** (`FUN_1c94` — textured "cover" spans) drawn on top. This reproduces normal corridors at 99.9% and 30/32 captured wall-cases byte-exact.

It **cannot** reproduce a head-on door (the entrance portcullis viewed from inside, gy127/gy121 facing 2). The engine draws that as a *see-through* gate: narrow bars with the dungeon corridor receding behind them, visible in the gaps. Our additive OR can't layer the gate *over* the corridor (`a | b == b | a` — OR can't cover), so we draw solid bars over black and miss the hallway behind. The best we reach is 97.93%, and the residual is structural, not a missing piece.

The engine's actual algorithm is now fully reverse-engineered (`docs/re/findings/maze-headon-recess-emit.json`, `maze-doorrecess-source.json`): a **two-phase deferred renderer** where the see-through is a consequence of **back-to-front draw order**, not masking. This spec ports that renderer.

## Goal & scope

Replace our two-step approximation with the engine's deferred two-phase pipeline.

**Success bar (scoped — "faithful base + fix the gate"):**

- The see-through door / recess / lookback views (gx127 gy121 f2, gx127 gy122 f2, and the gate lookbacks) render **byte-exact** (new pixel-parity gates).
- Every other maze view stays **≥ its current parity** — no regression:
  - canonical corridor (gx127 gy121 f0) stays **100%**,
  - the 30/32 byte-exact wall-cases stay byte-exact,
  - the freeroam off-axis views stay ≥ their current floors,
  - the masked-mirror / decoration / generated-corridor gates stay green.
- **Out of scope (deferred follow-up):** chasing the remaining #084 residuals (dither phase, off-axis masked-mirror side walls) to byte-exact. The deferred renderer is the faithful base those would build on, but we do not pursue them in this effort.

## The engine's algorithm (what we port)

`view_render_corridor_frame` (wmaze 0x4ad7) is a **two-phase deferred renderer**:

**① BUILD** — depth loop (0x4c60), depth `d = 0 → 3` (near → far). For each depth it *classifies* the cell's edges (front face, sides, corners) and **queues** draw records tagged with `depthField = d` — it draws nothing yet. The records are of two kinds:
- OR / masked background placements (floor, ceiling, side panels, portcullis frame) — `FUN_0a93`.
- `FUN_1c94` textured wall / door spans (the cover rasterizer), the engine's 11-byte span queue at DGROUP 0x50d0.

Occlusion (`wall_occlude_forward` 0x4892) clamps the depth bound **only** when the forward edge is a *solid wall* (edge code 2 or ≥5). A **door (code 3) does not occlude** — the loop keeps walking and emits the full corridor behind the door.

**② FLUSH** — draws the queued records **back-to-front**: outer loop counts depth **down**, `d = 3 → 0`, drawing every record whose `depthField == d`. So the deepest pieces blit first and the **depth-0 gate blits last, on top**. Its bars land over the already-painted corridor; the gaps reveal the corridor underneath.

**The see-through is pure painter's order** — no per-pixel mask, no clip-to-opening. The "missing hallway" is simply the corridor-behind that our occluding, unordered renderer never drew.

## Architecture

```
renderMazeViewport(block, party, assets):
  list = buildDrawList(block, party)          // ① BUILD  (pure)
  page = flushDrawList(list, wb, assets)      // ② FLUSH  (back-to-front)
  full = decodePageIndex(page)
  return crop(full, MAZE_VIEWPORT)
```

### What changes
- A single **ordered, depth-tagged draw list**, replacing "OR background page, then all walls on top."
- The flush is strictly **back-to-front** so near pieces cover far ones.
- Doors stop occluding, so the corridor-behind is emitted.
- The accreted per-view special cases collapse into the uniform per-depth classify+emit (see Consolidation).

### What is reused unchanged (this is a consolidation, not a greenfield)
- **Both blit primitives are already ported and byte-exact:**
  - OR / masked background — `background.ts` `composeBackground` / `applyMaskedMirror`.
  - `FUN_1c94` cover spans — `compositor.ts` `renderPieceCall` (including the per-span x-clip ported 2026-06-09).
- The classify / seam / index-arithmetic laws — `classify.ts`, `build.ts`, the `EMIT_BASES` (`base + depth`), the occlusion-stop, the masked-mirror law (`src.destX + dst.destX + dst.w == 40`).
- `maze-data.ts` (placement expansion), `page.ts` (4-plane → index decode).

## Components & module boundaries

`packages/parser/src/maze/`:

- **`drawlist.ts` (new)** — the `DrawRecord` type and the BUILD phase.
  - `DrawRecord = { depthField: number; kind: 'or' | 'masked' | 'span'; … }` where the payload is the existing per-kind data (an OR placement index; a masked src→dst+mode pair; a `MazeSpan`).
  - `buildDrawList(block, party): DrawRecord[]` — pure. Walks depths 0→3, classifies, emits the records. Reuses `classify.ts` (amended so a door no longer occludes) + the existing emit laws.
- **`flush.ts` (extended)** — `flushDrawList(list, wb, assets): Uint8Array` — iterate the list back-to-front (depth 3→0), dispatch each record to its primitive (`composeBackground` / `applyMaskedMirror` / `renderPieceCall`) onto one page.
- **Reused unchanged:** `background.ts`, `compositor.ts`, `maze-data.ts`, `page.ts`.
- **`render.ts`** — `renderMazeViewport` orchestrates BUILD → FLUSH → decode → crop.

### Consolidation
The deferred BUILD law subsumes the special-case branches that accreted in `callist.ts`: `isHeadOnDoorArchway` / `ARCHWAY_FRAME`, `headOnDoorAheadStop`, `generateDeepDoorRecess`, the parity-odd whole-frame branch, the near-flank-masked helpers. These become a single per-depth classify+emit. The rewrite **removes** this code, not just adds to it.

## Migration & regression strategy

Build-alongside, switch-when-green:

1. Implement the deferred path (`buildDrawList` + `flushDrawList`) as a **new** entry, leaving the current `renderMazeViewport` path working throughout.
2. Validate the new path against **every existing gate** before switching: corridor 100%, wall-cases ≥30/32 byte-exact, freeroam ≥ current floors, masked-mirror / decoration / generated-corridor green.
3. Pin the one open RE detail — the exact **interleaving + cover order** of OR-background placements vs `FUN_1c94` spans within the back-to-front flush — **per view against the live captures** (`trace-maze.ts` doorturn / freeroam / placements). The corridor (100%) and the 30 wall-cases are the guardrail that the ordering is correct.
4. Flip `renderMazeViewport` to the deferred path only once all gates hold; add **new byte-exact gates** for the see-through views.
5. Delete the old OR-page-then-walls path + the subsumed special-case branches.

## Testing

- The existing pixel-parity suite is the **regression net** — every current gate must hold (no cell-grid substitution; pixel-parity is the gate, per project convention).
- **New byte-exact pixel-parity gates** for the see-through door/recess views (gx127 gy121 f2 + the gate lookbacks), against committed engine fixtures.
- The canonical corridor's 100% is the **canary**: if the back-to-front ordering or the OR/`FUN_1c94` interleaving is wrong, it breaks first.
- Manual browser smoke (`pnpm dev:viewer`): walk to the gate, turn, confirm the see-through hallway renders.

## Risks

- **Interleaving + cover order (primary).** Today OR-background and `FUN_1c94` are two phases; the engine interleaves them per depth in one back-to-front flush. The exact order is the one piece not fully pinned statically. Mitigation: validate per-view against captures; the corridor + wall-cases gate it; resolve view-by-view rather than big-bang.
- **Scope / blast radius.** Touches every maze view. Mitigation: build-alongside + the full existing gate suite as the net; stage the work (the implementation plan decomposes it).
- **`FUN_0a93` vs `FUN_1c94` for floor/ceiling.** Findings differ on whether the corridor floor/ceiling are OR placements or `FUN_1c94`; our OR background reproduces corridors at 99.9%, so OR is at least sufficient there. The deferred renderer must preserve that. Resolve empirically during BUILD against the corridor gate.

## References

- `docs/re/findings/maze-headon-recess-emit.json` — the deferred two-phase law, door-non-occlusion, back-to-front flush.
- `docs/re/findings/maze-doorrecess-source.json` — FUN_0a93 OR vs masked branches; uniform source math.
- `docs/re/findings/maze-callist-generation.json`, `maze-index-arithmetic.json`, `maze-masked-mirror.json` — the emit laws reused.
- TODO #085 (gate residual), #084/#077 (deferred residuals).
