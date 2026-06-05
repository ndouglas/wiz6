# Faithful START NEW GAME — Design

**Date:** 2026-06-05
**Status:** Approved (design); implementation plan to follow.
**TODO:** #078. Builds on the shipped walkable-dungeon MVP (`2026-06-05-walkable-dungeon-mvp*.md`).

## Goal

Replace the walkable MVP's instant jump-to-free-control with the engine's **faithful entry
sequence**: after scenario pick, the party stands at the outer gate while a **narration**
prints on the bottom message strip; ENTER dismisses it and then **walks the party forward 3
cells** to the inner front-wall, where **free control** (arrows) begins. The narration text
strip is gated **pixel-exact** against an engine fixture.

## What the engine does (RE-established)

From `docs/re/findings/maze-entry-{narration,sequence}.json` (live deltas + framebuffer):

- **One `game_state` (5) throughout, two input sub-modes:**
  - **Scripted entry (narration + gate-walk):** **ENTER only; arrows dead.** The party starts
    at **gx=127, gy=118, z=0, facing=0**. The 1st ENTER dismisses the narration text; each
    subsequent ENTER steps **forward one cell** (facing-0 ⇒ gy+1): gy 118→119→120→**121**
    (exactly **3 steps**).
  - **Free-roam:** begins at **gy=121** (= the committed `maze-corridor.state`; the walkable
    MVP's entrance). Arrows move; ENTER = "PRESS RETURN FOR OPTIONS" (camp — deferred).
- **Narration:** 3 lines = msg IDs **10010 / 10011 / 10012** (`"APPROACHING THE GATE WITH
  CONFIDENCE,"` / `"YOU KNOW IF THINGS GET TOO HAIRY YOU "` / `"^CAN ALWAYS TURN AND RUN BACK
  OUT..."`; `^` = anchored-x format code → left-aligned at x=8 here). Decoded **exactly** in
  `extracted/messages/msg.json` (no #025 dependency). Rendered as **white text (palette idx 5)
  on the black bottom message strip (idx 0)**, over the undimmed live dungeon view — **no
  window border**. Display routine `msg_show_short_in_window` @ wmaze 0x58ed.
- **"HMMMM..."** (msg **10020**) = the front-wall bump at gy=121 (ENTER into the wall ahead).
- **Mode flag:** there is **no single DGROUP byte** for scripted-vs-free; it's wmaze-internal
  CPU state. We model it in the session as an FSM keyed off **walk-steps-remaining**.

## Architecture & data flow

```
START NEW GAME (scenario pick) ──▶ initGameSession(level, entryMode:'narration')
     party at the SCRIPTED START (gy = entrance.gy − 3 along facing-0 = gy 118), facing 0
                          │
   ┌──────────────────────┴───────────────────────────────────────────────┐
   │  /game/maze — entryMode FSM (sub-mode of the live dungeon view)        │
   │                                                                        │
   │  'narration'  ── ENTER ──▶ 'gate-walk' (stepsRemaining = 3)            │
   │     bottom strip = narration text (10010–12)                          │
   │                                                                        │
   │  'gate-walk'  ── ENTER ──▶ step forward 1 (tryStepForward), steps−−    │
   │     bottom strip = (engine shows the dungeon's normal strip here)     │
   │     when stepsRemaining == 0  ──▶ 'free'                              │
   │     arrows: dead                                                       │
   │                                                                        │
   │  'free'  ── arrows move (turn/step) · ENTER = OPTIONS (deferred no-op) │
   │     bottom strip = movement widget (existing) · ENTER@wall = "HMMMM…" │
   └────────────────────────────────────────────────────────────────────────┘
```

The renderer (`renderMazeViewport`) is unchanged — it already draws any `(cell, facing)`. The
new work is **the entry FSM + the bottom-strip render states + per-mode input dispatch**. The
party still uses the existing `MazeParty` / `tryStepForward` (the 3 scripted steps are just
`tryStepForward` calls driven by ENTER instead of ↑).

### Components / files

- **`@wiz6/data`** — extend `DungeonLevel`/session: a `scriptedEntry` for the level (the
  scripted start = `entrance` shifted 3 cells back along its facing, `steps: 3`, the narration
  msg-ID list `[10010,10011,10012]`, the bump ID `10020`). Derive the start from `entrance`
  (don't hardcode a second coordinate that can drift). `GameSession` gains `entryMode:
  'narration' | 'gate-walk' | 'free'` + `stepsRemaining`.
- **`@wiz6/parser`** — a pure entry-FSM reducer: `advanceEntry(session, block) → session`
  (ENTER in narration → gate-walk; ENTER in gate-walk → step + decrement → free at 0). Pure,
  isomorphic, unit-tested. Reuses `tryStepForward`.
- **`@wiz6/viewer`**
  - `data-loader`: decode the narration lines from the loaded `msg.json` (IDs 10010–12; strip/
    handle `^`). The viewer already loads `msg.json`.
  - `MazeView`: bottom-strip render state machine — **narration text** (white idx5 on black
    idx0, lines at y=153/161/169, left margin x=8, the existing message-render/font path) vs
    the existing **movement widget** vs the **"HMMMM…" bump**. Per-mode keydown: ENTER advances
    the FSM in narration/gate-walk (arrows ignored); arrows move in free; ENTER in free is a
    deferred no-op (OPTIONS out of scope).
  - `StartNewGamePage`: init the session in `entryMode:'narration'` at the scripted start.

## Parity / testing

- **Pixel-parity (region-gated):** the narration text strip vs
  `tools/parity/fixtures/engine/maze-entry-narration.idx.gz`. Gate the **bottom message strip
  rect (text band y=153..174 within the strip y=144..199)** at tolerance 0 — **exclude** the
  dungeon view above (partial-fidelity in our port, by design) and the run-to-run mouse-cursor
  corner (x=313..319, y=184..190). `compareRgba` currently has only a global tolerance, so the
  gate compares a **cropped rect** of our compose vs the fixture (or we add the named-region
  support flagged in CLAUDE.md's TODO — prefer the simple crop for this screen).
- **Unit:** the entry FSM reducer (narration→gate-walk→free; exactly 3 steps; arrows inert in
  scripted modes; party ends at gy=121 facing 0). The narration-decode (IDs→3 lines, `^`
  handled).
- **e2e (Playwright):** create a party → START NEW GAME → assert the narration strip renders →
  ENTER → (walk) → ENTER ×3 → assert free control (arrow turns the view) at gy=121.

## Deferred (explicit)

- The **OPTIONS / camp menu** (ENTER in free-roam) — a no-op for now (separate feature).
- The **gate-open mechanic** beyond the "HMMMM…" bump (the inner gate is a hard stop for the MVP).
- The exact wmaze **scripted→free mode-flip handler** branch (we model the FSM behaviorally;
  static-disasm pin is a follow-up only if byte-fidelity needs it).
- **Multi-level** scripted entries (level-0 only; the start derives from `entrance` + facing).
- **Full-frame** narration parity (the dungeon behind is the banked partial renderer — only the
  text strip is gated).

## References

- RE: `docs/re/findings/maze-entry-narration.json`, `maze-entry-sequence.json`,
  `maze-start-new-game.json`, `maze-harness-movement.json`. Fixture +
  `tools/libretro/capture-narration-fixture.ts`.
- Existing: `packages/viewer/src/pages/game/{MazeView.tsx,StartNewGamePage.tsx}`,
  `game/game-session-store.ts`; `packages/parser/src/maze/movement.ts`;
  `packages/data/src/maze/level-schema.ts`; `data-loader` `loadMessageDb`.
