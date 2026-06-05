# Walkable Dungeon MVP — Design

**Date:** 2026-06-05
**Status:** Approved (design); implementation plan to follow.

## Goal

Make the dungeon **walkable**: create a party → **START NEW GAME** → enter the starting
dungeon level → **turn (L/R) and step (forward)** around it, with the first-person view
recomposed **engine-faithfully** per `(cell, facing)` from the **real decoded map**, and
wall/door collision (you can't walk through walls). This is a faithful reimplementation of
Wizardry VI's **discrete grid-stepper** dungeon — not free-roam: at a cell, facing N/E/S/W,
the view is one of a finite, deterministic set keyed by the local geometry.

This turns the current dead-end (START NEW GAME → a stub) into actual play, and it makes the
heavily-RE'd maze renderer finally *used*.

## Key decisions (settled in brainstorming)

- **Engine-faithful rendering (not a clean procedural look).** We're reimplementing the
  original; the view must match the engine.
- **A1 — finish the from-geometry renderer.** Render any `(cell, facing)` from map data via
  the maze-arc pipeline (`renderMazeViewport`), rather than replaying captured frames (A2).
  Because the game is discrete, the remaining view-cases are a **finite, bounded** set.
- **From-disk map extractor** for the starting level (the real reimplementation; reusable for
  all levels), building on the cell-wall format + region resolver already RE'd. Capturing a
  live `MazeBlock` is the fallback if the extractor stalls.
- **Pure-traversal scope.** Deferred: encounters/monsters/combat, items/chests/treasure,
  NPCs/dialogue, stairs/level-transitions, traps, automap, the camp/OPTIONS menu, and
  session save/load.

## Architecture & data flow

```
BUILD-TIME
  game files ──[@wiz6/cli extract-mazedata]──▶ starting-level map
              (MazeBlock: region planes + gxBase/gyBase tables + per-cell N/W walls + doors)
              ──▶ committed JSON in extracted/

RUNTIME (@wiz6/viewer)
  START NEW GAME ──▶ [scripted intro? see below] ──▶ GameSession {
                       level: <loaded map>,
                       party: { cell (cellA,cellB,z), facing } at the entrance
                     }
  keydown:  ◄/► turn (facing ±1 mod 4)   ↑ step forward IF maze_can_step_in_facing(open)
            ──▶ update GameSession.party ──▶ renderMazeViewport(level.mazeBlock, party)
            ──▶ indices → RGBA → canvas
```

The renderer is a **pure function of (map, party)** — the same input contract
`renderMazeViewport(block, party, assets)` already has. Movement only mutates the party
`{cell, facing}` in the session and re-invokes it.

## Stages (dependency-ordered; the plan details them)

**Stage 1 — Map extractor.** `@wiz6/cli` `extract-mazedata`: decode the starting level's cell
map from the game files into the `MazeBlock` shape the renderer + movement consume (region
planes indexed `regions[r][cellA*8+cellB]`, the `gxBase/gyBase` tables, per-cell N/W 2-bit
walls + door/decoration fields). Builds on `docs/re/findings/maze-classify-{projection,gating}.json`
(the resolver + cell-wall format) and `tools/parity/decode-asset.ts` (the SCENARIO.DBS/header
access already cracked). **Validate** byte-exact against a captured-live `MazeBlock` (same
discipline as `decode-asset`'s 24/24 zones). *(RE + impl.)*

**Stage 2 — Renderer completion (the RE-heavy bulk; the banked maze-arc tail).** Finish
`renderMazeViewport` to draw **every** discrete view-case byte-exact:
- Port the remaining wall jump-table handlers (junctions/corners/front-walls + far-shape
  walls — statically decoded in `docs/re/findings/maze-{classify-gating,span-build}.json`).
- Key the floor/ceiling/window **background call-lists per depth/opening config** — the
  finite-capture sidestep for the decompiler-blocked *generation* (`docs/re/findings/
  maze-callist-generation.json`): enumerate the small set of distinct configs, capture each
  call-list once (the reliable first-render harness, `maze-capture-harness.json`), key by the
  local geometry config. Decoders are all cracked (`maze-{expander,masked-mirror,floor-ceiling-decoder}.json`).
- Each view-case gated **byte-exact** vs an engine fixture (corridor/junction/corner/door/dead-end).
*(This is the work banked at decoder-complete; the discreteness makes it finite. Expect
multiple sub-tasks/passes.)*

**Stage 3 — Traversal wiring.** `@wiz6/viewer`:
- A `GameSession` store (party `{cell, facing}` + the loaded level), analogous to the existing
  `ActivePartyStore`/`RosterStore`; `PositionSchema`/`MazeStateSchema` already exist in `@wiz6/data`.
- A real **START NEW GAME** handler: load the starting level + place the party at the entrance
  + navigate to `/game/maze` (replacing the `/castle/start-new-game` stub).
- `/game/maze` rebuilt: read the session, `renderMazeViewport` per position, and key handling
  (◄/► turn, ↑ step with the RE'd `maze_can_step_in_facing` collision, wmaze 0x3244). *(Impl.)*

## The scripted intro (ordering flexibility)

START NEW GAME in the engine isn't an instant jump to free movement — there's a **scripted
entry sequence** (the entry narration; `ENTER` = "PRESS RETURN FOR OPTIONS" dismisses it — see
`maze-harness-movement.json`). The exact ordering of (scenario pick → scripted intro → first
controllable frame at the entrance) will be **pinned during implementation** by observing the
engine; Stage 3's START-NEW-GAME handler may need a scripted-intro step before handing control
to free traversal. The plan should treat the START→entrance ordering as discoverable, not fixed.

## Parity / testing

- **Stage 1:** extractor output == captured-live `MazeBlock`, byte-exact.
- **Stage 2:** per-view-case pixel-parity gates (tolerance 0) vs committed engine fixtures —
  one per distinct case the starting level exercises.
- **Stage 3:** a Playwright e2e that creates a party, START NEW GAME, then turns/steps and
  pixel-asserts the canvas vs engine frames at a few cells; plus unit tests for the movement
  reducer (turn wrap, collision no-op at walls/doors) and the session store.

## Deferred (explicit, not in this MVP)

Encounters/monsters/combat · items/chests/treasure · NPCs/dialogue · stairs/level-transitions ·
traps · automap · camp/OPTIONS menu · session save/load · multi-level map extraction (Stage 1
does the starting level only).

## References

- Renderer + schemas: `packages/parser/src/maze/{render,classify,build,flush,compositor,page,
  background,callist,maze-data}.ts`; `packages/data/src/maze/render-schema.ts` (`MazeBlock`,
  `MazeParty`); `packages/data/src/schemas/save.ts` (`PositionSchema`, `MazeStateSchema`).
- Maze RE: `docs/re/findings/maze-*.json` (esp. classify-projection/gating, callist-generation,
  capture-harness, masked-mirror, expander, asset-loader); `docs/re/findings/maze-harness-movement.json`
  (movement keys + `maze_can_step_in_facing` 0x3244 + the scripted entry narration).
- Asset/header access: `tools/parity/decode-asset.ts`, `tools/parity/expand-asset.ts`.
- Existing flow: `packages/viewer/src/{router.tsx,App.tsx}`, `pages/castle/*`,
  `pages/game/{MazeView.tsx,compose-maze-frame.ts}`, the `*-store.ts` stores.
- Banked outcome / remaining maze work: `docs/superpowers/plans/2026-06-04-maze-renderer-port.md` (Outcome).
