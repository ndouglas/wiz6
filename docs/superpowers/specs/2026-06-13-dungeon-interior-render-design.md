# Byte-Exact Level-0 Interior Rendering — Design (#091 Piece B)

**Date:** 2026-06-13
**Status:** Design approved; spec under review.
**Supersedes/extends:** This is **Piece B** of `docs/superpowers/specs/2026-06-12-dungeon-interior-capture-design.md`. Piece A (movement-first interior capture via door-poke) was **falsified and abandoned** (see TODO #091 / `docs/re/findings/maze-door-movement-gate.json`): the engine's forward-step gate is the unobservable per-frame render-classify computation (#087), so doors can't be poked open for the engine's own navigation. Piece B reaches the interior by driving the engine's **real** door-open instead, and targets **rendering** (the byte-exact first-person view), not the collision model.

---

## Problem

Within the captured level-0 entrance island (266 configs / 293 views), the first-person dungeon view renders **byte-exact** via committed viewport-oracles (#086) and movement is engine-faithful (#087). The moment the party steps **past a forced door into the interior**, there are no captured oracles, so the view falls back to the **generation path**, whose off-axis fidelity is broadly broken (#086 measured mean ~55.7%). Symptom (manual smoke 2026-06-12, after #089 shipped FORCE/PICK doors): "garbled / wrong walls, worse as you move."

**Goal:** make the level-0 **interior** (the cells reachable past the force-doors) render **byte-exact**, identical to how the entrance renders now.

**Non-goal:** other dungeon levels (need the stairs/teleporter mechanic, currently unimplemented — `warp` verdicts are no-ops); the general generation-law crack (#077/#084); engine-faithful interior *collision* (#087, banked).

---

## Approach

Generalize the proven #086 **capture-replay** pipeline to the interior. The pipeline downstream of capture is **unchanged**: engine framebuffer → per-`(gx,gy,facing)` oracle → `build-viewport-oracles.ts` → `viewport-oracles.json` → `renderMazeViewport(capturedViewports)` returns the engine viewport verbatim → byte-exact, gated by a pixel-parity test and an e2e walking test.

The **one new capability** is getting the engine's camera into interior cells, which requires driving the engine through an **opened door**. This session (2026-06-12) proved the engine cannot be *poked* through a door (the static door fields don't gate forward movement; the gate is the per-frame render-classify, #087). But the engine opens doors for real via the FORCE/PICK mechanic (#089). So the capture navigator drives the **real force-open**, then navigates and captures beyond it.

### Load-bearing decision: force once, freeze, then BFS

Re-rolling the RNG force on every interior capture would be slow and flaky (each re-roll can fail or trigger combat). Instead, each door is opened **once**: drive to it, force it open, step through, then **serialize that live state as a transient interior-seed state**. The existing `engcap` BFS is then run **seeded from that state** (reusing engcap's re-drive-from-serialized-state machinery verbatim — only the seed swaps). Consequences:

- The force RNG and any combat are handled exactly **once per door**, not per cell.
- The seed `.state` is a throwaway **capture-time artifact** — never committed. The build-specific serialize problem (#090) does not bite us, because only the resulting oracle `.json` is committed (and a single capture run uses one consistent core).

### Hard gate: feasibility spike first

Driving the live engine through a real force-open and navigating beyond it is **unproven** in the harness (the #089 recipes drive *to* the door and open the FORCE menu, but never drive a successful force + step-through). So **Stage 0 is a spike that must pass before any further building**. It also resolves a secondary open risk: whether the harness's START-NEW-GAME path produces a **forceable party member** (FORCE requires a member with STR).

---

## Stages

### Stage 0 — Feasibility spike (decision gate)

A new `trace-maze.ts` phase (e.g. `forcethrough`):

1. Drive to free-roam (`driveToFreeRoam`) and navigate to the (124,121,f2) lock-3 door (reuse the #089 path: `left, up, up, up, left` → lands in the door cell facing the door edge).
2. Run the engine's real OPTIONS→OPEN→FORCE→WHO flow: `enter` (PARTY OPTIONS) → `right down enter` (OPEN → detect type-7 door → FORCE/PICK/EXIT menu) → select FORCE → WHO-WILL-TRY picker → pick a member → observe the roll outcome (success / failure / jammed).
3. On RNG failure, re-enter the menu and retry up to N attempts. On combat trigger (game_state → 0x0a/0x0b), detect and abort that attempt, then retry.
4. On success, step forward (`up`) and read the live party position.

**Pass criterion:** the party reaches **(124,120)** (gy 121→120), i.e. it actually walked through the opened door. Report: success/failure, attempts needed, whether combat triggered, whether a forceable member existed, final position.

**Branch on outcome:**
- **Pass →** proceed to Stage 1 (Approach 1, automated).
- **Fail →** stop and escalate; the documented fallback is **Approach 2 (semi-manual seed)**: a human (or a one-shot script) drives through each door region once to mint an interior-seed state, then Stage 1's BFS-from-seed proceeds. (Same downstream; only seed creation changes.)

### Stage 1 — Door-aware interior capture

Extend `engcap` (and/or `collmap`):

1. **Seed creation** — for each openable level-0 force-door on the *current* reachable frontier (from `extracted/maze/doors.json`: e.g. (124,121,f2), (124,123,f0), (130,121,f2), (130,123,f0), (124,129,f2), (124,131,f0), (125,130,f3), (129,130,f1), (130,129,f2), (130,131,f0); the two welded (22,12) doors are excluded — they can't open): drive → force open (Stage-0 routine) → step through → serialize `interior-seed-<door>.state`. **Doors are discovered iteratively**: opening one door and BFS-capturing the region beyond it can reveal *further* interior doors on that region's frontier, which are then opened and captured in turn — the process expands until no new openable door / reachable cell remains.
2. **Interior BFS capture** — run engcap's BFS seeded from each interior-seed state, capturing a framebuffer oracle per reached `(gx,gy,facing)` (same capture path as the entrance island; warps excluded, encounter-dodge retry as in the existing `engcap all`).
3. **Coverage logging** (CLAUDE.md "no silent caps"): log every reachable interior cell *not* captured and every door that could not be opened.

Spot-check during development: confirm (124,120) and a handful of interior cells are captured and their oracles decode to plausible corridor/room views.

### Stage 2 — Wire + gate

1. `build-viewport-oracles.ts` merges the interior oracles with the existing entrance set → a larger `tools/parity/fixtures/engine/maze-viewport-oracles.json` + served `extracted/maze/viewport-oracles.json`. **Viewer wiring is unchanged** (`loadMazeViewportOracles` just loads a bigger map).
2. **Pixel-parity gate:** extend `maze-capture-replay-parity.test.ts` to cover the interior configs (the composed RGBA must equal the engine oracle, **100% floor** — byte-exact).
3. **e2e walking gate:** extend `packages/viewer/e2e/maze-walk-*.spec.ts` to place the party in the interior past an open door and pixel-assert interior viewports against the new oracles. Use the existing **DEV-only state-injection hook** to position the party with the door already open, sidestepping the port's RNG force in the e2e (the deterministic-force dev hook is a separate #089 deferred item and is **not** a prerequisite here).
4. **Manual smoke:** `pnpm dev:viewer`, force the (124,121) door open, walk into the interior, eyeball that the view now renders correctly while moving.

---

## Data flow

```
live engine framebuffer
  → engcap capture (176×112 EGA-index .idx.gz per (gx,gy,facing))
  → build-viewport-oracles.ts (merge entrance + interior)
  → viewport-oracles.json (gzip+base64, posKey-keyed)
  → loadMazeViewportOracles → renderMazeViewport(capturedViewports)
  → byte-exact viewport (verbatim engine pixels on a config match)

Gates:
  pixel-parity test: composed RGBA  == committed oracle (100%)
  e2e walking test:  port canvas     == committed oracle (through an open door)
```

---

## Error handling

- **RNG force failure:** retry up to N attempts; if a door never opens, report it (don't silently skip — drop is logged, coverage noted).
- **Combat during force:** detect game-state transition to a combat state (0x0a/0x0b), abort the attempt, retry; if combat is persistent at a door, document it as a coverage gap.
- **No forceable member:** caught by the Stage-0 spike; if the harness party can't force, the spike fails → fallback path.
- **Spike failure (engine won't traverse a real-opened door):** stop, escalate, fall back to Approach 2 (semi-manual seed).
- **Capture under-coverage:** every reachable interior cell not captured is logged; the parity gate only asserts the configs we committed, so an uncaptured cell shows as a generation-path fallback (visible in manual smoke), never a false "covered."

---

## Testing

- **Stage 0:** the spike *is* its own test — does the party reach (124,120) through a real force-open?
- **Stage 1:** spot-check captured interior cells decode to plausible views; coverage log reviewed.
- **Stage 2:** pixel-parity gate (interior configs byte-exact, 100% floor) + e2e walking gate (port matches oracle through an open door) + manual browser smoke.

---

## Risks & open questions

1. **(Primary) Real force-then-navigate in the harness is unproven** — the entire approach depends on Stage 0 passing. Mitigated by making it a hard gate before any build.
2. **Forceable party member** in the START-NEW-GAME harness path — confirmed or refuted by the spike.
3. **Combat encounters** mid-force or mid-interior-navigation — handled by detect-and-retry; persistent combat at a door is a logged coverage gap, not a failure of the whole effort.
4. **Interior size / asset growth** — the entrance set is 266 configs ≈ 1.66 MB; the interior will grow `viewport-oracles.json`. Acceptable (gzip + base64, lazy-loaded), but note if it balloons; a per-region split is a future option, not this piece.
5. **Frozen views** — replayed views don't animate the door-seam flicker (already accepted for the entrance; correct-but-static beats animated-but-wrong).

---

## What this explicitly does NOT do

- Crack the generation law (#077/#084) — we capture instead.
- Fix engine-faithful interior **collision** (#087, banked) — this is rendering only; movement past the door uses the shipped table where captured and the existing fallback elsewhere.
- Reach other dungeon levels — needs stairs/teleporters (warp verdicts), out of scope.
- Open welded doors — they bound unreachable regions.
