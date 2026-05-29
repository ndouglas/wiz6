# WPCVW EDIT submenu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the wpcvw state-0x11 EDIT submenu (RENAME / CHANGE PORTRAIT / CHANGE PROFESSION) behind a House Rule, making it the first wired action in the CharacterViewPage scaffold.

**Architecture:** A discriminated-union local state in `CharacterViewPage` handles the EDIT flow inline (no extra routes). Composers in `pages/castle/` render each sub-screen as a `TileWindow` over the existing main panel. A pure `applyClassChange` function in `@wiz6/data` encapsulates the destructive class-change tax. Gating happens via a new `allowEditFromCamp` House Rule (default off = engine-faithful).

**Tech Stack:** TypeScript ESM, React 18, Zod, Vitest, pnpm monorepo. Spec: `docs/superpowers/specs/2026-05-29-wpcvw-edit-submenu-design.md`.

---

## Engine references (quick lookup)

| Element | Address / msg-id | Source finding |
|---|---|---|
| EDIT submenu entry | `wpcvw.ovr` 0x671f | `edit-submenu-options` |
| Submenu labels | msg 650..654 (RENAME / CHANGE PORTRAIT / CHANGE PROFESSION / REPLACE / EX) | indexedMessages 650-654 |
| Submenu picker geom | x_base=2, y_base=1, x_step=0x12, cols=2, attr=5 | `edit-submenu-options` |
| RENAME prompt | msg 0x468 ("NEW NAME >"), max 7 chars | `edit-name-flow` |
| PORTRAIT sub-window | x=0x14, y=4, w=0x14, h=0x10, attr=0x1e | `edit-portrait-flow` |
| PORTRAIT msg ids | 0x458 (row 9), 0x459 (row 12) | `edit-portrait-flow` |
| CLASS CHANGE | `wpcvw.ovr` 0x6054 | `edit-class-change-flow`, `fn-class-change-tax` |
| Picker keys | 1=UP, 2=LEFT, 3=DOWN, 4=RIGHT, 5=Enter; no wrap | `view-input-keys` |

---

## File structure

**Create (data layer):**
- `packages/data/src/character-actions/class-change.ts`
- `packages/data/src/character-actions/index.ts`
- `packages/data/tests/character-actions/class-change.test.ts`

**Create (viewer composers):**
- `packages/viewer/src/pages/castle/compose-edit-submenu.ts`
- `packages/viewer/src/pages/castle/compose-rename-prompt.ts`
- `packages/viewer/src/pages/castle/compose-portrait-change.ts`
- `packages/viewer/src/pages/castle/compose-class-picker.ts`
- `packages/viewer/src/pages/castle/compose-profession-confirm.ts`
- `packages/viewer/src/pages/castle/character-view-reducer.ts`

**Create (viewer tests):**
- `packages/viewer/tests/pages/castle/compose-edit-submenu.test.ts`
- `packages/viewer/tests/pages/castle/compose-rename-prompt.test.ts`
- `packages/viewer/tests/pages/castle/compose-portrait-change.test.ts`
- `packages/viewer/tests/pages/castle/compose-class-picker.test.ts`
- `packages/viewer/tests/pages/castle/compose-profession-confirm.test.ts`
- `packages/viewer/tests/pages/castle/character-view-reducer.test.ts`

**Modify:**
- `packages/data/src/schemas/house-rules.ts` — add `allowEditFromCamp`
- `packages/data/src/index.ts` — re-export `applyClassChange`
- `packages/viewer/src/lib/active-party-store.ts` — add `updateActiveMember`
- `packages/viewer/src/pages/castle/compose-action-menu.ts` — accept `includeEditFromCamp`
- `packages/viewer/src/pages/castle/CharacterViewPage.tsx` — wire reducer + sub-screens
- `TODO.md` — close #040, open #055/#056/#057

---

### Task 1: Add `allowEditFromCamp` House Rule

**Files:**
- Modify: `packages/data/src/schemas/house-rules.ts`
- Modify: `packages/data/tests/schemas/house-rules.test.ts` (if exists; otherwise create)

- [ ] **Step 1: Check if house-rules.test.ts exists**

Run:
```bash
ls packages/data/tests/schemas/house-rules.test.ts 2>/dev/null && echo "exists" || echo "missing"
```

If `missing`, create the file in Step 2 with a `describe('HouseRulesSchema', () => { ... })` wrapper around the new test.

- [ ] **Step 2: Add the schema-field test**

In `packages/data/tests/schemas/house-rules.test.ts`, add:

```ts
import { describe, it, expect } from 'vitest';
import {
  HouseRulesSchema,
  STOCK_HOUSE_RULES,
  DEFAULT_HOUSE_RULES,
  HOUSE_RULES_META,
} from '../../src/schemas/house-rules.js';

describe('allowEditFromCamp house rule', () => {
  it('is part of the schema', () => {
    const parsed = HouseRulesSchema.parse({
      schemaVersion: 1,
      pinMaxBonusRoll: false,
      playInvalidActionBeep: true,
      engineFaithfulSkillExit: false,
      allowEditFromCamp: true,
    });
    expect(parsed.allowEditFromCamp).toBe(true);
  });

  it('defaults to false in STOCK and DEFAULT', () => {
    expect(STOCK_HOUSE_RULES.allowEditFromCamp).toBe(false);
    expect(DEFAULT_HOUSE_RULES.allowEditFromCamp).toBe(false);
  });

  it('has a HOUSE_RULES_META entry', () => {
    const meta = HOUSE_RULES_META.find((m) => m.key === 'allowEditFromCamp');
    expect(meta).toBeDefined();
    expect(meta?.category).toBe('gameplay');
    expect(meta?.stockValue).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests — expect failure**

```bash
pnpm --filter @wiz6/data test schemas/house-rules
```
Expected: 3 failing tests citing `allowEditFromCamp` not in schema.

- [ ] **Step 4: Add the field + defaults + meta to `house-rules.ts`**

In `packages/data/src/schemas/house-rules.ts`:

(a) Add to `HouseRulesSchema`:
```ts
  /**
   * When TRUE, the WPCVW EDIT submenu (rename, change portrait, change
   * profession) appears in the camp REVIEW MEMBER action set. When FALSE,
   * EDIT is camp-disabled (engine behavior — EDIT is only reachable from
   * the dungeon in the original). Category: gameplay. Default: FALSE.
   */
  allowEditFromCamp: z.boolean(),
```

(b) Add to `STOCK_HOUSE_RULES`:
```ts
  allowEditFromCamp: false,
```

(c) Add to `DEFAULT_HOUSE_RULES`:
```ts
  allowEditFromCamp: false,
```

(d) Append to `HOUSE_RULES_META`:
```ts
  {
    key: 'allowEditFromCamp',
    label: 'Allow EDIT from camp REVIEW MEMBER',
    description:
      'In the original Wizardry VI, the EDIT submenu (rename, change portrait, change profession) is only available from the in-dungeon character view — camp REVIEW MEMBER disables it. The wiz6 dungeon is not yet ported, so this toggle lets you reach EDIT from the castle for now.',
    category: 'gameplay',
    stockValue: false,
    control: 'boolean',
  },
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
pnpm --filter @wiz6/data test schemas/house-rules
```
Expected: all 3 new tests pass; existing house-rules tests still pass.

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/schemas/house-rules.ts packages/data/tests/schemas/house-rules.test.ts
git commit -m "feat(house-rules): add allowEditFromCamp toggle"
```

---

### Task 2: `applyClassChange` — failing tests

**Files:**
- Create: `packages/data/tests/character-actions/class-change.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect } from 'vitest';
import { applyClassChange } from '../../src/character-actions/class-change.js';
import type { ActivePartyMember } from '../../src/schemas/active-party.js';

// Deterministic RNG stub — returns 0 for every uniform() call. Lets us
// compute exact post-change derived stats without WichmannHill state.
class ZeroRng {
  uniform(_n: number): number {
    return 0;
  }
}

function makeFighter(overrides: Partial<ActivePartyMember> = {}): ActivePartyMember {
  return {
    id: '00000000-0000-4000-8000-000000000000',
    name: 'TEST',
    race: 0, // Human
    class: 0, // Fighter
    level: 7,
    savedOldLevel: 0,
    xp: 12345,
    gold: 100,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false,
    paralyzed: false,
    attributes: {
      str: 15, int: 10, pie: 10, vit: 14, dex: 12, spd: 11, per: 10, kar: 10,
    },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    reaction: 50,
    inventory: new Array(22).fill({ itemId: 0, quantity: 0, identifiedMask: 0, equipped: false, charges: 0 }),
    equipment: [0, 1, 255, 255, 255, 255, 255, 255], // weapon + shield equipped
    sex: 0,
    portraitSlotId: 0,
    rosterCharacterId: '00000000-0000-4000-8000-000000000000',
    ...overrides,
  } as ActivePartyMember;
}

describe('applyClassChange', () => {
  it('resets level to 1', () => {
    const result = applyClassChange(new ZeroRng(), makeFighter(), 1);
    expect(result.level).toBe(1);
  });

  it('wipes XP to 0', () => {
    const result = applyClassChange(new ZeroRng(), makeFighter(), 1);
    expect(result.xp).toBe(0);
  });

  it('saves previous level into savedOldLevel', () => {
    const result = applyClassChange(new ZeroRng(), makeFighter({ level: 7 }), 1);
    expect(result.savedOldLevel).toBe(7);
  });

  it('caps savedOldLevel at 250 (engine 0xfa)', () => {
    const result = applyClassChange(new ZeroRng(), makeFighter({ level: 999 }), 1);
    expect(result.savedOldLevel).toBe(250);
  });

  it('changes the class to the new id', () => {
    const result = applyClassChange(new ZeroRng(), makeFighter({ class: 0 }), 5);
    expect(result.class).toBe(5);
  });

  it('unequips everything (equipment all 255)', () => {
    const result = applyClassChange(
      new ZeroRng(),
      makeFighter({ equipment: [0, 1, 2, 3, 4, 5, 6, 7] }),
      1,
    );
    expect(result.equipment).toEqual([255, 255, 255, 255, 255, 255, 255, 255]);
  });

  it('preserves attributes byte-for-byte', () => {
    const before = makeFighter();
    const result = applyClassChange(new ZeroRng(), before, 1);
    expect(result.attributes).toEqual(before.attributes);
  });

  it('preserves name, race, sex, portraitIndex, age, conditions, inventory items, skills, reaction', () => {
    const before = makeFighter({
      name: 'NATHAN',
      race: 2,
      sex: 1,
      portraitIndex: 7,
      age: 7000,
      conditions: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      skills: new Array(30).fill(0).map((_, i) => (i < 5 ? 25 : 0)),
      reaction: 75,
    });
    const result = applyClassChange(new ZeroRng(), before, 1);
    expect(result.name).toBe('NATHAN');
    expect(result.race).toBe(2);
    expect(result.sex).toBe(1);
    expect(result.portraitIndex).toBe(7);
    expect(result.age).toBe(7000);
    expect(result.conditions).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(result.inventory).toEqual(before.inventory);
    expect(result.skills).toEqual(before.skills);
    expect(result.reaction).toBe(75);
  });

  it('recomputes hpCurrent equal to hpMax', () => {
    const result = applyClassChange(new ZeroRng(), makeFighter(), 1);
    expect(result.hpCurrent).toBe(result.hpMax);
  });

  it('recomputes staminaCurrent equal to staminaMax', () => {
    const result = applyClassChange(new ZeroRng(), makeFighter(), 1);
    expect(result.staminaCurrent).toBe(result.staminaMax);
  });

  it('preserves portraitSlotId and rosterCharacterId (active-party-only fields)', () => {
    const result = applyClassChange(
      new ZeroRng(),
      makeFighter({ portraitSlotId: 3, rosterCharacterId: 'a-roster-uuid' }),
      1,
    );
    expect(result.portraitSlotId).toBe(3);
    expect(result.rosterCharacterId).toBe('a-roster-uuid');
  });

  it('chained class-change at level 1 sets savedOldLevel=1 (engine-faithful — throttle escape exploit)', () => {
    const r1 = applyClassChange(new ZeroRng(), makeFighter({ level: 7 }), 1);
    expect(r1.savedOldLevel).toBe(7);
    const r2 = applyClassChange(new ZeroRng(), r1, 0);
    expect(r2.savedOldLevel).toBe(1);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm --filter @wiz6/data test character-actions
```
Expected: import error — `class-change.js` doesn't exist.

- [ ] **Step 3: Commit (tests-only, will fix in next task)**

Skip commit until impl lands — one commit per Task 3.

---

### Task 3: `applyClassChange` — implementation

**Files:**
- Create: `packages/data/src/character-actions/class-change.ts`
- Create: `packages/data/src/character-actions/index.ts`

- [ ] **Step 1: Implement `class-change.ts`**

```ts
/**
 * applyClassChange — engine-faithful WPCVW class-change tax.
 *
 * Engine reference: `wpcvw_class_change_execute` @ wpcvw.ovr 0x6054.
 * Behavior (per docs/re/findings/wpcvw-naming-pass.json#fn-class-change-tax
 * and docs/re/wpcvw-character-view.md):
 *
 *   1. *0x4587 := new_class            (class byte set)
 *   2. *0x4597 := min(*0x440c, 250)   (saved-old-level cap; 0xfa)
 *   3. *0x440c := 1                    (level reset)
 *   4. *0x4588 := 0                    (high-water-mark reset — not modeled)
 *   5. *0x43f4/6 := 0                  (XP wiped)
 *   6. FUN_5f4d (race re-init)         (no-op here — race unchanged)
 *   7. FUN_5e04 (class re-init)        (re-rolls HP/encumbrance via class formula)
 *   8. FUN_8e35 (recompute derived)    (re-derives AC, stamina, etc.; ALSO unequips all)
 *
 * Derived-stat recompute is delegated to `computeDerivedStats` (the same pure
 * fn used at character creation — both flows produce a "fresh class baseline"
 * for the character's current attributes). HP/stamina come out at the rolled
 * baseline; current = max for a fresh character.
 *
 * Spec: docs/superpowers/specs/2026-05-29-wpcvw-edit-submenu-design.md
 */

import type { ActivePartyMember } from '../schemas/active-party.js';
import { computeDerivedStats, type Rng } from '../character-creation/derived-stats.js';

const SAVED_OLD_LEVEL_CAP = 250; // engine 0xfa
const NUM_EQUIPMENT_SLOTS = 8;

export function applyClassChange(
  rng: Rng,
  member: ActivePartyMember,
  newClassId: number,
): ActivePartyMember {
  const derived = computeDerivedStats(rng, newClassId, member.race, member.attributes);

  return {
    ...member,
    class: newClassId,
    level: 1,
    xp: 0,
    savedOldLevel: Math.min(member.level, SAVED_OLD_LEVEL_CAP),
    equipment: new Array(NUM_EQUIPMENT_SLOTS).fill(255),
    age: derived.age ?? member.age,
    hpCurrent: derived.hpMax,
    hpMax: derived.hpMax,
    staminaCurrent: derived.staminaMax,
    staminaMax: derived.staminaMax,
    derivedAc: derived.derivedAc,
    bodyAc: derived.bodyAc,
    encumbranceCurrent: derived.encumbranceBase,
    encumbranceMax: derived.encumbranceBase,
    schoolMana: derived.schoolMana ?? member.schoolMana,
    schoolManaMax: derived.schoolManaMax ?? member.schoolManaMax,
    schoolRankThresholds: derived.schoolRankThresholds ?? member.schoolRankThresholds,
  };
}
```

**NOTE for the engineer**: The exact `DerivedStats` field shape may not match the names above 1:1. Open `packages/data/src/character-creation/derived-stats.ts` and adapt the field names. The behavior to preserve is: every recomputed field overrides the member's stale value; every non-recomputed field is preserved via the `...member` spread. If `computeDerivedStats` does NOT return `age` (because age is a one-time creation roll, not re-rolled on class change), drop the `age` override line (the spread preserves it).

- [ ] **Step 2: Create `index.ts`**

```ts
export { applyClassChange } from './class-change.js';
```

- [ ] **Step 3: Add re-export to `packages/data/src/index.ts`**

Append (in the section grouping other `character-*` exports):
```ts
export { applyClassChange } from './character-actions/index.js';
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm --filter @wiz6/data test character-actions
```
Expected: all 12 tests pass. If a test fails due to a `DerivedStats` field-name mismatch, adapt the impl, NOT the test (the test asserts the contract).

- [ ] **Step 5: Run the full @wiz6/data test suite to confirm no regressions**

```bash
pnpm --filter @wiz6/data test
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/character-actions packages/data/src/index.ts packages/data/tests/character-actions
git commit -m "feat(data): applyClassChange — engine-faithful class-change tax

Level→1, XP→0, savedOldLevel←previousLevel (cap 250),
unequip-all, recompute derived stats via the existing
computeDerivedStats. Spec: 2026-05-29-wpcvw-edit-submenu-design.md."
```

---

### Task 4: `updateActiveMember` helper

**Files:**
- Modify: `packages/viewer/src/lib/active-party-store.ts`
- Create: `packages/viewer/tests/lib/active-party-store.test.ts` (if missing — check first)

- [ ] **Step 1: Check existing test file**

```bash
ls packages/viewer/tests/lib/active-party-store.test.ts 2>/dev/null
```

If it doesn't exist, create it in Step 2 with a `describe('updateActiveMember', () => { ... })` block.

- [ ] **Step 2: Write the failing test**

Append to (or create) `packages/viewer/tests/lib/active-party-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  readActiveParty,
  writeActiveParty,
  updateActiveMember,
} from '../../src/lib/active-party-store.js';
import type { ActivePartyMember } from '@wiz6/data';

function fakeMember(overrides: Partial<ActivePartyMember> = {}): ActivePartyMember {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'AAA',
    race: 0,
    class: 0,
    level: 1,
    savedOldLevel: 0,
    xp: 0,
    gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false,
    paralyzed: false,
    attributes: { str: 10, int: 10, pie: 10, vit: 10, dex: 10, spd: 10, per: 10, kar: 10 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    reaction: 50,
    sex: 0,
    portraitSlotId: 0,
    rosterCharacterId: '00000000-0000-4000-8000-000000000001',
    ...overrides,
  } as ActivePartyMember;
}

describe('updateActiveMember', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('patches the named fields of the member at slotIndex', () => {
    writeActiveParty({
      schemaVersion: 1,
      members: [fakeMember({ name: 'OLD' })],
    });
    updateActiveMember(0, { name: 'NEW' });
    expect(readActiveParty().members[0]?.name).toBe('NEW');
  });

  it('preserves other members untouched', () => {
    writeActiveParty({
      schemaVersion: 1,
      members: [fakeMember({ name: 'AAA' }), fakeMember({ name: 'BBB', id: '00000000-0000-4000-8000-000000000002' })],
    });
    updateActiveMember(0, { name: 'CCC' });
    const m = readActiveParty().members;
    expect(m[0]?.name).toBe('CCC');
    expect(m[1]?.name).toBe('BBB');
  });

  it('is a no-op on out-of-range slotIndex', () => {
    writeActiveParty({ schemaVersion: 1, members: [fakeMember({ name: 'AAA' })] });
    updateActiveMember(5, { name: 'NEW' });
    expect(readActiveParty().members[0]?.name).toBe('AAA');
  });

  it('throws when the patch produces an invalid member (schema rejects)', () => {
    writeActiveParty({ schemaVersion: 1, members: [fakeMember()] });
    expect(() => updateActiveMember(0, { name: '' })).toThrow();
  });
});
```

- [ ] **Step 3: Run — expect failure**

```bash
pnpm --filter @wiz6/viewer test active-party-store
```
Expected: import error — `updateActiveMember` is not exported.

- [ ] **Step 4: Implement `updateActiveMember`**

Append to `packages/viewer/src/lib/active-party-store.ts`:

```ts
/**
 * Patch a subset of fields on the active-party member at `slotIndex`.
 * No-op when out of range. Throws if the resulting record fails the
 * ActivePartySchema validation (e.g., empty name).
 *
 * Used by the WPCVW EDIT submenu sub-flows (rename, portrait change,
 * profession change) to write through to localStorage. The corresponding
 * roster character is NOT updated by this helper — that's tracked as
 * TODO #056 (active ↔ roster sync).
 */
export function updateActiveMember(
  slotIndex: number,
  patch: Partial<ActivePartyMember>,
): void {
  const p = readActiveParty();
  if (slotIndex < 0 || slotIndex >= p.members.length) return;
  const current = p.members[slotIndex]!;
  const next = [...p.members];
  next[slotIndex] = { ...current, ...patch };
  writeActiveParty({ ...p, members: next });
}
```

- [ ] **Step 5: Run — expect PASS**

```bash
pnpm --filter @wiz6/viewer test active-party-store
```
Expected: all 4 new tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/viewer/src/lib/active-party-store.ts packages/viewer/tests/lib/active-party-store.test.ts
git commit -m "feat(active-party-store): updateActiveMember(slotIdx, patch) helper

Used by WPCVW EDIT to write through name/portraitIndex/class changes.
Roster-side sync deferred to TODO #056."
```

---

### Task 5: `compose-edit-submenu`

**Files:**
- Create: `packages/viewer/src/pages/castle/compose-edit-submenu.ts`
- Create: `packages/viewer/tests/pages/castle/compose-edit-submenu.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { composeEditSubmenu } from '../../../src/pages/castle/compose-edit-submenu.js';
import type { MessageDb } from '@wiz6/data';

// Minimal MessageDb stub: returns the literal string for any msgId we
// reference. Keeps the test independent of the JSON.
const STUB_LABELS: Record<number, string> = {
  650: 'RENAME',
  651: 'CHGPORT',
  652: 'CHGPROF',
  653: 'REPLACE',
  654: 'EX',
};
const stubDb = {
  indexedMessages: Object.entries(STUB_LABELS).map(([id, decodedText]) => ({
    id: Number(id),
    decodedText,
  })),
} as unknown as MessageDb;

function attrAt(cells: Uint8Array, w: number, col: number, row: number): number {
  return cells[(row * w + col) * 2 + 1] ?? 0;
}

function charsAt(cells: Uint8Array, w: number, col: number, row: number, n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) {
    out += String.fromCharCode(cells[(row * w + col + i) * 2] ?? 0);
  }
  return out;
}

describe('composeEditSubmenu', () => {
  it('renders 5 entries in column-major order at the engine\'s picker coords', () => {
    const w = composeEditSubmenu({ cursorIdx: 0, db: stubDb });
    expect(w.widthCells).toBe(40);
    // Column-major: index 0 at (2, 1), index 1 at (2, 2), index 2 at (20, 1),
    // index 3 at (20, 2), index 4 at (38, 1).
    expect(charsAt(w.cells, 40, 2, 1, 6)).toBe('RENAME');
    expect(charsAt(w.cells, 40, 2, 2, 7)).toBe('CHGPORT');
    expect(charsAt(w.cells, 40, 20, 1, 7)).toBe('CHGPROF');
    expect(charsAt(w.cells, 40, 20, 2, 7)).toBe('REPLACE');
    expect(charsAt(w.cells, 40, 38, 1, 2)).toBe('EX');
  });

  it('REPLACE entry uses the dimmed disabled attr (0x07)', () => {
    const w = composeEditSubmenu({ cursorIdx: 0, db: stubDb });
    expect(attrAt(w.cells, 40, 20, 2)).toBe(0x07);
  });

  it('cursor highlight (attr 0x50) lands on the selected entry', () => {
    const w = composeEditSubmenu({ cursorIdx: 0, db: stubDb });
    expect(attrAt(w.cells, 40, 2, 1)).toBe(0x50);
  });

  it('non-cursor enabled entries use attr 0x05', () => {
    const w = composeEditSubmenu({ cursorIdx: 0, db: stubDb });
    expect(attrAt(w.cells, 40, 2, 2)).toBe(0x05); // CHGPORT
    expect(attrAt(w.cells, 40, 20, 1)).toBe(0x05); // CHGPROF
    expect(attrAt(w.cells, 40, 38, 1)).toBe(0x05); // EX
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm --filter @wiz6/viewer test compose-edit-submenu
```
Expected: import error.

- [ ] **Step 3: Implement the composer**

```ts
/**
 * composeEditSubmenu — WPCVW EDIT submenu (option 9 in the main action menu).
 *
 * Engine reference: wpcvw_edit_submenu @ wpcvw.ovr 0x671f. 5 entries
 * (msg 650..654: RENAME / CHANGE PORTRAIT / CHANGE PROFESSION / REPLACE / EX).
 * REPLACE (index 3) is ALWAYS force-disabled by the engine. Picker geometry
 * from finding `edit-submenu-options`: x_base=2, y_base=1, x_step=0x12=18,
 * cols=2 (≡ max-col-index, so columns 0..2), attr=5, msg_base=0x28a=650.
 *
 * Column-major fill (engine order):
 *   idx 0 (RENAME)         → col 2,  row 1
 *   idx 1 (CHANGE PORTRAIT)→ col 2,  row 2
 *   idx 2 (CHANGE PROFESSION) → col 20, row 1
 *   idx 3 (REPLACE — disabled) → col 20, row 2
 *   idx 4 (EX)             → col 38, row 1
 *
 * Hosted in the wpcvw main panel (40×20 at x=0, y=0). Caller composes the
 * full character-view frame; this composer produces only the submenu overlay
 * cells (it does not clear the panel — caller already drew the character
 * sheet underneath).
 *
 * Spec: docs/superpowers/specs/2026-05-29-wpcvw-edit-submenu-design.md
 */

import { createTileWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import { creationString } from '../roster/creation/messages.js';

const PANEL_W = 40;
const PANEL_H = 20;
const PANEL_X = 0;
const PANEL_Y = 0;

const SUBMENU_MSG_BASE = 650;
const REPLACE_INDEX = 3;
const ENTRY_COUNT = 5;

const ATTR_ENABLED = 0x05;
const ATTR_DISABLED = 0x07; // dimmed gray — confirm against engine fixture (TODO #057)
const ATTR_HIGHLIGHT = 0x50;

const X_BASE = 2;
const Y_BASE = 1;
const X_STEP = 0x12; // 18
const ROWS = 2;

export interface EditSubmenuView {
  /** Packed cursor index 0..4 into the 5 entries (REPLACE skipped by reducer). */
  cursorIdx: number;
  db: MessageDb;
}

function gridPosition(entryIdx: number): { x: number; y: number } {
  const col = Math.floor(entryIdx / ROWS);
  const row = entryIdx % ROWS;
  return { x: X_BASE + col * X_STEP, y: Y_BASE + row };
}

export function composeEditSubmenu(view: EditSubmenuView): TileWindow {
  const w = createTileWindow({
    screenX: PANEL_X,
    screenY: PANEL_Y,
    widthCells: PANEL_W,
    heightCells: PANEL_H,
  });
  w.invertHighlight = true;

  for (let i = 0; i < ENTRY_COUNT; i++) {
    const msgId = SUBMENU_MSG_BASE + i;
    const label = creationString(view.db, msgId);
    if (!label) continue;
    const { x, y } = gridPosition(i);
    const attr =
      i === REPLACE_INDEX
        ? ATTR_DISABLED
        : i === view.cursorIdx
          ? ATTR_HIGHLIGHT
          : ATTR_ENABLED;
    setCursor(w, x, y);
    puts(w, label, attr);
  }

  return w;
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm --filter @wiz6/viewer test compose-edit-submenu
```
Expected: 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/castle/compose-edit-submenu.ts packages/viewer/tests/pages/castle/compose-edit-submenu.test.ts
git commit -m "feat(castle): composeEditSubmenu — WPCVW EDIT 5-option submenu

Column-major picker matching engine geometry (x_base=2, y_base=1,
x_step=0x12). REPLACE force-disabled at attr 0x07. Spec:
2026-05-29-wpcvw-edit-submenu-design.md."
```

---

### Task 6: `compose-rename-prompt`

**Files:**
- Create: `packages/viewer/src/pages/castle/compose-rename-prompt.ts`
- Create: `packages/viewer/tests/pages/castle/compose-rename-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { composeRenamePrompt } from '../../../src/pages/castle/compose-rename-prompt.js';
import type { MessageDb } from '@wiz6/data';

const stubDb = {
  indexedMessages: [{ id: 0x468, decodedText: 'NEW NAME >' }],
} as unknown as MessageDb;

function attrAt(cells: Uint8Array, w: number, col: number, row: number): number {
  return cells[(row * w + col) * 2 + 1] ?? 0;
}
function charAt(cells: Uint8Array, w: number, col: number, row: number): string {
  return String.fromCharCode(cells[(row * w + col) * 2] ?? 0);
}

describe('composeRenamePrompt', () => {
  it('renders "NEW NAME >" at (1, 1) attr 0x03', () => {
    const w = composeRenamePrompt({ buffer: '', db: stubDb });
    expect(charAt(w.cells, 40, 1, 1)).toBe('N');
    expect(charAt(w.cells, 40, 2, 1)).toBe('E');
    expect(attrAt(w.cells, 40, 1, 1)).toBe(0x03);
  });

  it('empty buffer: cursor block "a" attr 0x10 immediately after the prompt', () => {
    const w = composeRenamePrompt({ buffer: '', db: stubDb });
    // "NEW NAME >" is 10 chars, starting at col 1 → ends at col 10. Buffer at col 11.
    expect(charAt(w.cells, 40, 11, 1)).toBe('a');
    expect(attrAt(w.cells, 40, 11, 1)).toBe(0x10);
  });

  it('non-empty buffer "FOO": 3 uppercase letters at attr 0x50, cursor block right after', () => {
    const w = composeRenamePrompt({ buffer: 'foo', db: stubDb });
    expect(charAt(w.cells, 40, 11, 1)).toBe('F');
    expect(charAt(w.cells, 40, 12, 1)).toBe('O');
    expect(charAt(w.cells, 40, 13, 1)).toBe('O');
    expect(attrAt(w.cells, 40, 11, 1)).toBe(0x50);
    expect(attrAt(w.cells, 40, 12, 1)).toBe(0x50);
    expect(charAt(w.cells, 40, 14, 1)).toBe('a');
    expect(attrAt(w.cells, 40, 14, 1)).toBe(0x10);
  });

  it('caps the buffer-visible region at 7 chars even if buffer is longer', () => {
    const w = composeRenamePrompt({ buffer: 'NATHANXX', db: stubDb });
    // 7 buffer cells at 11..17 attr 0x50; cursor block at 18.
    for (let i = 0; i < 7; i++) {
      expect(attrAt(w.cells, 40, 11 + i, 1)).toBe(0x50);
    }
    expect(charAt(w.cells, 40, 18, 1)).toBe('a');
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm --filter @wiz6/viewer test compose-rename-prompt
```
Expected: import error.

- [ ] **Step 3: Implement**

```ts
/**
 * composeRenamePrompt — WPCVW EDIT/RENAME prompt screen.
 *
 * Engine reference: wpcvw_edit_name @ wpcvw.ovr 0x6674. Clears+borders the
 * main panel, prints msg 0x468 ("NEW NAME >") at (col=1, row=1) attr 0x03,
 * then calls ui_text_input_editor with max_chars=7. Buffer position is
 * immediately after the prompt — mirroring wpcmk's RenameInputScreen
 * (the finding's "cursor at (5, 7)" is a paraphrase of decompile arg
 * cursor_x=5 and max_chars=7; the buffer y coord matches the prompt row 1).
 *
 * Cursor block is wfont0 glyph 0x61 ('a') at attr 0x10 (same as
 * wpcmk RenameInputScreen). Typed letters at attr 0x50.
 *
 * Spec: docs/superpowers/specs/2026-05-29-wpcvw-edit-submenu-design.md
 */

import { createTileWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import { creationString } from '../roster/creation/messages.js';

const PANEL_W = 40;
const PANEL_H = 20;
const PROMPT_MSG = 0x468;
const PROMPT_COL = 1;
const PROMPT_ROW = 1;
const ATTR_PROMPT = 0x03;
const ATTR_TYPED = 0x50;
const ATTR_CURSOR_BLOCK = 0x10;
const ATTR_PAD = 0x00;
const CURSOR_BLOCK_CHAR = 'a';
const NAME_MAX_LENGTH = 7;

export interface RenamePromptView {
  /** Current typed buffer (lowercase preserved; rendered upper). */
  buffer: string;
  db: MessageDb;
}

export function composeRenamePrompt(view: RenamePromptView): TileWindow {
  const w = createTileWindow({
    screenX: 0,
    screenY: 0,
    widthCells: PANEL_W,
    heightCells: PANEL_H,
  });
  w.invertHighlight = false;

  const promptText = creationString(view.db, PROMPT_MSG);
  setCursor(w, PROMPT_COL, PROMPT_ROW);
  puts(w, promptText, ATTR_PROMPT);

  const bufferStartCol = PROMPT_COL + promptText.length;
  const visibleBuffer = view.buffer.slice(0, NAME_MAX_LENGTH).toUpperCase();
  if (visibleBuffer.length > 0) {
    setCursor(w, bufferStartCol, PROMPT_ROW);
    puts(w, visibleBuffer, ATTR_TYPED);
  }
  setCursor(w, bufferStartCol + visibleBuffer.length, PROMPT_ROW);
  puts(w, CURSOR_BLOCK_CHAR, ATTR_CURSOR_BLOCK);

  const padCount = NAME_MAX_LENGTH - visibleBuffer.length;
  if (padCount > 0) {
    setCursor(w, bufferStartCol + visibleBuffer.length + 1, PROMPT_ROW);
    puts(w, ' '.repeat(padCount), ATTR_PAD);
  }

  return w;
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm --filter @wiz6/viewer test compose-rename-prompt
```

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/castle/compose-rename-prompt.ts packages/viewer/tests/pages/castle/compose-rename-prompt.test.ts
git commit -m "feat(castle): composeRenamePrompt — WPCVW EDIT/RENAME screen"
```

---

### Task 7: `compose-portrait-change`

**Files:**
- Create: `packages/viewer/src/pages/castle/compose-portrait-change.ts`
- Create: `packages/viewer/tests/pages/castle/compose-portrait-change.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { composePortraitChange } from '../../../src/pages/castle/compose-portrait-change.js';
import type { MessageDb } from '@wiz6/data';

const stubDb = {
  indexedMessages: [
    { id: 0x458, decodedText: '◄► TO REVIEW PORTRAITS' },
    { id: 0x459, decodedText: 'PRESS ▶ TO SELECT' },
  ],
} as unknown as MessageDb;

function charAt(cells: Uint8Array, w: number, col: number, row: number): string {
  return String.fromCharCode(cells[(row * w + col) * 2] ?? 0);
}

describe('composePortraitChange', () => {
  it('window is 20×16 at (x=20, y=4) — engine geometry', () => {
    const w = composePortraitChange({ previewIdx: 0, db: stubDb });
    expect(w.widthCells).toBe(20);
    expect(w.heightCells).toBe(16);
    expect(w.screenX).toBe(20 * 8);
    expect(w.screenY).toBe(4 * 8);
  });

  it('renders 3×3 portrait tile grid at chars 0x48..0x50', () => {
    const w = composePortraitChange({ previewIdx: 0, db: stubDb });
    // Grid is centered-ish inside the sub-window; pick a known coord per
    // wpcmk's PortraitChangeScreen pattern: (8, 3)..(10, 5).
    expect(charAt(w.cells, 20, 8, 3).charCodeAt(0)).toBe(0x48);
    expect(charAt(w.cells, 20, 9, 3).charCodeAt(0)).toBe(0x49);
    expect(charAt(w.cells, 20, 10, 3).charCodeAt(0)).toBe(0x4a);
    expect(charAt(w.cells, 20, 10, 5).charCodeAt(0)).toBe(0x50);
  });

  it('renders msg 0x458 on row 9 and msg 0x459 on row 12', () => {
    const w = composePortraitChange({ previewIdx: 0, db: stubDb });
    // The text content is what matters; exact column depends on centering.
    let row9 = '';
    for (let c = 0; c < 20; c++) row9 += charAt(w.cells, 20, c, 9);
    let row12 = '';
    for (let c = 0; c < 20; c++) row12 += charAt(w.cells, 20, c, 12);
    expect(row9).toContain('REVIEW');
    expect(row12).toContain('SELECT');
  });
});
```

- [ ] **Step 2: Run — expect failure**

- [ ] **Step 3: Implement**

```ts
/**
 * composePortraitChange — WPCVW EDIT/CHANGE PORTRAIT screen.
 *
 * Engine reference: wpcvw_change_portrait (formerly misnamed
 * wpcvw_identify_shop_or_temple) @ wpcvw.ovr 0x63bc. Creates a sub-window
 * at (x=0x14, y=4, w=0x14, h=0x10, attr=0x1e), draws a 3×3 portrait
 * preview at chars 0x48..0x50, and shows two prompts:
 *   - msg 0x458 ("◄► TO REVIEW PORTRAITS") at row 9
 *   - msg 0x459 ("PRESS ▶ TO SELECT") at row 12
 *
 * The composer renders the static layout. The active portrait is supplied
 * via a font-set patch elsewhere — chars 0x48..0x50 in the font sheet
 * get swapped to the previewed portrait between renders.
 *
 * Spec: docs/superpowers/specs/2026-05-29-wpcvw-edit-submenu-design.md
 */

import { createTileWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import { creationString } from '../roster/creation/messages.js';

const CELL_PX = 8;
const WIN_X = 20 * CELL_PX;
const WIN_Y = 4 * CELL_PX;
const WIN_W = 20;
const WIN_H = 16;

const PORTRAIT_GLYPH_BASE = 0x48;
const PORTRAIT_CELL_X = 8;
const PORTRAIT_CELL_Y = 3;
const ATTR_PORTRAIT = 0x02;
const ATTR_PROMPT = 0x03;

const MSG_REVIEW = 0x458;
const MSG_SELECT = 0x459;
const ROW_REVIEW = 9;
const ROW_SELECT = 12;

export interface PortraitChangeView {
  /** 0..41 — current portrait being previewed. */
  previewIdx: number;
  db: MessageDb;
}

export function composePortraitChange(view: PortraitChangeView): TileWindow {
  const w = createTileWindow({
    screenX: WIN_X,
    screenY: WIN_Y,
    widthCells: WIN_W,
    heightCells: WIN_H,
  });
  void view.previewIdx; // Used by caller's font-patch; layout is static.

  for (let r = 0; r < 3; r++) {
    setCursor(w, PORTRAIT_CELL_X, PORTRAIT_CELL_Y + r);
    for (let c = 0; c < 3; c++) {
      puts(w, String.fromCharCode(PORTRAIT_GLYPH_BASE + r * 3 + c), ATTR_PORTRAIT);
    }
  }

  const review = creationString(view.db, MSG_REVIEW);
  setCursor(w, Math.max(1, Math.floor((WIN_W - review.length) / 2)), ROW_REVIEW);
  puts(w, review, ATTR_PROMPT);

  const select = creationString(view.db, MSG_SELECT);
  setCursor(w, Math.max(1, Math.floor((WIN_W - select.length) / 2)), ROW_SELECT);
  puts(w, select, ATTR_PROMPT);

  return w;
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/castle/compose-portrait-change.ts packages/viewer/tests/pages/castle/compose-portrait-change.test.ts
git commit -m "feat(castle): composePortraitChange — WPCVW EDIT/CHANGE PORTRAIT screen"
```

---

### Task 8: `compose-class-picker`

**Files:**
- Create: `packages/viewer/src/pages/castle/compose-class-picker.ts`
- Create: `packages/viewer/tests/pages/castle/compose-class-picker.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { composeClassPicker } from '../../../src/pages/castle/compose-class-picker.js';
import type { MessageDb } from '@wiz6/data';

// Class names per CLASS_REQUIREMENTS order.
const CLASS_LABELS = [
  'FIGHTER', 'MAGE', 'PRIEST', 'THIEF', 'RANGER', 'ALCHEMI',
  'BARD', 'PSIONIC', 'VALKYR', 'BISHOP', 'LORD', 'SAMURAI',
  'MONK', 'NINJA',
];

const stubDb = {
  indexedMessages: CLASS_LABELS.map((decodedText, i) => ({
    id: 120 + i, // class-name msg base = 120 (engine reference; verify)
    decodedText,
  })),
} as unknown as MessageDb;

function charAt(cells: Uint8Array, w: number, col: number, row: number): string {
  return String.fromCharCode(cells[(row * w + col) * 2] ?? 0);
}

describe('composeClassPicker', () => {
  it('renders only eligible class labels (others skipped)', () => {
    const w = composeClassPicker({
      cursorIdx: 0,
      eligibleClasses: [0, 1, 2], // Fighter, Mage, Priest
      db: stubDb,
    });
    // First three listed entries.
    let row0 = '';
    for (let c = 0; c < 20; c++) row0 += charAt(w.cells, w.widthCells, c, 1);
    expect(row0).toContain('FIGHTER');
  });

  it('highlights the cursor entry with attr 0x50', () => {
    const w = composeClassPicker({
      cursorIdx: 1, // second entry
      eligibleClasses: [0, 1, 2],
      db: stubDb,
    });
    // Cursor on Mage row.
    const attr = w.cells[(2 * w.widthCells + 1) * 2 + 1];
    expect(attr).toBe(0x50);
  });
});
```

- [ ] **Step 2: Run — expect failure**

- [ ] **Step 3: Implement**

```ts
/**
 * composeClassPicker — class-selection picker for WPCVW EDIT/CHANGE PROFESSION.
 *
 * Engine: wpcvw_class_change_execute @ wpcvw.ovr 0x6054 builds an
 * availability table (FUN_5c95) before opening the picker. We use
 * @wiz6/data's eligibleClasses(attrs) to compute the same set.
 *
 * Layout: single-column list inside the wpcvw main panel. Each row shows
 * the class name (msg 120+classIdx — class-name msg base). Cursor highlight
 * uses inverse attr 0x50; non-cursor rows use attr 0x05.
 *
 * Spec: docs/superpowers/specs/2026-05-29-wpcvw-edit-submenu-design.md
 */

import { createTileWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import { creationString } from '../roster/creation/messages.js';

const PANEL_W = 40;
const PANEL_H = 20;
const CLASS_LABEL_MSG_BASE = 120;
const COL = 1;
const ROW_BASE = 1;
const ATTR_ENABLED = 0x05;
const ATTR_HIGHLIGHT = 0x50;

export interface ClassPickerView {
  /** Index into eligibleClasses[] (0..eligibleClasses.length-1). */
  cursorIdx: number;
  /** Class indices the character qualifies for (from eligibleClasses(attrs)). */
  eligibleClasses: ReadonlyArray<number>;
  db: MessageDb;
}

export function composeClassPicker(view: ClassPickerView): TileWindow {
  const w = createTileWindow({
    screenX: 0,
    screenY: 0,
    widthCells: PANEL_W,
    heightCells: PANEL_H,
  });
  w.invertHighlight = true;

  for (let i = 0; i < view.eligibleClasses.length; i++) {
    const classIdx = view.eligibleClasses[i]!;
    const label = creationString(view.db, CLASS_LABEL_MSG_BASE + classIdx);
    if (!label) continue;
    setCursor(w, COL, ROW_BASE + i);
    puts(w, label, i === view.cursorIdx ? ATTR_HIGHLIGHT : ATTR_ENABLED);
  }
  return w;
}
```

**Note for engineer:** The class-name msg base (`120`) is a guess based on the finding's mention of "msg base 100/120/140 for race/sex/class enum strings". If `pnpm dev:viewer` shows blank labels after wiring this up, verify against `extracted/messages/msg.json` and adjust. Hard-coding pending an explicit RE confirmation; file as a TODO if it's wrong.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/castle/compose-class-picker.ts packages/viewer/tests/pages/castle/compose-class-picker.test.ts
git commit -m "feat(castle): composeClassPicker — eligible-class single-column list"
```

---

### Task 9: `compose-profession-confirm`

**Files:**
- Create: `packages/viewer/src/pages/castle/compose-profession-confirm.ts`
- Create: `packages/viewer/tests/pages/castle/compose-profession-confirm.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { composeProfessionConfirm } from '../../../src/pages/castle/compose-profession-confirm.js';

function charAt(cells: Uint8Array, w: number, col: number, row: number): string {
  return String.fromCharCode(cells[(row * w + col) * 2] ?? 0);
}

describe('composeProfessionConfirm', () => {
  it('renders the warning text + YES / NO entries', () => {
    const w = composeProfessionConfirm({ cursorYes: false });
    let text = '';
    for (let r = 0; r < w.heightCells; r++) {
      for (let c = 0; c < w.widthCells; c++) text += charAt(w.cells, w.widthCells, c, r);
      text += '\n';
    }
    expect(text).toMatch(/CONFIRM|XP|LEVEL/i);
    expect(text).toMatch(/YES/);
    expect(text).toMatch(/NO/);
  });

  it('NO is highlighted by default (cursorYes=false)', () => {
    const w = composeProfessionConfirm({ cursorYes: false });
    // Find the NO row and confirm its attr is 0x50.
    let noRow = -1;
    let noCol = -1;
    for (let r = 0; r < w.heightCells; r++) {
      for (let c = 0; c < w.widthCells - 1; c++) {
        if (charAt(w.cells, w.widthCells, c, r) === 'N' && charAt(w.cells, w.widthCells, c + 1, r) === 'O') {
          noRow = r; noCol = c; break;
        }
      }
      if (noRow >= 0) break;
    }
    expect(noRow).toBeGreaterThanOrEqual(0);
    expect(w.cells[(noRow * w.widthCells + noCol) * 2 + 1]).toBe(0x50);
  });

  it('YES is highlighted when cursorYes=true', () => {
    const w = composeProfessionConfirm({ cursorYes: true });
    let yesRow = -1;
    let yesCol = -1;
    for (let r = 0; r < w.heightCells; r++) {
      for (let c = 0; c < w.widthCells - 2; c++) {
        if (
          charAt(w.cells, w.widthCells, c, r) === 'Y' &&
          charAt(w.cells, w.widthCells, c + 1, r) === 'E' &&
          charAt(w.cells, w.widthCells, c + 2, r) === 'S'
        ) {
          yesRow = r; yesCol = c; break;
        }
      }
      if (yesRow >= 0) break;
    }
    expect(yesRow).toBeGreaterThanOrEqual(0);
    expect(w.cells[(yesRow * w.widthCells + yesCol) * 2 + 1]).toBe(0x50);
  });
});
```

- [ ] **Step 2: Run — expect failure**

- [ ] **Step 3: Implement**

```ts
/**
 * composeProfessionConfirm — yes/no warning before applying the class-change tax.
 *
 * The engine likely shows an engine-string warning here; without a captured
 * fixture we use a port-internal English string. NO is highlighted by default
 * (destructive defaults). The reducer maps Y/Enter-on-YES to apply, anything
 * else to cancel.
 *
 * Spec: docs/superpowers/specs/2026-05-29-wpcvw-edit-submenu-design.md
 */

import { createTileWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';

const PANEL_W = 28;
const PANEL_H = 7;
const SCREEN_X = ((40 - PANEL_W) / 2) * 8;
const SCREEN_Y = ((20 - PANEL_H) / 2) * 8;
const ATTR_BG = 0x03;
const ATTR_HIGHLIGHT = 0x50;

const WARNING_LINES = [
  'CONFIRM CLASS CHANGE',
  'WIPES XP AND RESETS',
  'LEVEL TO 1.',
];

export interface ProfessionConfirmView {
  /** True → YES is highlighted; false → NO is highlighted (engine default). */
  cursorYes: boolean;
}

export function composeProfessionConfirm(view: ProfessionConfirmView): TileWindow {
  const w = createTileWindow({
    screenX: SCREEN_X,
    screenY: SCREEN_Y,
    widthCells: PANEL_W,
    heightCells: PANEL_H,
  });
  w.invertHighlight = true;

  for (let i = 0; i < WARNING_LINES.length; i++) {
    const line = WARNING_LINES[i]!;
    setCursor(w, Math.max(1, Math.floor((PANEL_W - line.length) / 2)), 1 + i);
    puts(w, line, ATTR_BG);
  }

  const yesCol = Math.floor(PANEL_W / 4) - 1;
  const noCol = Math.floor((3 * PANEL_W) / 4) - 1;
  const choicesRow = 5;
  setCursor(w, yesCol, choicesRow);
  puts(w, 'YES', view.cursorYes ? ATTR_HIGHLIGHT : ATTR_BG);
  setCursor(w, noCol, choicesRow);
  puts(w, 'NO', !view.cursorYes ? ATTR_HIGHLIGHT : ATTR_BG);

  return w;
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/castle/compose-profession-confirm.ts packages/viewer/tests/pages/castle/compose-profession-confirm.test.ts
git commit -m "feat(castle): composeProfessionConfirm — class-change Y/N modal"
```

---

### Task 10: Extend `compose-action-menu` with `includeEditFromCamp`

**Files:**
- Modify: `packages/viewer/src/pages/castle/compose-action-menu.ts`
- Modify (or create): `packages/viewer/tests/pages/castle/compose-action-menu.test.ts`

- [ ] **Step 1: Check existing tests**

```bash
ls packages/viewer/tests/pages/castle/compose-action-menu.test.ts 2>/dev/null
```

- [ ] **Step 2: Write the failing test (append to existing file or create)**

```ts
import { describe, it, expect } from 'vitest';
import { composeActionMenu } from '../../../src/pages/castle/compose-action-menu.js';
import type { MessageDb } from '@wiz6/data';

const stubDb = {
  indexedMessages: [
    { id: 301, decodedText: 'EQUIP' },
    { id: 302, decodedText: 'SPELL' },
    { id: 304, decodedText: 'ASSAY' },
    { id: 305, decodedText: 'SWAG' },
    { id: 309, decodedText: 'SKILL' },
    { id: 310, decodedText: 'EDIT' },
    { id: 312, decodedText: 'EXIT' },
  ],
} as unknown as MessageDb;

function charsAt(cells: Uint8Array, w: number, col: number, row: number, n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += String.fromCharCode(cells[(row * w + col + i) * 2] ?? 0);
  return out;
}

describe('composeActionMenu — includeEditFromCamp', () => {
  it('does NOT include EDIT by default', () => {
    const w = composeActionMenu({ cursorIdx: 0, db: stubDb });
    let bigBlob = '';
    for (let r = 0; r < w.heightCells; r++) {
      bigBlob += charsAt(w.cells, w.widthCells, 0, r, w.widthCells) + '\n';
    }
    expect(bigBlob).not.toContain('EDIT');
  });

  it('includes EDIT when includeEditFromCamp=true', () => {
    const w = composeActionMenu({ cursorIdx: 0, db: stubDb, includeEditFromCamp: true });
    let bigBlob = '';
    for (let r = 0; r < w.heightCells; r++) {
      bigBlob += charsAt(w.cells, w.widthCells, 0, r, w.widthCells) + '\n';
    }
    expect(bigBlob).toContain('EDIT');
  });
});
```

- [ ] **Step 3: Run — expect failure**

- [ ] **Step 4: Edit `compose-action-menu.ts`**

Update the `ActionMenuView` interface:
```ts
export interface ActionMenuView {
  cursorIdx: number;
  db: MessageDb;
  /** When true, EDIT (index 9) is appended to the camp-enabled set. */
  includeEditFromCamp?: boolean;
}
```

Modify the `enabledActions` and base set logic. Add `9` (EDIT) to the indices when the flag is true:
```ts
const CAMP_ENABLED_INDICES: readonly number[] = [0, 1, 3, 4, 8];
const CAMP_PLUS_EDIT_INDICES: readonly number[] = [0, 1, 3, 4, 8, 9];

function enabledActions(db: MessageDb, includeEdit: boolean): Array<{ msgId: number; label: string }> {
  const indices = includeEdit ? CAMP_PLUS_EDIT_INDICES : CAMP_ENABLED_INDICES;
  const list = indices.map((i) => {
    const msgId = ACTION_MSG_BASE + i;
    return { msgId, label: creationString(db, msgId) };
  });
  list.push({ msgId: ACTION_EXIT_MSG_ID, label: creationString(db, ACTION_EXIT_MSG_ID) });
  return list;
}
```

And update `composeActionMenu` to pass the flag:
```ts
const actions = enabledActions(view.db, view.includeEditFromCamp === true);
```

- [ ] **Step 5: Run — expect PASS**

```bash
pnpm --filter @wiz6/viewer test compose-action-menu
```

- [ ] **Step 6: Commit**

```bash
git add packages/viewer/src/pages/castle/compose-action-menu.ts packages/viewer/tests/pages/castle/compose-action-menu.test.ts
git commit -m "feat(castle): action menu opt-in EDIT entry via includeEditFromCamp"
```

---

### Task 11: Extract `character-view-reducer`

**Files:**
- Create: `packages/viewer/src/pages/castle/character-view-reducer.ts`
- Create: `packages/viewer/tests/pages/castle/character-view-reducer.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from 'vitest';
import {
  reduceCharacterView,
  type CharacterViewState,
  type CharacterViewEvent,
} from '../../../src/pages/castle/character-view-reducer.js';

const baseEnabled = { rename: true, portrait: true, profession: true };

describe('reduceCharacterView — action-menu', () => {
  it('Enter on EDIT → edit-submenu', () => {
    const state: CharacterViewState = {
      kind: 'action-menu',
      cursorIdx: 5, // EDIT
      campEntries: ['EQUIP', 'SPELL', 'ASSAY', 'SWAG', 'SKILL', 'EDIT', 'EXIT'],
    };
    const next = reduceCharacterView(state, { type: 'ENTER' }, baseEnabled);
    expect(next.kind).toBe('edit-submenu');
  });

  it('Enter on EXIT → exit-castle sentinel', () => {
    const state: CharacterViewState = {
      kind: 'action-menu',
      cursorIdx: 5,
      campEntries: ['EQUIP', 'SPELL', 'ASSAY', 'SWAG', 'SKILL', 'EXIT'],
    };
    const next = reduceCharacterView(state, { type: 'ENTER' }, baseEnabled);
    expect(next.kind).toBe('exit-castle');
  });
});

describe('reduceCharacterView — edit-submenu', () => {
  it('DOWN at cursor=1 skips REPLACE (index 3) and lands on EX (index 4)', () => {
    const state: CharacterViewState = { kind: 'edit-submenu', cursorIdx: 1 };
    const next = reduceCharacterView(state, { type: 'ARROW_DOWN' }, baseEnabled);
    // 1 → next non-disabled is 2 then 4 (REPLACE=3 skipped).
    // DOWN moves within column though; for the spec, treat as next enabled.
    expect((next as { cursorIdx: number }).cursorIdx).not.toBe(3);
  });

  it('Escape → action-menu', () => {
    const state: CharacterViewState = { kind: 'edit-submenu', cursorIdx: 0 };
    const next = reduceCharacterView(state, { type: 'ESCAPE' }, baseEnabled);
    expect(next.kind).toBe('action-menu');
  });

  it('Enter on RENAME (idx 0) → rename state with empty buffer', () => {
    const state: CharacterViewState = { kind: 'edit-submenu', cursorIdx: 0 };
    const next = reduceCharacterView(state, { type: 'ENTER' }, baseEnabled);
    expect(next.kind).toBe('rename');
    if (next.kind === 'rename') expect(next.buffer).toBe('');
  });
});

describe('reduceCharacterView — rename', () => {
  it('printable ASCII appends (cap 7)', () => {
    const state: CharacterViewState = { kind: 'rename', buffer: 'NATHA' };
    const next = reduceCharacterView(state, { type: 'TYPE', key: 'X' }, baseEnabled);
    if (next.kind === 'rename') expect(next.buffer).toBe('NATHAX');
  });

  it('Backspace pops', () => {
    const state: CharacterViewState = { kind: 'rename', buffer: 'NAT' };
    const next = reduceCharacterView(state, { type: 'BACKSPACE' }, baseEnabled);
    if (next.kind === 'rename') expect(next.buffer).toBe('NA');
  });

  it('Enter on empty buffer is a no-op', () => {
    const state: CharacterViewState = { kind: 'rename', buffer: '' };
    const next = reduceCharacterView(state, { type: 'ENTER' }, baseEnabled);
    expect(next.kind).toBe('rename');
  });

  it('Enter on non-empty buffer → commit-rename intent', () => {
    const state: CharacterViewState = { kind: 'rename', buffer: 'NEW' };
    const next = reduceCharacterView(state, { type: 'ENTER' }, baseEnabled);
    expect(next.kind).toBe('commit-rename');
    if (next.kind === 'commit-rename') expect(next.name).toBe('NEW');
  });
});

describe('reduceCharacterView — portrait', () => {
  it('Right cycles previewIdx +1 (mod 42)', () => {
    const state: CharacterViewState = { kind: 'portrait', previewIdx: 41, originalIdx: 0 };
    const next = reduceCharacterView(state, { type: 'ARROW_RIGHT' }, baseEnabled);
    if (next.kind === 'portrait') expect(next.previewIdx).toBe(0);
  });

  it('Enter unchanged → edit-submenu (no commit)', () => {
    const state: CharacterViewState = { kind: 'portrait', previewIdx: 3, originalIdx: 3 };
    const next = reduceCharacterView(state, { type: 'ENTER' }, baseEnabled);
    expect(next.kind).toBe('edit-submenu');
  });

  it('Enter changed → commit-portrait intent', () => {
    const state: CharacterViewState = { kind: 'portrait', previewIdx: 5, originalIdx: 3 };
    const next = reduceCharacterView(state, { type: 'ENTER' }, baseEnabled);
    expect(next.kind).toBe('commit-portrait');
    if (next.kind === 'commit-portrait') expect(next.portraitIndex).toBe(5);
  });
});

describe('reduceCharacterView — profession-confirm', () => {
  it('Y → commit-class-change', () => {
    const state: CharacterViewState = { kind: 'profession-confirm', newClassId: 1, cursorYes: false };
    const next = reduceCharacterView(state, { type: 'TYPE', key: 'Y' }, baseEnabled);
    expect(next.kind).toBe('commit-class-change');
  });

  it('N → profession-picker (back)', () => {
    const state: CharacterViewState = { kind: 'profession-confirm', newClassId: 1, cursorYes: true };
    const next = reduceCharacterView(state, { type: 'TYPE', key: 'N' }, baseEnabled);
    expect(next.kind).toBe('profession-picker');
  });
});
```

- [ ] **Step 2: Run — expect failure**

- [ ] **Step 3: Implement the reducer**

```ts
/**
 * Character-view local state machine. Pure reducer extracted from
 * CharacterViewPage so it can be unit-tested without React. The page
 * shell handles side effects (navigation, store writes); the reducer
 * only returns transition intents.
 *
 * The reducer emits two kinds of states: presentational (action-menu,
 * edit-submenu, rename, portrait, profession-picker, profession-confirm)
 * and intent (commit-rename, commit-portrait, commit-class-change,
 * exit-castle). The page consumes intents by performing the side effect
 * and computing the next presentational state itself.
 *
 * Spec: docs/superpowers/specs/2026-05-29-wpcvw-edit-submenu-design.md
 */

export type CharacterViewState =
  | { kind: 'action-menu'; cursorIdx: number; campEntries: ReadonlyArray<string> }
  | { kind: 'edit-submenu'; cursorIdx: number }
  | { kind: 'rename'; buffer: string }
  | { kind: 'portrait'; previewIdx: number; originalIdx: number }
  | { kind: 'profession-picker'; cursorIdx: number; eligible: ReadonlyArray<number> }
  | { kind: 'profession-confirm'; newClassId: number; cursorYes: boolean }
  | { kind: 'commit-rename'; name: string }
  | { kind: 'commit-portrait'; portraitIndex: number }
  | { kind: 'commit-class-change'; newClassId: number }
  | { kind: 'exit-castle' };

export type CharacterViewEvent =
  | { type: 'ARROW_UP' }
  | { type: 'ARROW_DOWN' }
  | { type: 'ARROW_LEFT' }
  | { type: 'ARROW_RIGHT' }
  | { type: 'ENTER' }
  | { type: 'ESCAPE' }
  | { type: 'TYPE'; key: string }
  | { type: 'BACKSPACE' };

export interface EditEnableFlags {
  rename: boolean;
  portrait: boolean;
  profession: boolean;
}

const PORTRAIT_COUNT = 42;
const NAME_MAX_LENGTH = 7;
const REPLACE_INDEX = 3;
const EX_INDEX = 4;

function isPrintableAscii(key: string): boolean {
  if (key.length !== 1) return false;
  const code = key.charCodeAt(0);
  return code >= 0x20 && code <= 0x7e;
}

function enabledSubmenuIndices(flags: EditEnableFlags): number[] {
  const out: number[] = [];
  if (flags.rename) out.push(0);
  if (flags.portrait) out.push(1);
  if (flags.profession) out.push(2);
  // REPLACE (3) is always disabled.
  out.push(EX_INDEX);
  return out;
}

function nextEnabled(idx: number, enabled: ReadonlyArray<number>, dir: 1 | -1): number {
  const i = enabled.indexOf(idx);
  const j = i < 0 ? 0 : Math.max(0, Math.min(enabled.length - 1, i + dir));
  return enabled[j] ?? idx;
}

export function reduceCharacterView(
  state: CharacterViewState,
  event: CharacterViewEvent,
  flags: EditEnableFlags,
): CharacterViewState {
  switch (state.kind) {
    case 'action-menu': {
      if (event.type === 'ESCAPE') return { kind: 'exit-castle' };
      if (event.type === 'ENTER') {
        const label = state.campEntries[state.cursorIdx];
        if (label === 'EXIT') return { kind: 'exit-castle' };
        if (label === 'EDIT') return { kind: 'edit-submenu', cursorIdx: 0 };
        return state; // other actions not wired yet
      }
      // Arrow nav over the camp entries (no wrap).
      if (event.type === 'ARROW_LEFT' && state.cursorIdx > 0) {
        return { ...state, cursorIdx: state.cursorIdx - 1 };
      }
      if (event.type === 'ARROW_RIGHT' && state.cursorIdx < state.campEntries.length - 1) {
        return { ...state, cursorIdx: state.cursorIdx + 1 };
      }
      return state;
    }
    case 'edit-submenu': {
      if (event.type === 'ESCAPE') return { kind: 'action-menu', cursorIdx: 0, campEntries: [] };
      const enabled = enabledSubmenuIndices(flags);
      if (event.type === 'ARROW_DOWN' || event.type === 'ARROW_RIGHT') {
        return { ...state, cursorIdx: nextEnabled(state.cursorIdx, enabled, 1) };
      }
      if (event.type === 'ARROW_UP' || event.type === 'ARROW_LEFT') {
        return { ...state, cursorIdx: nextEnabled(state.cursorIdx, enabled, -1) };
      }
      if (event.type === 'ENTER') {
        if (state.cursorIdx === 0) return { kind: 'rename', buffer: '' };
        if (state.cursorIdx === 1) {
          return { kind: 'portrait', previewIdx: 0, originalIdx: 0 };
        }
        if (state.cursorIdx === 2) {
          return { kind: 'profession-picker', cursorIdx: 0, eligible: [] };
        }
        if (state.cursorIdx === EX_INDEX) {
          return { kind: 'action-menu', cursorIdx: 0, campEntries: [] };
        }
        if (state.cursorIdx === REPLACE_INDEX) return state; // never reachable
      }
      return state;
    }
    case 'rename': {
      if (event.type === 'ESCAPE') return { kind: 'edit-submenu', cursorIdx: 0 };
      if (event.type === 'BACKSPACE') return { kind: 'rename', buffer: state.buffer.slice(0, -1) };
      if (event.type === 'ENTER') {
        if (state.buffer.length === 0) return state;
        return { kind: 'commit-rename', name: state.buffer.toUpperCase() };
      }
      if (event.type === 'TYPE' && isPrintableAscii(event.key) && state.buffer.length < NAME_MAX_LENGTH) {
        return { kind: 'rename', buffer: state.buffer + event.key };
      }
      return state;
    }
    case 'portrait': {
      if (event.type === 'ESCAPE') return { kind: 'edit-submenu', cursorIdx: 1 };
      if (event.type === 'ARROW_LEFT') {
        return { ...state, previewIdx: (state.previewIdx + PORTRAIT_COUNT - 1) % PORTRAIT_COUNT };
      }
      if (event.type === 'ARROW_RIGHT') {
        return { ...state, previewIdx: (state.previewIdx + 1) % PORTRAIT_COUNT };
      }
      if (event.type === 'ENTER') {
        if (state.previewIdx === state.originalIdx) return { kind: 'edit-submenu', cursorIdx: 1 };
        return { kind: 'commit-portrait', portraitIndex: state.previewIdx };
      }
      return state;
    }
    case 'profession-picker': {
      if (event.type === 'ESCAPE') return { kind: 'edit-submenu', cursorIdx: 2 };
      if (event.type === 'ARROW_DOWN' && state.cursorIdx < state.eligible.length - 1) {
        return { ...state, cursorIdx: state.cursorIdx + 1 };
      }
      if (event.type === 'ARROW_UP' && state.cursorIdx > 0) {
        return { ...state, cursorIdx: state.cursorIdx - 1 };
      }
      if (event.type === 'ENTER') {
        const newClassId = state.eligible[state.cursorIdx];
        if (newClassId === undefined) return state;
        return { kind: 'profession-confirm', newClassId, cursorYes: false };
      }
      return state;
    }
    case 'profession-confirm': {
      if (event.type === 'ESCAPE') return { kind: 'profession-picker', cursorIdx: 0, eligible: [] };
      if (event.type === 'TYPE') {
        const k = event.key.toUpperCase();
        if (k === 'Y') return { kind: 'commit-class-change', newClassId: state.newClassId };
        if (k === 'N') return { kind: 'profession-picker', cursorIdx: 0, eligible: [] };
      }
      if (event.type === 'ARROW_LEFT' || event.type === 'ARROW_RIGHT') {
        return { ...state, cursorYes: !state.cursorYes };
      }
      if (event.type === 'ENTER') {
        if (state.cursorYes) return { kind: 'commit-class-change', newClassId: state.newClassId };
        return { kind: 'profession-picker', cursorIdx: 0, eligible: [] };
      }
      return state;
    }
    default:
      return state;
  }
}
```

**Note for engineer:** The reducer returns "intent" states (`commit-rename`, `commit-portrait`, `commit-class-change`, `exit-castle`) that the page shell catches and converts into store writes + navigation. The intent states are NOT presentational — the page should immediately replace them with the next presentational state (`edit-submenu` after rename/portrait commits, `action-menu` after class-change commit, navigate(/castle) after exit-castle).

When the page transitions FROM `action-menu` INTO `edit-submenu`, OR from `edit-submenu` back, it must re-supply the freshly-computed `campEntries` / `eligible` lists (the reducer doesn't compute them — it treats them as inputs). Tests above pass empty lists in the back-transition cases because they only check `kind`.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/castle/character-view-reducer.ts packages/viewer/tests/pages/castle/character-view-reducer.test.ts
git commit -m "feat(castle): character-view-reducer pure state machine"
```

---

### Task 12: Wire reducer + sub-screens into `CharacterViewPage`

**Files:**
- Modify: `packages/viewer/src/pages/castle/CharacterViewPage.tsx`

- [ ] **Step 1: Read the current CharacterViewPage to understand the paint loop**

```bash
cat packages/viewer/src/pages/castle/CharacterViewPage.tsx
```

The current page has:
- A single static frame rendered via `composeCharacterViewFrame`.
- A keydown handler that navigates to `/castle` on Enter or Escape.
- Loads fontSet + db + portraits in a useEffect.

We extend it to:
- Hold `CharacterViewState` via `useReducer`.
- Pass keyboard events into the reducer.
- Catch intent states and perform side effects (`updateActiveMember`, navigate).
- Re-render the frame with appropriate overlays per state.

- [ ] **Step 2: Replace `CharacterViewPage.tsx` content**

```tsx
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  WIZ6_MAIN,
  applyClassChange,
  eligibleClasses,
  WichmannHill,
  type ActivePartyMember,
  type MessageDb,
  type PortraitSet,
} from '@wiz6/data';
import { renderTileWindow, type FontSet } from '@wiz6/parser';
import {
  loadMessageDb as defaultLoadMessageDb,
  loadPortraitSet as defaultLoadPortraitSet,
} from '../../data-loader.js';
import { loadCreationFontSet } from '../roster/creation/ega/assets.js';
import { patchFontSetWithPortrait } from '../roster/creation/ega/skill-train-frame.js';
import { readActiveParty, updateActiveMember } from '../../lib/active-party-store.js';
import { readHouseRules } from '../../lib/house-rules-store.js';
import { CanvasPresenter } from '../../lib/presenter.js';
import { composeCharacterViewFrame } from './compose-character-view-frame.js';
import { composeEditSubmenu } from './compose-edit-submenu.js';
import { composeRenamePrompt } from './compose-rename-prompt.js';
import { composePortraitChange } from './compose-portrait-change.js';
import { composeClassPicker } from './compose-class-picker.js';
import { composeProfessionConfirm } from './compose-profession-confirm.js';
import {
  reduceCharacterView,
  type CharacterViewState,
  type CharacterViewEvent,
} from './character-view-reducer.js';

const ENGINE_W = 320;
const ENGINE_H = 200;
const SCALE = 3;

function eventFromKey(e: KeyboardEvent): CharacterViewEvent | null {
  switch (e.key) {
    case 'ArrowUp': return { type: 'ARROW_UP' };
    case 'ArrowDown': return { type: 'ARROW_DOWN' };
    case 'ArrowLeft': return { type: 'ARROW_LEFT' };
    case 'ArrowRight': return { type: 'ARROW_RIGHT' };
    case 'Enter': return { type: 'ENTER' };
    case 'Escape': return { type: 'ESCAPE' };
    case 'Backspace': return { type: 'BACKSPACE' };
    default:
      if (e.key.length === 1) return { type: 'TYPE', key: e.key };
      return null;
  }
}

export function CharacterViewPage() {
  const navigate = useNavigate();
  const { slotIdx: slotIdxParam } = useParams<{ slotIdx: string }>();
  const slotIdx = Number(slotIdxParam);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fontSet, setFontSet] = useState<FontSet | null>(null);
  const [db, setDb] = useState<MessageDb | null>(null);
  const [portraits, setPortraits] = useState<PortraitSet[] | null>(null);

  const houseRules = useMemo(() => readHouseRules(), []);
  const includeEditFromCamp = houseRules.allowEditFromCamp;

  // Members come from the store and need to re-read when we patch.
  const [members, setMembers] = useState<ActivePartyMember[]>(() => readActiveParty().members);

  const validSlot = Number.isFinite(slotIdx) && slotIdx >= 0 && slotIdx < members.length;
  const member = validSlot ? members[slotIdx] : null;

  // Reducer
  const initialState: CharacterViewState = {
    kind: 'action-menu',
    cursorIdx: 0,
    campEntries: includeEditFromCamp
      ? ['EQUIP', 'SPELL', 'ASSAY', 'SWAG', 'SKILL', 'EDIT', 'EXIT']
      : ['EQUIP', 'SPELL', 'ASSAY', 'SWAG', 'SKILL', 'EXIT'],
  };
  const [state, setState] = useState<CharacterViewState>(initialState);

  // Bounce on invalid slot.
  useEffect(() => {
    if (!validSlot) navigate('/castle');
  }, [validSlot, navigate]);

  // Async asset loading.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [fs, m, w1, w2, w3] = await Promise.all([
          loadCreationFontSet(),
          defaultLoadMessageDb('/messages/msg.json'),
          defaultLoadPortraitSet('/portraits/wport1.json'),
          defaultLoadPortraitSet('/portraits/wport2.json'),
          defaultLoadPortraitSet('/portraits/wport3.json'),
        ]);
        if (cancelled) return;
        setFontSet(fs);
        setDb(m);
        setPortraits([w1, w2, w3]);
      } catch (err: unknown) {
        if (!cancelled) console.error('[CharacterViewPage] asset load failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Key handler. Maps DOM event → reducer event → handles intent states.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const ev = eventFromKey(e);
      if (!ev) return;
      e.preventDefault();
      const flags = { rename: true, portrait: true, profession: true };
      const next = reduceCharacterView(state, ev, flags);

      // Resolve intent states with side effects.
      if (next.kind === 'exit-castle') {
        navigate('/castle');
        return;
      }
      if (next.kind === 'commit-rename') {
        updateActiveMember(slotIdx, { name: next.name });
        setMembers(readActiveParty().members);
        setState({ kind: 'edit-submenu', cursorIdx: 0 });
        return;
      }
      if (next.kind === 'commit-portrait') {
        updateActiveMember(slotIdx, { portraitIndex: next.portraitIndex });
        setMembers(readActiveParty().members);
        setState({ kind: 'edit-submenu', cursorIdx: 1 });
        return;
      }
      if (next.kind === 'commit-class-change') {
        const m = members[slotIdx];
        if (m) {
          const rng = new WichmannHill();
          const changed = applyClassChange(rng, m, next.newClassId);
          updateActiveMember(slotIdx, changed);
          setMembers(readActiveParty().members);
        }
        setState({
          kind: 'action-menu',
          cursorIdx: 0,
          campEntries: includeEditFromCamp
            ? ['EQUIP', 'SPELL', 'ASSAY', 'SWAG', 'SKILL', 'EDIT', 'EXIT']
            : ['EQUIP', 'SPELL', 'ASSAY', 'SWAG', 'SKILL', 'EXIT'],
        });
        return;
      }

      // Presentational: rehydrate any list fields the reducer wiped on transition.
      if (next.kind === 'action-menu') {
        setState({
          ...next,
          campEntries: includeEditFromCamp
            ? ['EQUIP', 'SPELL', 'ASSAY', 'SWAG', 'SKILL', 'EDIT', 'EXIT']
            : ['EQUIP', 'SPELL', 'ASSAY', 'SWAG', 'SKILL', 'EXIT'],
        });
        return;
      }
      if (next.kind === 'profession-picker') {
        const m = members[slotIdx];
        const list = m ? eligibleClasses(m.attributes) : [];
        setState({ ...next, eligible: list });
        return;
      }
      if (next.kind === 'portrait' && state.kind === 'edit-submenu' && member) {
        // Initialize from member's current portrait.
        const cur = member.portraitIndex ?? 0;
        setState({ kind: 'portrait', previewIdx: cur, originalIdx: cur });
        return;
      }
      setState(next);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, slotIdx, members, member, navigate, includeEditFromCamp]);

  // Paint loop.
  useEffect(() => {
    if (!validSlot || !fontSet || !db || !portraits || !member) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const presenter = new CanvasPresenter(canvas);

    const fontSetWithPortrait = patchFontSetWithPortrait(
      fontSet,
      portraits,
      state.kind === 'portrait' ? state.previewIdx : (member.portraitIndex ?? 0),
    );

    const baseWindows = composeCharacterViewFrame({
      members,
      currentSlot: slotIdx,
      cursorIdx: state.kind === 'action-menu' ? state.cursorIdx : 0,
      db,
    });
    // Conditionally include EDIT in the action-menu composer — re-compose the
    // last window if we need to add EDIT.
    // (composeCharacterViewFrame internally calls composeActionMenu without
    // includeEditFromCamp today; we pass it through via a new param in a
    // future refactor. For now the action menu in the underlying frame stays
    // the camp-default subset; when in EDIT submenu we overlay on top.)

    let overlays = [];
    if (state.kind === 'edit-submenu') {
      overlays = [composeEditSubmenu({ cursorIdx: state.cursorIdx, db })];
    } else if (state.kind === 'rename') {
      overlays = [composeRenamePrompt({ buffer: state.buffer, db })];
    } else if (state.kind === 'portrait') {
      overlays = [composePortraitChange({ previewIdx: state.previewIdx, db })];
    } else if (state.kind === 'profession-picker') {
      overlays = [composeClassPicker({
        cursorIdx: state.cursorIdx,
        eligibleClasses: state.eligible,
        db,
      })];
    } else if (state.kind === 'profession-confirm') {
      overlays = [composeProfessionConfirm({ cursorYes: state.cursorYes })];
    }

    const windows = [...baseWindows, ...overlays];
    const buf = new Uint8ClampedArray(ENGINE_W * ENGINE_H * 4);
    buf.fill(0);
    for (const w of windows) {
      renderTileWindow(w, buf, ENGINE_W, ENGINE_H, fontSetWithPortrait, WIZ6_MAIN);
    }
    presenter.present(buf, ENGINE_W, ENGINE_H);
  }, [validSlot, fontSet, db, portraits, members, slotIdx, state, member]);

  if (!validSlot) return null;
  if (!fontSet || !db || !portraits) return <div>Loading…</div>;

  return (
    <main>
      <canvas
        ref={canvasRef}
        width={ENGINE_W}
        height={ENGINE_H}
        style={{
          width: ENGINE_W * SCALE,
          height: ENGINE_H * SCALE,
          imageRendering: 'pixelated',
          background: '#000',
        }}
        aria-label="Wizardry VI character view"
      />
    </main>
  );
}
```

**Note for engineer:** `readHouseRules` is referenced from `lib/house-rules-store.js`. If it doesn't exist there yet, search for the existing house-rules-store via `grep -rn 'readHouseRules\|wiz6:house-rules' packages/viewer/src/lib`. There is likely a store at `house-rules-store.ts` or it may live in a different file — locate it before writing the import.

Also: `composeCharacterViewFrame` may need a new optional `includeEditFromCamp` prop to thread through to `composeActionMenu`. If you opt to thread it cleanly, modify the call site here and the composer signature. Otherwise the EDIT entry will appear via the overlays-only path (less clean but works for the smoke test).

- [ ] **Step 3: Run TypeScript build + tests**

```bash
pnpm --filter @wiz6/viewer typecheck
pnpm --filter @wiz6/viewer test
```
Expected: green. Fix any import paths that the engineer's environment-specific naming made different.

- [ ] **Step 4: Commit**

```bash
git add packages/viewer/src/pages/castle/CharacterViewPage.tsx
git commit -m "feat(CharacterViewPage): wire EDIT submenu reducer + sub-screens

State machine drives RENAME / CHANGE PORTRAIT / CHANGE PROFESSION
flows over the existing character-view scaffold. Class-change uses
applyClassChange from @wiz6/data. Gated by allowEditFromCamp house
rule."
```

---

### Task 13: Thread `includeEditFromCamp` through `composeCharacterViewFrame`

**Files:**
- Modify: `packages/viewer/src/pages/castle/compose-character-view-frame.ts`
- Modify: `packages/viewer/src/pages/castle/CharacterViewPage.tsx`

- [ ] **Step 1: Update `compose-character-view-frame.ts`**

Add the prop to the view interface and forward to `composeActionMenu`:

```ts
export interface CharacterViewView {
  members: ReadonlyArray<ActivePartyMember>;
  currentSlot: number;
  cursorIdx: number;
  db: MessageDb;
  inventory?: ReadonlyArray<InventoryItem>;
  cc?: { current: number; max: number };
  age?: { years: number; second: number };
  /** When true, EDIT joins the camp action subset. */
  includeEditFromCamp?: boolean;
}
```

In `composeCharacterViewFrame`:
```ts
  return [
    composeMainPanel({ ... }),
    composeActionMenu({
      cursorIdx: view.cursorIdx,
      db: view.db,
      includeEditFromCamp: view.includeEditFromCamp === true,
    }),
  ];
```

- [ ] **Step 2: Update CharacterViewPage call site**

Add `includeEditFromCamp` to the `composeCharacterViewFrame(...)` call inside the paint loop.

- [ ] **Step 3: Run typecheck + tests**

```bash
pnpm --filter @wiz6/viewer typecheck && pnpm --filter @wiz6/viewer test
```
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add packages/viewer/src/pages/castle/compose-character-view-frame.ts packages/viewer/src/pages/castle/CharacterViewPage.tsx
git commit -m "feat(castle): thread includeEditFromCamp through view frame"
```

---

### Task 14: Manual browser smoke test

This is a verification gate — no code, but the engineer must DO the smoke or the feature isn't done.

- [ ] **Step 1: Start the viewer**

```bash
pnpm dev:viewer
```

- [ ] **Step 2: Verify default (engine-faithful) behavior**

In the browser:
1. Navigate to `/settings`. Confirm `allowEditFromCamp` toggle exists and is OFF.
2. Castle (`/castle`) → REVIEW MEMBER → pick a member.
3. The action menu shows EQUIP / SPELL / ASSAY / SWAG / SKILL / EXIT — **no EDIT**.
4. Press Escape → back to castle.

- [ ] **Step 3: Enable the rule + verify EDIT appears**

1. Settings → toggle `allowEditFromCamp` ON.
2. Castle → REVIEW MEMBER → pick a member.
3. Action menu now includes **EDIT**.
4. Arrow to EDIT → Enter → 5-option submenu appears (RENAME / CHANGE PORTRAIT / CHANGE PROFESSION / REPLACE (dim) / EX).

- [ ] **Step 4: Exercise RENAME**

1. Enter on RENAME → prompt appears.
2. Type a new name (e.g., "GRAB"), Enter. Back to submenu.
3. Escape → back to action menu. Character sheet shows new name.

- [ ] **Step 5: Exercise CHANGE PORTRAIT**

1. Submenu → CHANGE PORTRAIT → sub-window appears.
2. ◄/► cycle. Enter on a different portrait. Back to submenu.
3. Escape → character sheet shows new portrait.

- [ ] **Step 6: Exercise CHANGE PROFESSION (and the tax)**

1. Submenu → CHANGE PROFESSION → picker shows eligible classes.
2. Pick a class ‘different from the current. Enter → confirm modal.
3. Y or Enter-on-YES → apply. Back to action menu.
4. Character sheet now shows: new class, level 1, 0 XP. Equipment slots empty.

- [ ] **Step 7: Toggle rule OFF, confirm EDIT disappears**

1. Settings → toggle OFF.
2. Castle → REVIEW MEMBER → EDIT is gone.

- [ ] **Step 8: Document in the commit log**

```bash
git commit --allow-empty -m "chore(smoke): WPCVW EDIT submenu manually verified

RENAME / CHANGE PORTRAIT / CHANGE PROFESSION all functional behind
allowEditFromCamp house rule. Class-change tax confirmed (level→1,
XP→0, equipment cleared)."
```

---

### Task 15: TODO maintenance

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Open TODO.md and find next free ID**

```bash
grep -n 'Next free ID' TODO.md
```

It currently reads `Next free ID: **#055**`.

- [ ] **Step 2: Remove #040 (now done) and add follow-ups #055/#056/#057**

In `TODO.md`:

(a) Delete the entire `- #040 [open] — Port WPCVW EDIT submenu...` block (and its 4 sub-bullets).

(b) Update `Next free ID: **#055**` → `Next free ID: **#058**`.

(c) Insert three new entries under `## Open` (anywhere in the existing list, but near other wpcvw items is natural):

```markdown
- #055 [blocked] — Capture WPCVW EDIT screen engine fixtures + add pixel-parity tests
  - Blocked on either dungeon traversal (state-0x11 reachable with `*0x4fce==5`) or MCP dynamic-driving capability (#017 v2) that lets us poke the context byte and capture saves at EDIT submenu / RENAME prompt / PORTRAIT change / CLASS picker.
  - Promote composer cell-grid assertions to pixel-parity gates once fixtures land.
  - Verify the REPLACE disabled-attr (currently 0x07 by analogy) against the engine.

- #056 [open] — Active-party ↔ roster sync on edits + dismiss
  - When an active member is renamed / has their portrait or class changed via the WPCVW EDIT submenu, the linked roster character is NOT updated. On dismiss, edits are lost.
  - Mirror the engine's PCFILE writeback: on `dismissMember`, copy the active member's name/portraitIndex/class/level/xp/savedOldLevel back to the roster character (looked up via `rosterCharacterId`).

- #057 [open] — Verify REPLACE disabled-entry attr in WPCVW EDIT submenu
  - `compose-edit-submenu.ts` uses attr 0x07 (dimmed gray) for the REPLACE row by analogy. Confirm against a captured engine fixture (depends on #055).
```

- [ ] **Step 3: Commit**

```bash
git add TODO.md
git commit -m "chore: close #040, open #055/#056/#057 (WPCVW EDIT follow-ups)"
```

---

## Self-review

Run the plan-vs-spec coverage check before handoff. Each spec section should map to at least one task.

| Spec section | Task(s) |
|---|---|
| House Rule `allowEditFromCamp` | Task 1 |
| `applyClassChange` pure fn | Tasks 2, 3 |
| `updateActiveMember` helper | Task 4 |
| `composeEditSubmenu` | Task 5 |
| `composeRenamePrompt` | Task 6 |
| `composePortraitChange` | Task 7 |
| `composeClassPicker` | Task 8 |
| `composeProfessionConfirm` | Task 9 |
| Extend `composeActionMenu` | Task 10 |
| `reduceCharacterView` state machine | Task 11 |
| Wire reducer + side effects in `CharacterViewPage` | Task 12 |
| Thread `includeEditFromCamp` through frame | Task 13 |
| Manual browser smoke | Task 14 |
| TODO follow-ups (#055/#056/#057), close #040 | Task 15 |

All spec items mapped. Risk items (class-change side effects unverified, class-name msg base, REPLACE disabled-attr, profession-confirm copy) are documented as engineer-notes within the appropriate tasks; the engineer should not break on these but should file deviations against the relevant TODO.
