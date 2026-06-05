# Byte-Exact START NEW GAME Sequence — Design

**Date:** 2026-06-05
**Status:** Approved (design); plan to follow.
**Supersedes** the first-pass entry sequence (`2026-06-05-faithful-start-new-game*.md`, already merged) — that shipped a narration strip over the static chrome with the wrong (baked) party. This reworks it to **byte-exact, full-screen, per-frame** parity with the engine, and fixes the party + background bugs.

## Goal

Make the START NEW GAME entry sequence match the engine **pixel-for-pixel, full screen, every frame**: the "ENTERING…" title card → narration → 3-step gate-walk → "HMMMM…" bump → free control. Render the **live party panel** (the player's actual party), the **dungeon viewport** (the gate, via framebuffer-oracle), and the correct **per-frame bottom-strip background**. The copy-protection (magicword) screen is **skipped entirely**.

## Engine ground truth (RE-verified, byte-exact)

Per `docs/re/findings/maze-newgame-byteexact.json` + committed deterministic fixtures `tools/parity/fixtures/engine/newgame-seq-{02..06}.idx.gz` (each re-mints 100% from a committed serialize-state). Every frame = **top chrome (y0–31)** + **live party panels (x0–71 / x248–319)** + **dungeon viewport (`MAZE_VIEWPORT` x72–247, y32–143)** + **bottom strip (y144–199)**. The party panel is **pixel-identical to MASTER OPTIONS** (reuse `party-panel-render.ts`) and does not animate during the sequence.

| Frame | Party pos | Bottom strip (y144–199) | Text | Advance |
|---|---|---|---|---|
| **02 ENTERING title** | gy=117 | **gray widget (idx 8)** | blue (idx 1) "ENTERING" / "BANE OF THE COSMIC FORGE" — msg **1212+1213**, centered y161/169 | auto / ENTER |
| **03 narration** | gy=118 | **clean BLACK (idx 0)** | yellow (idx 5) 3 lines — msg **10010–12**, y153/161/169 x=8 | ENTER dismisses |
| **04 walk** | gy=119 | **gray widget** (normal) | — | ENTER steps |
| **05 walk** | gy=120 | **gray widget** | — | ENTER steps |
| **06 HMMMM bump** | gy=121 | **clean BLACK** | yellow "HMMMM…" — msg **10020**, y153 | → free control |

- **The black strip** = the engine's message window (`msg_show_short_in_window` @ wmaze 0x58ed → `ui_window_create(col0,row19,w40,h5,attr0x14)`, window y152–191 + the engine blacks y144–151/192–199). It hides the gray OPTIONS/TURN widget. **This is the bug in the shipped version** — we drew the narration *over* the gray widget instead of blanking to black.
- **Viewport:** the inner gate / corridor is the **banked tile-0/1 atlas + a free-running flicker** → not renderable byte-exact by our pipeline. For this **fixed scripted sequence** we **framebuffer-oracle** it: each frame's viewport is the committed frozen-state image (the same near-identity approach as the original corridor port). Party-independent, so it composes with any live party.
- **02-vs-03** is a party step (gy117→118), not a gate animation. **Copy-protection** = msg 1050 + 3 random symbols + a cursor — **omitted**.

## Architecture & data flow

```
START NEW GAME → initGameSession(level, entryMode:'title')   [party = scriptedEntry.start, gy=117]
  /game/maze  — entry FSM (sub-modes of the live dungeon view):
    'title'     → render frame 02 (oracle vp + live panel + gray widget + blue title)   — ENTER → 'narration'
    'narration' → frame 03 (oracle vp + panel + BLACK strip + yellow narration)         — ENTER → 'gate-walk'
    'gate-walk' → frames 04/05 (oracle vp + panel + gray widget) ; ENTER forced-steps    — after 2 steps → 'bump'
    'bump'      → frame 06 (oracle vp + panel + BLACK strip + "HMMMM…")                  — ENTER → 'free'
    'free'      → live renderMazeViewport + gray OPTIONS/TURN widget ; arrows move
```

Note the step count: the scripted start moves to gy=117 (title), then gy 117→118 (title→narration is the first forward), 118→119→120→121 across the walk. The FSM is keyed off the committed frame sequence + the party gy, not a guessed step count — the plan pins the exact per-ENTER transitions against the fixtures.

### Components

- **Framebuffer-oracle viewport** (`@wiz6/parser` + a browser asset): extract each scripted frame's `MAZE_VIEWPORT` rect from the committed fixture, commit as a small per-frame viewport asset (browser-served via `extracted/`), and composite it. Pure + isomorphic; a per-frame lookup keyed by entry sub-mode/position.
- **Live party panel:** replace `composeMazeFrame()`'s static baked panel with `party-panel-render.ts` driven by the **active party** (the `ActivePartyStore`/roster) — the central bug fix. Used for BOTH the entry sequence and free-roam.
- **Bottom-strip renderer:** per entry sub-mode, draw the correct background (gray widget vs clean black) + text (title 1212/1213 blue; narration 10010–12 yellow; HMMMM 10020 yellow; none for walk). Reuse the gated `narration-strip` helper, extended for the gray-widget + title cases.
- **Entry FSM:** extend `entry-sequence.ts` with `title` + `bump` sub-modes (current: narration/gate-walk/free). Pure, unit-tested.

## Parity / testing

- **Full-screen per-frame byte-exact gates (tol 0)** for frames 02–06: seed the committed 6-member roster (the fixtures' party), compose (live panel + oracle viewport + bottom strip + chrome), compare the **full 320×200** to `newgame-seq-0N.idx.gz`. Because the viewport is oracle'd (byte-exact by construction) and the panel/strip/chrome are rendered, the gate is a real test of the rendered regions + a 100% full-screen match. Document which regions are rendered vs oracle'd.
- **FSM unit tests:** title→narration→gate-walk→bump→free; the per-ENTER party transitions; arrows inert in scripted modes.
- **e2e:** create a party → START NEW GAME → assert each frame (title/narration/walk/bump) → free control (arrows turn). Replace the prior narration-only e2e.

## Deferred (explicit)

- The copy-protection (magicword) screen — **skipped by design**.
- A *generated* (non-oracle) dungeon viewport for the entry frames — the oracle is the byte-exact path for this fixed sequence; the general renderer is the banked #079 work.
- The title card's exact auto-timing (engine ~8 frames) — the port advances it by ENTER or a short fixed delay (a UX detail; parity gates the frame, not the wall-clock).
- OPTIONS/camp menu (free-roam ENTER), gate-open mechanic, multi-level — as before.

## References

- RE: `docs/re/findings/maze-newgame-byteexact.json`, `maze-newgame-sequence-frames.json`, `maze-entry-{narration,sequence}.json`. Fixtures+states: `tools/parity/fixtures/engine/newgame-seq-*`, `test-fixtures/states/newgame-seq-*`, recipes in `tools/dosbox/state-catalog.ts`. Capture: `tools/libretro/freeze-newgame-states.ts`.
- Existing: `packages/viewer/src/pages/game/{MazeView.tsx,compose-maze-frame.ts,party-panel-render.ts}`, `game/game-session-store.ts`; `packages/parser/src/maze/{entry-sequence,narration-strip}.ts`; `packages/data/src/maze/level-schema.ts`.
