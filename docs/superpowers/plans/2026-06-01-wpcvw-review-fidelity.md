# WPCVW Review-Member Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the castle REVIEW MEMBER character view (WPCVW state 0x11) match the engine — render the member's equipment (inventory item-name list) and fix the action-menu navigation (column-major 2-row, cursor starts on EXIT, REVIEW shown when party_size ≥ 2) — behind a full-screen pixel-parity gate.

**Architecture:** Two independent fixes in the existing WPCVW character-view code. (A) Equipment: a pure `scenarioItemName` + `equipSlotIcon` lookup, then wire `CharacterViewPage` to build `InventoryItem[]` from `member.inventory` and pass `inventory` to the already-capable composer. (B) Action menu: make REVIEW conditional on party size, add a pure `nextActionCursor` column-major 2-row reducer nav, and start the cursor on EXIT. Gated by a new 3-member engine fixture (`review-member-view`) at tolerance 0, a reducer unit test, and a browser e2e.

**Tech Stack:** TypeScript ESM (`.js` import extensions), React + react-router, `@wiz6/data` (scenario-db schema, already has `loadScenarioDb`), `@wiz6/parser` TileWindow renderer, vitest (unit + parity), Playwright (e2e), DOSBox-X MCP (fixture already saved to slot 9).

**Engine ground truth & references:**
- Captured live 2026-06-01: 3-member castle party (THESUS/TEMPEST/LYSANDR) → REVIEW MEMBER → THESUS → character view, saved to DOSBox **slot 9** (cursor on EXIT).
- THESUS data: rendered portraitIndex (`+0x19c`) = **0** (NOT the `portrait_index`/`+0x1ac` field 10 — the SP1 gotcha), hp 8/8, stamina 126/126, age_counter 6590, encumbrance 295/2700, race 0, class 0, sex 0, level 1. Inventory itemIds `[8,135,132,130,141]` → LONGSWORD/LEATHER CUIRASS/FUR LEGGING/SANDALS/BUCKLER SHIELD.
- `docs/re/findings/wpcvw-character-view-ux.json`: `view-context-mask-from-camp` (camp enables 0,1,3,4,8,10), `view-context-mask-default-dungeon` (party_size<2 disables index 10=REVIEW), `view-entry-default-cursor` (cursor init = enabled count = EXIT index).
- Spec: `docs/superpowers/specs/2026-06-01-wpcvw-review-fidelity-design.md`.

**Verified action-menu nav model** (column-major 2-row, `idx = col*2 + row`):
- `Left`: `idx-2` if `idx >= 2`; else stay. `Right`: `idx+2` if `idx+2 < n`; else stay.
- `Up`: `idx-1` if `idx` odd (row1→row0); else stay. `Down`: `idx+1` if `idx` even AND `idx+1 < n`; else stay.
- Initial cursor = `n-1` (EXIT, last entry). `Enter`: EXIT→exit, EDIT→submenu, else no-op. `Escape`→exit.

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `packages/viewer/src/pages/castle/item-display.ts` | NEW pure helpers: `scenarioItemName(db,id)`, `equipSlotIcon(slot)`, `buildInventoryItems(member, db)` | Create |
| `packages/viewer/tests/pages/castle/item-display.test.ts` | unit tests for the helpers | Create |
| `packages/viewer/src/pages/castle/CharacterViewPage.tsx` | load scenario db, build+pass inventory; REVIEW-conditional camp entries; initial cursor = EXIT | Modify |
| `packages/viewer/src/pages/castle/character-view-reducer.ts` | `nextActionCursor` + 2D nav in `action-menu` case | Modify |
| `packages/viewer/tests/pages/castle/character-view-reducer.test.ts` | `nextActionCursor` unit test (extend existing if present) | Modify/Create |
| `packages/viewer/src/pages/castle/compose-action-menu.ts` | REVIEW (index 10) conditional on `includeReview` | Modify |
| `tools/parity/fixtures/engine/review-member-view.{idx.gz,png}` | NEW 3-member engine fixture | Create (capture) |
| `tools/parity/screen-parity.test.ts` | add `review-member-view` case; keep `creation-review-member` (1-member) green | Modify |
| `packages/viewer/e2e/review-member-flow.spec.ts` | mounted-app canvas assertion | Modify |
| `TODO.md` | note REVIEW handler (#041) + unverified equipSlot icons | Modify |

---

## Task 1: Capture the engine fixture (ORCHESTRATOR-RUN)

**Files:** Create `tools/parity/fixtures/engine/review-member-view.{idx.gz,png}`

> **Orchestrator-run** (not a subagent). DOSBox slot 9 already holds the THESUS character view (cursor on EXIT), saved during brainstorming. `gen-fixture` only decodes the `.sav` — no MCP driving needed. If slot 9 was clobbered, re-drive via MCP: launch → load slot 6 → `enter` (THESUS view) → confirm cursor on EXIT → `dosbox_save_state 9`.

- [ ] **Step 1: Generate the fixture from slot 9.**

Run: `pnpm tsx tools/parity/gen-fixture.ts --save 9 --name review-member-view`
Expected: writes `tools/parity/fixtures/engine/review-member-view.idx.gz` + `.png`.

- [ ] **Step 2: Eyeball the PNG.** Confirm it shows: THESUS char sheet + portrait, the item list (LONGSWORD/LEATHER CUIRASS/FUR LEGGING/SANDALS/BUCKLER SHIELD) + scrollbar, and the 7-entry action menu (`EQUIP ASSAY SKILL EXIT` / `SPELL SWAG REVIEW`) with **EXIT highlighted**.

- [ ] **Step 3: Commit.**

```bash
git add tools/parity/fixtures/engine/review-member-view.idx.gz tools/parity/fixtures/engine/review-member-view.png
git commit -m "test(parity): capture 3-member REVIEW MEMBER character-view fixture (THESUS, cursor on EXIT)"
```

---

## Task 2: Item-name + icon lookup helpers

**Files:**
- Create: `packages/viewer/src/pages/castle/item-display.ts`
- Test: `packages/viewer/tests/pages/castle/item-display.test.ts`

The composer's render `InventoryItem` is `{ name: string; iconChar: number }` (compose-main-panel.ts:151). `loadScenarioDb` already exists (data-loader.ts:68). Item name = `scenarioDb.items[itemId].name1` (verified). Icon = a fixed `equipSlot → wfont0 glyph` map (compose-main-panel.ts:154 documents: 0x02 weapon, 0x2a body, 0x2d legs, 0x2f feet, 0x27 shield; equipSlot enum at character.ts:42).

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, it, expect } from 'vitest';
import { scenarioItemName, equipSlotIcon, buildInventoryItems } from '../../../src/pages/castle/item-display.js';
import type { ScenarioDb, ActivePartyMember } from '@wiz6/data';

const db = { items: Array.from({ length: 200 }, (_, i) => ({ index: i, name1: '', name2: '', bytes: [] })) } as unknown as ScenarioDb;
db.items[8]!.name1 = 'LONGSWORD';
db.items[135]!.name1 = 'LEATHER CUIRASS';

describe('item-display', () => {
  it('scenarioItemName resolves name1 by itemId', () => {
    expect(scenarioItemName(db, 8)).toBe('LONGSWORD');
    expect(scenarioItemName(db, 135)).toBe('LEATHER CUIRASS');
  });
  it('scenarioItemName returns empty string for out-of-range id', () => {
    expect(scenarioItemName(db, 9999)).toBe('');
  });
  it('equipSlotIcon maps the verified fighter-kit slots', () => {
    expect(equipSlotIcon(0)).toBe(0x02);  // 1H weapon
    expect(equipSlotIcon(7)).toBe(0x2a);  // body
    expect(equipSlotIcon(8)).toBe(0x2d);  // legs
    expect(equipSlotIcon(10)).toBe(0x2f); // feet
    expect(equipSlotIcon(11)).toBe(0x27); // shield
  });
  it('buildInventoryItems skips empty slots and resolves name+icon, capped at 5', () => {
    const member = { inventory: [
      { itemId: 8, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0 },
      { itemId: 0, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0 }, // empty
      { itemId: 135, weight: 0, equipSlot: 7, spriteIdx: 0, quantity: 0, flags: 0 },
    ] } as unknown as ActivePartyMember;
    expect(buildInventoryItems(member, db)).toEqual([
      { name: 'LONGSWORD', iconChar: 0x02 },
      { name: 'LEATHER CUIRASS', iconChar: 0x2a },
    ]);
  });
  it('buildInventoryItems returns [] when member has no inventory', () => {
    expect(buildInventoryItems({} as ActivePartyMember, db)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails.** `pnpm --filter @wiz6/viewer exec vitest run item-display` → FAIL (module missing).

- [ ] **Step 3: Implement `item-display.ts`.**

```ts
/**
 * Pure helpers to turn a character's stored inventory (itemId + equipSlot) into
 * the render-ready InventoryItem list (name + body-slot glyph) the WPCVW main
 * panel draws. Names come from scenario.dbs (items[id].name1); icons from a
 * fixed equipSlot → wfont0-glyph map.
 *
 * Verified glyphs (compose-main-panel.ts + screen-parity NATHAN fixture):
 *   slot 0 (1H weapon)=0x02, 7 (body)=0x2a, 8 (legs)=0x2d, 10 (feet)=0x2f,
 *   11 (shield)=0x27. Other equipSlots are best-effort until a fixture with
 *   those item types exists (TODO #NNN — see plan).
 */
import type { ScenarioDb, ActivePartyMember } from '@wiz6/data';
import type { InventoryItem } from './compose-main-panel.js';

const INV_MAX_ROWS = 5;

/** equipSlot (character.ts enum) → wfont0 body-slot glyph rendered at col 38. */
const EQUIP_SLOT_ICON: Readonly<Record<number, number>> = {
  0: 0x02, // 1H_weapon
  1: 0x02, // 2H_staff  → weapon glyph (best-effort)
  2: 0x02, // thrown    → weapon glyph (best-effort)
  3: 0x02, // ranged    → weapon glyph (best-effort)
  7: 0x2a, // body
  8: 0x2d, // legs
  10: 0x2f, // feet
  11: 0x27, // shield
};
const DEFAULT_ICON = 0x02;

export function scenarioItemName(db: ScenarioDb, itemId: number): string {
  return db.items[itemId]?.name1 ?? '';
}

export function equipSlotIcon(equipSlot: number): number {
  return EQUIP_SLOT_ICON[equipSlot] ?? DEFAULT_ICON;
}

/** Non-empty inventory slots (itemId > 0), first INV_MAX_ROWS, resolved to render items. */
export function buildInventoryItems(member: ActivePartyMember, db: ScenarioDb): InventoryItem[] {
  const slots = member.inventory ?? [];
  const out: InventoryItem[] = [];
  for (const slot of slots) {
    if (slot.itemId <= 0) continue;
    out.push({ name: scenarioItemName(db, slot.itemId), iconChar: equipSlotIcon(slot.equipSlot) });
    if (out.length >= INV_MAX_ROWS) break;
  }
  return out;
}
```

- [ ] **Step 4: Run it, confirm it passes.** `pnpm --filter @wiz6/viewer exec vitest run item-display` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add packages/viewer/src/pages/castle/item-display.ts packages/viewer/tests/pages/castle/item-display.test.ts
git commit -m "feat(castle): scenario itemId→name + equipSlot→icon lookup for the WPCVW inventory list"
```

---

## Task 3: Reducer — column-major 2-row action-menu navigation

**Files:**
- Modify: `packages/viewer/src/pages/castle/character-view-reducer.ts`
- Test: `packages/viewer/tests/pages/castle/character-view-reducer.test.ts` (create if absent)

The `action-menu` case currently does linear `cursorIdx ±1` on Left/Right and ignores Up/Down (character-view-reducer.ts:85-91). Replace with a pure `nextActionCursor` + 2D nav.

- [ ] **Step 1: Write the failing test** (add to the reducer test file; create it if it doesn't exist).

```ts
import { describe, it, expect } from 'vitest';
import { nextActionCursor } from '../../../src/pages/castle/character-view-reducer.js';

// 7-entry camp menu (2+ members): [EQUIP,SPELL,ASSAY,SWAG,SKILL,REVIEW,EXIT], EXIT=6.
describe('nextActionCursor (column-major 2-row, n=7)', () => {
  it('Left moves to the previous column, same row', () => {
    expect(nextActionCursor(6, 'ArrowLeft', 7)).toBe(4); // EXIT(c3r0) → SKILL(c2r0)
    expect(nextActionCursor(2, 'ArrowLeft', 7)).toBe(0); // ASSAY(c1r0) → EQUIP(c0r0)
    expect(nextActionCursor(0, 'ArrowLeft', 7)).toBe(0); // clamp at col0
  });
  it('Right moves to the next column, same row (clamp if empty)', () => {
    expect(nextActionCursor(4, 'ArrowRight', 7)).toBe(6); // SKILL(c2r0) → EXIT(c3r0)
    expect(nextActionCursor(5, 'ArrowRight', 7)).toBe(5); // REVIEW(c2r1) → no c3r1 → stay
    expect(nextActionCursor(0, 'ArrowRight', 7)).toBe(2); // EQUIP → ASSAY
  });
  it('Down moves row0→row1 within column; clamps otherwise', () => {
    expect(nextActionCursor(4, 'ArrowDown', 7)).toBe(5); // SKILL → REVIEW
    expect(nextActionCursor(5, 'ArrowDown', 7)).toBe(5); // REVIEW(row1) → stay
    expect(nextActionCursor(6, 'ArrowDown', 7)).toBe(6); // EXIT(c3r0), no c3r1 → stay
  });
  it('Up moves row1→row0 within column; clamps at row0', () => {
    expect(nextActionCursor(5, 'ArrowUp', 7)).toBe(4); // REVIEW → SKILL
    expect(nextActionCursor(4, 'ArrowUp', 7)).toBe(4); // SKILL(row0) → stay
  });
});

// 6-entry camp menu (1 member): [EQUIP,SPELL,ASSAY,SWAG,SKILL,EXIT], EXIT=5.
describe('nextActionCursor (n=6)', () => {
  it('Right from SKILL(c2r0) reaches EXIT(c2r1)? no — EXIT is c2r1 via Down', () => {
    expect(nextActionCursor(4, 'ArrowDown', 6)).toBe(5); // SKILL → EXIT (c2r1)
    expect(nextActionCursor(4, 'ArrowRight', 6)).toBe(4); // no c3 → stay
  });
});
```

- [ ] **Step 2: Run it, confirm it fails.** `pnpm --filter @wiz6/viewer exec vitest run character-view-reducer` → FAIL (`nextActionCursor` not exported).

- [ ] **Step 3: Add `nextActionCursor` + rewire the `action-menu` case.** Add this exported function near the top of `character-view-reducer.ts` (after the helpers):

```ts
/**
 * Action-menu navigation. The menu is a column-major 2-row grid: entry `idx`
 * sits at column `floor(idx/2)`, row `idx%2`. EXIT is the last entry (idx n-1).
 * Verified by live DOSBox capture 2026-06-01.
 */
export function nextActionCursor(idx: number, key: string, n: number): number {
  switch (key) {
    case 'ArrowLeft':
      return idx >= 2 ? idx - 2 : idx;
    case 'ArrowRight':
      return idx + 2 < n ? idx + 2 : idx;
    case 'ArrowUp':
      return idx % 2 === 1 ? idx - 1 : idx;
    case 'ArrowDown':
      return idx % 2 === 0 && idx + 1 < n ? idx + 1 : idx;
    default:
      return idx;
  }
}
```

Then replace the `action-menu` case's arrow handling (the `ARROW_LEFT`/`ARROW_RIGHT` blocks at lines ~86-91) so ALL four arrows route through `nextActionCursor`:

```ts
    case 'action-menu': {
      if (event.type === 'ESCAPE') return { kind: 'exit-castle' };
      if (event.type === 'ENTER') {
        const label = state.campEntries[state.cursorIdx];
        if (label === 'EXIT') return { kind: 'exit-castle' };
        if (label === 'EDIT') return { kind: 'edit-submenu', cursorIdx: 0 };
        return state; // EQUIP/SPELL/ASSAY/SWAG/SKILL/REVIEW handlers are SP3
      }
      const key =
        event.type === 'ARROW_LEFT' ? 'ArrowLeft' :
        event.type === 'ARROW_RIGHT' ? 'ArrowRight' :
        event.type === 'ARROW_UP' ? 'ArrowUp' :
        event.type === 'ARROW_DOWN' ? 'ArrowDown' : '';
      if (key) {
        return { ...state, cursorIdx: nextActionCursor(state.cursorIdx, key, state.campEntries.length) };
      }
      return state;
    }
```

- [ ] **Step 4: Run it, confirm it passes.** `pnpm --filter @wiz6/viewer exec vitest run character-view-reducer` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add packages/viewer/src/pages/castle/character-view-reducer.ts packages/viewer/tests/pages/castle/character-view-reducer.test.ts
git commit -m "feat(castle): column-major 2-row action-menu nav (nextActionCursor)"
```

---

## Task 4: REVIEW entry conditional on party_size ≥ 2

**Files:**
- Modify: `packages/viewer/src/pages/castle/compose-action-menu.ts`
- Modify: `packages/viewer/src/pages/castle/compose-character-view-frame.ts`
- Modify: `packages/viewer/src/pages/castle/CharacterViewPage.tsx`

Engine: camp enables indices `[0,1,3,4,8,10]` but party_size<2 disables 10 (REVIEW). So 1-member view = 6 entries (no REVIEW, preserves the existing `creation-review-member` fixture); 2+ = 7 (with REVIEW). The render list (compose-action-menu) and the reducer's `campEntries` (CharacterViewPage) must stay in sync.

- [ ] **Step 1: compose-action-menu.ts — thread `includeReview`.** Add `includeReview?: boolean` to `ActionMenuView`; in `enabledActions`, append REVIEW (index 10) when `includeReview`:

```ts
// in ActionMenuView:
  /** When true (party_size ≥ 2), include REVIEW (action index 10 = msg 311). */
  includeReview?: boolean;

// rewrite enabledActions:
function enabledActions(db: MessageDb, includeEdit: boolean, includeReview: boolean) {
  const indices = [0, 1, 3, 4, 8];           // EQUIP SPELL ASSAY SWAG SKILL
  if (includeReview) indices.push(10);        // REVIEW (party_size ≥ 2)
  if (includeEdit) indices.push(9);           // EDIT (house rule, before EXIT)
  const list = indices.map((i) => ({ msgId: ACTION_MSG_BASE + i, label: creationString(db, ACTION_MSG_BASE + i) }));
  list.push({ msgId: ACTION_EXIT_MSG_ID, label: creationString(db, ACTION_EXIT_MSG_ID) });
  return list;
}
```
Update the `composeActionMenu` call site to pass `includeReview`: `const actions = enabledActions(view.db, view.includeEditFromCamp === true, view.includeReview === true);`. (Delete the now-unused `CAMP_ENABLED_INDICES`/`CAMP_PLUS_EDIT_INDICES` constants.)

- [ ] **Step 2: compose-character-view-frame.ts — pass party-size through.** Add `includeReview` to the `composeActionMenu` call, derived from the party size:

```ts
    composeActionMenu({
      cursorIdx: view.cursorIdx,
      db: view.db,
      includeEditFromCamp: view.includeEditFromCamp === true,
      includeReview: view.members.length >= 2,
    }),
```

- [ ] **Step 3: CharacterViewPage.tsx — REVIEW-conditional camp entries.** Replace the `CAMP_ENTRIES_*` constants + `campEntriesFor` with a party-size-aware builder:

```ts
// Camp action-menu entry labels (must mirror compose-action-menu's enabledActions
// order so the reducer cursorIdx aligns with the rendered grid). REVIEW appears
// only with 2+ members (engine: party_size<2 disables it); EDIT is the house rule.
function campEntriesFor(includeEdit: boolean, includeReview: boolean): ReadonlyArray<string> {
  const out = ['EQUIP', 'SPELL', 'ASSAY', 'SWAG', 'SKILL'];
  if (includeReview) out.push('REVIEW');
  if (includeEdit) out.push('EDIT');
  out.push('EXIT');
  return out;
}
```
Update every `campEntriesFor(includeEditFromCamp)` call to `campEntriesFor(includeEditFromCamp, members.length >= 2)`. (There are calls in the initial `useState` and in the action-menu return paths around lines 110, 184, 198 — update all.)

- [ ] **Step 4: Typecheck + run the existing screen-parity to confirm the 1-member case still passes.**

Run: `pnpm --filter @wiz6/viewer exec tsc --noEmit && pnpm --filter @wiz6/parity exec vitest run screen-parity`
Expected: tsc clean; `creation-review-member` (1-member, no REVIEW) still 100% (the `includeReview` defaults false / `members.length` is 1 there).

- [ ] **Step 5: Commit.**

```bash
git add packages/viewer/src/pages/castle/compose-action-menu.ts packages/viewer/src/pages/castle/compose-character-view-frame.ts packages/viewer/src/pages/castle/CharacterViewPage.tsx
git commit -m "feat(castle): show REVIEW in the WPCVW action menu when party_size >= 2"
```

---

## Task 5: Wire equipment + initial EXIT cursor into CharacterViewPage

**Files:** Modify `packages/viewer/src/pages/castle/CharacterViewPage.tsx`

- [ ] **Step 1: Load the scenario DB.** Add to the imports and the asset-load effect (alongside `loadMessageDb`):

```ts
import { loadScenarioDb as defaultLoadScenarioDb } from '../../data-loader.js';
import { buildInventoryItems } from './item-display.js';
import type { ScenarioDb } from '@wiz6/data';
// ... state:
const [scenarioDb, setScenarioDb] = useState<ScenarioDb | null>(null);
// ... in the Promise.all load effect, add defaultLoadScenarioDb('/scenario/scenario.json')
//     and setScenarioDb(...). (Confirm the served URL by loading it; other loaders
//     use '/messages/msg.json', '/portraits/wportN.json' → scenario at '/scenario/scenario.json'.)
```

- [ ] **Step 2: Build + pass `inventory`, and start the cursor on EXIT.**
  - Gate the render on `scenarioDb` being loaded (like `db`/`fontSet`).
  - In the `composeCharacterViewFrame({...})` call (line ~263), add `inventory: member ? buildInventoryItems(member, scenarioDb) : []`.
  - Change the initial action-menu state (line ~107-111) so `cursorIdx` is the EXIT index:

```ts
  const [state, setState] = useState<CharacterViewState>(() => {
    const entries = campEntriesFor(includeEditFromCamp, members.length >= 2);
    return { kind: 'action-menu', cursorIdx: entries.length - 1, campEntries: entries };
  });
```
  Also set `cursorIdx: entries.length - 1` (not 0) in the action-menu return paths that reconstruct the state after leaving the EDIT submenu (lines ~182, ~195) — compute `entries` the same way and use `entries.length - 1`.

- [ ] **Step 3: Typecheck + manual smoke build check.** `pnpm --filter @wiz6/viewer exec tsc --noEmit` → clean. (Full render verification is the parity gate in Task 6 + the e2e in Task 7.)

- [ ] **Step 4: Commit.**

```bash
git add packages/viewer/src/pages/castle/CharacterViewPage.tsx
git commit -m "feat(castle): wire equipment list + EXIT-initial cursor into the WPCVW character view"
```

---

## Task 6: Pixel-parity gate (3-member character view)

**Files:** Modify `tools/parity/screen-parity.test.ts`

Add a `review-member-view` case that composes the full character view with THESUS's real data — inventory resolved via `buildInventoryItems` against the real scenario DB (NOT hardcoded) — cursor on EXIT, 7-entry menu, and asserts tolerance-0 match.

- [ ] **Step 1: Add a render function + case.** Model it on `renderCreationReviewMember` (line ~664). Build the 3 members (THESUS/TEMPEST/LYSANDR) as `ActivePartyMember` objects matching the fixture; THESUS gets the real inventory (itemIds 8/135/132/130/141 with their equipSlots 0/7/8/10/11) so `buildInventoryItems` resolves the 5 names+icons. Use `patchFontSetWithPortrait(fontSet, [wport1,wport2,wport3], 0)` (THESUS rendered portrait = **0**, the `+0x19c` selector — NOT 10). Load the scenario DB from `extracted/scenario/scenario.json`. Cursor = `members.length === 3 ? 6 : ...` (EXIT index). Add `{ fixture: 'review-member-view', floor: 100, render: renderReviewMemberView }` to the CASES array.

```ts
function renderReviewMemberView(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  const scenarioDb = ScenarioDbSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED, 'scenario', 'scenario.json'), 'utf-8')),
  );
  // THESUS/TEMPEST/LYSANDR — match the slot-9 fixture. Inventory only matters for
  // the viewed member (THESUS, slot 0). equipSlots: LONGSWORD=0, LEATHER CUIRASS=7,
  // FUR LEGGING=8, SANDALS=10, BUCKLER SHIELD=11.
  const inv = (ids: Array<[number, number]>) =>
    ids.map(([itemId, equipSlot]) => ({ itemId, weight: 0, equipSlot, spriteIdx: 0, quantity: 0, flags: 0 }));
  const thesus = { /* ActivePartyMember: name THESUS, portraitIndex 0, hp 8/8, stamina 126/126,
    age fields, encumbranceCurrent 295, race 0, class 0, sex 0, level 1, portraitSlotId 0,
    inventory: inv([[8,0],[135,7],[132,8],[130,10],[141,11]]) */ } as unknown as ActivePartyMember;
  const tempest = { /* ... portraitIndex 22, hp 9/9, stamina 123/123, portraitSlotId 1 ... */ } as unknown as ActivePartyMember;
  const lysandr = { /* ... portraitIndex 20, hp 5/5, stamina 87/87, portraitSlotId 2 ... */ } as unknown as ActivePartyMember;
  const members = [thesus, tempest, lysandr];
  const fontSetWithPortrait = patchFontSetWithPortrait(fontSet, [wport1, wport2, wport3], 0);
  const windows = composeCharacterViewFrame({
    members, currentSlot: 0,
    cursorIdx: 6, // EXIT in the 7-entry (2+ member) menu
    db: msgDb,
    inventory: buildInventoryItems(thesus, scenarioDb),
    cc: { current: Math.floor(295 / 10), max: Math.floor(resolveCarryCapacityMax(thesus, false) / 10) },
    age: { years: /* from age_counter */ 0, second: /* */ 0 },
  });
  return renderCreationFrame(windows, fontSetWithPortrait, palette);
}
```
Fill the member fields from the captured data; derive `age.years`/`age.second` to match the fixture (read them off the engine save / the `creation-review-member` render's age derivation — same formula). Import `buildInventoryItems`, `ScenarioDbSchema`, `resolveCarryCapacityMax` as needed.

- [ ] **Step 2: Run + iterate to 100%.**

Run: `pnpm --filter @wiz6/parity exec vitest run screen-parity`
Expected: `review-member-view` at 100% (0 px). If <100%, inspect the diff PNG; likely causes in order: (a) member field mismatch (portrait/hp/stamina/age/cc → fix the constants); (b) the 7-entry menu layout/REVIEW label or EXIT highlight (fix Task 4); (c) the item names/icons (fix the equipSlot map / lookup). **Do not lower the floor.** Confirm `creation-review-member` (1-member) is still 100%.

- [ ] **Step 3: Commit.**

```bash
git add tools/parity/screen-parity.test.ts
git commit -m "test(parity): 3-member REVIEW MEMBER view pixel-parity (equipment + 7-entry menu, tol 0)"
```

---

## Task 7: Browser e2e — mounted character view

**Files:** Modify `packages/viewer/e2e/review-member-flow.spec.ts`

Inject a 3-member active party (THESUS/TEMPEST/LYSANDR matching the fixture — including THESUS's `inventory`), navigate to `/castle/review-member/0`, and assert the mounted canvas matches `review-member-view`. This gates the runtime wiring (scenario load, inventory build, EXIT cursor) — the class of bug the SP1 e2e caught.

- [ ] **Step 1: Add the test.** Reuse the SP1 active-party injection pattern (the `wiz6:active-party` localStorage `addInitScript`). The injected THESUS must include the `inventory` array (itemIds + equipSlots) so the page's `buildInventoryItems` produces the list; reuse the same member data as the parity test (factor a shared fixture-party constant if convenient).

```ts
test('REVIEW MEMBER character view matches engine (equipment + EXIT cursor)', async ({ page }) => {
  await gotoReviewMemberView(page, threeMemberPartyWithInventory, 0); // inject party + nav to /castle/review-member/0
  await expectCanvasMatchesFixture(page, 'review-member-view');
});
```

- [ ] **Step 2: Run.** `pnpm --filter @wiz6/viewer test:e2e review-member-flow` → PASS. If the mounted canvas differs from the fixture (and it's not fountain animation — this screen has none), that's a real wiring bug (e.g. scenario URL wrong, inventory not built) — fix the page, don't relax the assertion.

- [ ] **Step 3: Commit.**

```bash
git add packages/viewer/e2e/review-member-flow.spec.ts
git commit -m "test(e2e): mounted REVIEW MEMBER view asserts equipment + menu vs fixture"
```

---

## Task 8: Docs / TODO

**Files:** Modify `TODO.md`

- [ ] **Step 1: Add notes.** Add a TODO entry for the unverified `equipSlot` icons (only the 5 fighter-kit slots are fixture-verified; cloak/head/hands/scroll/2H/thrown/ranged icons are best-effort until a fixture with those item types exists). Note that the action *handlers* (EQUIP/SPELL/ASSAY/SWAG/SKILL/REVIEW) remain no-ops (REVIEW = #041, others = SP3 / #032-#039). Use the next free `#NNN` id (check `grep -oE "#0[0-9][0-9]" TODO.md | sort -u | tail`).

- [ ] **Step 2: Commit.**

```bash
git add TODO.md
git commit -m "docs: note unverified equipSlot icons + WPCVW action handlers remain SP3"
```

---

## Final verification

- [ ] `pnpm --filter @wiz6/viewer exec tsc --noEmit` — clean.
- [ ] `pnpm --filter @wiz6/viewer exec vitest run` — all green.
- [ ] `pnpm --filter @wiz6/parity exec vitest run` — all green, incl. `review-member-view` (100%) AND `creation-review-member` (still 100%).
- [ ] `pnpm --filter @wiz6/viewer test:e2e review-member-flow` — green.
- [ ] Manual smoke: `pnpm dev:viewer`, build a 2+ member party, REVIEW MEMBER → pick a member → confirm equipment list shows, the action menu has REVIEW + cursor starts on EXIT, and Up/Down/Left/Right match the engine.
