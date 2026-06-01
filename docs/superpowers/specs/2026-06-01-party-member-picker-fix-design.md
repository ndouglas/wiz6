# Party-Member Picker Fix (REVIEW WHO? / DISMISS WHO?) — Design

**Status:** spec — awaiting review
**Sub-project:** SP1 of the castle REVIEW MEMBER (WPCVW) flow work (SP2 = review-screen
fidelity; SP3 = WPCVW action ports — both separate specs).
**Date:** 2026-06-01

## Goal

Make the castle party-member picker — the `REVIEW WHO?` menu (MASTER OPTIONS slot 1)
and the `DISMISS WHO?` menu (slot 2), shown when the party has ≥2 members — match the
original engine, behind a pixel-parity gate. Both menus are the *same* widget
(`wbase_pick_party_member` @ wbase 0x26c7); fix it once.

## Ground truth (captured + RE, both agree)

Captured live from DOSBox-X on 2026-06-01 (castle, 2 and 3 members → REVIEW WHO?), and
corroborated by the high-confidence RE finding
`docs/re/findings/wbase-party-pickers-and-dismiss.json`.

```
REVIEW WHO?   EXIT           <- banner strip (persistent 40x1 at y=18). Title left, then EXIT.
THESUS    TEMPEST            <- member grid, row-major 2-col: slot s at col (s%2), row floor(s/2)
LYSANDR                         even slots LEFT (x=2), odd slots RIGHT (x=11); rows at y=1,2,3
```

**Layout** (relative to the picker window at screen `x=0, y=19, w=19, h=5`, attr `0x19`,
cleared to `(space, attr 3)`):
- Member cell for slot `s ∈ [0, party_size)`: `x = (s%2)*9 + 2`, `y = floor(s/2) + 1`.
- Names rendered from the live party records; non-selected style `3` (no highlight),
  selected cell with **inverse-highlight** style `0xfffb` (−5).

**Banner** (the persistent strip `*0x3342` at `y=18`): title msg (`0x4b2` = "REVIEW WHO?",
`0x4b3` = "DISMISS WHO?") written centered with `center_x = 10 − (strlen + 6)/2` — the **+6
padding reserves space for the trailing "EXIT"**. The EXIT indicator uses banner-state msgs
`0x7eb` (regular) / `0x7ec` (highlight). When the cursor is on EXIT, the highlight variant
is drawn; otherwise the regular variant.

**Navigation / cursor model** (keymap LEFT/UP/RIGHT/DOWN/ENTER; verified by driving):
- Initial cursor = **−1** → the EXIT indicator is highlighted (cancel state). The cursor
  begins on EXIT, *not* on a member.
- `Down` from −1 → slot 0 (top-left). `Down` from slot `s` → `s+2` (next row, same column);
  **clamps** if `s+2 ≥ party_size` (verified: Down from the last member stays put).
- `Up` from slot `s` → `s−2`; from the top member row (slot 0 or 1) → **−1** (EXIT).
- `Left` from an odd (right-column) slot → `s−1`; `Right` from an even (left-column) slot →
  `s+1` (only when `s+1 < party_size`).
- `Enter` on a member → commit that slot (review/dismiss it). `Enter` on EXIT (cursor −1) →
  cancel, return to MASTER OPTIONS.
- 1-member party: the engine returns slot 0 immediately with no picker UI. (Already handled
  by our `members.length === 1` shortcut — out of scope to change.)

## What our port currently gets wrong

| | Engine | Our port (`PartyMemberPicker.tsx` + `compose-party-member-picker-frame.ts`) |
|---|---|---|
| Initial cursor | **−1 / EXIT** | member 0 |
| Banner | title + selectable **EXIT** (`0x7eb`/`0x7ec`) | centered title only, no EXIT |
| Cancel affordance | `Enter` on EXIT, reached via `Up` from top row | `Left`-from-col-0 → a "cancel" state |
| Member grid placement | row-major 2×3 (`x=(s%2)*9+2, y=s/2+1`) | row-major 2×3 — **already correct** |
| Selected-cell highlight | inverse `0xfffb` | (verify against fixture) |

The member *placement* was never the bug. The bugs are the **EXIT affordance, the initial
cursor position, the banner layout, and the cancel-via-Up model**.

**This also corrects TODO #058**, which proposed switching the picker to *column-major* to
"fix" the nav. The engine is **row-major** — that refactor would have been wrong. #058's real
symptom (cancel/exit felt unclear with small parties) is explained by the missing EXIT
affordance, fixed here. Close #058 as part of this work.

## Rendering: composite over the castle scene (discovered during planning)

The engine keeps the live castle scene visible *behind* the picker — `ui_window_create`
overlays the picker windows on top of the gate/fountain/party-portraits screen (confirmed in
the captured screenshots). **Our current `PartyMemberPicker` instead clears to black
(`buf.fill(0)`) and draws only the picker windows** — so the full-screen pixel-parity fixtures
will never match a black background.

The fix must therefore composite the picker over the castle frame, exactly like the sibling
`AddPartyPage` already does: render `composeCastleFrame(parity=0, …, members, portraitSets)`
into the buffer, then overlay the picker windows (`renderTileWindow`) on top. The shared
picker widget loads the castle assets (mon08, dragonsc, wfont0/1/3, all three portrait sets)
the same way `AddPartyPage` does. This also keeps the party portraits (which the picker sits
below) on screen, matching the engine.

## The fix

One shared widget, two consumers (`ReviewMemberPage`, `DismissMemberPage`) — no per-page
divergence. The widget mirrors `AddPartyPage`'s structure: own the cursor state machine, load
castle + picker assets, compose the castle frame, overlay the picker windows.

1. **Composer** (`compose-party-member-picker-frame.ts`):
   - Render the banner as title (centered with the `+6` padding) **plus** the EXIT indicator,
     using the `0x7eb` (regular) / `0x7ec` (highlight) message variant selected by whether the
     cursor is on EXIT.
   - Keep the member grid math (`x=(s%2)*9+2, y=s/2+1`); render the selected member's cell with
     the engine's inverse-highlight (`0xfffb`) and others at style 3.
   - Drive the highlight from a single `cursor: number` (−1 = EXIT, 0..party_size−1 = member),
     not a separate `onCancel` boolean.

2. **Nav state machine** (`PartyMemberPicker.tsx`):
   - Replace the current `cursorIdx` + `onCancelState` with a single `cursor` (−1..N−1),
     initialized to **−1**.
   - Implement the verified keymap: Down (−1→0, s→s+2 clamped), Up (s→s−2, top-row→−1),
     Left (odd→s−1), Right (even→s+1 if in range), Enter (commit member or cancel on −1),
     Escape (cancel, = Enter-on-EXIT).
   - On commit, call the existing select callback with the slot; on cancel, the existing
     cancel callback.

3. **Verify message content during implementation:** confirm `0x7eb`/`0x7ec` decode to the
   regular/highlight "EXIT" strings (the RE finding left their content unverified). The
   pixel-parity gate is the backstop.

## Testing (the gate)

This picker has had **no engine fixture** until now. Add pixel-parity fixtures for **both
pickers in both cursor states** — 4 fixtures total, tolerance 0:

| Picker | Cursor on a member | Cursor on EXIT |
|---|---|---|
| REVIEW WHO? | `review-who-member` | `review-who-exit` |
| DISMISS WHO? | `dismiss-who-member` | `dismiss-who-exit` |

- **Recipes** (`tools/dosbox/state-catalog.ts`): deterministic drives from a fixed multi-member
  castle. e.g. `castle-3 → down enter` reaches REVIEW WHO? with cursor on EXIT
  (`review-who-exit`); `+ down` lands on slot 0 (`review-who-member`). Analogous
  `down down enter` path for DISMISS WHO?. Capture at ≥2 members so the grid is non-trivial;
  3 members exercises a second row.
- Build via `build-saves` (Accessibility terminal) → `gen-fixture` → commit `.idx.gz`/`.png`.
- **Parity tests** compose the FULL screen — `composeCastleFrame(…, members, portraitSets)`
  then the picker overlay windows — and compare to each fixture pixel-for-pixel (tolerance 0),
  per the project's "every ported screen needs a pixel-exact parity test" rule. (The fixtures
  are full 320×200 frames: castle scene + party portraits + picker overlay.)
- **Browser e2e**: one drive through REVIEW WHO? asserting the canvas vs `review-who-exit`
  (the mounted-app gate, per `docs/driving-based-testing.md`).
- Update the existing component tests (`PartyMemberPicker.test.tsx`) to the new cursor model;
  fix the misleading "column-major" comment.

## Out of scope (explicitly)

- SP2: showing equipment + the WPCVW action-menu 2D nav.
- SP3: porting EQUIP/SPELL/ASSAY/SWAG/SKILL.
- The character view reached after selecting a member (REVIEW) — that's the existing flow;
  this spec only fixes the picker that precedes it.
- The 1-member shortcut (already correct) and the ADD WHO? picker (separate widget; uses
  "CANCEL", not "EXIT").

## Files

- `packages/viewer/src/pages/castle/compose-party-member-picker-frame.ts` — banner + EXIT + highlight.
- `packages/viewer/src/components/PartyMemberPicker.tsx` — cursor model + keymap.
- `packages/viewer/tests/components/PartyMemberPicker.test.tsx` — update to new model.
- `packages/viewer/tests/pages/castle/compose-party-member-picker-frame.test.ts` — banner/EXIT assertions.
- `tools/dosbox/state-catalog.ts` — 2 new recipes (review/dismiss reachers).
- `tools/parity/fixtures/engine/{review,dismiss}-who-{member,exit}.{idx.gz,png}` — committed fixtures.
- `tools/parity/*-parity.test.ts` — 4 parity cases.
- `packages/viewer/e2e/review-member-flow.spec.ts` — extend with a picker canvas assertion.
- `TODO.md` — close #058; note #023/#041 follow-ups.
