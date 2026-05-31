# Creation Spell-Picker Grid Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the interim flat-list creation spell picker with the engine's real model — a 3×2 school grid that drills into a per-school spell sub-list, offering only level-1 spells filtered by the class's (corrected) book mask, with per-spell SP cost.

**Architecture:** Pure data layer in `@wiz6/data` (corrected book masks + a `creationSpellGrid` helper), pixel-exact rendering in `composeSpellPanel` + the persistent char-sheet school-icon cursor, and a two-level state machine in `SpellPickScreen.tsx` (grid mode ⇄ sub-list mode). Pixel-parity gated against new DOSBox-X engine fixtures captured by the orchestrator.

**Tech Stack:** TypeScript ESM (`.js` import extensions), Vitest, React, the tile-window renderer (`@wiz6/parser`), `tools/parity` differential pixel testing.

**Authoritative spec:** `docs/re/findings/spell-picker-eligibility.json` + `docs/re/findings/spell-realm-colors.json`. Key facts:
- **Grid:** cursor index 0..5 == school. `idiv 3` → 3 cols × 2 rows: row0 = FIRE/WATER/AIR (0/1/2), row1 = EARTH/MENTAL/MAGIC (3/4/5). In **grid mode**: LEFT/RIGHT = ±3 (between rows, no-op if out of range), UP/DOWN = ±1 within a row (clamped to the row of 3, no wrap).
- **Two-level nav:** ENTER on a non-empty school → **sub-list mode** (cursor on spell 0, COST shown). In sub-list mode UP/DOWN move the spell cursor (clamped 0..len-1); ENTER commits the spell (decrements the per-book pick counter); ESC/LEFT returns to grid mode.
- **Eligibility:** selectable iff `(byte5 & bookMask) && level === 1`. Book index → mask (CORRECTED, engine-verified): Mage(0)=0x8, Priest(1)=0x4, **Alchemist(2)=0x1**, **Psionic(3)=0x2**. Group the result by school for the per-cell view; empty schools render a blank spell name.
- **Cost:** `SpellEntry.b2` is the SP cost (ENERGY BLAST=2, CHILLING TOUCH=2, TERROR=3 — verified on-screen).
- **Realms:** names msg.dbs 0x0f6e+school = FIRE/WATER/AIR/EARTH/MENTAL/MAGIC; colours (attr) from `REALM_ATTR` = FIRE 0x40 / WATER 0x20 / AIR 0x30 / EARTH 0x60 / MENTAL 0x70 / MAGIC 0x50.
- **Pick budget:** sum of `CLASS_SPELLBOOKS[classIdx]` (e.g. Mage = 2). Loop until exhausted, then `SPELLS_DONE`.

---

## File Structure

- `packages/data/src/character-creation/spell-table.ts` — fix `spellsInBook` book→mask array; document `b2` as SP cost; add `spellCost()`.
- `packages/data/src/character-creation/spell-schools.ts` — swap Alchemist/Psionic `SPELLBOOK_SCHOOLS` rows; correct byte5-bit-label comments.
- `packages/data/src/character-creation/creation-spell-grid.ts` — **NEW** pure helper: `creationSpellGrid(classIdx)` (6 per-school arrays of level-1 eligible spells) + `creationPickCount(classIdx)`.
- `packages/data/src/index.ts` — export the new helper.
- `packages/viewer/src/pages/roster/creation/ega/compose-spell-panel.ts` — render the per-school spell list + sub-list highlight + per-spell COST.
- `packages/viewer/src/pages/roster/creation/ega/compose-school-cursor.ts` — **NEW** (or extend the persistent panel composer): highlight the current school's char-sheet mana icon.
- `packages/viewer/src/pages/roster/creation/screens/SpellPickScreen.tsx` — two-level state machine + key handling.
- `tools/parity/fixtures/engine/creation-spell-*.{idx.gz,png}` — **NEW** captured fixtures (orchestrator).
- `tools/parity/spell-pick-parity.test.ts` — extend with the new grid + sub-list cases.
- Tests: `packages/data/tests/character-creation/*.test.ts`, `packages/viewer/tests/pages/roster/creation/screens/SpellPickScreen.test.tsx`.

---

## Task 1: Data fix — corrected Alchemist/Psionic masks + cost field

**Files:**
- Modify: `packages/data/src/character-creation/spell-table.ts`
- Modify: `packages/data/src/character-creation/spell-schools.ts`
- Test: `packages/data/tests/character-creation/spell-table.test.ts`, `packages/data/tests/character-creation/spell-schools.test.ts`

- [ ] **Step 1: Write failing tests for the corrected masks + cost**

In `spell-table.test.ts` add:
```ts
import { spellsInBook, SPELL_TABLE, spellCost } from '../../src/character-creation/spell-table.js';

it('Alchemist book (idx 2) uses byte5 bit0 (mask 0x1) — engine-verified', () => {
  // entry 0 ENERGY BLAST byte5=0x08 (Mage only) must NOT be in the Alchemist book
  expect(spellsInBook(2).some((s) => s.entryIdx === 0)).toBe(false);
  // every Alchemist-book entry has bit0 set
  expect(spellsInBook(2).every((s) => (s.entry.byte5 & 0x1) !== 0)).toBe(true);
});
it('Psionic book (idx 3) uses byte5 bit1 (mask 0x2) — engine-verified', () => {
  expect(spellsInBook(3).every((s) => (s.entry.byte5 & 0x2) !== 0)).toBe(true);
});
it('spellCost returns the SP cost (b2): ENERGY BLAST=2, TERROR=3', () => {
  expect(spellCost(SPELL_TABLE[0]!)).toBe(2);   // ENERGY BLAST
  expect(spellCost(SPELL_TABLE[11]!)).toBe(3);  // TERROR
});
```

- [ ] **Step 2: Run the tests; expect failure**

Run: `pnpm --filter @wiz6/data test spell-table`
Expected: FAIL — `spellsInBook(2)` currently uses mask 0x2 (so it would include bit1 entries, not bit0), and `spellCost` is undefined.

- [ ] **Step 3: Fix the mask array + add cost field/helper in spell-table.ts**

Change the `spellsInBook` mask line:
```ts
// engine book index -> byte5 mask (VERIFIED in docs/re/findings/spell-picker-eligibility.json):
// Mage=8, Priest=4, Alchemist=1 (bit0), Psionic=2 (bit1).
const mask = [8, 4, 1, 2][bookIdx];
```
Update the `spellsInBook` doc comment to `(8=Mage, 4=Priest, 1=Alchemist, 2=Psionic)`.
In the `SpellEntry` block comment, change the `b2` description to: `b2: SP cost of the spell (shown as COST in the creation picker)`. Add at the end of the file:
```ts
/** SP cost of a spell (the b2 byte), shown as COST in the creation picker. */
export function spellCost(entry: SpellEntry): number {
  return entry.b2;
}
```

- [ ] **Step 4: Run tests; expect pass**

Run: `pnpm --filter @wiz6/data test spell-table`
Expected: PASS.

- [ ] **Step 5: Fix spell-schools.ts SPELLBOOK_SCHOOLS + comments**

Swap rows 2 and 3 of `SPELLBOOK_SCHOOLS` (Alchemist now all-six from mask 0x1; Psionic now no-Fire from mask 0x2):
```ts
export const SPELLBOOK_SCHOOLS: readonly (readonly boolean[])[] = [
  [ true,  true,  true,  true,  true,  true  ], // 0 Mage      (mask 0x08) — all 6
  [ true,  true,  true,  true,  true,  true  ], // 1 Priest    (mask 0x04) — all 6
  [ true,  true,  true,  true,  true,  true  ], // 2 Alchemist (mask 0x01) — all 6 (25 spells)
  [ false, true,  true,  true,  true,  true  ], // 3 Psionic   (mask 0x02) — no Fire (32 spells)
];
```
In the header comment block, correct the byte5 bit legend and the per-book summary:
```
 *   - bit 3 = Mage (mask 0x08), bit 2 = Priest (mask 0x04),
 *     bit 1 = Psionic (mask 0x02), bit 0 = Alchemist (mask 0x01).
 *     (Engine-verified by the wpcmk book->mask switch — see
 *      docs/re/findings/spell-picker-eligibility.json. The earlier
 *      "bit1=Alchemist / bit0=Psionic, Alchemist lacks Fire" labelling was
 *      backwards: it is PSIONIC (mask 0x02) that lacks Fire.)
 *   - Mage book (0x08): 33 spells, all 6 schools
 *   - Priest book (0x04): 33 spells, all 6 schools
 *   - Alchemist book (0x01): 25 spells, all 6 schools
 *   - Psionic book (0x02): 32 spells, 5 schools (NO Fire)
```

- [ ] **Step 6: Update spell-schools.test.ts for the swapped rows**

Find any test asserting `SPELLBOOK_SCHOOLS[2]`/`[3]` (Alchemist/Psionic Fire access) or `classCanCastSchool(5, 0)` (Alchemist=class 5, Fire) and flip the expectation: Alchemist (class 5) CAN now cast Fire; Psionic (class 7) CANNOT. If no such test exists, add:
```ts
it('Alchemist (class 5) can cast Fire; Psionic (class 7) cannot — engine-verified', () => {
  expect(classCanCastSchool(5, 0)).toBe(true);
  expect(classCanCastSchool(7, 0)).toBe(false);
});
```

- [ ] **Step 7: Run the full data suite; expect pass**

Run: `pnpm --filter @wiz6/data test`
Expected: PASS (fix any other test that encoded the old swapped masks).

- [ ] **Step 8: Commit**

```bash
git add packages/data/src/character-creation/spell-table.ts packages/data/src/character-creation/spell-schools.ts packages/data/tests/character-creation
git commit -m "fix(data): correct Alchemist/Psionic book masks (bit0=Alchemist, bit1=Psionic); add spellCost (#060)"
```

---

## Task 2: `creationSpellGrid` eligibility helper

**Files:**
- Create: `packages/data/src/character-creation/creation-spell-grid.ts`
- Modify: `packages/data/src/index.ts`
- Test: `packages/data/tests/character-creation/creation-spell-grid.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { creationSpellGrid, creationPickCount } from '../../src/character-creation/creation-spell-grid.js';

describe('creationSpellGrid', () => {
  it('Mage (class 1): per-school level-1 counts = FIRE1 WATER2 AIR0 EARTH2 MENTAL1 MAGIC0', () => {
    const g = creationSpellGrid(1);
    expect(g.map((s) => s.length)).toEqual([1, 2, 0, 2, 1, 0]);
    // WATER holds CHILLING TOUCH (9) then TERROR (11)
    expect(g[1].map((s) => s.entryIdx)).toEqual([9, 11]);
  });
  it('Priest (class 2): FIRE0 WATER1 AIR0 EARTH0 MENTAL2 MAGIC2', () => {
    expect(creationSpellGrid(2).map((s) => s.length)).toEqual([0, 1, 0, 0, 2, 2]);
  });
  it('Alchemist (class 5) gets a level-1 spell pool from the bit0 book (no Fire L1)', () => {
    // mask 0x1; per-school L1 counts (engine masks) = FIRE0 WATER1 AIR1 EARTH2 MENTAL2 MAGIC1
    expect(creationSpellGrid(5).map((s) => s.length)).toEqual([0, 1, 1, 2, 2, 1]);
  });
  it('non-caster (Fighter, class 0) → all empty', () => {
    expect(creationSpellGrid(0).every((s) => s.length === 0)).toBe(true);
  });
  it('creationPickCount: Mage=2, Bishop(9)=2, Fighter=0', () => {
    expect(creationPickCount(1)).toBe(2);
    expect(creationPickCount(9)).toBe(2);
    expect(creationPickCount(0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run; expect failure (module not found)**

Run: `pnpm --filter @wiz6/data test creation-spell-grid`
Expected: FAIL — cannot resolve `creation-spell-grid.js`.

- [ ] **Step 3: Implement the helper**

```ts
// packages/data/src/character-creation/creation-spell-grid.ts
//
// The character-creation spell picker offers only LEVEL-1 spells, filtered by
// the class's book mask, grouped into the six schools (0=Fire..5=Magic). The
// engine presents these as a 3x2 school grid; each cell drills into a per-school
// spell sub-list. See docs/re/findings/spell-picker-eligibility.json.
import { SPELL_TABLE, type SpellEntry } from './spell-table.js';
import { CLASS_SPELLBOOKS } from './spell-schools.js';

/** Engine book index -> byte5 mask: Mage=8, Priest=4, Alchemist=1, Psionic=2. */
const BOOK_MASK = [8, 4, 1, 2] as const;

export interface CreationSpell {
  entryIdx: number;
  entry: SpellEntry;
}

/**
 * Six arrays (one per school 0..5) of the level-1 spells `classIdx` may pick at
 * creation. A school with no eligible spell yields an empty array (blank cell).
 */
export function creationSpellGrid(classIdx: number): CreationSpell[][] {
  const grid: CreationSpell[][] = [[], [], [], [], [], []];
  const books = CLASS_SPELLBOOKS[classIdx];
  if (!books) return grid;
  let mask = 0;
  books.forEach((picks, bookIdx) => {
    if (picks > 0) mask |= BOOK_MASK[bookIdx]!;
  });
  if (mask === 0) return grid;
  SPELL_TABLE.forEach((entry, entryIdx) => {
    if (entry.level === 1 && entry.school < 6 && (entry.byte5 & mask) !== 0) {
      grid[entry.school]!.push({ entryIdx, entry });
    }
  });
  return grid;
}

/** Total starter-spell picks required for the class (sum of its CLASS_SPELLBOOKS row). */
export function creationPickCount(classIdx: number): number {
  return (CLASS_SPELLBOOKS[classIdx] ?? []).reduce<number>((sum, n) => sum + n, 0);
}
```

- [ ] **Step 4: Export from the data barrel**

In `packages/data/src/index.ts`, add near the other character-creation exports:
```ts
export { creationSpellGrid, creationPickCount, type CreationSpell } from './character-creation/creation-spell-grid.js';
```

- [ ] **Step 5: Run; expect pass**

Run: `pnpm --filter @wiz6/data test creation-spell-grid`
Expected: PASS. (If the Alchemist counts differ, recompute against `SPELL_TABLE` with the corrected mask and update the test's expected array — the predicate is the source of truth, not the literal.)

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/character-creation/creation-spell-grid.ts packages/data/src/index.ts packages/data/tests/character-creation/creation-spell-grid.test.ts
git commit -m "feat(data): creationSpellGrid — level-1 spells per school for the creation picker (#060)"
```

---

## Task 3: (ORCHESTRATOR / DOSBox-X) Capture engine parity fixtures

> **This task is executed by the orchestrator, not a subagent** — it requires driving DOSBox-X (the MCP driving path is not available to subagents). Subagents implementing later tasks consume the committed `.idx.gz`/`.png` fixtures.

- [ ] **Step 1: Drive a Mage to the spell picker** (load `tools/dosbox/save/1.sav` — the parked Mage picker — or create one: CREATE PC → Human/Elf → Male → Mage → spend bonus → karma → portrait → skills → spell picker).

- [ ] **Step 2: Capture each frame** with `tools/parity/gen-fixture.ts` (decode the engine framebuffer from a save at each state). Capture and commit:
  - `creation-spell-grid-fire` — school grid on FIRE (1 spell "ENERGY BLAST" listed, COST blank).
  - `creation-spell-grid-water` — school grid on WATER (2 spells "CHILLING TOUCH"/"TERROR" listed, COST blank, realm WATER blue).
  - `creation-spell-grid-air` — school grid on AIR (blank spell name, realm AIR magenta).
  - `creation-spell-sublist-chill` — sub-list, CHILLING TOUCH highlighted, COST 2.
  - `creation-spell-sublist-terror` — sub-list, TERROR highlighted, COST 3.
  - Capture at least one bottom-row school (`creation-spell-grid-earth`, realm EARTH green) to gate the row-1 cursor position.

- [ ] **Step 3: Commit fixtures + provenance**

```bash
git add tools/parity/fixtures/engine/creation-spell-*.idx.gz tools/parity/fixtures/engine/creation-spell-*.png
git commit -m "test(parity): capture creation spell-picker grid + sub-list engine fixtures (#060)"
```
Record in the commit body which save/game_state each came from. Do **not** commit any `.sav`.

---

## Task 4: Render — per-school spell list, sub-list highlight, COST, school-icon cursor

**Files:**
- Modify: `packages/viewer/src/pages/roster/creation/ega/compose-spell-panel.ts`
- Create: `packages/viewer/src/pages/roster/creation/ega/compose-school-cursor.ts`
- Test: `packages/viewer/tests/pages/roster/creation/ega/compose-spell-panel.test.ts`

- [ ] **Step 1: Extend `SpellPanelView` and `composeSpellPanel`**

Change the view type to carry the school's spell list + selection:
```ts
export interface SpellPanelView {
  /** Realm/element name for the current school cell. */
  realm: string;
  /** The current school's eligible spell names, in order (may be empty → blank). */
  spellNames: string[];
  /** Index of the highlighted spell when in sub-list mode, else null (grid browse). */
  selectedIdx: number | null;
  /** COST value text for the selected spell (e.g. "2"), or null/empty for blank box. */
  cost?: string | null;
  /** 6-glyph pip bar (chars). Defaults to the full bar 0x18..0x1d. */
  pips?: number[];
}
```
In the body: render each name in `spellNames` down the inner window starting at row 3 (one row per spell), attr `0x03`; when `selectedIdx === i`, draw that row as a highlight bar (inverse: attr `0x50` low-nibble-0 highlight path — match the captured sub-list fixture). Keep the scrollbar in col 0. The realm name + colour and the COST box stay as today (COST blank when `selectedIdx === null`). Verify the highlight orientation (inverse vs coloured) against `creation-spell-sublist-chill.png` per the CLAUDE.md highlight-attr-sign checklist.

- [ ] **Step 2: Update the existing panel-parity test usage**

`composeSpellPanel` callers now pass `{ realm, spellNames, selectedIdx, cost }`. Update the existing test in `tools/parity/spell-pick-parity.test.ts` call site to `{ realm: 'FIRE', spellNames: ['ENERGY BLAST'], selectedIdx: null }` (grid-browse FIRE, the original fixture) so the original `creation-spell-pick` case still passes 100%.

- [ ] **Step 3: Create the school-icon cursor composer**

The current school is highlighted on the char-sheet's school-mana icon grid (bottom-left of the persistent stat panel). Add `compose-school-cursor.ts` exporting `drawSchoolCursor(panel: TileWindow, school: number): void` that inverts/boxes the icon cell for `school` (positions per the stat-panel layout; derive the 6 icon cell coords from the persistent panel composer and match `creation-spell-grid-*.png`). Call it from the stat-panel render path when the spell picker is active.

- [ ] **Step 4: Unit-test the composer**

Add `compose-spell-panel.test.ts` asserting: (a) grid-browse mode (`selectedIdx: null`) writes each `spellNames` entry at the right inner-window row with attr 0x03 and a blank COST box; (b) sub-list mode (`selectedIdx: 1`) writes the highlight bar on row index 1 and the COST chars. Use the tile-window cell API to read back `(char, attr)`.

Run: `pnpm --filter @wiz6/viewer test compose-spell-panel`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/roster/creation/ega/compose-spell-panel.ts packages/viewer/src/pages/roster/creation/ega/compose-school-cursor.ts packages/viewer/tests/pages/roster/creation/ega/compose-spell-panel.test.ts tools/parity/spell-pick-parity.test.ts
git commit -m "feat(creation): render per-school spell list + sub-list highlight + COST + school cursor (#060)"
```

---

## Task 5: `SpellPickScreen` two-level state machine

**Files:**
- Modify: `packages/viewer/src/pages/roster/creation/screens/SpellPickScreen.tsx`
- Test: `packages/viewer/tests/pages/roster/creation/screens/SpellPickScreen.test.tsx`

- [ ] **Step 1: Write failing key-handling tests**

Replace the old `eligibleSpells` tests with state-machine tests. Drive the exported pure reducer (extract one — see Step 3) or simulate key events:
```ts
it('grid mode: right moves school +3 (FIRE→EARTH), clamped', () => {
  expect(nextSchool('grid', 0, /*key*/'right')).toBe(3);
  expect(nextSchool('grid', 3, 'right')).toBe(3); // 3+3=6 out of range → no-op
});
it('grid mode: down moves +1 within row, clamped at col 2', () => {
  expect(nextSchool('grid', 0, 'down')).toBe(1);
  expect(nextSchool('grid', 2, 'down')).toBe(2); // bottom of row → clamp
});
it('enter on a non-empty school enters sub-list at spell 0', () => {
  // Mage WATER has 2 spells
  expect(enterSchool(/*grid[1].length*/2)).toEqual({ mode: 'sublist', spellIdx: 0 });
  expect(enterSchool(/*empty*/0)).toEqual({ mode: 'grid', spellIdx: 0 }); // no-op on empty
});
it('sub-list: down moves spell cursor clamped to len-1; enter dispatches PICK_SPELL', () => { /* ... */ });
```

- [ ] **Step 2: Run; expect failure**

Run: `pnpm --filter @wiz6/viewer test SpellPickScreen`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Rewrite SpellPickScreen with grid/sub-list state**

Replace `eligibleSpells`/`totalPicksRequired` with `creationSpellGrid`/`creationPickCount`. Add exported pure helpers `nextSchool(mode, school, key)` and `enterSchool(count)` for testability. Component state: `school` (0..5), `mode` ('grid'|'sublist'), `spellIdx`. Key handler:
```ts
// grid mode: code 1=left(-3 if >=0), 3=right(+3 if <6), 2=up(-1 if col>0), 4=down(+1 if col<2),
//            5=enter → if grid[school].length>0 setMode('sublist'),setSpellIdx(0)
// sublist mode: 2=up(spellIdx-1 clamp 0), 4=down(spellIdx+1 clamp len-1),
//            5=enter → dispatch PICK_SPELL grid[school][spellIdx].entryIdx;
//                      if picked+1>=required dispatch SPELLS_DONE else setMode('grid')
//            1=left or 0=esc → setMode('grid')
```
Render: `const cells = creationSpellGrid(classIdx); const list = cells[school];`
```ts
composeSpellPanel(outer, inner, {
  realm: REALM_NAMES[school] ?? '',
  spellNames: list.map((s) => spellName(db, s.entryIdx) || `SPELL ${s.entryIdx}`),
  selectedIdx: mode === 'sublist' ? spellIdx : null,
  cost: mode === 'sublist' && list[spellIdx] ? String(spellCost(list[spellIdx]!.entry)) : null,
});
drawSchoolCursor(top, school);
```
Keep the bottom-bar prompt (msg 0x2bf).

- [ ] **Step 4: Run; expect pass**

Run: `pnpm --filter @wiz6/viewer test SpellPickScreen`
Expected: PASS.

- [ ] **Step 5: tsc + commit**

Run: `pnpm --filter @wiz6/viewer exec tsc --noEmit` (expect clean for these files).
```bash
git add packages/viewer/src/pages/roster/creation/screens/SpellPickScreen.tsx packages/viewer/tests/pages/roster/creation/screens/SpellPickScreen.test.tsx
git commit -m "feat(creation): SpellPickScreen 3x2 school grid + sub-list state machine (#060)"
```

---

## Task 6: Pixel-parity gate against the captured fixtures

**Files:**
- Modify: `tools/parity/spell-pick-parity.test.ts`

- [ ] **Step 1: Add a parity case per captured fixture**

For each fixture from Task 3, render the panel (+ school cursor) for that state and `rectDiff` the panel region (x∈[160,320), y∈[32,160)) at 100%:
```ts
const CASES = [
  { fixture: 'creation-spell-grid-fire',  realm: 'FIRE',  names: ['ENERGY BLAST'], sel: null },
  { fixture: 'creation-spell-grid-water', realm: 'WATER', names: ['CHILLING TOUCH', 'TERROR'], sel: null },
  { fixture: 'creation-spell-grid-air',   realm: 'AIR',   names: [], sel: null },
  { fixture: 'creation-spell-sublist-chill',  realm: 'WATER', names: ['CHILLING TOUCH', 'TERROR'], sel: 0, cost: '2' },
  { fixture: 'creation-spell-sublist-terror', realm: 'WATER', names: ['CHILLING TOUCH', 'TERROR'], sel: 1, cost: '3' },
];
```
Iterate, compose, compare. If the school-icon cursor falls outside the panel rect, add a second rect over the icon-grid region gated against `creation-spell-grid-earth` (row-1 cursor).

- [ ] **Step 2: Run the parity suite; expect 100%**

Run: `pnpm --filter @wiz6/parity test spell-pick-parity`
Expected: PASS at 100% for every case. If a case is < 100%, debug the composer against the named `.png` (highlight attr sign, row placement, cursor coords) — do not widen tolerance.

- [ ] **Step 3: Manual smoke + commit**

`pnpm dev:viewer`, create a Mage, navigate the school grid (←/→ rows, ↑/↓ within row), drill into WATER, pick a spell, confirm the 2nd pick + advance. Then:
```bash
git add tools/parity/spell-pick-parity.test.ts
git commit -m "test(parity): gate the creation spell-picker grid + sub-list at 100% (#060)"
```

---

## Self-Review

**Spec coverage:** data fix (Task 1), eligibility filter level-1+mask grouped by school (Task 2), grid+sub-list nav (Task 5), per-school/sub-list/COST render + school cursor (Task 4), fixtures (Task 3), pixel-parity gate (Task 6). All spec bullets covered.

**Open risks flagged for the implementer:**
- The exact RIGHT-key out-of-range behaviour (the disasm hinted "+3 if <6 else −1/cancel"); this plan treats it as a clamp/no-op. Verify against the engine if a created caster reports odd cursor jumps (DOSBox breakpoint at wpcmk 0x2459 on `[bp-0x40]`).
- The school-icon cursor coords (Task 4 Step 3) must be derived from the existing persistent-panel composer and matched to `creation-spell-grid-*.png`; if the icon layout isn't already a known table, RE it from the stat-panel render before coding.
- Highlight orientation (inverse vs coloured) for the sub-list bar: confirm the attr SIGN against the fixture per the CLAUDE.md checklist — cell-grid parity won't catch it.

**Type consistency:** `creationSpellGrid` returns `CreationSpell[][]`; `SpellPanelView` uses `spellNames: string[]` + `selectedIdx: number | null`; `spellCost(entry)` used in both Task 4 and Task 5. Consistent.
