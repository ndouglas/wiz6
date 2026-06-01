# WPCVW EQUIP Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the engine's EQUIP action — the faithful re-equip-from-scratch wizard reached from the camp character view — as a pure logic layer (Stage A, unit-gated) plus the wizard UI (Stage B, pixel/e2e-gated).

**Architecture:** Stage A: a pure `@wiz6/data` module (`equipment/equip-logic.ts`) implementing the engine's equip_slot→body_slot map, bitmask eligibility, candidate collection, AC recompute, and `applyEquipSelections` — gated entirely by deterministic unit tests (NO driving). Stage B: a `@wiz6/viewer` wizard reducer sub-state + per-slot candidate-row composer + `CharacterViewPage` wiring, gated by pixel parity + e2e (fixtures need DOSBox driving / the user's Accessibility terminal).

**Tech Stack:** TypeScript ESM (`.js` import extensions), Zod schemas (`@wiz6/data`), React + react-router (viewer), vitest, Playwright, DOSBox-X MCP.

**RE basis (read both):** `docs/re/findings/wpcvw-equip-action.json`, `docs/re/findings/wpcvw-equip-internals.json`. Spec: `docs/superpowers/specs/2026-06-01-wpcvw-equip-design.md`. All on branch `wpcvw-equip`.

**Key RE facts (exact):**
- **Body-slot map** (item `equipSlot` → body slot; body0=weapon,1=off-hand/shield,2=cloak,3=head,4=chest,5=legs,6=hands,7=feet): equipSlot `0,1,2,3,0xc,0x10`→body0 (or body1 if filling slot 1 AND item flag 0x04); `4`→1; `5`→2; `6`→3; `7`→4; `8`→5; `9`→6; `0xa`→7; `0xb`→1; `0xd,0xe,0xf`→body1 only if flag 0x04; `≥0x11`→not equippable.
- **Eligibility:** `bitTest(mask, value) = (mask[value>>3] & (1<<(value&7))) !== 0`. Item is offered iff `bitTest(classMask, member.class) && bitTest(raceMask, member.race) && bitTest(sexMask, member.sex)`, where the masks are **scenario item record bytes 54-55 (classMask u16), 56 (raceMask), 58 (sexMask)** = `scenarioDb.items[itemId].bytes[54/56/58]`. Flag 0x40 is NOT used in equip.
- **AC** (`FUN_884f`, lower=better): base 10; −1 if SPD≥16, −1 more if SPD≥18; −2 if race==5; monk/ninja (class 0xc/0xd) −(min(floor(level/2),20) + floor(skill/10)). Per equipped item, subtract its **AC bonus = scenario byte 0x46** from the slot's AC. **Anchor:** THESUS (fighter, SPD 9, race 0, nothing equipped) → `derivedAc 10`, `bodyAc [0,0,10,10,10,10,10]`.
- **Equip write:** `equipment[bodySlot] = invIndex`; item flag bit0 (0x01) set = equipped (Phase-1 cleared it on all). Genuine curse = bit1 (0x02), preserved by Phase-1.
- **Phase-3 grants** (item byte 0x44 grant code): codes 1..8 bump attribute (code−1) capped 0x14; 9/10 raise resist bytes to floor 4; 11 cure-all; 12 −365 XP; 13 +rng(d6+2) HP. (MEDIUM — stock fighter gear triggers none.)
- **equipSlot source:** `member.inventory[i].equipSlot` (cached = scenario byte 60); itemId from `inventory[i].itemId`; flags from `inventory[i].flags`.

> **NOTE on the equipSlot enum:** `character.ts:42`'s comment lists `3=ranged`, but the verified jump table has `4=ranged` (3 maps to body0/weapon). Trust the jump table (this plan); update that comment in Task 11.

---

## File structure

| File | Responsibility | Stage |
|---|---|---|
| `packages/data/src/equipment/equip-logic.ts` | NEW pure: body-slot map, eligibility, candidates, computeAc, applyEquipSelections | A |
| `packages/data/tests/equipment/equip-logic.test.ts` | unit tests (THESUS + real scenarioDb) | A |
| `packages/data/src/index.ts` | export the equip-logic API | A |
| `packages/viewer/src/pages/castle/equip-wizard-reducer.ts` | NEW pure: `nextEquipCursor`, `advanceEquipSlot`, the wizard transition | B |
| `packages/viewer/tests/pages/castle/equip-wizard-reducer.test.ts` | reducer unit tests | B |
| `packages/viewer/src/pages/castle/compose-equip-picker.ts` | NEW per-slot candidate-row composer | B |
| `packages/viewer/src/pages/castle/character-view-reducer.ts` | EQUIP enters the wizard (was no-op) | B |
| `packages/viewer/src/pages/castle/CharacterViewPage.tsx` | wizard wiring + commit (applyEquipSelections + persist) | B |
| `tools/dosbox/state-catalog.ts` | recipe to reach the EQUIP slot-0 picker | B |
| `tools/parity/fixtures/engine/equip-slot0.{idx.gz,png}` | engine fixture | B (capture) |
| `tools/parity/screen-parity.test.ts` (or new file) | EQUIP pixel-parity case | B |
| `packages/viewer/e2e/review-member-flow.spec.ts` | EQUIP wizard e2e | B |
| `TODO.md` | live-verify TODOs + House Rules idea | B |

---

# STAGE A — pure equip logic (`@wiz6/data`, no driving)

## Task 1: body-slot map + bitmask eligibility

**Files:** Create `packages/data/src/equipment/equip-logic.ts`; Test `packages/data/tests/equipment/equip-logic.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, it, expect } from 'vitest';
import { bodySlotForItem, bitTest, itemEligible } from '../../src/equipment/equip-logic.js';
import type { Character } from '../../src/index.js';

describe('bitTest', () => {
  it('tests bit (value&7) of byte (value>>3) of the mask', () => {
    expect(bitTest([0b0000_0001, 0], 0)).toBe(true);   // class 0 → byte0 bit0
    expect(bitTest([0b0000_0001, 0], 1)).toBe(false);
    expect(bitTest([0, 0b0000_0100], 10)).toBe(true);  // value 10 → byte1 (10>>3=1) bit2 (10&7=2)
  });
});

describe('bodySlotForItem', () => {
  // fillingSlot + flag 0x04 affect weapon/off-hand routing.
  it('weapon equipSlots 0,1,2,3,0xc,0x10 → body0 (weapon)', () => {
    for (const s of [0, 1, 2, 3, 0xc, 0x10]) expect(bodySlotForItem(s, 0, 0)).toBe(0);
  });
  it('armor equipSlots map fixed: 5→2,6→3,7→4,8→5,9→6,0xa→7, shield 0xb→1, ranged 4→1', () => {
    expect(bodySlotForItem(4, 1, 0)).toBe(1);
    expect(bodySlotForItem(5, 2, 0)).toBe(2);
    expect(bodySlotForItem(6, 3, 0)).toBe(3);
    expect(bodySlotForItem(7, 4, 0)).toBe(4);
    expect(bodySlotForItem(8, 5, 0)).toBe(5);
    expect(bodySlotForItem(9, 6, 0)).toBe(6);
    expect(bodySlotForItem(0xa, 7, 0)).toBe(7);
    expect(bodySlotForItem(0xb, 1, 0)).toBe(1);
  });
  it('a dual-wieldable weapon (flag 0x04) can go to body1 when filling slot 1', () => {
    expect(bodySlotForItem(0, 1, 0x04)).toBe(1);
    expect(bodySlotForItem(0, 1, 0)).toBe(0); // non-dual-wield weapon: stays body0
  });
  it('non-equippable equipSlots (>=0x11) → null', () => {
    expect(bodySlotForItem(0x11, 0, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, confirm FAIL.** `pnpm --filter @wiz6/data exec vitest run equip-logic`

- [ ] **Step 3: Implement the module head + these functions.**

```ts
/**
 * WPCVW EQUIP logic — engine-faithful re-equip computations, pure (no I/O/DOM).
 * RE: docs/re/findings/wpcvw-equip-action.json + wpcvw-equip-internals.json.
 *
 * Body slots: 0=weapon, 1=off-hand/shield, 2=cloak, 3=head, 4=chest, 5=legs,
 * 6=hands, 7=feet. Item equipSlot is member.inventory[i].equipSlot (cached
 * scenario byte 60). AC is lower=better.
 */
import type { Character } from '../schemas/character.js';
import type { ScenarioDb } from '../schemas/scenario-db.js';

export const BODY_SLOT_COUNT = 8;
const ITEM_FLAG_DUAL_WIELD = 0x04;

/** value/8 selects the mask byte, value%8 the bit. */
export function bitTest(mask: ReadonlyArray<number>, value: number): boolean {
  return ((mask[value >> 3] ?? 0) & (1 << (value & 7))) !== 0;
}

/** Map an item's equipSlot to its target body slot in the context of the slot
 *  currently being filled (fillingSlot) + the item flags. Returns null if the
 *  item can't go in `fillingSlot`. (Mirrors FUN_835e's jump table at file 0x844a.) */
export function bodySlotForItem(equipSlot: number, fillingSlot: number, flags: number): number | null {
  const dual = (flags & ITEM_FLAG_DUAL_WIELD) !== 0;
  // Weapon-family equipSlots → body0, or body1 when dual-wielding into the off-hand.
  if ([0, 1, 2, 3, 0xc, 0x10].includes(equipSlot)) {
    if (fillingSlot === 1) return dual ? 1 : null;
    return 0;
  }
  switch (equipSlot) {
    case 4: return 1;   // ranged → off-hand
    case 5: return 2;   // cloak
    case 6: return 3;   // head
    case 7: return 4;   // chest
    case 8: return 5;   // legs
    case 9: return 6;   // hands
    case 0xa: return 7;  // feet
    case 0xb: return 1;  // shield → off-hand
    case 0xd: case 0xe: case 0xf: return dual ? 1 : null; // only if dual-wieldable
    default: return null; // >=0x11 (scroll/consumable) or unknown
  }
}

/** classMask = scenario bytes 54-55 (u16), raceMask = byte 56, sexMask = byte 58. */
export function itemEligible(member: Pick<Character, 'class' | 'race' | 'sex'>, itemBytes: ReadonlyArray<number>): boolean {
  const classMask = [itemBytes[54] ?? 0, itemBytes[55] ?? 0];
  const raceMask = [itemBytes[56] ?? 0, itemBytes[57] ?? 0];
  const sexMask = [itemBytes[58] ?? 0, itemBytes[59] ?? 0];
  return bitTest(classMask, member.class) && bitTest(raceMask, member.race) && bitTest(sexMask, member.sex);
}
```

> NOTE: `bodySlotForItem`'s weapon-in-slot-1 rule and the `0xd-0xf` dual-wield rule are HIGH-confidence from the jump-table decode; if a later candidate test disagrees with the engine fixture, re-check the finding's stub details.

- [ ] **Step 4: Run it, confirm PASS.** Then `pnpm --filter @wiz6/data exec tsc --noEmit` (clean).
- [ ] **Step 5: Commit.** `git add packages/data/src/equipment/equip-logic.ts packages/data/tests/equipment/equip-logic.test.ts && git commit -m "feat(data): equip body-slot map + bitmask eligibility"`

## Task 2: candidate collection

**Files:** Modify `equip-logic.ts`; Test same file.

- [ ] **Step 1: Failing test** (append). `equipCandidates(member, bodySlot, scenarioDb, priorSelections)` returns inventory indices eligible for `bodySlot`, excluding already-selected indices, applying 2H/shield exclusivity.

```ts
import { equipCandidates } from '../../src/equipment/equip-logic.js';
// THESUS: items at inv 0..4 = itemIds 8(LONGSWORD,equipSlot0),135(LEATHER CUIRASS,7),
// 132(FUR LEGGING,8),130(SANDALS,0xa),141(BUCKLER SHIELD,0xb).
it('collects the weapon for body slot 0 and the shield for body slot 1', () => {
  const m = thesus(); const db = realScenarioDb();
  expect(equipCandidates(m, 0, db, emptySelections())).toContain(0); // LONGSWORD inv idx 0
  expect(equipCandidates(m, 4, db, emptySelections())).toContain(1); // LEATHER CUIRASS → chest
  expect(equipCandidates(m, 1, db, emptySelections())).toContain(4); // BUCKLER SHIELD → off-hand
});
it('excludes indices already selected in a prior slot', () => {
  const m = thesus(); const db = realScenarioDb();
  const sel = emptySelections(); sel[0] = 0; // LONGSWORD chosen for weapon
  expect(equipCandidates(m, 1, db, sel)).not.toContain(0);
});
```
(Provide `thesus()`, `realScenarioDb()` (parse `extracted/scenario/scenario.json` via `ScenarioDbSchema`), `emptySelections()` = `Array(8).fill(null)` helpers at the top of the test.)

- [ ] **Step 2: Run, confirm FAIL.**
- [ ] **Step 3: Implement.**

```ts
const ITEM_FLAG_TWO_HANDED = 0x08;

export function equipCandidates(
  member: Character,
  bodySlot: number,
  scenarioDb: ScenarioDb,
  priorSelections: ReadonlyArray<number | null>,
): number[] {
  const inv = member.inventory ?? [];
  const selected = new Set(priorSelections.filter((x): x is number => x != null));
  // 2H weapon chosen for body0 removes the off-hand slot entirely.
  if (bodySlot === 1) {
    const weaponIdx = priorSelections[0];
    if (weaponIdx != null) {
      const w = inv[weaponIdx];
      const wBytes = w ? scenarioDb.items[w.itemId]?.bytes ?? [] : [];
      if (w && (((w.flags & ITEM_FLAG_TWO_HANDED) !== 0) || isTwoHandWeaponType(wBytes))) return [];
    }
  }
  const out: number[] = [];
  for (let i = 0; i < inv.length; i++) {
    const slot = inv[i]!;
    if (slot.itemId <= 0 || selected.has(i)) continue;
    if (bodySlotForItem(slot.equipSlot, bodySlot, slot.flags) !== bodySlot) continue;
    const bytes = scenarioDb.items[slot.itemId]?.bytes ?? [];
    if (!itemEligible(member, bytes)) continue;
    out.push(i);
  }
  return out;
}

/** Off-hand exclusion: a main weapon whose type byte (scenario byte 0x2d in the
 *  loaded record) is in this set occupies both hands. RE set: {0xb,0x16,0xd,0x17,0xc,0x53}. */
const TWO_HAND_WEAPON_TYPES = new Set([0xb, 0x16, 0xd, 0x17, 0xc, 0x53]);
function isTwoHandWeaponType(itemBytes: ReadonlyArray<number>): boolean {
  return TWO_HAND_WEAPON_TYPES.has(itemBytes[0x2d] ?? -1);
}
```

> The weapon type byte offset (0x2d here) is from the RE's `+0x442d` ↔ inventory cache; if the unit test for shield exclusivity doesn't match, verify the offset against the finding (it's the loaded-record weapon-type byte) — flag for RE-confirm.

- [ ] **Step 4: Run PASS + tsc clean. Step 5: Commit** `feat(data): equip candidate collection + 2H/shield exclusivity`.

## Task 3: AC recompute (`computeAc`)

**Files:** Modify `equip-logic.ts`; Test same.

- [ ] **Step 1: Failing test** — anchored to THESUS's KNOWN engine values.

```ts
import { computeAc } from '../../src/equipment/equip-logic.js';
it('THESUS unequipped → derivedAc 10, bodyAc [0,0,10,10,10,10,10]', () => {
  const m = thesus(); // SPD 9, race 0, class 0 (fighter), nothing equipped
  expect(computeAc(m, realScenarioDb())).toEqual({ derivedAc: 10, bodyAc: [0, 0, 10, 10, 10, 10, 10] });
});
it('equipping LEATHER CUIRASS (chest=body4) lowers that slot AC by its byte-0x46 bonus', () => {
  const m = thesus(); m.equipment = [255,255,255,255, 1, 255,255,255]; // inv idx1 in body4
  const cuirassAc = realScenarioDb().items[135]!.bytes[0x46]!;
  const { bodyAc } = computeAc(m, realScenarioDb());
  // body4 maps to the bodyAc index used for armor slots 2..7 (verify mapping vs THESUS anchor).
  expect(bodyAc[/* armor index for body4 */ 4]).toBe(10 - cuirassAc);
});
```

- [ ] **Step 2: Run, confirm FAIL.**
- [ ] **Step 3: Implement `computeAc`** to reproduce the engine. Base AC + modifiers per `FUN_884f`; fill `bodyAc` (weapon slots default 0, armor slots default base AC — matching THESUS's `[0,0,10,10,10,10,10]`); subtract each equipped item's byte-0x46 AC from its slot. **The exact bodyAc index↔body-slot mapping is pinned by the THESUS anchor — iterate `computeAc` until `[0,0,10,10,10,10,10]` reproduces, then the per-item subtraction follows the same indexing.**

```ts
export interface AcResult { derivedAc: number; bodyAc: number[] }

export function computeBaseAc(member: Character): number {
  let ac = 10;
  const spd = member.attributes.spd;
  if (spd >= 16) ac -= 1;
  if (spd >= 18) ac -= 1;
  if (member.race === 5) ac -= 2;
  if (member.class === 0xc || member.class === 0xd) {
    const lvl = Math.min(Math.floor(member.level / 2), 20);
    const skill = Math.floor((member.skills[/* martial-arts skill idx — verify */ 0] ?? 0) / 10);
    ac -= lvl + skill;
  }
  return ac;
}

export function computeAc(member: Character, scenarioDb: ScenarioDb): AcResult {
  const base = computeBaseAc(member);
  // Reproduce THESUS-unequipped [0,0,10,10,10,10,10]: weapon slots (bodyAc 0,1) start 0,
  // armor slots start at base. (Confirm indexing against the anchor test.)
  const bodyAc = [0, 0, base, base, base, base, base];
  const equip = member.equipment ?? [];
  const inv = member.inventory ?? [];
  for (let bodySlot = 0; bodySlot < BODY_SLOT_COUNT; bodySlot++) {
    const invIdx = equip[bodySlot];
    if (invIdx === undefined || invIdx === 0xff) continue;
    const item = inv[invIdx];
    if (!item || item.itemId <= 0) continue;
    const acBonus = scenarioDb.items[item.itemId]?.bytes[0x46] ?? 0;
    const acIdx = bodySlot <= 1 ? 0 : bodySlot - 1; // weapons → bodyAc[0]; armor body2..7 → bodyAc[1..6]
    bodyAc[acIdx] = (bodyAc[acIdx] ?? base) - acBonus;
  }
  return { derivedAc: base, bodyAc };
}
```

> **MEDIUM-confidence (flag prominently):** the `acIdx` mapping (weapons→bodyAc[0], armor body2..7→bodyAc[1..6]) and the weapon-slot default 0 are inferred to match THESUS's `[0,0,10,10,10,10,10]`. The anchor test is the gate — if it can't be made to pass, the bodyAc layout differs from this assumption; re-derive from `FUN_884f`/the struct dump and, if still unclear, capture a second engine character (with armor equipped) to pin it (DOSBox). The martial-arts skill index for monk/ninja is unverified (fighter THESUS doesn't exercise it).

- [ ] **Step 4: Run + iterate to PASS** (adjust `acIdx`/defaults until the THESUS anchor reproduces). tsc clean. **Step 5: Commit** `feat(data): equip AC recompute (computeAc) anchored to THESUS`.

## Task 4: `applyEquipSelections`

**Files:** Modify `equip-logic.ts`; Test same.

- [ ] **Step 1: Failing test.**

```ts
import { applyEquipSelections } from '../../src/equipment/equip-logic.js';
it('Phase-1 resets then applies selections: equipment array, equipped bit0, AC', () => {
  const m = thesus(); const db = realScenarioDb();
  const sel = [0, 4, null, null, 1, 2, null, 3]; // weapon, shield, chest, legs, feet (per slot)
  const out = applyEquipSelections(m, sel, db);
  expect(out.equipment).toEqual([0, 4, 255, 255, 1, 2, 255, 3]);
  expect(out.inventory![0]!.flags & 0x01).toBe(1);          // LONGSWORD equipped bit set
  expect(out.inventory![/* an unselected item */ 3]!.flags & 0x01).toBe(0); // not equipped
});
it('preserves a genuine curse (bit1) through Phase-1 reset', () => {
  const m = thesus(); m.inventory![0]!.flags |= 0x02;       // cursed LONGSWORD
  const out = applyEquipSelections(m, Array(8).fill(null), db);
  expect(out.inventory![0]!.flags & 0x02).toBe(0x02);       // bit1 preserved
  expect(out.inventory![0]!.flags & 0x01).toBe(0);          // bit0 cleared (not equipped)
});
```

- [ ] **Step 2: Run, confirm FAIL.**
- [ ] **Step 3: Implement** — immutable: clone the member, Phase-1 reset (`equipment=[255×8]`, every item `flags &= 0xFE`), then for each non-null selection set `equipment[bodySlot]=invIdx` + `flags |= 1`, then recompute AC via `computeAc`, then apply Phase-3 grants (item byte 0x44 code) per the finding's table. Return the new member.

```ts
export function applyEquipSelections(
  member: Character, selections: ReadonlyArray<number | null>, scenarioDb: ScenarioDb,
): Character {
  const m: Character = structuredClone(member);
  const inv = m.inventory ?? [];
  m.equipment = Array(BODY_SLOT_COUNT).fill(0xff);
  for (const item of inv) item.flags &= 0xfe;           // Phase-1: clear equipped bit0 (keep bit1 curse)
  for (let bodySlot = 0; bodySlot < BODY_SLOT_COUNT; bodySlot++) {
    const invIdx = selections[bodySlot];
    if (invIdx == null) continue;
    m.equipment[bodySlot] = invIdx;
    const it = inv[invIdx];
    if (it) it.flags |= 0x01;                             // equipped (== bit0)
  }
  const ac = computeAc(m, scenarioDb);
  m.derivedAc = ac.derivedAc;
  m.bodyAc = ac.bodyAc;
  applyPhase3Grants(m, selections, scenarioDb);           // MEDIUM — see below
  return m;
}
```
Implement `applyPhase3Grants` per the finding (codes 1..8 → `attributes` bump cap 0x14; 9/10 → resist floor 4; 11 → cure conditions; 12 → −365 xp; 13 → +rng(d6+2) hp). **Stock fighter gear has grant code 0 (no-op), so the gates won't exercise it — implement per RE, mark MEDIUM, accept it's unverified.** Use a passed-in `rng` only for code 13 (default to a no-op/0 if not provided, since stock gear never triggers it).

- [ ] **Step 4: Run PASS + tsc clean. Step 5: Commit** `feat(data): applyEquipSelections (reset + commit + AC + Phase-3)`.

## Task 5: export the API

**Files:** Modify `packages/data/src/index.ts`

- [ ] **Step 1:** Add `export { bitTest, bodySlotForItem, itemEligible, equipCandidates, computeAc, computeBaseAc, applyEquipSelections, BODY_SLOT_COUNT, type AcResult } from './equipment/equip-logic.js';`
- [ ] **Step 2:** `pnpm --filter @wiz6/data exec tsc --noEmit && pnpm --filter @wiz6/data exec vitest run` — green.
- [ ] **Step 3: Commit** `feat(data): export equip-logic API`.

---

# STAGE B — wizard UI (`@wiz6/viewer`, pixel/e2e-gated)

## Task 6: equip-wizard reducer

**Files:** Create `packages/viewer/src/pages/castle/equip-wizard-reducer.ts`; Test `packages/viewer/tests/pages/castle/equip-wizard-reducer.test.ts`

Pure nav over the per-slot candidate row. State: `{ slot: number; selections: (number|null)[]; cursor: number }` where `cursor` indexes `[...candidates, SKIP]` (SKIP = candidates.length, representing the empty/−1 position).

- [ ] **Step 1: Failing test.**

```ts
import { nextEquipCursor, nextPopulatedSlot } from '../../../src/pages/castle/equip-wizard-reducer.js';
describe('nextEquipCursor (over candidates + skip)', () => {
  it('Right/Left clamp within [0, candidateCount] (skip is the last index)', () => {
    expect(nextEquipCursor(0, 'ArrowRight', 2)).toBe(1);
    expect(nextEquipCursor(2, 'ArrowRight', 2)).toBe(2); // at skip, clamp
    expect(nextEquipCursor(0, 'ArrowLeft', 2)).toBe(0);
  });
});
describe('nextPopulatedSlot', () => {
  it('returns the next body slot (from start, exclusive) that has candidates, else null', () => {
    const hasCands = (s: number) => s === 0 || s === 4; // weapon + chest only
    expect(nextPopulatedSlot(0, hasCands)).toBe(4);
    expect(nextPopulatedSlot(4, hasCands)).toBeNull();
  });
});
```

- [ ] **Step 2: Run FAIL. Step 3: Implement** `nextEquipCursor(cursor, key, candidateCount)` (Left/Right clamp over `[0, candidateCount]`; `candidateCount` index = SKIP) and `nextPopulatedSlot(fromExclusive, hasCandidates)` (scan `from+1..7`). Both pure.
- [ ] **Step 4: Run PASS. Step 5: Commit** `feat(castle): equip-wizard cursor + slot-advance reducer`.

## Task 7: per-slot candidate-row composer

**Files:** Create `packages/viewer/src/pages/castle/compose-equip-picker.ts`

- [ ] **Step 1: Failing cell-grid test** (model on `compose-party-member-picker-frame.test.ts`): given a slot title + candidate names + cursor, the composer renders the horizontal row in the main-panel region with the cursored candidate highlighted (inverse, `invertHighlight`). Assert candidate placement + highlight attr 0x50 on the cursored one. (Exact columns are pinned by the Task 9 fixture; start from the RE's draw site — candidate labels via the highlight renderer at row `candidate+9`/col 0x16 per `FUN_8dcd`.)
- [ ] **Step 2: Run FAIL. Step 3: Implement** `composeEquipPicker(view)` returning the overlay TileWindow(s) — a horizontal candidate row + slot title, `invertHighlight = true`, modeled on the existing castle composers (`compose-main-panel.ts` geometry + `compose-party-member-picker-frame.ts` highlight pattern). **Step 4: PASS. Step 5: Commit** `feat(castle): equip-picker candidate-row composer`.

## Task 8: wire EQUIP into CharacterViewPage + reducer

**Files:** Modify `character-view-reducer.ts`, `CharacterViewPage.tsx`

- [ ] **Step 1:** In `character-view-reducer.ts` `action-menu` ENTER (currently `if (label === 'EQUIP') return state` via the no-op fallthrough at line ~98), return an `equip-wizard` intent state. Add `equip-wizard` to `CharacterViewState`. The reducer transitions slot/cursor/selections per `nextEquipCursor`/`nextPopulatedSlot`; on Enter at a slot it records `selections[slot]` and advances via `nextPopulatedSlot` (handling 2H consuming body1); after the last populated slot it emits `{ kind: 'commit-equip', selections }`; ESC → back to `action-menu` (cursor on EXIT), NO persist.
- [ ] **Step 2:** In `CharacterViewPage.tsx`: when state is `equip-wizard`, compute `candidates = equipCandidates(member, slot, scenarioDb, selections)` and overlay `composeEquipPicker(...)` on the char sheet. On `commit-equip`: `const updated = applyEquipSelections(member, selections, scenarioDb); updateActiveMember(slotIdx, updated);` then return to the action menu (cursor EXIT). The char-sheet AC + inventory equipped-markers re-render via the existing composer (reads `member.bodyAc` / inventory).
- [ ] **Step 3:** `pnpm --filter @wiz6/viewer exec tsc --noEmit` clean; `pnpm --filter @wiz6/viewer exec vitest run character-view equip-wizard` green.
- [ ] **Step 4: Commit** `feat(castle): EQUIP runs the re-equip wizard + persists`.

## Task 9: capture the EQUIP fixture (ORCHESTRATOR / USER-RUN — needs driving)

**Files:** `tools/dosbox/state-catalog.ts`, `tools/parity/fixtures/engine/equip-slot0.{idx.gz,png}`

> **Run by the orchestrator via MCP if driving works, else by the user from an Accessibility-granted terminal** (MCP screenshots/save were flaky this session). The slot-9 save (THESUS character view) already exists.

- [ ] **Step 1:** Add a recipe reaching the EQUIP slot-0 picker: from slot 9 (THESUS view, cursor EXIT) → navigate to EQUIP (`left left left` from EXIT) → `enter` (Phase-1 runs, slot-0 weapon picker appears). Add to `state-catalog.ts` (document the macro).
- [ ] **Step 2:** Drive it (MCP `send_input` + `save_state`, OR `build-saves` from the user's terminal) → save to a slot → `gen-fixture.ts --save N --name equip-slot0`. Eyeball the PNG (the weapon candidate row with LONGSWORD).
- [ ] **Step 3: Commit** the `.idx.gz`/`.png`: `test(parity): capture EQUIP slot-0 candidate-picker fixture`.

## Task 10: EQUIP pixel-parity + e2e + save round-trip

**Files:** `tools/parity/screen-parity.test.ts` (or new `wpcvw-equip-parity.test.ts`), `packages/viewer/e2e/review-member-flow.spec.ts`, a data round-trip test

- [ ] **Step 1: Pixel-parity** case `equip-slot0`: compose the THESUS char sheet + `composeEquipPicker` (slot 0, the eligible weapon candidates, cursor on LONGSWORD) and assert tolerance-0 vs the fixture. Iterate the composer (Task 7) to 0-diff.
- [ ] **Step 2: e2e:** inject the 3-member party, drive REVIEW MEMBER → THESUS → EQUIP → step into slot 0, assert the canvas vs `equip-slot0`, complete the wizard, and assert `readActiveParty().members[0].equipment` reflects the picks.
- [ ] **Step 3: Save round-trip** (data test): equip an item via `applyEquipSelections`, serialize the member through the active-party store schema, reload, and assert bit0=equipped persists and a separately-set bit1 curse survives.
- [ ] **Step 4:** Run all; iterate to green (do NOT relax tolerance). **Step 5: Commit** `test(equip): pixel-parity + e2e + bit0 save round-trip`.

## Task 11: docs / TODO

**Files:** `TODO.md`, `packages/data/src/schemas/character.ts` (comment fix)

- [ ] **Step 1:** Fix the `equipSlot` enum comment at `character.ts:42` (`3=ranged` → the jump-table truth: 0-3,0xc,0x10=weapon; 4=ranged; …). Add TODOs: live-verify the bit0 equipped/cursed round-trip + the Phase-3 grant magnitudes (unexercised by stock gear); the monk/ninja AC martial-arts skill index; surface a House Rules idea "friendlier per-item equip (skip the re-equip-all wizard)".
- [ ] **Step 2: Commit** `docs: equipSlot enum fix + EQUIP live-verify TODOs + House Rules idea`.

---

## Final verification
- [ ] `pnpm --filter @wiz6/data exec vitest run` + `pnpm --filter @wiz6/viewer exec vitest run` + `pnpm --filter @wiz6/parity exec vitest run` + `tsc --noEmit` all green.
- [ ] `equip-slot0` pixel-parity at 100% (tol 0); `creation-review-member` + `review-member-view` still 100%.
- [ ] e2e green. Manual smoke: REVIEW MEMBER → EQUIP → step the wizard → AC + equipped items update.
- [ ] Stage A is independently mergeable if Stage B fixtures are blocked on driving.
