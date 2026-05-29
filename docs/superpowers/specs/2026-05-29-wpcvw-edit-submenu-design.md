# WPCVW EDIT submenu — design spec

**Date:** 2026-05-29

**TODO entry:** #040 — Port WPCVW EDIT submenu (rename, change portrait, change class).

**Context:** The wpcvw state-0x11 character view (`CharacterViewPage`) is a static scaffold reached from castle's REVIEW MEMBER. The action-menu cursor is locked on EXIT and no actions are wired. This spec ports the **EDIT** action (option 9 in the engine's 11-option menu) and its 5-option submenu, making it the first wired action in the view.

Reverse-engineering basis: `docs/re/findings/wpcvw-character-view-ux.json` (37 findings, in particular `edit-submenu-options`, `edit-name-flow`, `edit-portrait-flow`, `edit-class-change-flow`, `edit-replace-character-disabled`) + `docs/re/findings/wpcvw-naming-pass.json` (`fn-class-change-tax`) + `docs/re/wpcvw-character-view.md` (class-change-tax narrative).

## Goal

1. Ship a working **WPCVW EDIT submenu** reachable from the action menu in `CharacterViewPage`, behind a House Rule (default off = engine-faithful, on = QoL/early-access).
2. Wire all three enabled sub-flows: **RENAME**, **CHANGE PORTRAIT**, **CHANGE PROFESSION**. REPLACE is force-disabled (matches engine).
3. Port the engine's destructive class-change tax (level→1, XP→0, savedOldLevel←previousLevel, unequip-all, recompute derived stats) as a pure function in `@wiz6/data`.
4. Unlock the action-menu cursor so the user can navigate to EDIT (and to EXIT, which is currently the only working option).

Out of scope for this slice:

- The other 10 actions (EQUIP/SPELL/TRADE/ASSAY/SWAG/MERGE/USE/DROP/SKILL/in-place REVIEW WHO). Each has its own TODO entry.
- Pixel-parity tests for the four new screens. Engine fixtures are not capturable today (state-0x11 EDIT requires either dungeon traversal or a memory poke). Tracked as a new TODO #055, deferred until dungeon work makes capture practical.
- Active-party ↔ roster sync for edited fields. Edits to an active member do not propagate to the linked roster character. Future work; out of scope here.
- The "saved-old-level cap throttle" behavior on level-up. The field is stored, but the level-up flow isn't ported yet — the throttle becomes live when that ships.

## Scope

In scope:

- New House Rule: `allowEditFromCamp`. Default `false`. When `true`, EDIT joins the camp-enabled action subset.
- Unlock the action-menu cursor in `CharacterViewPage` so the player can navigate to EDIT and EXIT (no other actions are wired in this slice; cursor still skips disabled entries).
- Four new composers in `packages/viewer/src/pages/castle/`: EDIT submenu, RENAME prompt, PORTRAIT change, CLASS picker (+ confirm modal).
- A pure `applyClassChange` function in `@wiz6/data` with full unit tests.
- A new `updateActiveMember(slotIdx, partial)` helper in `active-party-store.ts`.
- Composer unit tests asserting layout matches the RE findings (cell-grid byte assertions).
- State-machine reducer tests for the page's local `ViewState` discriminated union.
- Manual browser smoke test of the end-to-end flow.

Out of scope:

- Pixel-parity tests (deferred to TODO #055).
- Mouse input (keyboard-only per project convention).
- The 10 non-EDIT actions.
- School-mana persistence behavior after class-change beyond what `computeDerivedStats` produces (the engine may zero school-mana on class change in ways our finding doesn't capture; conservative choice is "full recompute from class baseline"; document any divergence later).

## Engine references

| Element | Engine address | Notes |
|---------|----------------|-------|
| EDIT submenu entry | `wpcvw.ovr` 0x671f | Called from action-menu dispatch case 9 at `wpcvw.ovr` 0x6b2c. Finding `edit-submenu-options`. |
| Submenu mask | inline at 0x671f | All 5 mask slots set to 1; `local_1a[3] := 0` force-disables REPLACE. |
| Submenu picker geometry | inline | `msg_base=0x28a=650`, `x_base=2`, `y_base=1`, `x_step=0x12`, `cols=2`, `attr=5`. Picker host = `param_2` = wpcvw main panel (`local_4` in view-main-loop). |
| Submenu labels | msg ids 650..654 | RENAME CHARACTER / CHANGE PORTRAIT / CHANGE PROFESSION / REPLACE CHARACTER / EX. From `extracted/messages/msg.json` indexedMessages. |
| RENAME handler | `wpcvw.ovr` 0x6674 | `ui_text_input_editor` with max-len 7, cursor at (5,7), prompt msg 0x468 ("NEW NAME >"). Commit copies buffer to `slot*0x1b0 + 0x43e8`. Finding `edit-name-flow`. |
| PORTRAIT handler | `wpcvw.ovr` 0x63bc | Sub-window at (x=0x14, y=4, w=0x14, h=0x10, attr=0x1e). msg 0x458 row 9, msg 0x459 row 12. ◄/► cycles. Commit updates `slot+0x4584`. Finding `edit-portrait-flow`. (Prior name `wpcvw_identify_shop_or_temple` is misapplied — actual function is portrait change.) |
| CLASS CHANGE handler | `wpcvw.ovr` 0x6054 | `class_change_apply`. Body: class availability table → picker → on confirm: `*0x4587:=new_class-1`, `*0x4597:=min(*0x440c,0xfa)`, `*0x440c:=1`, `*0x4588:=0`, `*0x43f4/6:=0`, FUN_5f4d (race re-init), FUN_5e04 (class re-init), FUN_4e94 (full redraw), FUN_8e35 (recompute all derived incl. unequip-all). Findings `edit-class-change-flow`, `fn-class-change-tax`. |
| Camp context mask | `*0x4fce==4` at `wpcvw.ovr` 0x68e9 | Enables only 0/1/3/4/8/10 (EQUIP/SPELL/ASSAY/SWAG/SKILL/REVIEW). EDIT (index 9) is NOT enabled — this is why the House Rule gate exists. Finding `view-context-mask-from-camp`. |
| Dungeon context mask | default branch at 0x68ce | All 11 enabled subject to per-character disables. EDIT is enabled here. |
| Picker input keys | `ui_menu_picker_grid` @ 0x6c | 1=UP, 2=LEFT, 3=DOWN, 4=RIGHT, 5=Enter. No wrap-around. Finding `view-input-keys`. |

## House Rule

Add to `packages/data/src/schemas/house-rules.ts`:

```ts
allowEditFromCamp: z.boolean(),  // schema field
```

- `STOCK_HOUSE_RULES.allowEditFromCamp = false` (engine-faithful — EDIT disabled from camp).
- `DEFAULT_HOUSE_RULES.allowEditFromCamp = false` (start in engine-faithful mode; user opts in).
- `HOUSE_RULES_META` entry:
  - `key: 'allowEditFromCamp'`
  - `label: 'Allow EDIT from camp REVIEW MEMBER'`
  - `description: 'In the original Wizardry VI, the EDIT submenu (rename, change portrait, change profession) is only available from the in-dungeon character view — camp REVIEW MEMBER disables it. The wiz6 dungeon is not yet ported, so this toggle lets you reach EDIT from the castle for now.'`
  - `category: 'gameplay'`
  - `stockValue: false`

When the rule is **off** (default): EDIT does not appear in the camp action-menu mask; player cannot reach the submenu.

When the rule is **on**: EDIT joins the camp-enabled set (index 9 added). Other camp restrictions (TRADE/USE/DROP/MERGE/REVIEW unchanged) stay engine-faithful.

## State machine

`CharacterViewPage` adds a discriminated-union local state:

```ts
type ViewState =
  | { kind: 'action-menu'; cursorIdx: number }
  | { kind: 'edit-submenu'; cursorIdx: number }
  | { kind: 'rename'; buffer: string }
  | { kind: 'portrait'; previewIdx: number; originalIdx: number }
  | { kind: 'profession-picker'; cursorIdx: number }
  | { kind: 'profession-confirm'; newClassId: number };
```

**Transitions:**

| From | Key | Action | To |
|------|-----|--------|----|
| `action-menu` | arrows | move cursor over enabled actions (no wrap) | `action-menu` |
| `action-menu` | Enter on EXIT | navigate('/castle') | — |
| `action-menu` | Enter on EDIT (if `allowEditFromCamp`) | — | `edit-submenu { cursorIdx: 0 }` |
| `action-menu` | Escape | navigate('/castle') | — |
| `edit-submenu` | arrows | move cursor (skip REPLACE at index 3) | `edit-submenu` |
| `edit-submenu` | Enter on RENAME | — | `rename { buffer: '' }` |
| `edit-submenu` | Enter on PORTRAIT | — | `portrait { previewIdx: current, originalIdx: current }` |
| `edit-submenu` | Enter on PROFESSION | — | `profession-picker { cursorIdx: 0 }` |
| `edit-submenu` | Enter on EX OR Escape | — | `action-menu { cursorIdx: editIdx }` |
| `rename` | printable ASCII | append (cap 7) | `rename` |
| `rename` | Backspace | pop | `rename` |
| `rename` | Enter (non-empty) | `updateActiveMember(slot, { name: buffer.toUpperCase() })` | `edit-submenu` |
| `rename` | Enter (empty) | no-op | `rename` |
| `rename` | Escape | discard | `edit-submenu` |
| `portrait` | ◄/► | `previewIdx = (previewIdx ± 1 + 42) % 42` | `portrait` |
| `portrait` | Enter (changed) | `updateActiveMember(slot, { portraitIndex: previewIdx })` | `edit-submenu` |
| `portrait` | Enter (unchanged) | no-op | `edit-submenu` |
| `portrait` | Escape | discard | `edit-submenu` |
| `profession-picker` | arrows | move cursor over class-available entries | `profession-picker` |
| `profession-picker` | Enter | — | `profession-confirm { newClassId }` |
| `profession-picker` | Escape | discard | `edit-submenu` |
| `profession-confirm` | Y / Enter on Yes | `updateActiveMember(slot, applyClassChange(member, newClassId))` | `action-menu` |
| `profession-confirm` | N / Esc / Enter on No | — | `profession-picker` |

The character sheet (portrait + stats column + inventory list + school-mana grid + party-row) re-renders every frame regardless of `ViewState.kind`. Sub-windows for RENAME, PORTRAIT, PROFESSION are drawn on top of the main panel, matching the engine's "outer loop unconditionally re-renders" pattern (finding `view-menu-loop-shape`).

## File-level changes

### Create

- `packages/data/src/character-actions/class-change.ts`
  ```ts
  export function applyClassChange(
    member: ActivePartyMember,
    newClassId: number,
  ): ActivePartyMember
  ```
  Implements:
  1. `class = newClassId`
  2. `level = 1`
  3. `xp = 0`
  4. `savedOldLevel = Math.min(previousLevel, 250)`
  5. `equipment = [255, 255, 255, 255, 255, 255, 255, 255]` (unequip-all)
  6. Re-derive `derivedAc`, `hpMax`, `hpCurrent`, `staminaMax`, `staminaCurrent`, `bodyAc`, `encumbranceCurrent`, `encumbranceMax`, `schoolMana`, `schoolManaMax`, `schoolRankThresholds` via existing `computeDerivedStats`.
  7. Preserve `attributes`, `name`, `race`, `sex`, `portraitIndex`, `age`, `conditions`, `inventory[]` items (only `equipment` body-slot array is cleared), `reaction`, `npcRaceReaction`, `skills`.

- `packages/data/tests/character-actions/class-change.test.ts` — unit tests for the function (see Testing).

- `packages/viewer/src/pages/castle/compose-edit-submenu.ts` — composer.

  Renders a `TileWindow` representing the 5-option submenu, hosted in the wpcvw main panel (40×20 at x=0, y=0). Picker layout per RE: cell positions for each option computed from `(x_base=2, y_base=1, x_step=0x12, cols=2)` in column-major order.

  Disabled REPLACE entry: drawn dimmed at attr 0x07 (consistent with TODO #042's open question — the exact disabled-attr is unverified; choose 0x07 and document as a value to confirm during fixture capture).

  Cursor highlight: attr 0x50 (black-on-yellow inverse) — same convention as other wpcvw menus.

- `packages/viewer/src/pages/castle/compose-rename-prompt.ts` — composer.

  Clears the main panel (`clearWindow(w, 0x20, 0x03)`), draws the "NEW NAME >" prompt (msg 0x468) at (col=1, row=1) attr 0x03, then the 7-char buffer immediately following the prompt on the same row: typed letters at attr 0x50, cursor-block 'a' (wfont0 glyph 0x61) at attr 0x10, trailing pad at attr 0x00. **Buffer position is tentative** — finding `edit-name-flow` lists `cursor_x=5` from the decompile but the y-coord is not separately captured (the prose paraphrase "(5, 7)" conflates `cursor_x=5` with `max_chars=7`). Mirror wpcmk's `RenameInputScreen` pattern (buffer right after prompt) until a fixture clarifies.

- `packages/viewer/src/pages/castle/compose-portrait-change.ts` — composer.

  Creates a sub-window at (x=20, y=4, w=20, h=16) attr 0x1e — same geometry as the engine's portrait-change window, drawn over the wpcvw main panel. Big 3×3 portrait grid at chars `0x48..0x50` (rows 0..2 × cols 0..2 inside the sub-window). `patchFontSetWithPortrait` swaps the cycled portrait into glyphs 0x48..0x50 each render. Bottom of the sub-window shows msg 0x458 ("◄► TO REVIEW PORTRAITS") at row 9 and msg 0x459 ("PRESS Enter TO SELECT") at row 12.

- `packages/viewer/src/pages/castle/compose-class-picker.ts` — composer.

  Class-availability filter logic uses the existing wpcmk helper (or re-uses the data layer's `availableClassesForStats(attributes, race)` — TBD during implementation; the wpcmk `pick_class` screen has the same input shape). Renders the class list in a sub-window; cursor highlights the active row.

- `packages/viewer/src/pages/castle/compose-profession-confirm.ts` — modal-style yes/no confirm.

  Small centered window with the engine's warning text (msg id TBD during fixture capture; if no engine string is reachable, use a port-internal English string documented in the spec as a deliberate divergence). YES / NO options, default cursor on NO (engine convention — destructive defaults).

### Edit

- `packages/data/src/schemas/house-rules.ts` — add `allowEditFromCamp` to schema + STOCK + DEFAULT + META.

- `packages/viewer/src/lib/active-party-store.ts` — add:
  ```ts
  export function updateActiveMember(
    slotIndex: number,
    patch: Partial<ActivePartyMember>,
  ): void
  ```
  Splices the party array, applies the patch via `{ ...member, ...patch }`, validates via `ActivePartySchema.parse`, writes back. No-op on out-of-range index.

- `packages/viewer/src/pages/castle/CharacterViewPage.tsx` — add `ViewState` reducer; unlock cursor in `action-menu`; handle EDIT key transition; render sub-windows over the main panel when `kind !== 'action-menu'`. Read `allowEditFromCamp` from the house-rules store on mount; pass into the action-menu composer to control the EDIT entry.

- `packages/viewer/src/pages/castle/compose-action-menu.ts` — accept an optional `includeEditFromCamp: boolean` prop. When true, append `9` (EDIT) to `CAMP_ENABLED_INDICES`. Re-pack the column-major grid layout to fit the extended set (6 → 7 actions + EXIT).

### Touched (incidentally)

- `packages/data/src/character-creation/derived-stats.ts` — may need a small refactor if `computeDerivedStats` only accepts a creation draft. If so, extract a `recomputeDerivedFor(member)` variant. Resolve during implementation.

## Testing

### Pure-function tests (default CI gate)

`packages/data/tests/character-actions/class-change.test.ts`:

- Level-7 Fighter → Mage: post-state has `level=1`, `xp=0`, `savedOldLevel=7`, `class=mageId`, `equipment` all 255.
- Level-251 → cap: `savedOldLevel == 250` (engine 0xfa cap).
- Attributes (STR/INT/PIE/VIT/DEX/SPD/PER/KAR) preserved byte-for-byte.
- `name`, `race`, `sex`, `portraitIndex`, `age`, `inventory` items, `skills`, `conditions`, `reaction`, `npcRaceReaction` preserved.
- `hpCurrent == hpMax` after change (fresh class baseline).
- `derivedAc` recomputed using new class's modifiers (Monk/Ninja `-level/2`; new level is 1, so floor `(1/2) == 0` — no AC bonus until ranking back up).
- Chained-change exploit (engine-faithful): `applyClassChange` writes `savedOldLevel := previousLevel` unconditionally (capped at 250). Calling it twice in a row at level 1 sets `savedOldLevel = 1` on the second call, effectively releasing the throttle. The test asserts this engine-faithful behavior so a future regression doesn't silently "fix" it without an explicit House Rule.

### Composer unit tests (default CI gate)

`packages/viewer/tests/pages/castle/compose-edit-submenu.test.ts`:

- Composed window has expected cell content at all 5 picker positions: RENAME at (2,1) attr 5, CHANGE PORTRAIT at (2,2) attr 5, CHANGE PROFESSION at (20,1) attr 5, REPLACE at (20,2) attr 7 (dimmed), EX at (38,1) attr 5 — column-major fill matches the engine's picker geometry.
- Cursor on RENAME draws attr 0x50 at the matching range.
- Cursor never lands on REPLACE (caller's reducer responsibility, validated by state-machine test).

`packages/viewer/tests/pages/castle/compose-rename-prompt.test.ts`:

- "NEW NAME >" prompt at (1,1) attr 0x03.
- Empty buffer: 7-cell pad and cursor block immediately following the "NEW NAME >" prompt at attr 0x00 / 0x10 respectively (exact column depends on prompt length).
- Non-empty buffer "FOO": three uppercase cells at attr 0x50, cursor block following them, trailing pad cells.

`packages/viewer/tests/pages/castle/compose-portrait-change.test.ts`:

- Sub-window has expected size + attr 0x1e.
- Big 3×3 portrait grid uses chars 0x48..0x50 at the documented coords.
- msg 0x458 at row 9 col 1; msg 0x459 at row 12 col 1.

`packages/viewer/tests/pages/castle/compose-class-picker.test.ts`:

- Filtered class list matches `availableClassesForStats` for a known stat block.
- Cursor highlight on the right row.

### State-machine tests (default CI gate)

`packages/viewer/tests/pages/castle/CharacterViewPage.state.test.ts`:

Extract the page's reducer into a pure function (`reduceViewState(state, event)`) and unit-test:

- `action-menu` + EDIT key → `edit-submenu`.
- `edit-submenu` arrow moves cursor; cursor never lands on index 3 (REPLACE).
- `rename` + commit → `edit-submenu`.
- `rename` + Escape → `edit-submenu`.
- `portrait` + ◄ / ► cycles previewIdx with wrap.
- `profession-confirm` + Yes → applies `applyClassChange` via injected store.

### Manual gate

Per CLAUDE.md "manual smoke test before declaring a screen port done":

1. `pnpm dev:viewer`.
2. Settings → enable `allowEditFromCamp`.
3. Castle → REVIEW MEMBER → pick character → navigate to EDIT → step through RENAME (commit one), PORTRAIT (commit one), PROFESSION (commit Fighter → Mage for a level-3+ character), confirm post-class-change character sheet shows level 1 / 0 XP.
4. Toggle `allowEditFromCamp` off → confirm EDIT is no longer in the action menu.

### Deferred (file as TODO #055)

Pixel-parity tests for EDIT submenu, RENAME prompt, PORTRAIT change, CLASS picker. Blocked on engine fixture capture, which is blocked on either dungeon traversal or MCP dynamic-driving capability (#017 v2).

## Risks and open items

1. **Class-change derived-stat reset details unverified.** The engine's FUN_8e35 (recompute-all) calls `class_init` (FUN_5e04) which probably resets HP/SP/mana from class baseline. Our `computeDerivedStats` does the same. Any divergence in the exact bytes (e.g., school-mana cur vs max relationship after change) will surface in pixel-parity verification later. Conservative choice: "recompute via existing pure fn"; document expected post-change byte layout in the unit test.

2. **Class-availability table source.** The engine builds the availability table at FUN_5c95 from current stats vs class requirements. We need either to call into the existing wpcmk helper (if it exposes this) or replicate the formula in `@wiz6/data`. Resolve in the writing-plans phase.

3. **REPLACE disabled-attr unverified.** Choosing attr 0x07 by analogy to other "disabled-list-entry" attrs in the engine. May need correction once we have a captured fixture. Document as a known unknown.

4. **Profession-confirm modal copy.** The engine likely shows a warning string for the class-change tax (msg id unknown without a fixture). Acceptable for the first port to use a port-internal English string ("Class change wipes XP and resets level to 1. Continue? Y/N") and replace with the engine string later. Document as a deliberate temporary divergence.

5. **Active-party-store update without roster sync.** Edits to an active member don't propagate to the linked roster character; if the player dismisses the member back to the roster, those edits are lost. Future TODO; out of scope for #040.

6. **`computeDerivedStats` API shape.** May currently only accept a creation draft. If so, refactor needed. Likely small (one new exported variant); confirm in writing-plans.

## TODO follow-ups created by this work

- **#055 — capture WPCVW EDIT screen engine fixtures + add pixel-parity tests** (blocked on dungeon entry / state 0x11 reachability).
- **#056 — active-party ↔ roster sync on member dismiss** (not blocking, but the divergence is real).
- **#057 — verify REPLACE disabled-entry attr in WPCVW EDIT submenu** (cosmetic; resolve when #055 captures fixtures).

(IDs are illustrative — actual IDs assigned at promote-to-TODO time.)
