# ADD PARTY MEMBER — design spec

**Date:** 2026-05-28
**Engine reference:** wbase.ovr slot 0 (file 0x2cf7), action helper 0x253a, picker 0x2143
**RE findings:** [`docs/re/findings/wbase-add-party-member.json`](../../re/findings/wbase-add-party-member.json)
**Engine prose:** [`docs/re/wbase-main-menu.md`](../../re/wbase-main-menu.md) §"Slot 0 — ADD PARTY MEMBER (deep dive)"
**Canonical fixture save:** `tools/dosbox/save/1.sav` (party_size=0, NATHAN available, cursor on NATHAN)

## Goal

Implement the **ADD PARTY MEMBER** command reached from the MASTER OPTIONS
menu. The user picks a character from the roster (PCFILE.DBS-equivalent
pool); the engine adds them to the active party at the next free slot,
allocates a portrait position on the left of the screen, and returns to
the main menu. The picker UI is byte-exact against the engine's
cell-grid rendering captured from `save/1.sav`.

This spec covers ADD only. DISMISS, RESUME SAVED GAME, CHOOSE LEADER, and
the right-side party-panel (`FUN_1b2d`) are out of scope.

## Scope

In scope:

- New `AddPartyPage` component reached via the existing
  `/castle/add-party` route (currently `CastleStub`).
- New `ActiveParty` schema in `@wiz6/data` and `active-party-store.ts`
  in the viewer (persistent localStorage key `wiz6:active-party`).
- Extension of `tools/parity/dump-cells.py` to extract the wbase
  picker's dynamically-allocated windows; committed cell-grid fixture
  at `tools/parity/fixtures/cells/add-party-picker-1char.json`.
- Castle-screen integration: `CastleScreen` reads `partySize` from the
  active-party store, renders left-side portraits at the engine's
  `(X=2, Y=portraitSlotId × 9 + 0x48)`, and menu-option visibility
  updates as `partySize` changes.
- TDD throughout: cell-grid parity test, store unit tests, component
  test, layout pure-function tests.

Out of scope (explicit non-goals):

- **DISMISS A PARTY MEMBER.** Lives inside `wbase character_submenu`
  (slot 2 after `pick_party_member(0x4b3)`). Needs another RE pass on
  that submenu before it can be ported. Tracked as a TODO follow-up.
- **`FUN_1b2d` right-side party-panel rendering.** The status/condition
  icon lookup tables at wbase `0x526` / `0x532` are not REd; equipment
  tile rendering is also undone. The portrait blit on the LEFT is in
  scope; the per-member panel on the RIGHT is not.
- **msg.dbs decoding for IDs 0x4b1 / 0x4b6 / 0x4b7.** The exact engine
  strings for the picker title/header/CANCEL aren't decoded. We use
  the strings observed in `save/1.sav` cells as ground truth (the
  fixture IS the engine output); we don't need msg.dbs decoding to
  achieve cell-grid parity.
- **CHOOSE LEADER (slot 1).** Transitions to WPCVW state 0x11; out of
  scope.
- **RESUME SAVED GAME (slot 4).** Save/load is its own subsystem
  (TODO #009 Phase 6+).

## Architecture

### New files

```
packages/data/src/schemas/active-party.ts
  ActivePartySchema (members: ActivePartyMember[], schemaVersion: 1)
  ActivePartyMemberSchema extends PartyMemberSchema with portraitSlotId

packages/viewer/src/lib/active-party-store.ts
  readActiveParty, writeActiveParty, addMember, dismissAllMembers,
  availableRosterFor (derives picker candidates from roster × activeParty)

packages/viewer/src/pages/castle/AddPartyPage.tsx
  Top-level component. useState for cursor + onCancel flag.
  Loads fonts + MessageDb + PortraitSet via existing data-loader.ts.
  Renders castle background + picker overlay via CreationCanvas.

packages/viewer/src/pages/castle/compose-add-party-picker-frame.ts
  Pure TileWindow composer. Inputs: candidates[], cursor, onCancel.
  Output: TileWindow[] matching the engine cells byte-exact.

tools/parity/fixtures/cells/add-party-picker-1char.json
  Cell-grid fixture extracted from save/1.sav.

packages/viewer/tests/.../add-party-picker-parity.test.ts
  Asserts compose function output === fixture, cell-by-cell.

packages/viewer/tests/.../active-party-store.test.ts
  Round-trip + portraitSlotId allocation + add/dismiss-all tests.

packages/data/tests/.../active-party-schema.test.ts
  Schema validation tests.
```

### Modified files

```
tools/parity/dump-cells.py
  Add picker-extraction mode (scans memory for the picker's dynamic
  windows; existing wpcmk handles don't cover this).

packages/viewer/src/router.tsx
  /castle/add-party → AddPartyPage  (was CastleStub)

packages/viewer/src/pages/game/CastleScreen.tsx
  Read partySize from readActiveParty(); render portraits via
  composeCastleFrame extension; visibleMenuOptions reflects party state.

packages/viewer/src/pages/game/castle-frame.ts
  composeCastleFrame gains a `partyMembers` parameter so it can blit
  portraits in the engine's left-side positions.

packages/viewer/src/pages/game/CastleStub.tsx
  Remove `add-party` entry from STUB_INFO.
```

### Deferred (explicit non-files)

```
packages/viewer/src/pages/castle/DismissPage.tsx              — DISMISS, follow-up
packages/viewer/src/pages/castle/compose-party-panel-frame.ts — FUN_1b2d, follow-up
```

## Data model

### `@wiz6/data` schemas

```typescript
// active-party.ts
import { z } from 'zod';
import { PartyMemberSchema } from './character.js';

export const ActivePartyMemberSchema = PartyMemberSchema.extend({
  /**
   * Portrait-slot id 0..5. Determines screen Y position on the castle
   * left side: Y = portraitSlotId × 9 + 0x48 (= 72 + 9 × portraitSlotId).
   * Engine reference: FUN_0c2c allocator + FUN_0b0e blit
   * (see findings/wbase-add-party-member.json).
   */
  portraitSlotId: z.number().int().min(0).max(5),
});

export const ActivePartySchema = z.object({
  schemaVersion: z.literal(1),
  members: z.array(ActivePartyMemberSchema).max(6),
});
```

### Viewer store (`active-party-store.ts`)

```typescript
const KEY = 'wiz6:active-party';

export function readActiveParty(): ActiveParty;     // empty on first visit
export function writeActiveParty(p: ActiveParty): void;

/** Add a roster character. Allocates the smallest unused portraitSlotId
 *  in the current party (matches engine FUN_0c2c). Throws if party is
 *  full (size >= 6) or the character is already in the party. */
export function addMember(rosterChar: Character): void;

/** Empty the party. Returned characters become available again
 *  (derived state — no roster mutation needed). */
export function dismissAllMembers(): void;

/** Derive the picker candidate list: roster characters NOT in the
 *  active party. */
export function availableRosterFor(
  roster: Character[],
  activeParty: ActiveParty,
): Character[];
```

### Available-roster derivation rule

The engine tracks per-PCFILE availability via the byte array at
`*0x4fd8` (0=missing, 1=available, 2=in-party). In the port, the
roster is the pool and the active party is the in-use set; a character
is "available" iff their id appears in the roster AND does not appear
in the active party. This is a pure derivation — no separate
availability field.

### portraitSlotId allocation

Mirrors engine `FUN_0c2c`: return the smallest non-negative integer in
0..5 not already present in `members[*].portraitSlotId`. When a
member is added to an empty party they get slot 0 (Y=72); when added
to a party of 3 (slots 0,1,2) they get slot 3 (Y=99). When DISMISS
removes individuals (future work), freed slots are filled by the next
ADD — leaving Y-position gaps if a non-trailing slot is freed.
Matches engine semantics.

## Picker UI

### Engine reference (`save/1.sav` decoded)

Two picker windows overlay the bottom of the castle scene (dragonsc
top stripe + mon08 gate persist above). The castle's MASTER OPTIONS
menu options window is also still visible behind, showing the
highlighted "ADD MEMBER" entry that triggered the picker.

**Left panel** — narrower window. Contains the picker prompt and
CANCEL button. Cell contents observed in save/1.sav:

- Title row: "ADD WHO?" (cells `41 03 44 03 44 03 20 03 57 03 48 03 4f 03 3f 03`, all attr 0x03)
- Button row: "CANCEL" (cells `43 03 41 03 4e 03 43 03 45 03 4c 03`, all attr 0x03)

**Right panel** — wider window. Scrollable list with arrow glyphs:

- ▲ scroll-up arrow at top (font char with attr 0x02)
- Candidate rows (5-row sliding window centered on cursor)
- ▼ scroll-down arrow at bottom

**Row format**: `NAME(highlight) + 2-space pad + SEX(1ch) + '-' + RACE_ABBR(3ch) + space + CLASS_ABBR(3ch)`

For save/1.sav's NATHAN entry, the cell sequence is:
```
4e 50 41 50 54 50 48 50 41 50 4e 50  → NATHAN (attr 0x50, inverse highlight)
20 10 20 10                          → 2-space pad (attr 0x10)
4d 70                                → 'M' (sex, attr 0x70)
2d 90                                → '-' (separator, attr 0x90)
52 60 41 60 57 60                    → "RAW" (race abbrev — Rawulf, attr 0x60)
20 10                                → space (attr 0x10)
46 30 49 30 47 30                    → "FIG" (class abbrev — Fighter, attr 0x30)
```

Per-field color attrs are engine-determined and match the wbase
highlight-attr-sign convention from CLAUDE.md.

### Compose function contract

```typescript
export function composeAddPartyPickerFrame(
  view: {
    candidates: ReadonlyArray<Character>;
    cursorIdx: number;        // 0..candidates.length-1
    onCancel: boolean;        // true = CANCEL highlighted, list cursor not
  },
  db: MessageDb,
): TileWindow[];
```

Returns the windows in paint order: the castle background's persistent
windows (created via existing `composeCastleFrame`), then the picker's
left and right panels overlaid. The exact window dimensions and
positions come from the extracted fixture (the implementation reads
the fixture's window header at TDD time to write the composer).

### Two-state cursor

Same model as the existing wpcmk roster pickers (REVIEW/DELETE/RENAME):
exactly one of `cursorIdx` (a list row) or `onCancel` (the CANCEL
button) is "active." Highlight (attr 0x50) flips between them based
on `onCancel`. Per-key behavior follows the existing
`useRosterPicker` hook (see `findings/wpcmk-roster-picker-input.json`)
— if the hook generalizes, lift it to `packages/viewer/src/hooks/`;
otherwise copy then refactor in a follow-up.

| Key | When on list | When on CANCEL |
|----:|--------------|----------------|
| ArrowUp | Move to CANCEL | — |
| ArrowLeft | `cursor--` clamp ≥ 0 | Move to list |
| ArrowDown | — | Move to list |
| ArrowRight | `cursor++` clamp < count | Move to list |
| Enter | Add this character | Return without adding |
| Escape | Return without adding | Return without adding |

### Cancel path

Match the engine: clean no-op. No state mutation, no party-table
writes, no portrait blit. Navigate back to `/castle`. The active
party stays exactly as it was.

## CastleScreen integration

### partySize wiring

Replace the hard-coded `DEFAULT_CONTEXT.partySize = 0` with a value
read from `readActiveParty().members.length`. The existing
`visibleMenuOptions(ctx)` already handles slot enable/disable rules
based on partySize (slot 0 disabled when partySize=6; slot 4 RESUME
disabled when partySize ≥ 1; etc.); no change to that function.

### Portrait rendering

For each active member, render their portrait at engine position
`(X=2, Y=memberPortraitSlotId × 9 + 0x48)`. Width 64 px (8 EGA bytes ×
8 pixels), height 9 rows. Source: `PortraitSet` loaded via
`loadPortraitSet` (same loader the wpcmk creation flow uses). The
character's portrait sprite is indexed by their `portraitIndex` field
on the `Character` record (already documented).

`composeCastleFrame` gains a `partyMembers: ActivePartyMember[]`
parameter. For each member it blits the portrait sprite into the
appropriate cell region of `top` or however `composeCastleFrame`
structures the castle scene. Implementation detail: the existing
function may need refactoring to support per-pixel overlays in a
specific screen region; the parity-test-first approach surfaces this.

## Implementation path (sequenced)

1. **Extend `dump-cells.py`** with a wbase-picker mode that finds the
   picker's two windows in the save state by scanning memory for cell
   patterns containing the cursor-highlighted name. Validate against
   `save/1.sav` (must produce a fixture with NATHAN at attr 0x50,
   "ADD WHO?", "CANCEL", scroll arrows). The exact wbase window struct
   layout will be derived empirically here. Commit the fixture at
   `tools/parity/fixtures/cells/add-party-picker-1char.json`.

2. **Schemas and store** (TDD): write `ActivePartySchema` +
   `ActivePartyMemberSchema` in `@wiz6/data` with round-trip tests,
   then `active-party-store.ts` with tests for add/dismissAll/
   portraitSlotId allocation/availableRosterFor.

3. **Composer** (TDD): write
   `compose-add-party-picker-frame.ts` driven by the fixture. The
   parity test asserts byte-exact cell equality against the fixture
   for the NATHAN/1-candidate state. Pure-layout unit tests cover
   cursor positions, scrolling for >5 candidates, two-state cursor
   toggle, empty-list early return (-1).

4. **AddPartyPage component**: render the castle background +
   picker overlay using `CreationCanvas` + the composer.
   Mount-effect loads fonts/MessageDb/PortraitSet. Component test
   covers key handling with mocked stores and a 5-character roster.

5. **CastleScreen integration**: extend `composeCastleFrame` for
   portraits, then wire `CastleScreen` to read partySize from the
   active-party store. `castle-parity.test.ts` already exists; extend
   it to cover the portrait-blit case using a populated active party
   captured from a future save.

6. **Wire route**: swap `/castle/add-party → CastleStub` for
   `→ AddPartyPage` in `router.tsx`; remove the `add-party` entry
   from `CastleStub`'s STUB_INFO.

7. **Manual verification** (`pnpm dev:viewer`): create a couple of
   characters via `/castle/character-menu`, navigate to `/castle`,
   select ADD PARTY MEMBER, observe picker, pick one, verify
   portrait appears on the left and the menu's slot 4 RESUME becomes
   visible.

Each step is one or more commits.

## Testing strategy

- **Cell-grid parity** (gold standard): `add-party-picker-1char.json`
  is the fixture from `save/1.sav`. The composer test asserts
  byte-exact equality cell-by-cell against this fixture. A future
  capture with multiple candidates (3+ characters in PCFILE, cursor
  on the middle one) would harden the scrolling logic; not blocking
  for v1.

- **Pure layout unit tests**: feed the composer synthetic
  candidates and verify cursor highlights, two-state cursor, scrolling
  edges, empty list, full party (partySize=6).

- **Store unit tests**: add/dismissAll/portraitSlotId allocation
  (smallest-free), localStorage round-trip via zod, schema validation.

- **Component test** (`AddPartyPage`): mocked stores + 5-character
  roster; assert key handling produces correct dispatched events and
  active-party-store calls.

- **Castle parity**: extend `castle-parity.test.ts` to assert
  portrait-blit placement for a party of 1/3/6. Requires a future
  save capture; OK to land the test as `it.skip` initially.

- **Manual smoke**: `pnpm dev:viewer` walkthrough listed above.

## Open questions / TODOs to track

- **Q1.** Exact wbase window struct format. The wpcmk format
  (`u8 w@0, u8 h@1, u8 x@2, u8 y@3, u8 attr@4, cells@+0x10`) doesn't
  cleanly fit the wbase picker memory layout in `save/1.sav` — the
  picker uses dynamically-allocated windows from `ui_window_create`
  that may follow a different struct. Resolved during Step 1
  (dump-cells extension); add a finding under
  `docs/re/findings/wbase-window-struct.json` if it differs from
  the wpcmk format.

- **Q2.** Race/class abbreviation length (3 chars per the observed
  cells). Confirm via additional captures with longer race/class
  names (e.g. "LIZARDMAN" race, "SAMURAI" class).

- **Q3.** Whether to lift `useRosterPicker` from
  `roster/creation/screens/` to `packages/viewer/src/hooks/` for
  shared use. Decide during Step 4 based on whether the wbase picker
  needs different semantics.

## Follow-up work (not in this spec)

- **DISMISS A PARTY MEMBER**: needs RE pass on
  `wbase_character_submenu` (slot 2 via `pick_party_member(0x4b3)`).
  File at `docs/re/findings/wbase-character-submenu.json` once done,
  then a sibling spec to this one.
- **Right-side party panel (`FUN_1b2d`)**: needs RE on the
  `0x526`/`0x532` lookup tables and equipment-tile rendering.
- **msg.dbs ID-to-text decoding** for IDs ≥ 718 (0x4b1/0x4b6/0x4b7
  among others). Decoupled from this feature since the fixture
  captures the rendered strings directly.
- **CHOOSE LEADER (slot 1)**: WPCVW transition; out of scope.
- **RESUME SAVED GAME (slot 4)**: save/load subsystem (TODO #009
  Phase 6+).
