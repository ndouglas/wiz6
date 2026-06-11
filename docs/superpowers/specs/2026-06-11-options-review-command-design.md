# OPTIONS → REVIEW command — design

**Date:** 2026-06-11
**Status:** approved (brainstorming) → ready for implementation plan
**Sub-project of:** "complete the dungeon" gameplay layer. The first real command wired into
the OPTIONS-menu shell (#088). Follow-on: OPEN→doors, SPELL, USE, REST, DISK, SEARCH, ORDER.

## Problem

The in-dungeon OPTIONS menu shell ships with all 9 commands stubbed (`dispatchOptionsCommand`
closes the menu). REVIEW should open the party's character view from the dungeon — the
character sheet + interactive action menu is already a comprehensive, pixel/e2e-gated port
(`CharacterViewPage` + `character-view-reducer.ts`, used by the castle review-member flow).

## RE findings (harness, 2026-06-11)

Driving the engine `OPTIONS → REVIEW`:
1. REVIEW opens a **"REVIEW WHO?" member picker** — an **in-place bottom-strip overlay**
   (game_state stays 5; the maze + panels stay visible behind). It lists the active party
   members + an EXIT cell; the cursor starts on EXIT. Reference fixture:
   `tools/parity/fixtures/engine/review-who-picker.idx.gz` (+ `.png`).
2. Selecting a member opens the **full character view** (stats / HP / armor class /
   equipment + the action menu: EQUIP TRADE SWAG USE SKILL REVIEW · SPELL ASSAY MERGE DROP
   EDIT EXIT) — **full-screen** (the maze is replaced). game_state still 5, so the engine
   invokes it as an in-place library call, but visually it's a full-screen swap. This is the
   SAME character view we ported.
3. EXIT on the picker (or the picker's EXIT cell) returns to free-roam.

Note: the dungeon char-view action menu shows a few commands beyond the ported set's
castle context (TRADE / USE / MERGE / DROP). Those are deferred (see Scope).

## Goal

Wire REVIEW end-to-end: `OPTIONS → REVIEW → "REVIEW WHO?" picker → pick member → the existing
character view → EXIT back to the dungeon`. Reuse the ported character view as-is. Byte-exact
"REVIEW WHO?" picker. No new char-view actions.

## Approach

Two pieces:

1. **"REVIEW WHO?" picker** — a new in-place `MazeView` bottom-strip overlay, the sibling of
   the OPTIONS-shell pattern (`compose-options-strip.ts` + the menu nav/state in MazeView).
   It lists the active party members (+ EXIT) and is navigable; selecting a member triggers
   the char-view navigation; EXIT/Escape closes back to free-roam.

2. **Reuse `CharacterViewPage` full-screen via a dungeon route + return-context.** The char
   view is full-screen, so it's a route navigation (not an overlay): a new
   `/game/review/:slotIdx` route renders `CharacterViewPage`. The page is router-coupled
   (EXIT → `navigate('/castle')`, in-view REVIEW → `navigate('/castle/review-member')`); add
   an **additive return-context** so dungeon entry returns to `/game/maze` (and the in-view
   REVIEW re-opens the dungeon picker), while **castle entry keeps its current behavior
   unchanged**. The session persists `entryMode:'free'`, so returning to `/game/maze`
   re-mounts MazeView straight into free-roam (no cutscene replay).

### Components

1. **`packages/viewer/src/pages/game/compose-review-picker.ts`** — composes the "REVIEW
   WHO?" bottom-strip overlay (header + party-member names + EXIT + cursor highlight),
   byte-exact. Sibling of `compose-options-strip.ts` (same tile/font/index-buffer approach,
   inverse highlight per the attr-sign lesson). Member names come from the active party.
2. **Picker nav + state in `MazeView`** — a `reviewPicker` UI state `{ open, cursorIndex }`;
   `dispatchOptionsCommand('review')` opens it; arrows navigate the member list + EXIT;
   select a member → navigate `/game/review/:slotIdx`; EXIT cell / Escape → close to free-roam.
3. **`CharacterViewPage` return-context (additive)** — a configurable exit/repick target
   (a prop or a small nav-store value, defaulting to the current castle targets). Dungeon
   entry sets EXIT→`/game/maze` and in-view REVIEW→the dungeon picker. The castle review-
   member flow is untouched (its pixel + e2e gates must stay green).
4. **`/game/review/:slotIdx` route** (`router.tsx`) — renders `CharacterViewPage` in dungeon
   return-context.

### Data flow

```
OPTIONS (open) → cursor REVIEW → Enter
  → dispatchOptionsCommand('review') → reviewPicker.open = true
  → MazeView composes the "REVIEW WHO?" strip (members + EXIT, cursor)
  → arrows navigate; Enter on a member → navigate('/game/review/<slotIdx>')
      → CharacterViewPage (dungeon return-context); all actions work
      → EXIT → navigate('/game/maze') → MazeView re-mounts in free-roam
  → EXIT cell / Escape on the picker → reviewPicker.open = false → free-roam strip
```

## Error handling

- Picker state is local UI state; closing always restores free-roam. Empty/short party →
  the picker lists only the present members (+ EXIT); a selected slot out of range falls back
  to EXIT (no crash). Matches the OPTIONS-shell graceful pattern.
- The char-view route guards an invalid `slotIdx` (the existing `CharacterViewPage` already
  redirects on an invalid slot — keep that, retargeted to the dungeon return).

## Testing

- **Picker pixel-parity (gate):** `compose-review-picker` renders the "REVIEW WHO?" strip
  byte-exact vs the engine fixture(s) (cursor on EXIT + each member; capture per-cursor
  fixtures in impl, as for the OPTIONS shell). Uses the pinned committed roster so member
  names are deterministic.
- **e2e (gate):** drive the real app `OPTIONS → REVIEW → pick member → char sheet renders →
  EXIT → back in the dungeon` (pixel-assert the picker strip + that the char view appears +
  that we return to free-roam). Mirrors `maze-options-menu.spec.ts`.
- **Castle regression:** the existing castle review-member pixel + e2e gates stay green
  (the return-context change is additive, castle-default).

## Open RE items (pin during implementation, before claiming parity)

1. **"REVIEW WHO?" picker layout + nav** — exact header/EXIT/member-cell coordinates, the
   grid order, and the cursor navigation (cursor starts on EXIT; how arrows reach members).
   Capture per-cursor fixtures via `trace-maze.ts screencap` (`enter,down,enter[,…]`).
2. **Member-cell labels** — confirm they're the party member names (THESUS/LYSANDR/TEMPEST in
   the reference roster) + the EXIT cell, and the highlight attr (inverse, per OPTIONS).
3. **Char-view invocation** — confirm full-screen (route nav) is faithful; confirm the
   re-mount of MazeView on return lands in free-roam (entryMode persisted 'free', no cutscene).
4. **In-view REVIEW re-pick** — selecting REVIEW inside the char view should return to the
   dungeon "REVIEW WHO?" picker (not the castle full-screen picker) when entered from the
   dungeon. Since the char view is a route (MazeView is unmounted while it's open), this is
   implemented by navigating back to `/game/maze` with an "open the review picker" intent
   (a query param or a small nav-store flag MazeView reads on mount). If that intent-passing
   proves fiddly, the slice may fall back to returning to plain free-roam (the player
   re-opens REVIEW manually) — decided during implementation, noted in the plan.

## Scope / deferred (YAGNI)

- **Reuse the ported char view as-is** — EQUIP/SPELL/ASSAY/SWAG/SKILL/EDIT/REVIEW already
  work; no new char-view actions.
- **The 4 dungeon-only action-menu commands (TRADE/USE/MERGE/DROP)** are NOT in the ported
  set — deferred. The dungeon char-view action menu therefore reuses the ported (castle-
  context) menu; matching the engine's exact dungeon action SET (and a dungeon char-view
  pixel-parity gate) is a later fidelity pass, not this slice. The NEW pixel gate here is the
  PICKER, not the char view.
- **Member paging** is via the picker / the in-view REVIEW re-pick (no separate next/prev-
  member key in this slice).

## References

- OPTIONS-menu shell (the picker pattern + dispatch seam): `#088`,
  `docs/superpowers/specs/2026-06-10-options-menu-shell-design.md`,
  `packages/viewer/src/pages/game/compose-options-strip.ts`, `MazeView.tsx`
  `dispatchOptionsCommand`.
- The reused char view: `packages/viewer/src/pages/castle/CharacterViewPage.tsx` +
  `character-view-reducer.ts`; route `/castle/review-member/:slotIdx`.
- Engine: `wpcvw` state 0x11 (`docs/re/wpcvw-character-view.md`); the dungeon picker +
  char-view invocation RE'd via `trace-maze.ts screencap` (this session).
- Picker reference fixture: `tools/parity/fixtures/engine/review-who-picker.idx.gz`.
