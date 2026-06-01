# WPCVW ASSAY Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the read-only WPCVW ASSAY action — pick a carried item, show its inspect popup — with a reusable inventory-item picker (serving future USE/DROP), behind unit + pixel-parity + e2e gates.

**Architecture:** A pure `assayItem` descriptor in `@wiz6/data` (item → display fields, reusing `equip-logic.itemEligible` + `item-display.scenarioItemName`); a reusable prompt-parameterized inventory-item picker composer + pure nav helper; a `compose-assay-display` popup composer; reducer sub-states (`assay-picker` → `assay-display`) + `CharacterViewPage` wiring. Read-only — no store writes.

**Tech Stack:** TS ESM (`.js` imports), Zod (`@wiz6/data`), React + react-router (viewer), vitest, Playwright, DOSBox-X MCP (fresh-boot capture path).

**RE basis (read it):** `docs/re/findings/wpcvw-assay-action.json`. Spec: `docs/superpowers/specs/2026-06-01-wpcvw-assay-design.md`. Branch `wpcvw-assay`.

**Key RE facts:**
- Picker: `ui_pick_inventory_item` (0x1a48), prompt **msg 0x1c2 'ASSAY WHICH ITEM?'**, all carried items; cancel = no-op.
- Display fn 0x7160: popup **(x=20, y=8, w=20, h=12, attr=0x19)**. **Name1** (scenario bytes 0..15) centered at row 3 (`x = 10 − (len+1)/2`). **Category** = byte **0x3c** → msg `0x60e + type` (0=WEAPON(S),1=WEAPON(E),2=WEAPON(T),3=WEAPON(L),4=MISSILE,5=MISC. ITEM,6=HELMET,7=BODY ARMOR,8=LEG ARMOR,9=GAUNTLETS,10=BOOTS,11=SHIELD,12/13/16=MAGICAL,14/15=SPECIAL). Category byte selects which stat lines render (jump table 0x74af). **Stat-line labels** (msg ids): AC 0x1c4, weight "LB" 0x1c5, "PS" 0x1c3, equip-slot 1HAND/2HAND 0x1c9/0x1ca + HEAD/BODY/LEGS/HANDS/FEET 0x1cc..0x1d0, DAMAGE 0x1d2, TOHIT 0x1d3, REGEN 0x1d4, CURSE: 0x1d1, SPECIAL POWER: 0x1d5 + effect 0x1d6..0x1dd; resistance grid (headers 0x1c6/0x1c8). **USABLE-BY** via `e34b`(record masks 0x36/0x38/0x3a) — else "UNUSABLE" (msg 0x61f). **AC value = record byte 0x46** (as EQUIP). Read-only.
- **MEDIUM:** the exact record-byte sources for the weapon DAMAGE/TOHIT/REGEN *values* + the resistance-grid cells — anchor to the `assay-longsword` fixture (the EQUIP-anchor approach).
- **Label msg-ids 0x1c3..0x1dd / 0x60e..0x61e are low-index strings in msg.json `records`, NOT `indexedMessages`** (so `creationString` returns empty for them — the EQUIP composer hit this). The descriptor returns label **TEXT** from a hardcoded table matching the fixture; the pixel fixture is the gate.

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `packages/data/src/equipment/assay-logic.ts` | NEW pure `assayItem` descriptor | Create |
| `packages/data/tests/equipment/assay-logic.test.ts` | descriptor unit tests (LONGSWORD anchor) | Create |
| `packages/data/src/index.ts` | export `assayItem` + types | Modify |
| `packages/viewer/src/pages/castle/compose-inventory-picker.ts` | NEW reusable carried-item picker composer + `nextInventoryCursor` | Create |
| `packages/viewer/tests/pages/castle/compose-inventory-picker.test.ts` | picker cell + nav tests | Create |
| `packages/viewer/src/pages/castle/compose-assay-display.ts` | NEW 20×12 inspect popup composer | Create |
| `packages/viewer/src/pages/castle/character-view-reducer.ts` | `assay-picker` + `assay-display` sub-states | Modify |
| `packages/viewer/tests/pages/castle/character-view-reducer.test.ts` | reducer sub-state tests | Modify |
| `packages/viewer/src/pages/castle/CharacterViewPage.tsx` | ASSAY wiring (picker → display → dismiss) | Modify |
| `tools/parity/fixtures/engine/assay-longsword.{idx.gz,png}` | engine fixture | Create (capture) |
| `tools/parity/screen-parity.test.ts` | `assay-longsword` pixel case | Modify |
| `packages/viewer/e2e/review-member-flow.spec.ts` | ASSAY e2e | Modify |
| `TODO.md` | close #035; follow-ups | Modify |

---

## Task 1: capture the ASSAY fixture (ORCHESTRATOR / USER-RUN — needs driving)

> **Run by the orchestrator via MCP** (fresh-boot path — `load_state`/screenshot chords were flaky this session, but launch→`send_input`→`save_state`≤9→`gen-fixture` works). Done FIRST so the descriptor + composer can match it.

- [ ] **Step 1: drive to the ASSAY inspect popup (blind, send_input):** launch → `enter` (title) → `enter enter` ×3 (build THESUS/TEMPEST/LYSANDR) → `down enter` (REVIEW MEMBER → picker) → `down enter` (THESUS → char view, cursor on EXIT) → navigate to ASSAY: the 7-entry camp menu is `[EQUIP,SPELL,ASSAY,SWAG,SKILL,REVIEW,EXIT]` (EXIT=idx6, col3row0; ASSAY=idx2, col1row0), so from EXIT `ArrowLeft` ×2 → SKILL(idx4)→ASSAY(idx2) — **confirm via `nextActionCursor`** (`left` = idx−2): `left left` = 6→4→2 = ASSAY ✓ → `enter` (ASSAY picker, "ASSAY WHICH ITEM?") → `enter` (pick the first item = LONGSWORD, inv idx 0 — confirm it's the default cursor) → the inspect popup → `save_state` to slot 4 (≤9).
- [ ] **Step 2:** `pnpm tsx tools/parity/gen-fixture.ts --save 4 --name assay-longsword`; **Read the PNG** to verify it's the LONGSWORD inspect popup (name centered, AC/DAMAGE/etc. lines, USABLE-BY). If it's the picker or wrong item, re-drive (adjust the picker pick).
- [ ] **Step 3: commit** `tools/parity/fixtures/engine/assay-longsword.*`: `test(parity): capture ASSAY LONGSWORD inspect-popup fixture`.
- [ ] **(Optional) Step 4:** if the picker screen ("ASSAY WHICH ITEM?") differs visibly from a generic list and you want it gated, also capture `assay-picker` (one `save_state` before the final pick `enter`). Otherwise the e2e covers the picker.

---

## Task 2: pure `assayItem` descriptor (`@wiz6/data`)

**Files:** Create `packages/data/src/equipment/assay-logic.ts`, `packages/data/tests/equipment/assay-logic.test.ts`

The descriptor turns a scenario item record into the display fields. Read `wpcvw-assay-action.json` for the offset/label map; reuse `itemEligible` (equip-logic) + `scenarioItemName` (item-display lives in the viewer — for `@wiz6/data` purity, read `name1` directly from `scenarioDb.items[id].name1`).

- [ ] **Step 1: Write the failing test** (anchor to LONGSWORD = scenario item 8 + a fighter member):

```ts
import { describe, it, expect } from 'vitest';
import { assayItem } from '../../src/equipment/assay-logic.js';
import { ScenarioDbSchema, type ScenarioDb, type Character } from '../../src/index.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
let _db: ScenarioDb | null = null;
const db = () => (_db ??= ScenarioDbSchema.parse(JSON.parse(readFileSync(join(ROOT, 'extracted/scenario/scenario.json'), 'utf-8'))));
const fighter = { class: 0, race: 0, sex: 0 } as unknown as Character;

describe('assayItem(LONGSWORD)', () => {
  it('name is the identified name1', () => {
    expect(assayItem(8, fighter, db()).name).toBe('LONGSWORD');
  });
  it('category label from byte 0x3c', () => {
    const d = assayItem(8, fighter, db());
    expect(d.categoryLabel).toMatch(/WEAPON/); // byte 0x3c ∈ 0..3
  });
  it('includes an AC line and is usable by a fighter', () => {
    const d = assayItem(8, fighter, db());
    expect(d.lines.find((l) => l.label === 'AC')?.value).toBe(String(db().items[8]!.bytes[0x46]));
    expect(d.usableBy).toBe(true);
  });
  it('a class-restricted item reports not-usable', () => {
    // pick any item whose classMask (bytes 54/55) excludes fighter (class 0); assert usableBy false.
    // (Find one in scenario.dbs during impl; if none, assert the eligibility path with a synthetic record.)
  });
});
```

- [ ] **Step 2: Run, confirm FAIL.** `pnpm --filter @wiz6/data exec vitest run assay-logic`
- [ ] **Step 3: Implement `assay-logic.ts`.**

```ts
/**
 * WPCVW ASSAY — pure read-only item-inspect descriptor. RE: wpcvw-assay-action.json.
 * Maps a scenario item record → the labeled fields the 0x7160 popup renders.
 */
import type { Character } from '../schemas/character.js';
import type { ScenarioDb } from '../schemas/scenario-db.js';
import { itemEligible } from './equip-logic.js';

export interface AssayLine { label: string; value: string }
export interface AssayDescriptor { name: string; categoryLabel: string; lines: AssayLine[]; usableBy: boolean }

// Category byte 0x3c → label (msg 0x60e+type; low-index strings, hardcoded to match the fixture).
const CATEGORY_LABELS = [
  'WEAPON', 'WEAPON', 'WEAPON', 'WEAPON', 'MISSILE', 'MISC. ITEM', 'HELMET', 'BODY ARMOR',
  'LEG ARMOR', 'GAUNTLETS', 'BOOTS', 'SHIELD', 'MAGICAL', 'MAGICAL', 'SPECIAL', 'SPECIAL', 'MAGICAL',
];

export function assayItem(itemId: number, member: Pick<Character, 'class' | 'race' | 'sex'>, scenarioDb: ScenarioDb): AssayDescriptor {
  const item = scenarioDb.items[itemId];
  const bytes = item?.bytes ?? [];
  const name = item?.name1 ?? '';
  const category = bytes[0x3c] ?? 0;
  const categoryLabel = CATEGORY_LABELS[category] ?? 'MISC. ITEM';
  const usableBy = itemEligible(member, bytes);

  const lines: AssayLine[] = [];
  lines.push({ label: 'AC', value: String(bytes[0x46] ?? 0) });
  lines.push({ label: 'LB', value: String(bytes[/* weight offset — verify vs fixture */ 0x2] ?? 0) });
  // Weapon lines (category 0..4): DAMAGE/TOHIT/REGEN — exact value offsets are MEDIUM; the
  // assay-longsword fixture pins them. Add per-category lines guided by byte 0x3c, matching the
  // fixture (Task 7 iterates the offsets until the popup is 0-diff).
  // ... (curse/special-power/resistance per the finding + fixture) ...
  return { name, categoryLabel, lines, usableBy };
}
```
> The line SET + numeric byte offsets (weight, damage, tohit, regen, resistance) are MEDIUM — implement the labels from the RE table and the values guided by the fixture: Task 7's pixel test is the gate. Start with name/category/AC/usableBy (HIGH-confidence), then add the rest while iterating Task 7 to 0-diff. Keep the descriptor pure + the line list ordered as the fixture shows.

- [ ] **Step 4: Run, confirm the HIGH-confidence assertions PASS** (name, category, AC, usableBy). tsc clean. **Step 5: Commit** `feat(data): assayItem read-only inspect descriptor`.

## Task 3: export `assayItem`

**Files:** `packages/data/src/index.ts`
- [ ] Add `export { assayItem, type AssayDescriptor, type AssayLine } from './equipment/assay-logic.js';`. Verify `pnpm --filter @wiz6/data exec tsc --noEmit && pnpm --filter @wiz6/data exec vitest run`. Commit `feat(data): export assayItem`.

## Task 4: reusable inventory-item picker

**Files:** Create `packages/viewer/src/pages/castle/compose-inventory-picker.ts`, `packages/viewer/tests/pages/castle/compose-inventory-picker.test.ts`

A prompt-parameterized "pick a carried item" picker (the `ui_pick_inventory_item` widget). Model the composer on `compose-equip-picker.ts` / `compose-party-member-picker-frame.ts`; model the nav on `nextEquipCursor` / SP1's `nextCursor`. RE the cursor layout from the `assay-longsword` capture (or the optional `assay-picker` fixture) — likely a vertical/horizontal list of carried-item names with a prompt; match it.

- [ ] **Step 1: Failing nav test.** `nextInventoryCursor(cursor, key, itemCount)` — clamp over `[0, itemCount-1]` (per the engine widget's axis; confirm L/R vs U/D from the fixture):

```ts
import { nextInventoryCursor } from '../../../src/pages/castle/compose-inventory-picker.js';
it('clamps within [0, itemCount-1]', () => {
  expect(nextInventoryCursor(0, 'ArrowDown', 3)).toBe(1);
  expect(nextInventoryCursor(2, 'ArrowDown', 3)).toBe(2);
  expect(nextInventoryCursor(0, 'ArrowUp', 3)).toBe(0);
});
```
(Adjust the keys to the engine widget's axis once the fixture shows it.)

- [ ] **Step 2: Run FAIL. Step 3: Implement** `composeInventoryPicker({ prompt, items: {name}[], cursor })` → TileWindow(s) (prompt + the carried-item list, cursored item highlighted via `invertHighlight`/attr 0x50, like the other pickers) + `nextInventoryCursor`. Match the geometry to the fixture.
- [ ] **Step 4: Run PASS + tsc clean. Step 5: Commit** `feat(castle): reusable inventory-item picker (serves ASSAY/USE/DROP)`.

## Task 5: `compose-assay-display` popup

**Files:** Create `packages/viewer/src/pages/castle/compose-assay-display.ts`

- [ ] **Step 1: Failing cell test** — `composeAssayDisplay({ descriptor })` renders a 20×12 window at (x=20*8=160, y=8*8=64): name centered at row 3, category line, the stat lines, USABLE-BY. Assert the window geometry + the name placement + a couple of label cells. (Exact rows pinned by Task 7's fixture.)
- [ ] **Step 2: Run FAIL. Step 3: Implement** `composeAssayDisplay(view)` → a `createTileWindow({ screenX: 160, screenY: 64, widthCells: 20, heightCells: 12 })` (attr 0x19 chrome), name centered (`x = 10 − Math.floor((name.length+1)/2)` row 3), category + lines + USABLE-BY rows. Model on `compose-equip-picker.ts` / `compose-main-panel.ts` text rendering.
- [ ] **Step 4: Run PASS + tsc clean. Step 5: Commit** `feat(castle): ASSAY inspect popup composer`.

## Task 6: reducer sub-states

**Files:** `character-view-reducer.ts`, `character-view-reducer.test.ts`

- [ ] **Step 1: Failing test.** Add `assay-picker { cursor }` + `assay-display { itemIdx }` to `CharacterViewState`. In `action-menu` ENTER: `label === 'ASSAY'` → `{ kind: 'assay-picker', cursor: 0 }` (was the no-op fallthrough). In `assay-picker`: arrows → `nextInventoryCursor`-style cursor move (the reducer needs the item count — pass via the same EquipInfo-style param the EQUIP wizard used, or a `carriedCount`); ENTER → `{ kind: 'assay-display', itemIdx: <inventory index at cursor> }`; ESC → `{ kind: 'action-menu', cursorIdx: <EXIT> }` (page rehydrates). In `assay-display`: ENTER or ESC → back to `action-menu` (EXIT). Tests for each transition.
- [ ] **Step 2: Run FAIL. Step 3: Implement** the transitions (mirror the `equip-wizard` pattern — carried-item info passed in from the page; cursor→inventory-index translation in the reducer or page). **Step 4: PASS + tsc clean. Step 5: Commit** `feat(castle): ASSAY reducer sub-states (picker → display)`.

## Task 7: CharacterViewPage wiring + pixel parity

**Files:** `CharacterViewPage.tsx`, `tools/parity/screen-parity.test.ts`

- [ ] **Step 1: Wire the page.** When `assay-picker`: compute carried items (`member.inventory` itemId>0 → `{name: scenarioItemName(...)}`), overlay `composeInventoryPicker({ prompt: 'ASSAY WHICH ITEM?', items, cursor })`. When `assay-display`: overlay `composeAssayDisplay({ descriptor: assayItem(member.inventory[itemIdx].itemId, member, scenarioDb) })`. Read-only — NO `updateActiveMember`. Reuse the loaded `scenarioDb`. Keys: arrows (picker), Enter (pick / dismiss), Esc (cancel/dismiss).
- [ ] **Step 2: Pixel-parity case** `assay-longsword` in `screen-parity.test.ts`: render = THESUS char sheet (reuse `renderReviewMemberView`/`renderEquipSlot0` setup) + `composeAssayDisplay({ descriptor: assayItem(8, thesus, scenarioDb) })` overlay; compare to the fixture at tolerance 0.
- [ ] **Step 3: Iterate to 100%** — adjust `compose-assay-display` + the descriptor's MEDIUM line offsets (weight/damage/tohit/regen/resistance) against the diff until 0-diff. **Do NOT lower tolerance.** Confirm `equip-slot0` / `review-member-view` / `creation-review-member` still 100%. tsc clean (both packages).
- [ ] **Step 4: Commit** `feat(castle): wire ASSAY (picker→inspect) + pixel-parity (assay-longsword, tol 0)`.

## Task 8: browser e2e

**Files:** `packages/viewer/e2e/review-member-flow.spec.ts`
- [ ] **Step 1:** Add a test: inject the 3-member party (reuse the EQUIP/review spec's party), navigate to `/castle/review-member/0`, drive `ArrowLeft ×2` (EXIT→SKILL→ASSAY) + `Enter` (picker) + `Enter` (pick LONGSWORD) → assert canvas matches `assay-longsword`; then `Enter` (dismiss) → assert back at the action menu (canvas non-blank / EXIT highlighted). Read the spec for the injection + `expectCanvasMatchesFixture` helpers; confirm the ASSAY menu index via the reducer.
- [ ] **Step 2: Run** `pnpm --filter @wiz6/viewer test:e2e review-member-flow`. If the mounted ASSAY popup doesn't match (non-animation), fix the page wiring. **Step 3: Commit** `test(e2e): drive ASSAY → inspect popup vs fixture`.

## Task 9: docs / TODO

**Files:** `TODO.md`
- [ ] **Step 1:** Close **#035** (ASSAY ported). Add a TODO: live-verify the MEDIUM ASSAY weapon-numeric offsets (DAMAGE/TOHIT/REGEN) + the resistance-grid column headers (msg 0x1c6/0x1c8) against a live DOSBox assay of a known weapon. Note the **reusable `compose-inventory-picker` is ready for USE (#038) / DROP (#037)**. Use the next free `#NNN` id.
- [ ] **Step 2: Commit** `docs: close #035 (ASSAY ported); note ASSAY live-verify + reusable picker`.

---

## Final verification
- [ ] `pnpm --filter @wiz6/data exec vitest run` + `pnpm --filter @wiz6/viewer exec vitest run` + `pnpm --filter @wiz6/parity exec vitest run` + `tsc --noEmit` (data + viewer) all green.
- [ ] `assay-longsword` pixel-parity at 100% (tol 0); existing fixtures still 100%.
- [ ] e2e green. Manual smoke: REVIEW MEMBER → ASSAY → pick item → inspect popup → Enter dismisses.
