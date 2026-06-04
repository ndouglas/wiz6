# Maze corridor frame — pixel-exact composer (foundation)

**Date:** 2026-06-03
**Status:** Design approved; implementation plan pending.
**Related RE:** `docs/re/findings/wmaze-render-in-egadrv.json`, `egadrv-blit-internals.json`, `wmaze-uv-texture.json`; `docs/re/wmaze-functions.md`. Tracking: `TODO.md` #076.

## Goal

Render the zone-0 first-person corridor reference frame (party facing the green
portcullis gate) in the viewer, **pixel-exact** against a committed engine
fixture, at full **320×200**. This is the first visible payoff of the maze RE and
the **scaffold** for a general maze renderer later.

Explicitly a single static frame: one zone (0), one position/facing (the gate
approach), one animation phase. A general renderer (arbitrary position/facing/
zone) is **out of scope** — it depends on the wall-driver U/V mapping that the RE
has not yet isolated (`egadrv-blit-internals.json` "needs_follow_up").

## What we know (RE inputs)

- **Viewport:** screen rect x72–247 (w176), y32–143 (h112), inside the full
  320×200 frame. The rest is UI chrome (Wizardry banner top; 3 party portraits/
  status on the left, 3 on the right).
- **Geometry tables** (live-confirmed, DGROUP-relative):
  - convergence columns @0x42 (left) = {0,104,128,144}, @0x4a (right) =
    {0,216,192,176} per depth 0..3 — the corridor opening narrows toward the
    vanishing point (~x160) with depth.
  - per-walltype texture-seam screen columns @0x36e4 (wt0) / @0x3717 (wt2),
    stride 0x13a.
  - per-slot walltype array @0x5220 (0 = open, 2 = solid stone side wall).
- **Texture content:** floor (cobblestone), ceiling (stone brick), converging
  stone side walls, far green gate. We do **not** have the source-texture decoder
  or the exact per-column U/V sampling law, so textures are obtained by
  extracting the rendered regions from the engine frame (the framebuffer oracle).

## Approach (approved)

**Geometry-positioned composition with frame-extracted textures, convergence-scaled.**

1. Read the geometry tables to derive the on-screen quad rects (corridor opening
   per depth from the convergence columns). This logic **generalizes** to other
   corridors.
2. Extract the side-wall texture at the **nearest depth (depth 0)** from the
   engine frame, and **scale it across depths via the convergence tables** to
   fill the converging trapezoids — so the convergence math is genuinely under
   test (not a verbatim per-slice copy-back).
3. Extract floor, ceiling, and the far gate as their own pieces, placed at their
   geometry-derived rects.
4. Compose into the 176×112 viewport, then assemble the full 320×200 frame with
   the surrounding chrome.

### Honesty note on what parity proves here

Because textures are extracted from the same frame, where pieces fully tile a
region, extract-and-place is near-identity — so pixel-parity is a **regression
gate**, not a deep correctness proof. The genuine validation in *this* milestone
is the **convergence-scaling** of the side walls (sub-decision A): if the
convergence interpretation is wrong, the scaled wall will not line up and parity
fails. Deep correctness of the floor/ceiling/U-V sampling comes in the
generalization milestone (needs the driver RE). The primary deliverables here
are the **visible maze view**, the **composer + asset pipeline**, and the
**reusable geometry-placement code**.

## Components

### 1. Engine fixture
- A `maze-corridor` recipe in `tools/dosbox/state-catalog.ts` replaying the
  documented drive (boot → castle-3 party via ADD PARTY MEMBER ×3 → START NEW
  GAME → ENTER through the narration to the gate frame; see
  `wmaze-uv-texture.json` drive_recipe and `tools/libretro/trace-maze.ts`).
- `build-state.ts <maze-corridor>` → committed
  `tools/parity/fixtures/engine/maze-corridor.{idx.gz,png}` (recipe-replay;
  deterministic from the pinned roster).
- **Animation phase:** the maze runs an idle/torch animation (the 0x4e0b loop).
  The recipe must settle to a **fixed, deterministic phase** so the fixture is
  byte-stable across rebuilds. Extraction bakes that phase into the pieces, so
  the composer reproduces it automatically; the only requirement is a stable
  capture (fixed settle frame count). If a single settle proves non-deterministic
  under dosbox-pure, fall back to a committed serialize-state (`--mint`-style),
  per the creation-rolls precedent.

### 2. Asset extraction
- A `tools/parity/extract-maze-tiles.ts` extractor that, from the engine fixture
  frame, cuts: depth-0 left/right side-wall strips, floor region, ceiling region,
  far gate region — each as RGBA + its source rect. Commit as
  `packages/viewer/src/data/maze-corridor-tiles.json` (base64 RGBA per piece +
  rects) so the viewer loads it like other data assets.
- The convergence/seam/walltype values are encoded as constants (with a doc
  pointer to the live source) in `@wiz6/data`, not extracted at runtime.

### 3. Composer (pure)
- `packages/viewer/src/pages/game/compose-maze-view.ts` (alongside
  `castle-frame.ts`, the existing full-screen composer analog): inputs =
  geometry constants + extracted tiles; output = the 176×112 viewport RGBA,
  with the convergence-scaling for the side walls. Pure function (no DOM).
- A thin full-frame assembler composes viewport + chrome into 320×200. Chrome
  (banner + 6 party portraits/status) reuses the existing
  `party-panel-render.ts` / `castle-frame.ts` rendering where it fits; any
  banner/background not covered by existing code is extracted as static for this
  frame.

### 4. Parity test
- `tools/parity/maze-corridor-parity.test.ts`: compose the full 320×200 →
  compare to `maze-corridor.idx.gz` via `compareRgba`, **tolerance 0, 100% floor**.

### 5. Viewer integration
- A route (e.g. `/game/maze`, or a `screens` index entry) renders the composer
  output through the existing `Presenter`/canvas path. Manual browser smoke per
  the project convention (load the page, eyeball vs the engine).

## Testing

- Pixel-parity gate (above) is the automated check.
- Manual smoke: `pnpm dev:viewer`, open the maze route, eyeball.
- (No e2e in this milestone — there is no interactive navigation yet.)

## Out of scope / follow-ups

- Arbitrary position/facing/zone rendering (needs the wall-driver U/V RE —
  `egadrv-blit-internals.json` needs_follow_up; the load-time copier watch).
- Proper source-texture decoding (4-plane EGA from the zone asset blocks).
- Interactive dungeon navigation + e2e.
- Floor/ceiling perspective sampling correctness (currently extract-and-place).

These remain tracked under TODO #076.
