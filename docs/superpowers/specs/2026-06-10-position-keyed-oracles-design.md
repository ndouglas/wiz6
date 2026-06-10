# Position-keyed capture-replay oracles (level-0) — design

**Date:** 2026-06-10
**Status:** approved (brainstorming) → ready for implementation plan
**Sub-project of:** "complete the dungeon" (gameplay layer). Bug fix to the capture-replay
faithful-rendering path shipped under #086.

## Problem

The faithful level-0 renderer (capture-replay, #086) returns the engine's pre-captured
framebuffer for each first-person view, looked up by **`viewConfigKey`** — a key built
**only from wall-edge geometry** (`front`/`cornerL`/`cornerR`/`leftSide`/`rightSide`/
`bounded`/`inRegion` per depth + the head-on-door depth). It contains **no decoration
data**. The oracle builder (`build-viewport-oracles.ts`) and the capture step
(`trace-maze.ts collcapture`) both dedup by this key, so two cells with identical wall
geometry but **different decoration sprites** (`special4`/`orient2` planes) collapse into a
single captured oracle. The renderer serves whichever cell was captured first to all of
them.

**Symptom (user-reported):** in the central room, one treasure chest renders correctly at
every distance; the symmetric chest "on the other side" turns into a different object (a
candlestick) when viewed up close — it is being served its geometric twin's oracle.

**Measured (evidence):** of 293 engine-reachable `(gx,gy,facing)` views, only **266** were
ever captured — the 27 colliding views' real framebuffers were dropped at capture time.
A probe (`viewConfigKeyFor` grouping + per-cell `special4` of the frustum) found **4 real
decoration-aliased groups, 29 reachable views affected**:

| Group | Views (share one oracle) | Decoration conflict |
|---|---|---|
| 1 | `(126,125..128, f3)` — 4 views | `special4=4` on a side at one depth vs none (minor) |
| 2 | `(127,124,f1)` vs `(127,132,f1)` — 2 views | `special4=9` ahead vs `special4=1` ahead — **a central chest** |
| 3 | `(126,133,f0)` vs `(128,133,f0)` — 2 views | `s7`/`s13` vs `s5` — **the symmetric "either side" chests** |
| 4 | `gx18..25` cluster — 21 views | various `special4` vs none — **warp-only**, currently unreachable |

Total: **4 groups, 29 views** (8 central + 21 far). Groups 1–3 are the user-visible central
room (reachable by walking — group 2/3 are the chests). Group 4 is the far `gx18-25`
warp-only cluster — invisible until warps/stairs land, but the same bug.

## Goal

Every engine-reachable level-0 view renders its **own** engine framebuffer. No two distinct
views ever share an oracle. The faithful-rendering guarantee (#086) becomes complete and
decoration-correct.

## Approach — key oracles by exact position, not wall geometry

Replace the wall-geometry lookup key with the exact **`(gx,gy,facing)` position key**
(`"gx,gy,facing"`). A position key structurally **cannot alias** — each reachable view maps
to itself. Capturing all 293 reachable views then makes every reachable position byte-exact.

Why position-keying over enriching `viewConfigKey` with the decoration planes: it is
strictly simpler, cannot alias by construction (no need to prove the decoration fields are
complete), and the cross-cell "one oracle serves an identical-geometry corridor"
generalization the geometry key provided is exactly what introduced the bug — and it saved
only 27 of 293 entries anyway. For a fully-captured per-level approach, per-position is the
honest model.

The capture is cheap: **293 cached engine states already exist** in
`/tmp/wiz6-collmap-states/` (`n-<gx>_<gy>_<facing>.state`, one per reachable view, written
by the `collmap` BFS). Re-capturing all 293 is just dropping the dedup and replaying each
cached state through the existing framebuffer grab — no re-driving, and it naturally covers
the warp-only cells too.

### Components

1. **Capture — `trace-maze.ts collcapture`**
   Currently iterates `cm.reachable` but writes one oracle per **distinct `viewConfigKey`**
   (`repByKey` dedup, ~line 4277) → 266 files. Change: iterate `cm.reachable` directly and
   write one oracle per `(gx,gy,facing)` (filename `maze-freeroam-gxNN-gyNN-fF.idx.gz`),
   loading each from its cached state → **293 files**. No other capture logic changes.
   Prereq: patched core built (`tools/libretro/build-core.sh`) + host
   (`tools/libretro/build.sh`); states regenerable via `trace-maze.ts collmap` if `/tmp`
   was cleared.

2. **Asset builder — `build-viewport-oracles.ts`**
   Key each case by **`posKey = "gx,gy,facing"`** instead of `viewConfigKeyFor(...)`. Remove
   the `if (byKey.has(configKey)) continue` geometry dedup (positions are unique). Emit
   `posKey` per case; drop the now-vestigial `configKey` field. Output: **293 cases** to
   `tools/parity/fixtures/engine/maze-viewport-oracles.json` + `extracted/maze/
   viewport-oracles.json`.

3. **Renderer — `render.ts`**
   `capturedViewports` lookup changes from
   `o.capturedViewports.get(viewConfigKeyFor(block, party))` to a position key
   `` `${party.gx},${party.gy},${party.facing}` ``. Absent key → fall through to the
   generation path (unchanged, graceful). The `capturedSpans` generation-path mechanism
   (separately keyed by `viewConfigKey`) is **untouched**.

4. **Viewer — `data-loader.ts`**
   `loadMazeViewportOracles` builds the `Map<string, Uint8Array>` keyed by `posKey` (from
   each case's `gx,gy,facing`) instead of `configKey`.

### Data flow

```
collmap (engine BFS) → /tmp/wiz6-collmap-states/*.state (293 cached views)
  → collcapture (no dedup) → 293 maze-freeroam-*.idx.gz oracle frames
  → build-viewport-oracles.ts (posKey, no dedup) → viewport-oracles.json (293 cases)
  → viewer loadMazeViewportOracles → Map keyed by "gx,gy,facing"
  → render.ts capturedViewports.get("gx,gy,facing") → byte-exact engine frame
```

## Error handling

- Absent position key (non-reachable cell / future level) → generation-path fallback;
  never throws (matches the current `capturedViewports` graceful pattern).
- Missing cached state during capture → `collcapture` logs it (existing `missing-state`
  counter) and continues; the build/parity gates then surface the coverage gap.

## Testing

- **Capture-replay parity (gate):** `maze-capture-replay-parity.test.ts` updated to assert
  **all 293** reachable views replay byte-exact (was 266). Each view's render equals its own
  committed oracle.
- **Anti-regression coverage gate (NEW — the test that would have caught this):** assert the
  committed oracle set has exactly one case per reachable `(gx,gy,facing)` and covers the
  full reachable set from `maze-reachability.json` (293, no missing, no duplicate posKey).
  This makes a future decoration-bearing view impossible to silently drop.
- **Aliasing spot-check (NEW):** for the 4 previously-aliased groups, assert the member
  views now resolve to **distinct** oracles (different `viewportB64`/bytes) — proving the
  decorations are no longer collapsed.
- **Manual smoke:** `pnpm dev:viewer`, walk to both central chests, confirm each renders
  correctly (no chest↔candlestick swap) at every distance; spot-check a corridor still
  renders.

## Scope / deferred (YAGNI)

- **Level-0 only** — matches the rendering + movement scope. Other levels need their own
  collmap + capture.
- **Far warp-only cluster (group 4)** — captured + fixed by the all-293 sweep, but only
  *visible* once warps/stairs land (a later sub-project). No extra work here.
- **No `viewConfigKey` removal** — it stays the key for the generation-path `capturedSpans`
  and the coverage tooling; only `capturedViewports` switches to position keys.
- **Asset size** — 266→293 cases (~+10%, ~1.8MB gzip+base64). Negligible.

## References

- The bug's origin: #086 capture-replay (`build-viewport-oracles.ts`, `render.ts`
  `capturedViewports`, `maze-capture-replay-parity.test.ts`), `viewConfigKey` in
  `packages/parser/src/maze/view-config.ts`.
- Capture machinery: `trace-maze.ts collcapture` / `collmap`; cached states in
  `/tmp/wiz6-collmap-states/`; engine reachability fixture
  `tools/parity/fixtures/engine/maze-reachability.json` (293 reachable views).
- Decoration planes: cell `special4` (decoration sprite) + `orient2` (orientation gate),
  per #084 (`docs/re/findings/maze-*` decoration findings).
