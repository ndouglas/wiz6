# Castle party-panel re-render — design spec

**Date:** 2026-05-30

**TODO entries closed by this work:** #061, #062, #024, #026 (overturned).

**Context:** The castle MASTER OPTIONS screen renders party members on a left-side column (per FUN_0b0e portrait blit) and a per-member info panel (per FUN_1b2d). The existing `portrait-blit-y-stacking` finding claims single-column 6-stack at X=2/Y=slot*9+72; the `castle-one-member` fixture (captured 2026-05-30) refutes this — slot 0 lives at the TOP of the screen (Y≈13), not at Y=72. Nate's lived recollection says the engine actually has a 3-left + 3-right layout. Subsequent re-read of the wbase-add-party-member.json finding confirms FUN_1b2d splits even slots (0,2,4) into a LEFT window (`*0x4fba`) and odd slots (1,3,5) into a RIGHT window (`*0x4fb8`) — i.e., the 3+3 layout IS in the engine, the existing RE finding was incomplete.

Yesterday's merge shipped a DOSBox-X MCP dynamic-driving capability (send input, capture screenshots, save state to slot). This work dogfoods it: drive the running emulator to build save states with N=1..6 party members, capture fixtures from each, port the per-member info-panel renderer, and lift castle pixel-parity from the current 97% / 1-member floor to 100% / all six configurations.

## Goal

1. Overturn the wrong RE claims (`portrait-blit-y-stacking` single-column; TODO #026's 64×9 portrait dims) with corrected findings.
2. Port the engine's FUN_1b2d per-member info-panel renderer (name + colored bar + status icon + condition icons + class symbol + 2 equipment-tile slots) to `packages/viewer/src/pages/game/party-panel-render.ts`.
3. Correct the castle portrait blit to honor the LEFT/RIGHT column split (even slots → left, odd slots → right; row within panel = `(slot/2)*4`).
4. Capture engine fixtures `castle-{1..6}-members.{idx.gz,png}` via MCP-driven save-state building.
5. Lift castle parity floor to 100% for all six N values.
6. Dogfood the new DOSBox-X MCP — first end-to-end exercise of yesterday's merge.

Out of scope:

- Combat / dungeon screen renders.
- New RE on FUN_1b2d's lookup tables beyond what's needed to reach 100% parity.
- Multi-platform MCP support (#063 remains separate).
- The 9 still-stubbed debugger-driving MCP tools (#064).

## Spike validation

Before any fixture work: launch DOSBox-X via `dosbox_launch`; verify `dosbox_send_input("enter")` actually reaches the emulator and the title-page dismisses; capture a screenshot via `dosbox_screenshot` and confirm a valid PNG comes back. If any of these fail, halt and fix the MCP before proceeding.

## Engine references

| Element | Engine address | Notes |
|---|---|---|
| Portrait blit | `wbase.ovr` 0x0b0e (FUN_0b0e) | Reads `WPORT*.EGA`, blits via `dcf2(buf, X, Y, rows=9)`. Existing finding's X=2 single-column claim is INCOMPLETE — the X param needs to vary per even/odd slot OR a sibling routine handles the right side. Resolve during RE pass. |
| Info panel | `wbase.ovr` 0x1b2d (FUN_1b2d) | `party_panel_redraw_slot(party_slot)`. Splits even/odd → LEFT (`*0x4fba`) / RIGHT (`*0x4fb8`) window handle. `panel_row = (slot/2)*4`. Renders name + colored bar + status icon + condition icons + class symbol + 2 equipment-tile slots. |
| Status icon table | `wbase.ovr` `0x526 + byte*2` | Lookup keyed on sex/race composite byte. Per existing finding, exact contents not fully decoded — decode what's needed for parity. |
| Condition severity table | `wbase.ovr` `0x532 + idx*2` | Max-severity scan over `record+0x450a..+0x4513` (10 condition slots). |
| Class symbol table | `wbase.ovr` `class*2 + 0x3a` | 14-entry table. Each entry → 2-letter class abbreviation. |
| Equipment tile renderer | `wbase.ovr` FUN_1a4c | Takes `(kind, kind, row, item_lo, item_hi, sprite_id)`. Called twice from FUN_1b2d for the two visible equipment-tile slots. |
| Character record offsets | `+0x43e8` base, `+0x1b0` stride per slot | Name at +0x0, class byte at +0x4587, race byte at +0x4589, condition bytes at +0x450a..+0x4513, etc. (Documented in wpcvw-naming-pass.json and CLAUDE.md.) |

## Build-saves script

`tools/parity/build-castle-saves.ts`. Dogfood interface:

```ts
// Drives DOSBox-X via the wiz6 MCP to build save states with N=1..6 party members.
// Usage:
//   pnpm tsx tools/parity/build-castle-saves.ts --slots 1,2,3,4,5,6
// Or:
//   pnpm tsx tools/parity/build-castle-saves.ts --slot 6
// Reads roster intent from a constant in this file (e.g., ['NATHAN', 'NUG2', ...]).
// Idempotent: skips slots where dosbox_inspect_save already reports the target party_size.
```

The script:

1. Inspects each existing save to determine which are already at target party_size (skip those).
2. For each slot N that needs building: `dosbox_launch` → wait for title → navigate to ADD PARTY MEMBER N times → save state to slot N → `dosbox_inspect_save` to verify.
3. Reports a clear summary at the end (which slots built, which skipped, which failed).
4. Uses generous `setTimeout` waits between key presses + menu transitions. v1 timing is empirical; tune during first run.

## File-level changes

### Create

- `docs/re/findings/wbase-party-panel-redraw.json` — new finding from re-RE'd FUN_1b2d. Documents the LEFT/RIGHT split, per-field layout, and supersedes `portrait-blit-y-stacking`.
- `docs/re/findings/wbase-party-portrait-blit.json` — new finding correcting the FUN_0b0e screen-coord claim (per-column X, slot-derived Y).
- `packages/viewer/src/pages/game/party-panel-render.ts` — composes one party-slot info panel as cell-grid output. Signature roughly `composePartyPanel(slot, member, fontSet, palette) → TileWindow` (or RGBA chunk — adapt to castle-frame's current pattern).
- `packages/viewer/tests/pages/game/party-panel-render.test.ts` — unit tests covering name format, status-icon lookup, class-symbol, condition-icon priority, and equipment-tile renders for a known member.
- `tools/parity/build-castle-saves.ts` — MCP-driven save-state builder (see above).
- `tools/parity/fixtures/engine/castle-2-members.{idx.gz,png}`
- `tools/parity/fixtures/engine/castle-3-members.{idx.gz,png}`
- `tools/parity/fixtures/engine/castle-4-members.{idx.gz,png}`
- `tools/parity/fixtures/engine/castle-5-members.{idx.gz,png}`
- `tools/parity/fixtures/engine/castle-6-members.{idx.gz,png}`

### Modify

- `packages/viewer/src/pages/game/castle-frame.ts` — replace `PORTRAIT_BLIT_X=6` / `PORTRAIT_BLIT_Y_STRIDE=60` constants with the corrected LEFT/RIGHT-split math. Call `composePartyPanel` per active member (replacing the bare portrait blit). Remove or update the inline TODO comments referencing the wrong findings.
- `tools/parity/castle-parity.test.ts` — extend `CASES` with N=2..6 fixtures. Bump the N=1 case floor from 97 → 100 once Stage 1 lands.
- `tools/parity/README.md` (or similar; check the existing fixture-regen doc) — document the build-castle-saves workflow.
- `tools/parity/fixtures/engine/castle-one-member.{idx.gz,png}` — rename to `castle-1-members.*` for consistency with the new fixtures. Update test reference.
- `TODO.md` — close #061, #062, #024 once done; mark #026 superseded.

## Implementation phases (sequential by N)

### Stage 0 — MCP smoke + RE pass

Validate the MCP works end-to-end on this machine (`dosbox_launch` → `dosbox_send_input("enter")` → `dosbox_screenshot` returns a valid PNG). Halt if it fails.

PyGhidra decompile of FUN_0b0e + FUN_1b2d + FUN_1a4c (equipment-tile renderer). Decode the 0x526 status-icon and 0x532 condition-severity tables. Write `wbase-party-panel-redraw.json` and `wbase-party-portrait-blit.json` findings with the corrected geometry.

### Stage 1 — N=1 to 100% parity

Port FUN_1b2d into `party-panel-render.ts`. Update `castle-frame.ts` to call it for the single member at slot 0. Re-run the existing `castle-one-member` parity (or its renamed equivalent `castle-1-members`) — target 100%.

Note: NATHAN's portrait at slot 0 is on the LEFT column (slot 0 is even). Stage 1 doesn't yet exercise the RIGHT-column path; that arrives in Stage 2.

### Stage 2 — N=2 fixture + parity

Run `build-castle-saves.ts --slot 2`. This adds a second roster member (slot 1 = odd → RIGHT column). Captures `castle-2-members.{idx.gz,png}`. Add the test case to `castle-parity.test.ts`. Adjust `castle-frame.ts` to render slot 1 on the right; iterate until parity = 100%.

This is the most likely stage to surface render bugs (LEFT/RIGHT split coords). Once it lands, Stages 3-6 should be incremental.

### Stages 3-6 — N=3..6

Each follows the same pattern: build save → capture fixture → add test case → adjust render code if needed → land at 100% parity.

### Stage 7 — Finalize

- Bump existing `castle-one-member` floor to 100 (or update its rename).
- Close TODOs #061, #062, #024.
- Mark TODO #026 as superseded (the 64×9 claim is wrong; portraits are 24×24-ish per fixture).
- Commit findings + render code + fixtures together at each stage to keep blame coherent.

## Testing

### Pure-fn / default-CI gates

- `tools/parity/castle-parity.test.ts` — 6 cases at floor 100. Failure here = render diverges from engine = visible bug.
- `packages/viewer/tests/pages/game/party-panel-render.test.ts` — unit tests with mocked fontSet + a hand-built ActivePartyMember. Asserts cell-grid char codes at known positions per stage.

### Manual smoke

After each stage: `pnpm dev:viewer`, navigate to /castle with N members in active-party-store, eyeball that the info panel matches the engine fixture for that N.

### Reproducibility test

Re-run `build-castle-saves.ts` from a clean PCFILE. If output saves don't match the committed fixtures, something is non-deterministic — investigate and either pin the source or accept the variance as a known TODO.

## Risks + open items

1. **MCP integration unvalidated.** Yesterday's merge ships gated; this is the first end-to-end run. Stage 0 must validate before any other work proceeds.
2. **Accessibility permission gate.** Claude Code needs macOS Accessibility enabled. Out-of-band setup; documented in `packages/mcp/PERMISSIONS.md`.
3. **PCFILE roster contents constrain building.** If < 6 chars exist, build-saves must create more via wpcmk creation. Fighters bypass #060's broken spell-pick screens. Inspect PCFILE state before starting.
4. **Build-saves timing flakiness.** Wall-clock waits between menu transitions are empirical; the script may need tuning runs. v2 enhancement: screenshot-based screen-recognition.
5. **FUN_1b2d lookup tables (0x526, 0x532) only partially decoded.** RE pass produces enough to render what fixtures show. Comprehensive decode of every code-path deferred to follow-up TODOs if parity holds without it.
6. **Right-side portrait blit path unknown.** FUN_0b0e's documented X=2 is incomplete. Either it's called with a different X for the right column, or there's a sibling routine that piggybacks on the right-side window. Resolved during Stage 0 RE.
7. **Fixture rename.** `castle-one-member` → `castle-1-members` for consistency. Trivial git mv + test-reference update; do it once during Stage 1.

## Closes / supersedes

- Closes TODO **#061** (capture N=2..6 fixtures + parity tests).
- Closes TODO **#062** (re-RE castle party-panel layout; overturn old findings).
- Closes TODO **#024** (right-side party-panel rendering FUN_1b2d).
- Supersedes TODO **#026** (engine-faithful 64×9 portraits — claim is wrong; portraits are ~24×24 per fixture).
- Supersedes finding `wbase-add-party-member.json#portrait-blit-y-stacking` (single-column claim).
