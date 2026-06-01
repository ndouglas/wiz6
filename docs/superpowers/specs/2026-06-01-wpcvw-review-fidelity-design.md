# WPCVW Review-Member Fidelity (Equipment + Action-Menu Nav) — Design

**Status:** spec — awaiting review
**Sub-project:** SP2 of the castle REVIEW MEMBER (WPCVW) flow. SP1 (the picker) is merged.
SP3 (porting the EQUIP/SPELL/ASSAY/SWAG/SKILL/REVIEW action *handlers*) is separate.
**Date:** 2026-06-01

## Goal

Make the castle REVIEW MEMBER character view (WPCVW state 0x11, reached via REVIEW MEMBER →
pick a member) match the original engine, behind a full-screen pixel-parity gate (tolerance 0):
1. **Show equipment** — render the member's inventory item-name list (mission 3).
2. **Fix the action-menu navigation** — column-major 2-row grid, cursor starts on EXIT,
   includes the REVIEW entry (mission 5).

## Ground truth (captured live 2026-06-01)

Drove a 3-member castle party (THESUS/TEMPEST/LYSANDR) → REVIEW MEMBER → THESUS → character
view; saved to DOSBox slot 9 (cursor on EXIT). The screen:
- **Right panel** = a **text list of inventory item names** + a scrollbar. THESUS's inventory
  itemIds `8/135/132/130/141` render as `LONGSWORD / LEATHER CUIRASS / FUR LEGGING / SANDALS /
  BUCKLER SHIELD`. Verified: `scenario.items[itemId].name1` resolves each exactly.
- **Action menu** (bottom) = **7 entries** in a column-major 2-row grid:
  ```
  EQUIP   ASSAY   SKILL   EXIT
  SPELL   SWAG    REVIEW
  ```
  i.e. column-major index order `[EQUIP, SPELL, ASSAY, SWAG, SKILL, REVIEW, EXIT]`
  (col c, row r → idx = c*2 + r). **The cursor starts on EXIT.**
- Verified nav by driving: **Left/Right** = previous/next column, same row (clamp if the target
  cell is empty); **Up/Down** = within the column (clamp at top/bottom row, no wrap). E.g. from
  EXIT (col3,row0): Left → SKILL (col2,row0); from SKILL: Down → REVIEW (col2,row1); from
  REVIEW: Right → clamp (no col3,row1); from SKILL: Up → clamp.

## Current state of our port

- **Equipment (mission 3):** `composeCharacterViewFrame` already *accepts* an `inventory`
  param and `drawInventoryList` (compose-main-panel.ts) already renders name + slot-icon — and
  `tools/parity/screen-parity.test.ts` already gates that render with NATHAN's hardcoded items.
  The gap is purely runtime wiring: `CharacterViewPage` never builds/passes `inventory` (the
  deferred "Task 13"). `cc` and `age` ARE already wired (CharacterViewPage.tsx:257-272).
  `ActivePartyMember` carries `inventory` (22 slots; `addMember` copies the full character), so
  the data is present at runtime.
- **Action menu (mission 5):** `CAMP_ENTRIES_BASE = ['EQUIP','SPELL','ASSAY','SWAG','SKILL',
  'EXIT']` — **missing REVIEW** (6 vs the engine's 7). The reducer's `action-menu` case
  (character-view-reducer.ts:85-91) does **linear** `cursorIdx ±1` on Left/Right and **ignores
  Up/Down** — wrong for a column-major grid (±1 moves *vertically*). Initial cursor is `0`
  (EQUIP), not EXIT. `compose-action-menu.ts` already lays entries out column-major 2-row, so
  it renders the 4th column correctly once fed 7 entries.

## The fix

### Mission 3 — equipment (runtime wiring + item-name lookup)
1. **Item-name lookup.** Add a helper that resolves `itemId → name` via the scenario DB:
   `scenario.items[itemId].name1`. Load `scenario.json` in the viewer (a `loadScenarioDb`
   loader alongside the others) and expose a small `scenarioItemName(scenarioDb, itemId)` (or a
   memoized map). Keep it pure/data-layer where it fits the existing patterns.
2. **Build + pass inventory.** In `CharacterViewPage`, from `member.inventory`, take the
   non-empty slots (`itemId > 0`), first `INV_MAX_ROWS` (5), and map each to the render
   `InventoryItem` `{ name: scenarioItemName(id), iconChar: equipSlotIcon(equipSlot) }`, then
   pass `inventory` to `composeCharacterViewFrame`. Reuse the existing `equipSlot → iconChar`
   mapping (the one `screen-parity.test.ts` and `compose-main-panel.ts` already encode); factor
   it into a shared helper if it's currently inline in the test.

### Mission 5 — action menu (entries + nav + initial cursor)
1. **Add REVIEW conditionally** — the engine's camp mask enables REVIEW (index 10) but
   **party_size < 2 disables it** (`view-context-mask-default-dungeon` finding; confirmed by the
   existing 1-member `creation-review-member` fixture having 6 entries vs the captured 3-member
   view's 7). So: 1 member → `[EQUIP,SPELL,ASSAY,SWAG,SKILL,EXIT]` (6); 2+ members →
   `[...,SKILL,REVIEW,EXIT]` (7). REVIEW is *rendered* with a **no-op** ENTER handler (its
   REVIEW-WHO re-pick is #041 / SP3). The EDIT house-rule (non-stock) inserts EDIT before EXIT.
   Both the render list (compose-action-menu) and the reducer's `campEntries` must stay in sync.
2. **Column-major 2-row nav** in the reducer's `action-menu` case. Extract a pure
   `nextActionCursor(idx, key, n)` (testable like SP1's `nextCursor`):
   - `Left`: `idx-2` if `idx >= 2` (prev column, same row); else stay.
   - `Right`: `idx+2` if `idx+2 < n` (next column, same row); else stay.
   - `Up`: `idx-1` if `idx` is odd (row 1 → row 0); else stay (clamp).
   - `Down`: `idx+1` if `idx` is even AND `idx+1 < n` (row 0 → row 1); else stay (clamp).
   - `Enter`: EXIT → exit-castle; EDIT → edit-submenu; others → no-op. `Escape` → exit-castle.
3. **Initial cursor = EXIT** (the last entry, `campEntries.length - 1`) wherever the
   `action-menu` state is constructed (CharacterViewPage initial state + the edit-submenu/overlay
   return paths). The pixel fixture (cursor on EXIT) gates this.

## Scope: full character-view pixel parity (decided)

Gate the **whole** character-view screen at tolerance 0 against the captured THESUS fixture, and
wire whatever it takes to hit 100% — not only equipment. `cc`/`age` appear already wired; the
gate is the arbiter. If the diff surfaces other unwired fields, fix them (the project's
differential-testing methodology drives completeness). Do NOT lower the tolerance.

## Testing (the gate)

- **Fixture:** capture `review-member-view` (THESUS character view, cursor on EXIT) from DOSBox
  slot 9 (already saved) via `gen-fixture`; commit `.idx.gz` + `.png`. Optionally a second
  fixture with the cursor on a member action to gate the action highlight.
- **Pixel-parity test** (`tools/parity/`): compose `composeCharacterViewFrame` with THESUS's
  real data — inventory resolved via the new `scenarioItemName` lookup (NOT hardcoded), cursor
  on EXIT — and compare to the fixture at tolerance 0. This gates the item-name lookup, the
  equipment render, the 7-entry menu, and the EXIT-initial cursor together. Model on the
  existing character-view case in `screen-parity.test.ts` and `castle-parity.test.ts`.
- **Reducer unit test:** `nextActionCursor` covering every verified transition + clamp edge
  (mirror SP1's `nextCursor` test).
- **Browser e2e** (`review-member-flow.spec.ts` or a new spec): inject a 3-member active party
  (THESUS/TEMPEST/LYSANDR, matching the fixture), navigate to `/castle/review-member/0`, assert
  the mounted canvas matches `review-member-view` (this gates the runtime wiring — exactly the
  class of bug the SP1 e2e caught with the missing wfont4).

## Files

- `packages/data/src/...` (or viewer data-loader) — `scenarioItemName` lookup + `loadScenarioDb`.
- `packages/viewer/src/pages/castle/CharacterViewPage.tsx` — build + pass `inventory`; initial
  action-menu cursor = EXIT.
- `packages/viewer/src/pages/castle/character-view-reducer.ts` — `nextActionCursor` + 2D nav in
  the `action-menu` case; add REVIEW to camp entries (the `CAMP_ENTRIES_*` constants live in
  CharacterViewPage.tsx — update there).
- `packages/viewer/tests/...` — reducer unit test.
- `tools/parity/fixtures/engine/review-member-view.{idx.gz,png}` — committed fixture.
- `tools/parity/wpcvw-review-parity.test.ts` (or extend `screen-parity.test.ts`) — pixel gate.
- `packages/viewer/e2e/review-member-flow.spec.ts` — mounted-app assertion.
- `TODO.md` — note REVIEW handler (#041) + any newly-filed gaps remain for SP3.

## Out of scope

- Porting the action *handlers* (EQUIP/SPELL/ASSAY/SWAG/SKILL/REVIEW) — that's SP3 / mission 4.
  In SP2 they render and navigate; ENTER on them is a no-op (except EXIT/EDIT).
- The EDIT submenu internals (already ported under #040).
- Dungeon/combat-context action sets (`*0x4fce` != 4) — camp context only.
