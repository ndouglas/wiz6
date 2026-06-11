# OPTIONS menu shell (in-dungeon command menu) — design

**Date:** 2026-06-10
**Status:** approved (brainstorming) → ready for implementation plan
**Sub-project of:** "complete the dungeon" (gameplay layer). This is the **prerequisite
shell** for the in-dungeon command menu. Doors (OPEN), and SPELL/USE/REST/DISK/SEARCH/
ORDER/REVIEW, are each separate follow-on sub-projects that wire into this shell.

## Problem

The dungeon shows "PRESS RETURN FOR OPTIONS" but the port has no command menu — Return
does nothing in free-roam. Every in-dungeon action (open a door, cast, use an item, rest,
save, review a character) is reached through this menu, so it gates a large slice of
gameplay. In particular, **doors** are opened via this menu (OPEN → Force / Pick / Key);
an earlier RE spike (`docs/re/findings/maze-door-open-mechanic.json`, parent-corrected)
established there is no bump-to-open — the OPTIONS menu is the door-opening entry point.

## Goal

Build the **menu shell**: pressing Return in free-roam opens the engine-faithful "PARTY
OPTIONS" command grid; the player navigates it and selects a command; every command
dispatches through a single seam (all stubbed for now); EXIT/Escape closes back to
free-roam. Byte-exact rendering of the menu strip. No command behaviors yet.

## Ground truth (captured)

`trace-maze.ts screencap n-127_121_0.state enter` shows the menu is an **in-place overlay**
— pressing Return in free-roam keeps `game_state == 5`; only the **bottom strip** changes
from the movement widget to a "PARTY OPTIONS" header + a 3×3 command grid. The maze
viewport, party panels, and top bar are unchanged. The grid (column-major labels, cursor
starts on SEARCH, top-left):

```
 SEARCH   USE    REST
 REVIEW   OPEN   DISK
 SPELL    ORDER  EXIT
```

The SEARCH cursor renders as highlighted (red) text. Reference capture committed at
`tools/parity/fixtures/engine/options-menu-search.idx.gz` (+ `.png`).

## Approach — in-place overlay, MazeView-local UI state

No new game-state. `MazeView` gains an `optionsMenu` UI state `{ open: boolean;
cursorIndex: number }`. In free-roam (`entryMode === 'free'`):
- **Return** → open the menu (cursor = SEARCH, index 0).
- **Arrow keys** → move the cursor over the 3×3 grid (capture the keys; the party does NOT
  move while the menu is open).
- **Return** on a cell → `dispatchOptionsCommand(cmd)`.
- **EXIT** cell selected, or **Escape** → close the menu, restore the free-roam strip.

The maze viewport render path is untouched; only the bottom-strip composition changes when
the menu is open.

### Components

1. **`packages/parser/src/maze/options-menu.ts`** (pure)
   - `OPTIONS_COMMANDS`: the 9 commands in grid order with their `(col,row)` positions and
     labels. Grid (col,row), col-major labels:
     `(0,0)SEARCH (0,1)REVIEW (0,2)SPELL | (1,0)USE (1,1)OPEN (1,2)ORDER | (2,0)REST (2,1)DISK (2,2)EXIT`.
   - `type OptionsCommand = 'search'|'review'|'spell'|'use'|'open'|'order'|'rest'|'disk'|'exit'`.
   - `moveOptionsCursor(index, dir: 'up'|'down'|'left'|'right'): number` — 2-D grid
     navigation matching the engine's `menu_grid_select` (wmaze 0x1574). The exact
     wrap/clamp behavior is **pinned during implementation** via the harness (drive arrows,
     observe the cursor) — see Open RE items.
   - `commandAt(index): OptionsCommand`.
   - Pure + total; no I/O.

2. **`compose-options-strip.ts`** (composer; sibling of the castle `compose-action-menu.ts`)
   - Renders the "PARTY OPTIONS" bottom-strip region (header + 3×3 grid + highlight at the
     cursor) into the framebuffer, byte-exact vs the engine fixture.
   - Must get right: the **highlight attr-sign** (colored-text vs inverse — the SEARCH
     cursor looks like colored text; confirm against the fixture per the attr-sign lesson in
     CLAUDE.md, do NOT infer colour from the cell) and the **blink phase** (the cursor
     likely blinks; the composer takes a `phase` flag, per the fixture-blink-phase playbook).
   - Reuses the existing tile-window / font rendering primitives; no new low-level rasteriser.

3. **`MazeView` wiring** (`packages/viewer/src/pages/game/MazeView.tsx`)
   - `optionsMenu` state; the key handler routes to menu-navigation when open, party-movement
     when closed. The render path composes the OPTIONS strip when `optionsMenu.open`.

4. **`dispatchOptionsCommand(cmd)`** (in MazeView or a small module)
   - The single dispatch seam. For the shell: **EXIT** closes the menu; every other command
     is a placeholder no-op that closes the menu (with a clear per-command hook + a TODO so
     wiring a real handler later — REVIEW→character view, OPEN→doors — is localized). No
     "not implemented" UI for now (shell scope).

### Data flow

```
free-roam + Return → optionsMenu.open=true (cursor 0)
  → render composes the PARTY OPTIONS strip (cursor highlight, blink phase)
  → arrows → moveOptionsCursor → re-render
  → Return → dispatchOptionsCommand(commandAt(cursor)) → (stub) close
  → EXIT/Escape → optionsMenu.open=false → free-roam strip
```

## Error handling

- Menu state is local UI state; closing always restores free-roam. A malformed/absent
  composer asset falls back gracefully (never throws; matches the maze render fallbacks).
- Keys are unambiguously owned: while `optionsMenu.open`, movement/turn keys drive the
  cursor only; while closed, they drive the party. No double-handling.

## Testing

- **Composer pixel-parity (gate):** `compose-options-strip` for the cursor-on-SEARCH state
  renders the strip region byte-exact vs `options-menu-search.idx.gz`. Add the other cursor
  positions once captured (one fixture per cursor cell, or a representative subset).
- **Navigation unit tests (gate):** `moveOptionsCursor` from each of the 9 cells × 4
  directions → the engine-correct next index (the table pinned via harness).
- **e2e walking-gate-style (gate):** drive the real app → free-roam → Return → assert the
  bottom-strip viewport matches the OPTIONS fixture → arrow(s) → cursor moves (strip
  changes) → Escape/EXIT → back to the free-roam strip. Uses the same
  `expectMazeViewportMatchesFixture`-style crop, retargeted to the bottom-strip rect.
- **Manual smoke:** `pnpm dev:viewer`, Return in the dungeon, eyeball the menu + navigate.

## Open RE items (pin during implementation, before claiming parity)

These are pinned via the harness (drive the menu, capture frames), not guessed:
1. **Cursor navigation** — `menu_grid_select` (wmaze 0x1574) wrap/clamp rules: does Down
   from the bottom row wrap to the top? does Left/Right wrap columns? Drive arrows from each
   cell, record the cursor index, build `moveOptionsCursor`'s table from observation.
2. **Highlight attr-sign + colour** — confirm the SEARCH highlight is colored-text (not
   inverse) and the exact palette index, against the fixture (per the CLAUDE.md highlight
   lesson). 
3. **Blink phase** — capture two phases of the cursor; give the composer a `phase` flag;
   freeze a deterministic phase in the e2e (per the fixture-blink-phase playbook).
4. **Strip rect + layout** — the exact (x,y,w,h) of the "PARTY OPTIONS" strip and the
   header/grid cell coordinates, measured from the fixture.
5. **Open/close triggers** — confirm Return opens (free-roam only) and both EXIT-cell and
   Escape close; capture the closed→open→closed strip transitions.

## Scope / deferred (YAGNI)

- **All 9 commands stubbed** — no real behaviors. EXIT + Escape close; others no-op-close.
- **The command sub-projects** (OPEN/doors, REVIEW, SPELL, USE, REST, DISK, SEARCH, ORDER)
  are each separate, layered on this shell's dispatch seam.
- **Level-0 / free-roam only** — the menu is only reachable from free-roam (not the entry
  cutscene).

## References

- Ground-truth capture tool: `trace-maze.ts screencap`; fixture
  `tools/parity/fixtures/engine/options-menu-search.idx.gz`.
- Sibling composer pattern: `packages/viewer/src/pages/castle/compose-action-menu.ts`
  (+ the row-199 baseline + highlight-attr-sign lessons in CLAUDE.md).
- Door-opening (the OPEN command's eventual target): findings
  `docs/re/findings/maze-door-open-mechanic.json` (parent-corrected: OPTIONS → Force/Pick/Key).
- Engine anchors: `menu_grid_select` wmaze 0x1574, `menu_redraw_item` 0x1539 (per
  `docs/re/wmaze-functions.md`).
- The e2e walking gate (the convergence pattern this reuses):
  `packages/viewer/e2e/maze-walk-*.spec.ts`, `docs/driving-based-testing.md`.
