# REVIEW MEMBER + DISMISS MEMBER (with shared PartyMemberPicker) — design spec

**Date:** 2026-05-29

**Context:** The MASTER OPTIONS menu's slots 1 (REVIEW MEMBER) and 2 (DISMISS MEMBER) currently route to placeholder `CastleStub` pages. This spec wires them into working features by porting (a) the shared `pick_party_member` widget used by both slots and (b) a WPCVW state-0x11 character-view scaffold reached via REVIEW (no action handlers — just rendering + EXIT) and (c) the slot 2 dismiss action end-to-end.

Reverse-engineering basis: `docs/re/findings/wbase-party-pickers-and-dismiss.json` (23 findings) + `docs/re/findings/wpcvw-character-view-ux.json` (37 findings) + the canonical `docs/re/wbase-main-menu.md` and `docs/re/wpcvw-character-view.md`.

## Goal

1. Ship a working **DISMISS MEMBER** flow: pick → dismiss → return to castle. Replaces the current stub.
2. Ship a working **REVIEW MEMBER → WPCVW character view shell** flow: pick → 3-window character view (full layout) with the 11-action menu rendered and disabled (only EXIT works) → return to castle. Replaces the current stub.
3. Build a **shared `PartyMemberPicker` React component** that REVIEW and DISMISS both reuse — and that future per-character flows (rename party member, drop-from-party, etc.) can reuse.
4. Establish the **WPCVW view layout** as a fixture-pinned pixel-exact reference for future action ports (EQUIP, USE, DROP, etc.).

Out of scope for THIS slice (each has its own future sub-project):

- Any of the 11 action handlers (EQUIP / SPELL / TRADE / ASSAY / SWAG / MERGE / USE / DROP / SKILL / EDIT / in-place REVIEW WHO swap).
- The level-up sub-flow (state 0x16, post-combat).
- The portrait-change cycle and in-place rename (part of the EDIT submenu).

## Scope

In scope:

- Shared picker React component + composer pair.
- DISMISS flow page + new `dismissMember(slotIndex)` helper in `active-party-store.ts`.
- REVIEW picker page + character-view page + composer.
- Pixel-parity test against a captured state-0x11 save fixture.
- e2e Playwright tests for both flows.

Out of scope:

- Mouse input. Findings document mouse-remap handling in the engine picker, but the port has been keyboard-only by design.
- The in-place REVIEW WHO swap from inside the view. EXIT remains the only way out of the view in this slice.

## Engine references (from the findings JSONs)

| Element | Engine address | Notes |
|---------|----------------|-------|
| Slot 1 handler (REVIEW) | `wbase.ovr` 0x2d09 | Picker → on success: `*0x43cc := picked`; `*0x363a := 0x11`; `*0x4fce := 4`. See finding `slot1-handler-stores-43cc-unconditionally`. |
| Slot 2 handler (DISMISS) | `wbase.ovr` 0x2d2d | Picker → on non-cancel: dismiss helper @ 0x25cc. See finding `slot2-handler-dismiss-only-on-non-cancel`. |
| Dismiss helper | `wbase.ovr` 0x25cc | Marks PCFILE avail, decrements `*0x43ce`, memmove down. No equipment/spell side effects (finding `dismiss-helper-no-equipment-or-spell-side-effects`). |
| Picker widget | `wbase.ovr` 0x2143 (the ADD picker is structurally similar) and the WPCVW-side `ui_pick_party_member` @ wpcvw 0x4419 (referenced by REVIEW WHO inside the view) | wbase's slot-1/2 pickers reuse a shared widget. Picker title msg 0x4b2 / 0x4b3 ("review_who}" / "dismiss_who}"). |
| Picker title msg IDs | 0x4b2 (REVIEW) / 0x4b3 (DISMISS) | Decoded from `extracted/messages/msg.json`. |
| State-0x11 entry | `wpcvw.ovr` 0x6804 | Dispatcher pushes `*0x43cc` as arg. Finding `wpcvw-dispatch-pushes-43cc-as-arg`. |
| State-0x11 view main loop | `wpcvw.ovr` 0x67f6 (per finding) | Creates 3 windows: stats panel `*0x5752` at x=20 y=4 w=20 h=16 attr=0x1a; main panel x=0 y=0 w=40 h=20 attr=0x14; party row x=0 y=20 w=40 h=4 attr=0x0f. |
| Full char-sheet render | `wpcvw.ovr` 0x4e94 | Composite renderer: stats panel + inventory panel + party-row each loop iteration. |
| 11-action menu | msg ids 301..311 + EXIT 312 | 2 cols × 6 rows; x_base=2 y_base=1 x_step=6 attr=5 in the main panel. |
| Action enable mask | `*0x4fce` context check | 4 = camp/read-only set; 0xd = combat-relevant set; default = all 11 enabled (modulo per-character disables). |
| EXIT mechanic | View entry pre-arms `*0x4fce` → on EXIT the dispatcher copies `*0x4fce` into `*0x363a`, returning to state 4 (main menu). |

## File-level changes

### Create

- `packages/viewer/src/components/PartyMemberPicker.tsx` — shared React component. Props:
  ```ts
  interface PartyMemberPickerProps {
    title: string;              // resolved msg text passed in (component doesn't fetch msg)
    members: ActivePartyMember[];
    fontSet: FontSet;
    palette: Palette;
    onCommit: (slotIndex: number) => void;  // 0..N-1
    onCancel: () => void;
  }
  ```
  Manages local cursor state (0..N-1, plus a CANCEL state per the wbase picker pattern). Keymap per finding `picker-input-loop-keymap`:
  - ArrowLeft → jump to CANCEL state
  - ArrowUp/Right/Down → return cursor to grid (when on CANCEL); otherwise move cursor
  - Enter → commit (`onCommit(cursorIdx)` if on grid; `onCancel()` if on CANCEL)
  - Escape → `onCancel()` (engine ignores Escape but the port adds it for ergonomics; consistent with other roster pickers)
- `packages/viewer/src/pages/castle/compose-party-member-picker-frame.ts` — pure composer. Takes `{members, title, cursorIdx, onCancel, db, palette}` (where `onCancel` is a boolean meaning "cursor is on CANCEL row") and returns the TileWindow array (banner + grid + cancel row). Mirrors the geometry from finding `picker-grid-layout-and-coordinate-math` and `picker-name-render-and-mouse-hotspots`.
- `packages/viewer/src/pages/castle/DismissMemberPage.tsx` — wraps `PartyMemberPicker` with title from msg 0x4b3. On commit: calls `dismissMember(slotIndex)`, navigates to `/castle`. On cancel: navigates to `/castle`.
- `packages/viewer/src/pages/castle/ReviewMemberPage.tsx` — wraps `PartyMemberPicker` with title from msg 0x4b2. On commit: navigates to `/castle/review-member/<slotIndex>`. On cancel: navigates to `/castle`.
- `packages/viewer/src/pages/castle/CharacterViewPage.tsx` — the WPCVW state-0x11 view scaffold. Reads `slotIdx` from URL params. Renders the 3-window layout. Handles keys: EXIT (option 12 on the menu, which is the initial cursor position; Enter commits it) OR Escape (immediate return). Navigates to `/castle` on EXIT.
- `packages/viewer/src/pages/castle/compose-character-view-frame.ts` — pure composer. Sub-composers:
  - `composeStatsPanel(member, db, palette)` — right panel: name + portrait + race/class/sex + AC + HP/SP + 8 attributes.
  - `composeMainPanelWithActionMenu(member, db, cursorIdx, enabledMask)` — full-screen panel: inventory grid + action menu overlay.
  - `composePartyRow(members, currentSlot, db)` — bottom row: 6 mini-cells with HP/SP bars + condition + weapon icons (per finding "party-row mini-cells").
- `packages/viewer/src/pages/castle/compose-character-view-frame.test.ts` — composer unit tests (cell-grid assertions).
- `packages/viewer/tests/lib/active-party-store.test.ts` — extend if exists else create; add tests for `dismissMember`.
- `packages/viewer/e2e/dismiss-member-flow.spec.ts` — DISMISS end-to-end test.
- `packages/viewer/e2e/review-member-flow.spec.ts` — REVIEW (pick → view → EXIT) end-to-end test.
- `tools/parity/fixtures/engine/creation-review-member.idx.gz` + `.png` — captured fixture (Phase B, after user captures save).
- `tools/parity/screen-parity.test.ts` (extend) — new `creation-review-member` parity case (Phase B).

### Modify

- `packages/viewer/src/lib/active-party-store.ts` — add `dismissMember(slotIndex: number): void`. Throws if `slotIndex` out of range. Splices the array (no portrait-id table to shift; per-member `portraitSlotId` survives as-is, and `allocatePortraitSlotId` reclaims the freed slot on next add).
- `packages/viewer/src/router.tsx` — add three routes:
  ```
  /castle/dismiss-member         → DismissMemberPage
  /castle/review-member          → ReviewMemberPage  (picker)
  /castle/review-member/:slotIdx → CharacterViewPage (the view)
  ```
  Replaces the current `/castle/:stub` catch-all routing for these two paths.
- `packages/viewer/src/pages/game/CastleStub.tsx` — drop the `'dismiss-member'` and `'review-member'` entries since they're no longer stubs.

### No change

- `packages/viewer/src/pages/game/CastleScreen.tsx` — `ROUTE_BY_SLOT` already targets `/castle/dismiss-member` and `/castle/review-member` (from commit `4788a24`).
- `packages/parser/src/sim/main-menu.ts` — labels + destinations already correct (from commit `26ffa65`).

## Component data flow

### DISMISS MEMBER flow

```
CastleScreen [Enter on slot 2]
  ↓ navigate('/castle/dismiss-member')
DismissMemberPage mounts
  → reads members from active-party-store (snapshot on mount)
  → renders <PartyMemberPicker title=msg(0x4b3) members={members} />
  → user picks, presses Enter
  ↓ onCommit(slotIndex)
  → call dismissMember(slotIndex) → store mutates localStorage
  ↓ navigate('/castle')
CastleScreen remounts → fresh useMemo over active-party → menu updates
```

If user cancels (Escape or ArrowLeft+Enter on CANCEL): `onCancel()` → navigate('/castle') with no state change.

### REVIEW MEMBER flow

```
CastleScreen [Enter on slot 1]
  ↓ navigate('/castle/review-member')
ReviewMemberPage mounts
  → reads members from active-party-store
  → renders <PartyMemberPicker title=msg(0x4b2) members={members} />
  → user picks, presses Enter
  ↓ onCommit(slotIndex)
  ↓ navigate(`/castle/review-member/${slotIndex}`)
CharacterViewPage mounts
  → reads members from active-party-store, indexes by slotIdx → member
  → composes 3-window layout (stats + main + party row)
  → renders 11-action menu (cursor=12 EXIT, all others disabled)
  → user presses Enter on EXIT (or Escape)
  ↓ navigate('/castle')
```

If user cancels on the picker page: navigate('/castle').

## Reducer / store shape

`active-party-store.ts` gains one function. No new state.

```ts
/**
 * Dismiss the party member at `slotIndex` (0..members.length-1). Splices the
 * array and writes back. No-op if `slotIndex` is out of range.
 *
 * Engine reference: `dismiss helper` @ wbase.ovr 0x25cc. The engine marks
 * the PCFILE entry available and shifts character-record tables down; in
 * our model the roster character stays put (unchanged in `wiz6:roster`),
 * and `allocatePortraitSlotId` will reclaim the freed `portraitSlotId` on
 * the next addMember call.
 *
 * Findings: docs/re/findings/wbase-party-pickers-and-dismiss.json
 * (dismiss-helper-memmove-math, dismiss-helper-no-equipment-or-spell-side-effects).
 */
export function dismissMember(slotIndex: number): void { ... }
```

## Engine fixture for pixel parity

We don't currently have a state-0x11 save. Phase B of the plan: user captures one manually.

Instructions (in the plan as Task 0 / pre-flight):

1. Launch DOSBox-X via `tools/dosbox/run-with-logging.sh`.
2. From title screen: click through intro to MASTER OPTIONS.
3. ADD PARTY MEMBER, pick the first available roster character (e.g. ZAYN).
4. Back at MASTER OPTIONS, select REVIEW MEMBER.
5. On the picker, press Enter to pick the first member.
6. Now in state 0x11. Open DOSBox-X save menu, save to slot 14.
7. The file lands at `tools/dosbox/save/14.sav`.
8. Generate the parity fixture (decodes the save's framebuffer to a gzipped EGA-index file + PNG): `pnpm tsx tools/parity/gen-fixture.ts --save 14 --name creation-review-member`. Output lands in `tools/parity/fixtures/engine/creation-review-member.{idx.gz,png}`.

Phase A of the plan (everything else) ships without the fixture; Phase B adds the parity test once the fixture exists. The plan can be merged in two PRs or one — implementer's call.

## Action menu in scaffold

The 11-action menu renders all 11 options + EXIT (12 entries total). For the scaffold:

- Initial cursor on option 12 (EXIT). Engine's exact initial cursor is an open question (see below); EXIT is the safe scaffold default — only commit path is the safe one.
- All 11 action options visually disabled in the scaffold. Render disabled options at attr 0x07 (dim gray) as a default; the implementer should cross-check against an engine save where some options are masked off and switch to whatever the engine does if different. (The engine's mask is keyed on `*0x4fce`; a save where `*0x4fce==4` would render the camp/read-only subset — usable as a reference.)
- Only EXIT is committable. Enter on a disabled option plays the invalid-action beep (consistent with the wpcmk gating pattern) and is a no-op.
- Escape is a shortcut for EXIT (same exit path).

## Testing strategy

### Vitest unit

- `PartyMemberPicker`: render with 3 members, simulate keys, verify cursor + commit/cancel callbacks.
- `compose-party-member-picker-frame.test.ts`: cell-grid assertions on banner + grid output.
- `compose-character-view-frame.test.ts`: cell-grid assertions on each sub-composer + the assembled 3-window output. Includes:
  - Action menu renders all 12 options.
  - Cursor highlight is on EXIT (option 12).
  - All non-EXIT options render with disabled attr.
  - Stats panel shows the picked character's name + portrait.
- `active-party-store.test.ts`: `dismissMember` happy path + out-of-range no-op + post-dismiss array integrity.

### Cell-grid diagnostic (`.diagnostic.test.ts`)

Once a state-0x11 fixture exists: compare our composer's cells against the engine's cells (dump from save 14). Confirms structural placement before the pixel test runs.

### Pixel-parity gate (Phase B)

- `tools/parity/screen-parity.test.ts` extended with a `creation-review-member` case. Floor 100% pixel-exact against `tools/parity/fixtures/engine/creation-review-member.png`.

### Playwright e2e

- `e2e/dismiss-member-flow.spec.ts`:
  1. Seed roster with NATHAN + GANDALF; seed active party with both.
  2. Navigate to `/castle`. Press Down (to slot 2) then Enter.
  3. Wait for `/castle/dismiss-member`. Press Enter (pick NATHAN at cursor 0).
  4. Wait for `/castle`. Read localStorage: active party should now have 1 member (GANDALF).
- `e2e/review-member-flow.spec.ts`:
  1. Seed roster + active party as above.
  2. Navigate to `/castle`. Press Down to slot 1, Enter.
  3. Wait for `/castle/review-member`. Press Enter.
  4. Wait for `/castle/review-member/0`. Press Enter (commits EXIT).
  5. Wait for `/castle`. Active party unchanged (verify localStorage).

## Out-of-scope follow-ups

Filed as TODOs at planning time:

- 11 WPCVW action handlers (separate sub-projects each).
- State-0x16 post-combat level-up (depends on combat port).
- The in-place REVIEW WHO swap from inside the view (defer to the action-port phase).
- Pixel-parity tolerance regions (the project's `compareRgba` only supports a single global tolerance; if the WPCVW view has localized drift we'll need to extend the API; deferred until we hit the actual case).

## Open questions

1. **Picker geometry**: the wbase ADD picker is well-RE'd, but `pick_party_member` for slot 1/2 may differ in dimensions. The findings JSON describes the picker but the implementer should re-verify against the captured engine fixture before pinning specifics.
2. **Action-menu initial cursor**: do we start on option 0 (EQUIP) or option 12 (EXIT)? The findings don't explicitly call this out — implementer should confirm at planning time. Spec assumes EXIT for the scaffold; if the engine starts on EQUIP we follow that (the scaffold can still treat all but EXIT as no-ops).
3. **Disabled-option render style**: the engine has an enable mask; we don't yet know how the engine visually renders disabled options. Implementer should check during Phase A. Fallback: render disabled at attr 0x07 (dim gray). May need a follow-up parity adjustment.
4. **Party-row mini-cell content**: finding `party-row-mini-cells` summarizes content (name + sex/race icon + HP/SP bars + weapons + condition icon) but the exact glyph IDs + bar pixel math aren't pinned. Implementer should re-RE this for pixel-parity OR ship a simplified version and TODO it.
