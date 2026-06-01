# WPCVW ASSAY Action — Design

**Status:** spec — awaiting review
**Sub-project:** SP3 / second action (mission 4, after EQUIP). SPELL/SWAG/SKILL + the REVIEW
re-pick (#041) remain separate.
**Date:** 2026-06-01
**RE basis:** `docs/re/findings/wpcvw-assay-action.json` (committed on branch `wpcvw-assay`).

## Goal

Port the WPCVW ASSAY action faithfully: pick a carried item, then show its read-only inspect
popup. Gated by deterministic unit tests (the inspect descriptor) + tolerance-0 pixel parity +
a browser e2e.

## What the engine does (from RE — read-only, no mutation)

ASSAY (`wpcvw 0x6a50`, action index 3):
1. Calls `ui_pick_inventory_item` (0x1a48) with prompt **msg 0x1c2 'ASSAY WHICH ITEM?'** — offers
   ALL carried items (the same picker USE/DROP use). Cancel → no-op back to the view loop.
2. On a pick, calls the display fn **@ 0x7160** (mode=0): loads the 74-byte scenario item record
   (via the shared `scenario_load_record`), opens a **20×12 popup at (x=20, y=8, attr=0x19)**,
   renders the inspect text, and waits for **Enter/'\r' or click** to dismiss. Single inspect,
   not a loop. **Zero record stores — read-only. No identify, no skill check, no RNG.**

**Displayed fields** (record byte → content; labels from msg 0x1c3..0x1dd):
- **Name** = bytes 0..15 = `name1` (the canonical/identified name), centered. (`name2` is never read.)
- **Category label** = byte **0x3c** → msg table 0x60e..0x61e (WEAPON variants / MISSILE / MISC /
  HELMET / BODY ARMOR / LEG ARMOR / GAUNTLETS / BOOTS / SHIELD / MAGICAL / SPECIAL). This byte also
  drives a CS jump table (file 0x74af) selecting which stat lines show per category.
- **Stat lines** (category-dependent): AC (label 0x1c4, value byte 0x46), weight LB (0x1c5),
  equip-slot (1HAND/2HAND/HEAD/BODY/LEGS/HANDS/FEET), DAMAGE/TO-HIT/REGEN for weapons, CURSE: (when
  the curse byte is set), SPECIAL POWER: + effect name (SLEEP/PARALYZE/POISON/STONE/SHRED/DRAIN/
  CRITICAL/KNOCKOUT), a 6-value **resistance grid** (averaged pairs of bytes 0x1f..0x2a, clamped
  ≤99), and a **USABLE-BY / 'UNUSABLE' (msg 0x61f)** line — the same `e34b` class/race/sex bitmask
  tests EQUIP uses (record masks 0x36/0x38/0x3a vs char class/race/sex), i.e. reuse
  `equip-logic.itemEligible`.

## Architecture

Reuse the established character-view patterns (the EQUIP-era reducer sub-state + composer +
`CharacterViewPage` wiring; `item-display.scenarioItemName`; `equip-logic.itemEligible`).

1. **Reusable inventory-item picker** — `compose-inventory-picker.ts` + a reducer sub-state.
   A general "pick a carried item" widget: a `prompt` (msg-id-parameterized, so USE #038 / DROP
   #037 reuse it) + the list of carried items (itemId>0), Left/Right or Up/Down per the engine
   widget (RE the `ui_pick_inventory_item` cursor layout from the fixture), Enter commits, Esc
   cancels. ASSAY passes prompt msg 0x1c2.
2. **Inspect descriptor** (pure, `@wiz6/data`, unit-tested) — `assayItem(item, scenarioDb)` →
   a structured descriptor: `{ name, categoryLabel, lines: {label, value}[], usableBy: boolean }`,
   reading the record fields above. Category byte 0x3c selects the line set. Pure — no I/O, fully
   deterministic given the item + scenario DB.
3. **Inspect composer** — `compose-assay-display.ts`: render the 20×12 popup at (20,8) from the
   descriptor (name centered, category, stat lines, USABLE-BY). Pixel-parity gated.
4. **Reducer sub-flow + `CharacterViewPage` wiring**: ASSAY (no-op today) → `assay-picker` →
   on pick → `assay-display` (overlay the popup) → Enter/Esc → back to the action menu (cursor
   EXIT). On the picker, Esc → back to action menu.

## Testing (the gate)

- **Descriptor unit tests** (`@wiz6/data`): `assayItem(LONGSWORD, scenarioDb)` → name "LONGSWORD",
  category = WEAPON-ish (byte 0x3c), the expected stat lines, `usableBy: true` for a fighter.
  Anchor the numeric values to the captured fixture (the EQUIP-anchor approach) so the MEDIUM
  weapon-offsets are pinned by ground truth.
- **Pixel-parity** (`tools/parity/`): capture an `assay-longsword` fixture (THESUS → ASSAY →
  LONGSWORD → the 20×12 popup) via the fresh-boot DOSBox path that worked for EQUIP
  (`send_input` + `save_state` ≤9 — `load_state`/screenshot chords were flaky). Compose the char
  sheet + the assay popup overlay and assert tolerance 0.
- **Browser e2e**: inject the 3-member party, drive REVIEW → THESUS → ASSAY → pick LONGSWORD,
  assert the canvas matches `assay-longsword`, then Enter to dismiss → back to the action menu.

## Caveats / follow-ups (TODOs)

- Exact record-byte sources for the weapon DAMAGE/TO-HIT/REGEN lines are MEDIUM-confidence — the
  `assay-longsword` fixture + descriptor unit tests pin them; if a value can't be reproduced,
  flag for a live DOSBox assay of a known weapon.
- The resistance-grid column-header strings (msg 0x1c6/0x1c8 packed letters) are undecoded — the
  fixture is ground truth for those cells.
- The `0x7160` mode≠0 (icon/sprite-grid) branch is a different caller — out of scope.

## Out of scope

- USE (#038) and DROP (#037) — but the reusable inventory-item picker is built to serve them.
- SPELL / SWAG / SKILL / REVIEW-handler (#041).
- Any identify/skill mechanic — the engine has none for ASSAY.
