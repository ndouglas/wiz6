# Maze Per-Turn Status Tick Implementation Plan (#089)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the engine-faithful maze per-turn status tick — a deterministic, staggered per-character regen+drain (poison stamina drain, conditions decay, HP/mana regen, exhaustion, death) advanced by a turn counter on each maze action.

**Architecture:** A pure `applyMazeTurnStatus(roster, turnCounter, rng)` in `@wiz6/parser` driven by a per-action `turnCounter` in the game session, fed by per-character affliction fields decoded from the pcfile. Wired into MazeView's movement + OPEN handlers via an `advanceMazeTurn()` seam. Producers (combat/traps), the rest/camp stamina-regen path, and the real graveyard screen are deferred; an all-dead "party-wiped" stub stands in.

**Tech Stack:** TypeScript ESM (pnpm monorepo); zod schemas (`@wiz6/data`); pure decoders (`@wiz6/parser`); React viewer; Vitest + Playwright.

**Spec:** `docs/superpowers/specs/2026-06-20-maze-per-turn-status-tick-design.md` (rev 2, all fields LIVE-verified). RE findings: `maze-status-effects.json`, `maze-per-turn-poison.json`, `maze-regen-tick.json`, `maze-status-tick-live-verify.json`.

---

## Verified facts (the implementation MUST match)

- Fields (char-record abs → pcfile on-disk = abs − 0x43e8; slot stride 0x1b0): `statusLevel` 0x4589→**+0x1A1**; `vitRegen[0..2]` 0x458a/b/c→**+0x1A2/3/4**; `poisonAmount` 0x458d→**+0x1A5**; `schoolSkill[0..5]` 0x4504..0x4509→**+0x11C..+0x121**; `conditions[10]` 0x450a..→+0x122 (already modeled); hp 0x4400/+0x18, hpMax +0x1A, stamina 0x4404/+0x1C, staminaMax +0x1E, schoolMana/Max +0x28.. (already modeled).
- Tick: only when `turnCounter % 10 === 5`; `selected = floor((turnCounter % 60) / 10)`; for each member with `statusLevel < 3` (skip ≥3): (1) if selected, `stamina = max(0, stamina − (poisonAmount + 1))`; (2) conditions decay each `b → (b===0||b===0xFF) ? b : max(0,b−1)`; (3) `hp = min(hpMax, hp + (vitRegen[0]−vitRegen[1]−vitRegen[2]))`, and if `hp < 1` → death (`statusLevel=3`, hp=0, stamina=0, skip rest); (4) if `stamina < 1` → `stamina=0`, `conditions[2] = 6 + rng.uniform(6)`; (5) if selected, per school `s`: `sk = schoolSkill[s]===0 ? 1 : schoolSkill[s]`, `mana[s] = min(manaMax[s], mana[s] + rng.uniform(sk + 1))`.
- `WichmannHill.uniform(n)` returns 0..n−1 (engine `rng(n)`).
- `allDead` = no member has `statusLevel === 0` (live-verify reading; flagged — see Task 4).
- Turn model: increment `turnCounter` once per discrete maze action (step/rotate/OPEN). Engine cadence is per-loop-pass; exact parity is not a goal (match the math, tune the rate).

---

## File structure

- **Modify** `packages/data/src/schemas/character.ts` — add `statusLevel`, `poisonAmount`, `vitRegen`, `schoolSkill` (Task 1).
- **Modify** `packages/parser/src/formats/pcfile-character-bridge.ts` — decode the new fields from `slot.raw` (Task 2).
- **Modify** `packages/data/src/schemas/game-session.ts` — add `turnCounter` (Task 3).
- **Create** `packages/parser/src/maze/status-tick.ts` + **Modify** `packages/parser/src/maze/index.ts`, `packages/parser/src/index.ts` — the pure tick + exports (Task 4).
- **Create** `packages/parser/tests/maze/status-tick.test.ts` (Task 4).
- **Modify** `packages/parser/tests/...` pcfile bridge test (Task 2).
- **Modify** `packages/viewer/src/pages/game/MazeView.tsx` — `advanceMazeTurn()` + wiring + all-dead stub (Task 5).
- **Modify** `packages/viewer/tests/game/MazeView.test.tsx` (Task 5).
- **Create** `packages/viewer/e2e/maze-status-tick.spec.ts` (Task 6).

---

## Task 1: Affliction fields on the Character schema

**Files:** Modify `packages/data/src/schemas/character.ts`; Test: `packages/data/tests/character.test.ts` (or the existing character schema test — confirm path).

- [ ] **Step 1: Read the schema + find the active-party type**

Read `packages/data/src/schemas/character.ts` (the `CharacterSchema` zod object ~L85, `conditions`/`schoolMana`/`skills` fields). Find where `ActivePartyMember` is defined (`grep -rn "ActivePartyMember" packages/data/src`) — confirm whether it is `Character` or a separate type; the new fields must reach the runtime roster MazeView reads.

- [ ] **Step 2: Write the failing test**

In the character schema test file, add:

```typescript
it('parses the maze-affliction fields with defaults', () => {
  const base = minimalCharacter(); // existing helper, or build a minimal valid object
  const c = CharacterSchema.parse(base);
  expect(c.statusLevel).toBe(0);
  expect(c.poisonAmount).toBe(0);
  expect(c.vitRegen).toEqual([0, 0, 0]);
  expect(c.schoolSkill).toEqual([0, 0, 0, 0, 0, 0]);
  const afflicted = CharacterSchema.parse({ ...base, statusLevel: 2, poisonAmount: 3, vitRegen: [5, 0, 0], schoolSkill: [1, 2, 0, 0, 0, 4] });
  expect(afflicted.poisonAmount).toBe(3);
});
```

(If there is no `minimalCharacter()` helper, construct the object from an existing passing test's fixture in the same file — copy it, don't invent fields.)

- [ ] **Step 3: Run it, see it fail**

Run: `pnpm --filter @wiz6/data test character`
Expected: FAIL (`statusLevel` undefined / unknown key).

- [ ] **Step 4: Add the fields**

In `CharacterSchema` (after `skills` / near `conditions`):

```typescript
  /** Maze status-effect fields (per-turn tick). pcfile on-disk +0x1A1..+0x1A5. */
  /** Status level: 0=well, 1-2=afflicted, >=3=dead/incapacitated. (+0x1A1) */
  statusLevel: U8.default(0),
  /** Per-tick stamina-drain severity; drain = poisonAmount+1. (+0x1A5) */
  poisonAmount: U8.default(0),
  /** HP regen triple: hp += vitRegen[0] - vitRegen[1] - vitRegen[2]. (+0x1A2..+0x1A4) */
  vitRegen: z.tuple([U8, U8, U8]).default([0, 0, 0]),
  /** Per-school spell-capacity/skill bytes; drives mana regen rng(skill+1). (+0x11C..+0x121) */
  schoolSkill: z.array(U8).length(6).default([0, 0, 0, 0, 0, 0]),
```

(Use the file's existing `U8` import. If `z.tuple(...).default(...)` trips the schema's strictness, use `z.array(U8).length(3).default([0,0,0])` and type as `number[]` — match the file's array style; `schoolMana` uses `z.array(U16).length(6)`.)

If `ActivePartyMember` is a SEPARATE type (not `z.infer<typeof CharacterSchema>`), add the same fields there too.

- [ ] **Step 5: Run, verify pass + full data suite**

Run: `pnpm --filter @wiz6/data test`
Expected: PASS (new test green; no regression).

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/schemas/character.ts packages/data/tests/character.test.ts
git commit -m "feat(#089): add maze-affliction fields (statusLevel/poisonAmount/vitRegen/schoolSkill) to Character"
```

---

## Task 2: Decode the affliction fields in the pcfile→character bridge

**Files:** Modify `packages/parser/src/formats/pcfile-character-bridge.ts` (`pcfileSlotToCharacter` ~L42); Test: the existing pcfile-bridge test (`grep -rn "pcfileSlotToCharacter" packages/parser/tests`).

- [ ] **Step 1: Read `pcfileSlotToCharacter`** — note the established raw-read pattern (e.g. `slot.raw[OFF_RENDERED_PORTRAIT]`, `slot.conditions`, `slot.hpCurrent`, `slot.spCurrent`). The `PcfileSlot.raw` is the full record byte array.

- [ ] **Step 2: Write the failing test**

In the bridge test file, add (adapt the slot-construction helper to the file's existing pattern):

```typescript
it('decodes maze-affliction fields from the raw record', () => {
  const slot = makePcfileSlot(); // existing helper / fixture in this test
  slot.raw[0x1a1] = 2;            // statusLevel
  slot.raw[0x1a2] = 5;            // vitRegen[0]
  slot.raw[0x1a3] = 1;            // vitRegen[1]
  slot.raw[0x1a4] = 0;            // vitRegen[2]
  slot.raw[0x1a5] = 3;            // poisonAmount
  slot.raw[0x11c] = 4;            // schoolSkill[0]
  const c = pcfileSlotToCharacter(slot, 'id-1');
  expect(c.statusLevel).toBe(2);
  expect(c.poisonAmount).toBe(3);
  expect(c.vitRegen).toEqual([5, 1, 0]);
  expect(c.schoolSkill[0]).toBe(4);
});
```

- [ ] **Step 3: Run it, see it fail**

Run: `pnpm --filter @wiz6/parser test pcfile-character-bridge` (or the actual test name)
Expected: FAIL (fields undefined / not 2/3).

- [ ] **Step 4: Decode in the bridge**

In `pcfileSlotToCharacter`'s returned object (alongside `conditions`/`hpCurrent`):

```typescript
    statusLevel: slot.raw[0x1a1] ?? 0,
    poisonAmount: slot.raw[0x1a5] ?? 0,
    vitRegen: [slot.raw[0x1a2] ?? 0, slot.raw[0x1a3] ?? 0, slot.raw[0x1a4] ?? 0],
    schoolSkill: [0, 1, 2, 3, 4, 5].map((s) => slot.raw[0x11c + s] ?? 0),
```

- [ ] **Step 5: Run, verify pass + full parser suite**

Run: `pnpm --filter @wiz6/parser test`
Expected: PASS (new test green; no regression).

- [ ] **Step 6: Commit**

```bash
git add packages/parser/src/formats/pcfile-character-bridge.ts packages/parser/tests/
git commit -m "feat(#089): decode maze-affliction fields from pcfile raw (+0x1A1..+0x1A5, +0x11C)"
```

---

## Task 3: `turnCounter` on the game session

**Files:** Modify `packages/data/src/schemas/game-session.ts`; Test: the existing game-session schema test (`grep -rn "GameSessionSchema" packages/data/tests packages/viewer`).

- [ ] **Step 1: Read `GameSessionSchema`** (~L8: `schemaVersion`, `party`, `level`, `entryMode`).

- [ ] **Step 2: Write the failing test**

```typescript
it('defaults turnCounter to 0', () => {
  const s = GameSessionSchema.parse({ /* existing minimal valid session fixture */ });
  expect(s.turnCounter).toBe(0);
});
```

(Copy the minimal session fixture from an existing passing test in the same file.)

- [ ] **Step 3: Run it, see it fail** — `pnpm --filter @wiz6/data test game-session` → FAIL.

- [ ] **Step 4: Add the field** in `GameSessionSchema`:

```typescript
  /** Maze turn counter — incremented once per maze action (step/rotate/OPEN);
   *  drives the per-turn status tick (#089). Default 0. */
  turnCounter: z.number().int().nonnegative().default(0),
```

- [ ] **Step 5: Run, verify pass + full data suite** — `pnpm --filter @wiz6/data test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/schemas/game-session.ts packages/data/tests/
git commit -m "feat(#089): add turnCounter to GameSession (maze per-turn tick)"
```

---

## Task 4: `applyMazeTurnStatus` pure function + tests

**Files:** Create `packages/parser/src/maze/status-tick.ts`; Modify `packages/parser/src/maze/index.ts` + `packages/parser/src/index.ts`; Create `packages/parser/tests/maze/status-tick.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `packages/parser/tests/maze/status-tick.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { applyMazeTurnStatus, type StatusTickMember } from '../../src/maze/status-tick.js';
import { WichmannHill } from '@wiz6/data';

function member(over: Partial<StatusTickMember> = {}): StatusTickMember {
  return {
    hpCurrent: 20, hpMax: 20, staminaCurrent: 50, staminaMax: 50,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    statusLevel: 0, poisonAmount: 0, vitRegen: [0, 0, 0],
    schoolMana: [0, 0, 0, 0, 0, 0], schoolManaMax: [9, 9, 9, 9, 9, 9],
    schoolSkill: [0, 0, 0, 0, 0, 0],
    ...over,
  };
}
const rng = () => new WichmannHill(1, 2, 3); // deterministic; reseed per test

describe('applyMazeTurnStatus', () => {
  it('no-op when turn % 10 !== 5', () => {
    const r = applyMazeTurnStatus([member({ staminaCurrent: 50 })], 4, rng());
    expect(r.roster[0]!.staminaCurrent).toBe(50);
  });

  it('drains selected slot by poisonAmount+1 on its turn (un-afflicted = 1)', () => {
    // turn 5 -> selected slot 0
    const r = applyMazeTurnStatus([member({ staminaCurrent: 50 })], 5, rng());
    expect(r.roster[0]!.staminaCurrent).toBe(49);
    // turn 15 -> selected slot 1; slot 0 NOT drained
    const r2 = applyMazeTurnStatus([member({ staminaCurrent: 50 }), member({ staminaCurrent: 50 })], 15, rng());
    expect(r2.roster[0]!.staminaCurrent).toBe(50);
    expect(r2.roster[1]!.staminaCurrent).toBe(49);
  });

  it('drain uses poisonAmount+1 and clamps at 0', () => {
    const r = applyMazeTurnStatus([member({ staminaCurrent: 2, poisonAmount: 7 })], 5, rng());
    expect(r.roster[0]!.staminaCurrent).toBe(0); // 2 - 8 -> clamp 0
  });

  it('slot wraps mod 60 (turn 65 -> slot 0)', () => {
    const r = applyMazeTurnStatus([member({ staminaCurrent: 50 })], 65, rng());
    expect(r.roster[0]!.staminaCurrent).toBe(49);
  });

  it('skips members with statusLevel >= 3 entirely', () => {
    const r = applyMazeTurnStatus([member({ staminaCurrent: 50, statusLevel: 3, conditions: [5, 0, 0, 0, 0, 0, 0, 0, 0, 0] })], 5, rng());
    expect(r.roster[0]!.staminaCurrent).toBe(50);
    expect(r.roster[0]!.conditions[0]).toBe(5); // not decayed
  });

  it('decays conditions by 1, floors at 0, skips 0 and 0xFF', () => {
    const r = applyMazeTurnStatus([member({ conditions: [5, 0, 0xff, 1, 0, 0, 0, 0, 0, 0] })], 5, rng());
    expect(r.roster[0]!.conditions).toEqual([4, 0, 0xff, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('HP regen = vitRegen[0]-[1]-[2], capped at hpMax', () => {
    const r = applyMazeTurnStatus([member({ hpCurrent: 10, hpMax: 20, vitRegen: [5, 1, 0] })], 5, rng());
    expect(r.roster[0]!.hpCurrent).toBe(14); // 10 + (5-1-0)
    const cap = applyMazeTurnStatus([member({ hpCurrent: 19, hpMax: 20, vitRegen: [5, 0, 0] })], 5, rng());
    expect(cap.roster[0]!.hpCurrent).toBe(20); // capped
  });

  it('death when HP regen drives HP < 1 (negative net)', () => {
    const r = applyMazeTurnStatus([member({ hpCurrent: 1, hpMax: 20, vitRegen: [0, 5, 0] })], 5, rng());
    expect(r.roster[0]!.hpCurrent).toBe(0);
    expect(r.roster[0]!.staminaCurrent).toBe(0);
    expect(r.roster[0]!.statusLevel).toBe(3);
  });

  it('stamina-empty sets conditions[2] = 6 + rng.uniform(6) (6..11)', () => {
    const r = applyMazeTurnStatus([member({ staminaCurrent: 1, poisonAmount: 0 })], 5, rng());
    expect(r.roster[0]!.staminaCurrent).toBe(0);
    expect(r.roster[0]!.conditions[2]).toBeGreaterThanOrEqual(6);
    expect(r.roster[0]!.conditions[2]).toBeLessThanOrEqual(11);
  });

  it('mana regen only for the selected member, skill-0 bumped, capped', () => {
    const r = applyMazeTurnStatus([member({ schoolMana: [0, 0, 0, 0, 0, 0], schoolSkill: [4, 0, 0, 0, 0, 0] })], 5, rng());
    // selected slot 0: school 0 += rng.uniform(5) in 0..4; capped at 9
    expect(r.roster[0]!.schoolMana[0]).toBeGreaterThanOrEqual(0);
    expect(r.roster[0]!.schoolMana[0]).toBeLessThanOrEqual(4);
  });

  it('allDead is true iff no member has statusLevel === 0', () => {
    expect(applyMazeTurnStatus([member({ statusLevel: 0 })], 4, rng()).allDead).toBe(false);
    expect(applyMazeTurnStatus([member({ statusLevel: 3 })], 4, rng()).allDead).toBe(true);
  });

  it('does not mutate the input roster', () => {
    const input = [member({ staminaCurrent: 50 })];
    applyMazeTurnStatus(input, 5, rng());
    expect(input[0]!.staminaCurrent).toBe(50);
  });
});
```

- [ ] **Step 2: Run it, see it fail** — `pnpm --filter @wiz6/parser test status-tick` → FAIL (module not found).

- [ ] **Step 3: Implement `packages/parser/src/maze/status-tick.ts`**

```typescript
import type { WichmannHill } from '@wiz6/data';

/** The per-member fields the maze status tick reads/writes. */
export interface StatusTickMember {
  hpCurrent: number;
  hpMax: number;
  staminaCurrent: number;
  staminaMax: number;
  conditions: number[];
  statusLevel: number;
  poisonAmount: number;
  vitRegen: readonly [number, number, number] | number[];
  schoolMana: number[];
  schoolManaMax: number[];
  schoolSkill: number[];
}

/**
 * Engine-faithful maze per-turn status tick (#089; wmaze dungeon_main_loop +
 * FUN_0000_1c94). Pure: returns a NEW roster, never mutates. The `rng` is the
 * session WichmannHill (scripted in tests). See the design spec for the verified
 * mechanic; `uniform(n)` returns 0..n-1 (engine rng(n)).
 */
export function applyMazeTurnStatus(
  roster: readonly StatusTickMember[],
  turnCounter: number,
  rng: WichmannHill,
): { roster: StatusTickMember[]; allDead: boolean } {
  const out: StatusTickMember[] = roster.map((m) => ({
    ...m,
    conditions: [...m.conditions],
    schoolMana: [...m.schoolMana],
  }));

  if (turnCounter % 10 === 5) {
    const selected = Math.floor((turnCounter % 60) / 10);
    for (let i = 0; i < out.length; i++) {
      const m = out[i]!;
      if (m.statusLevel >= 3) continue; // dead/incapacitated: no tick

      // 1. poison stamina drain (selected member only), FIRST.
      if (i === selected) {
        m.staminaCurrent = Math.max(0, m.staminaCurrent - (m.poisonAmount + 1));
      }
      // 2. conditions decay (-1, floor 0, skip sentinels 0 and 0xFF).
      m.conditions = m.conditions.map((b) => (b === 0 || b === 0xff ? b : Math.max(0, b - 1)));
      // 3. HP regen (VIT triple), cap at hpMax; death if < 1.
      const v = m.vitRegen;
      const hp = Math.min(m.hpMax, m.hpCurrent + (v[0]! - v[1]! - v[2]!));
      if (hp < 1) {
        m.statusLevel = 3;
        m.hpCurrent = 0;
        m.staminaCurrent = 0;
        continue; // dead: skip stamina-empty + mana
      }
      m.hpCurrent = hp;
      // 4. stamina-empty exhaustion side-effect.
      if (m.staminaCurrent < 1) {
        m.staminaCurrent = 0;
        m.conditions[2] = 6 + rng.uniform(6);
      }
      // 5. mana regen (selected member only).
      if (i === selected) {
        for (let s = 0; s < 6; s++) {
          const sk = m.schoolSkill[s] === 0 ? 1 : m.schoolSkill[s]!;
          m.schoolMana[s] = Math.min(m.schoolManaMax[s] ?? 0, (m.schoolMana[s] ?? 0) + rng.uniform(sk + 1));
        }
      }
    }
  }

  const allDead = !out.some((m) => m.statusLevel === 0);
  return { roster: out, allDead };
}
```

> **allDead threshold note:** the live-verify finding says the graveyard count uses `statusLevel === 0` (only fully-well members count as "able"); the static poison finding suggested `< 3`. We use `=== 0` (the live pass) — but it's a deferred-stub trigger; reconfirm when the graveyard screen + producers land. Leave an inline `// TODO(#089): confirm graveyard threshold (===0 vs <3) when producers/graveyard land`.

- [ ] **Step 4: Export it** — in `packages/parser/src/maze/index.ts` and `packages/parser/src/index.ts`, add `export { applyMazeTurnStatus, type StatusTickMember } from './maze/status-tick.js';` (match each file's export style; the maze index uses `./status-tick.js`).

- [ ] **Step 5: Run, verify pass** — `pnpm --filter @wiz6/parser test status-tick` → PASS (all cases). Then `pnpm --filter @wiz6/parser test` → no regression.

- [ ] **Step 6: Commit**

```bash
git add packages/parser/src/maze/status-tick.ts packages/parser/src/maze/index.ts packages/parser/src/index.ts packages/parser/tests/maze/status-tick.test.ts
git commit -m "feat(#089): applyMazeTurnStatus pure tick (staggered drain + regen + conditions + death)"
```

---

## Task 5: Wire `advanceMazeTurn` into MazeView (movement + OPEN + all-dead stub)

**Files:** Modify `packages/viewer/src/pages/game/MazeView.tsx`; Test: `packages/viewer/tests/game/MazeView.test.tsx`.

- [ ] **Step 1: Read the relevant MazeView regions** — the imports (`applyMazeTurnStatus` from `@wiz6/parser`, `readActiveParty`/`writeActiveParty` from `../../lib/active-party-store.js`), `activePartyRef` (~L610), `rngRef` (~L580), `updateSession` (from the game-session store), the free-roam movement case (`nextParty = turn(...)` / `tryStepForward(...)` then `updateParty(nextParty)`, ~L1330-1375), and the OPEN resolution site (the `// TODO: turn-tick` comment, ~L1176). Note how the session's `turnCounter` is read (`sessionRef.current`).

- [ ] **Step 2: Add the `advanceMazeTurn` helper** (near `present()` / the other helpers)

```typescript
  // #089: advance one maze turn — bump the counter and run the per-turn status tick
  // (staggered stamina drain + conditions decay + HP/mana regen + exhaustion/death).
  // Called after each maze action (movement step/rotate, OPEN). Persists the roster
  // + session, redraws the panel, and routes to the party-wiped stub if all dead.
  function advanceMazeTurn() {
    const session = sessionRef.current;
    const rng = rngRef.current;
    if (!session || !rng) return;
    const turnCounter = (session.turnCounter ?? 0) + 1;
    updateSession({ turnCounter });
    sessionRef.current = { ...session, turnCounter };
    const { roster, allDead } = applyMazeTurnStatus(
      activePartyRef.current as StatusTickMember[],
      turnCounter,
      rng,
    );
    activePartyRef.current = roster as ReadonlyArray<ActivePartyMember>;
    writeActiveParty({ ...readActiveParty(), members: roster as ActivePartyMember[] });
    present(); // redraw the party panel (stamina/HP/conditions changed)
    if (allDead) {
      // TODO(#089): real graveyard screen (winit 0xdf6) is unported — minimal stub.
      navigate('/castle'); // party-wiped stub: bounce to the castle main menu
    }
  }
```

> Adapt: `StatusTickMember`/`ActivePartyMember` casts to satisfy the field shapes (the roster members carry the new fields from Task 1/2; `applyMazeTurnStatus` reads the subset). Use the actual `navigate` available in the component (MazeView uses react-router — confirm the hook; if none, set a session flag / route the way other MazeView transitions do). Import `applyMazeTurnStatus`, `StatusTickMember`, `writeActiveParty`.

- [ ] **Step 3: Call it after each maze action**

  - **OPEN:** at the `// TODO: turn-tick` site (after the door attempt resolves + the strain/result flow is set up), replace the comment with `advanceMazeTurn();`. (OPEN consumes a turn even on failure.)
  - **Movement:** in the free-roam movement handler, after `updateParty(nextParty); sessionRef.current = { ...session, party: nextParty }; present();` for the ArrowUp (step) and ArrowLeft/ArrowRight (rotate) cases, call `advanceMazeTurn();`. (Place it once after the move is applied — confirm it runs for step + both rotates. A blocked step that doesn't move still consumes a turn in the engine; for the port, call it whenever the movement key is handled in free-roam.)

- [ ] **Step 4: Write the failing component test**

In `MazeView.test.tsx`, add (model on the existing maze-flow tests; use fake timers only if needed):

```typescript
it('advances a turn + runs the status tick on a maze step (#089)', async () => {
  // Seed an afflicted member (poisonAmount so the drain is visible) + a free-roam session.
  // (Use the test's existing renderMazeView + active-party seeding; set member 0
  //  poisonAmount=3, staminaCurrent=50, and turnCounter so the next step lands turn%10==5.)
  // After the seeded steps reach a turn where slot 0 is selected, assert writeActiveParty
  // was called with member 0 staminaCurrent reduced by 4 (poison+1), and turnCounter bumped.
});
```

> Implement against the test file's actual seeding/mocks (`mockUpdateParty`, the active-party mock, `mockUpdateSession`). The concrete assertion: drive enough free-roam ArrowUp/ArrowRight presses to reach `turnCounter % 10 === 5` with slot 0 selected, then assert the roster write shows member 0's stamina dropped by `poisonAmount+1` and `updateSession` was called with the incremented `turnCounter`. If the active-party store is mocked, assert via the mock; otherwise read it back.

- [ ] **Step 5: Run, iterate to pass** — `pnpm --filter @wiz6/viewer test MazeView` → PASS. Then `pnpm --filter @wiz6/viewer exec tsc --noEmit` → clean.

- [ ] **Step 6: Full viewer suite (no regression)** — `pnpm --filter @wiz6/viewer test` → PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/viewer/src/pages/game/MazeView.tsx packages/viewer/tests/game/MazeView.test.tsx
git commit -m "feat(#089): wire advanceMazeTurn (per-turn status tick) into MazeView movement + OPEN"
```

---

## Task 6: e2e — an afflicted member ticks over maze turns

**Files:** Create `packages/viewer/e2e/maze-status-tick.spec.ts`.

- [ ] **Step 1: Read the model spec** — `packages/viewer/e2e/maze-walk-gate-square.spec.ts` (roster seeding via `localStorage('wiz6:active-party')` + the cutscene cadence to free-roam) and `e2e/lib/drive.ts`.

- [ ] **Step 2: Write the spec**

```typescript
import { test, expect } from '@playwright/test';
import { waitForNonBlankCanvas, waitForStableCanvas } from './lib/canvas.js';

// #089: an afflicted party member's stamina drains over maze turns (the per-turn
// status tick). Seeds member 0 with poisonAmount + a known staminaCurrent, walks N
// steps, and asserts staminaCurrent dropped (read back from the active-party store).
test('afflicted member loses stamina over maze turns', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.setItem('wiz6:active-party', JSON.stringify({
      schemaVersion: 1,
      members: [/* one seedMember copied from maze-walk-gate-square.spec.ts, with
        staminaCurrent: 50, staminaMax: 50, poisonAmount: 3, statusLevel: 0 */],
    }));
  });
  await page.goto('/castle/start-new-game');
  await page.waitForURL('**/game/maze', { timeout: 15_000 });
  await waitForNonBlankCanvas(page, 'canvas', 500, 20_000);
  await waitForStableCanvas(page, 'canvas');

  // Walk + turn enough actions to cross a turn%10==5 where slot 0 is selected.
  for (let i = 0; i < 12; i++) { await page.keyboard.press('ArrowRight'); }

  const stamina = await page.evaluate(() => {
    const p = JSON.parse(window.localStorage.getItem('wiz6:active-party') ?? '{}');
    return p.members?.[0]?.staminaCurrent;
  });
  expect(stamina).toBeLessThan(50); // drained by the per-turn tick
});
```

> Copy `seedMember` from `maze-walk-gate-square.spec.ts` and add the affliction fields. Tune the action count so slot 0 is the selected member on a `turn%10==5` turn (slot 0 fires at turn ≡ 5 mod 60). If rotating in place doesn't increment `turnCounter` in the port wiring (confirm Task 5 wires rotate), use `ArrowUp` steps instead.

- [ ] **Step 3: Run, iterate** — `pnpm --filter @wiz6/viewer test:e2e maze-status-tick` → PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/viewer/e2e/maze-status-tick.spec.ts
git commit -m "test(#089): e2e — afflicted member stamina drains over maze turns"
```

---

## Task 7: Manual smoke + docs

- [ ] **Step 1: Manual smoke** — `pnpm dev:viewer`, import/seed an afflicted character (poisonAmount + a condition byte set), enter the dungeon, walk ~12+ actions; eyeball that the member's stamina drains and the condition wears off (party panel updates). Confirm an un-afflicted party just sees the slow staggered −1 stamina and nothing jarring.

- [ ] **Step 2: Update TODO** — in `TODO.md` #089, mark the per-turn status tick shipped (turn counter + staggered drain + conditions decay + HP/mana regen + exhaustion/death + all-dead stub); note the remaining deferrals (producers: combat/traps/spell-backfire; the rest/camp stamina-regen path; the real graveyard screen; the `===0`-vs-`<3` graveyard-threshold reconfirm).

```bash
git add TODO.md
git commit -m "docs(#089): maze per-turn status tick shipped (regen+drain); note deferrals"
```

---

## Self-review notes

- **Spec coverage:** affliction model (spec §Components 1 → Tasks 1–2); turn counter + model (§2 → Task 3); the full tick incl. all 5 sub-behaviors + death + allDead (§3 → Task 4); wiring seam + OPEN + movement + all-dead stub (§4 → Task 5); observability (§5 → Task 6); the verified field offsets + magnitudes (§"verified facts" → Tasks 1/2/4). All spec sections map to tasks.
- **Verified-facts fidelity:** Task 4's pure fn encodes the exact mechanic (staggered schedule, drain=poison+1, conditions decay/sentinels, HP VIT-triple+death, exhaustion 6+rng(6), mana rng(skill+1) skill-0 bump, allDead). `uniform(n)`=0..n−1 confirmed.
- **Flagged precisions (carried as inline TODOs, not placeholders):** the `allDead` threshold (`===0` per live-verify vs `<3`); whether the port increments `turnCounter` on rotate vs step-only (Task 5 wires step+rotate+OPEN; the e2e/smoke confirm the rate feels right) — both are documented decisions with the verified default, not gaps.
- **Type consistency:** `applyMazeTurnStatus(roster, turnCounter, rng) → { roster, allDead }` and `StatusTickMember` used identically across Tasks 4–6; field names (`statusLevel`/`poisonAmount`/`vitRegen`/`schoolSkill`) consistent across Tasks 1/2/4.
- **No producers / dormancy:** honestly scoped — observable via imported/seeded afflicted members; the un-afflicted baseline is the slow staggered −1 stamina. Death/graveyard largely dormant until producers land (documented).
