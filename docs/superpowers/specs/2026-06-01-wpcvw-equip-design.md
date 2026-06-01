# WPCVW EQUIP Action — Design

**Status:** spec — awaiting review
**Sub-project:** SP3 / first action (mission 4 of the castle REVIEW MEMBER work). The other
actions (SPELL/ASSAY/SWAG/SKILL, REVIEW-handler #041) are separate.
**Date:** 2026-06-01
**RE basis:** `docs/re/findings/wpcvw-equip-action.json` (the wizard flow) +
`docs/re/findings/wpcvw-equip-internals.json` (eligibility, AC formula, item offsets, Phase-3,
bit0). Both committed on branch `wpcvw-equip`.

## Goal

Port the engine's EQUIP action faithfully: the re-equip-from-scratch wizard reached from the
camp character-view action menu, including the AC recomputation and item eligibility, behind a
pixel-parity gate (UI) + deterministic unit tests (logic).

## What the engine does (from RE)

EQUIP (`wpcvw 0x6a17` → `FUN_8e35`) is a stateful wizard, NOT a toggle:
- **Phase 1 (reset):** write 0xFF to all 8 equipment body slots, clear each carried item's
  equipped bit (`flags &= 0xFE`), recompute **base AC** via `FUN_884f`.
- **Phase 2 (per-slot pickers):** walk body slots **0..7 in order** (0=weapon, 1=off-hand/shield,
  2=cloak, 3=head, 4=chest, 5=legs, 6=hands, 7=feet). For each, collect eligible carried items
  (`FUN_835e`); if any, draw a horizontal candidate row in the main panel — Left/Right moves
  through candidates plus an "empty/skip" position (cursor −1), Enter/click commits. On commit:
  `equipment[bodySlot] = invIndex`, set item `flags |= 1`, apply the item's stats. A 2-handed
  weapon (item flag 0x08) consumes the off-hand slot (skips body1). Slots with 0 candidates are
  skipped silently.
- **Phase 3 (grants):** a second 0..7 pass applies equip-granted skill/attr/resist/HP bumps via a
  5-entry table (item byte 0x44 grant code) — usually a no-op for stock gear.

**Eligibility** (`FUN_835e` + the generic bit-test `func_0xe34b` = wroot `FUN_1000_28af`):
an item is offered for a slot iff its `equip_slot` maps to that body slot AND it passes three
bitmask tests — `bit_test(itemRecord.classMask, member.class)`, `…raceMask, member.race)`,
`…sexMask, member.sex)` — where the masks are item-record bytes **54 (class), 56 (race), 58
(sex/alignment)**. **Item flag 0x40 (CLASS_LOCKED) is NOT used in the equip path** (it's the DROP
handler's concern). Off-hand/shield candidates are additionally disqualified against the equipped
weapon's type byte.

**AC** (`FUN_884f`, 14-way class dispatch): base **10**, then −1 per SPD threshold (≥16, ≥18),
−2 if race==5, and for monk/ninja (class 0xc/0xd) −((level/2, cap 20) + skill/10). Stored at
record `+0x4548` and broadcast to the 7 body-slot AC bytes `+0x4549..+0x454f`. Each equipped
item's **AC bonus = item-record byte 0x46**, SUBTRACTED (lower=better) from the weapon AC
(`+0x4549`, body 0/1) or the armor slot (`+0x4548+bodySlot`, body 2..7).

**bit0 overload:** item `flags` bit0 = "cursed-low" on disk AND "equipped" at runtime; persisted
verbatim (pcfile.dbs is a byte copy of the record). Genuine curse uses **bit1 (0x02)**, which
Phase-1's `&= 0xFE` preserves. (MEDIUM confidence — wants a live equip+save round-trip; see Risks.)

## Architecture — two layers

### Layer A: pure equip logic (`@wiz6/data`, no DOM/I/O — fully unit-testable)
A new module (e.g. `packages/data/src/character/equip-logic.ts`). All inputs are a
`Character`/`ActivePartyMember` + the `ScenarioDb` (item records via `scenarioDb.items[id].bytes`).
- `BODY_SLOTS` + `bodySlotForEquipSlot(equipSlot): number | null` — the equip_slot→body_slot map.
- `itemEligible(member, item): boolean` — the 3 bitmask tests against item `bytes[54/56/58]`
  indexed by `member.class/race/sex` (generic `bit_test(mask, value) = mask[value>>3] & (1<<(value&7))`).
- `equipCandidates(member, bodySlot, scenarioDb, priorSelections): InvIndex[]` — carried items
  whose body slot matches, that pass `itemEligible`, applying 2H/shield exclusivity vs the
  weapon already chosen this pass; excludes already-selected indices.
- `computeAc(member, scenarioDb): { derivedAc: number; bodyAc: number[] }` — the `FUN_884f`
  formula + per-equipped-item AC subtraction. Returns the displayed AC fields.
- `applyEquipSelections(member, selections: (InvIndex|null)[8], scenarioDb): ActivePartyMember` —
  Phase-1 reset semantics + apply the 8 selections → new `equipment[8]`, item `flags` (bit0
  equipped; bit1 preserved), recomputed `derivedAc`/`bodyAc`, plus the Phase-3 grants (implement
  per RE; the grant magnitudes are MEDIUM-confidence — see Risks). Returns a new immutable member.

These are gated by **deterministic unit tests** (no driving): eligibility for THESUS (fighter)
per slot, the body-slot map, 2H exclusivity, `computeAc` (THESUS base 10; equipping LEATHER
CUIRASS changes the right body-slot AC), and an `applyEquipSelections` round-trip.

### Layer B: the wizard UI (`@wiz6/viewer`)
- **Reducer sub-state** in `character-view-reducer.ts` (or a focused `equip-wizard-reducer.ts`):
  `{ kind: 'equip-wizard', slot, selections: (InvIndex|null)[8], cursor }`. EQUIP (no-op today)
  enters it at slot 0 (after the Phase-1 reset is reflected in the working copy). Left/Right move
  `cursor` over `[candidates…, skip(−1)]`; Enter records `selections[slot]` and advances to the
  next slot with candidates (2H consumes body1); after the last slot, emit a `commit-equip`
  intent. ESC cancels the whole wizard (no persistence — revert to the pre-EQUIP equipment).
- **Composer** `compose-equip-picker.ts`: renders the per-slot horizontal candidate row in the
  main panel (the Phase-2 UI), matching the engine. Pixel-parity gated.
- **`CharacterViewPage` wiring:** EQUIP → run the wizard (overlay the candidate row on the char
  sheet, like the EDIT sub-flows); on `commit-equip`, call `applyEquipSelections` and
  `updateActiveMember`. The char sheet's AC + inventory (equipped markers) reflect the result via
  the existing composer (which already reads `member.bodyAc`).

Gated by **pixel parity** (EQUIP-screen fixture(s)) + a **browser e2e** driving the wizard.

## Staging (one spec, ordered tasks)

- **Stage A — pure logic** first: build + unit-test Layer A entirely. *Needs no driving.* This
  de-risks the correctness-critical, RE-heavy core (AC recompute + eligibility) deterministically,
  and is independently mergeable.
- **Stage B — wizard UI** second: the reducer + composer + wiring, gated by pixel parity + e2e.

## Testing (the gate)

- **Stage A:** vitest unit tests in `@wiz6/data` for every Layer-A function, using THESUS's real
  data (fighter, items 8/135/132/130/141) + the real `scenarioDb`. Assert eligibility per slot,
  the AC numbers, and `applyEquipSelections` output (equipment array + flags + AC).
- **Stage B pixel parity:** capture the engine EQUIP-wizard screen(s) — at least the first
  populated per-slot picker (slot 0, weapon, with LONGSWORD as a candidate) — as a committed
  fixture; pixel-parity test composes the char sheet + the candidate-row overlay vs the fixture
  (tolerance 0). **Fixture capture needs DOSBox driving** (`build-saves` recipe: castle-3 →
  REVIEW → THESUS → EQUIP → into slot 0); run from an Accessibility-granted terminal if MCP
  driving is flaky.
- **Stage B e2e:** inject a 3-member party, drive REVIEW MEMBER → THESUS → EQUIP → step the
  wizard, assert the canvas vs the fixture + assert the resulting equipment persisted.
- **Save round-trip test** for the bit0 equipped/cursed overload: equip an item, serialize the
  member, confirm bit0=equipped is persisted and bit1 (genuine curse) is untouched.

## Risks / open items (carry as TODOs, handle per RE)

- **bit0 equipped/cursed overload** (MEDIUM): implement bit0=equipped + preserve bit1; the
  save-round-trip test + a future live DOSBox equip+save confirm no stock item uses bit0-alone as
  cursed (none found, but unproven). File a TODO for the live check.
- **Phase-3 grant magnitudes/directions** (MEDIUM): implement per the RE table (resist→floor 4,
  cure-all, −365 XP, +rng(d6+2) HP, attr bumps); flag for live verification. Stock fighter gear
  triggers none, so the Stage-A/B gates won't exercise it — note this gap.
- **Scenario item-record byte offsets** (54/56/58 masks, 0x46 AC): verified against
  scenario-dbs.md guesses; Stage A's unit tests confirm them against known items (LONGSWORD AC,
  fighter eligibility) — if an offset is off, the unit test catches it.
- **per-slot picker title messages**: not resolved to text in RE; the pixel fixture is ground
  truth for whatever the row renders.

## Out of scope

- The other actions (SPELL/ASSAY/SWAG/SKILL) and the REVIEW re-pick handler (#041).
- A "friendlier per-item equip" QoL mode — candidate **House Rules** entry for later, NOT this
  port (this port is the faithful re-equip-all wizard).
- DROP's cursed lockout (separate handler).
