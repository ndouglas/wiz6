# wpcmk Missing Validation Gates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 6 missing/partial engine-side validation gates in the wpcmk character-creation port (duplicate-name modal, bonus-pool exit prompt, invalid-action beep, skill-train exit relaxation, skill-point untrain, and spell-pick sentinel verification), exposing two new House Rules.

**Architecture:** Five small additive layers — a schema extension in `@wiz6/data` (two new house rules), a helper in `roster-store.ts` (`findDuplicateName`), an audio helper in `audio.ts` (`playInvalidActionBeep`), a creation-reducer extension (new state fields `modalErrorMsgId` + `skillFloors`, new events `MODAL_DISMISS` + `UNTRAIN_SKILL`), and a modal composer (`ega/modal-frame.ts`). Per-screen wiring follows.

**Tech Stack:** TypeScript ESM, pnpm monorepo (`@wiz6/data`, `@wiz6/parser`, viewer), vitest, React + TileWindow composers.

**Spec:** `docs/superpowers/specs/2026-05-29-wpcmk-missing-gates-design.md`

---

## Pre-flight: read these for context

Before beginning, the implementer should read:

- `docs/superpowers/specs/2026-05-29-wpcmk-missing-gates-design.md` — the spec this plan implements.
- `packages/viewer/src/pages/roster/creation/state.ts` — the creation reducer (≈900 lines). Many tasks touch it.
- `packages/viewer/src/pages/roster/creation/screens/SkillTrainScreen.tsx` — current key handling pattern (Tasks 7, 8).
- `packages/viewer/src/pages/roster/creation/screens/NameInputScreen.tsx` and `RenameInputScreen.tsx` — current name-entry pattern (Tasks 10, 11).
- `CLAUDE.md` — pixel-parity gate vs cell-grid diagnostic convention.

---

## Task 1: Add `playInvalidActionBeep` and `engineFaithfulSkillExit` house rules

**Files:**
- Modify: `packages/data/src/schemas/house-rules.ts`
- Test: `packages/data/tests/schemas/house-rules.test.ts` (create if missing — check first)

- [ ] **Step 1: Check for an existing house-rules test file**

Run: `ls packages/data/tests/schemas/house-rules.test.ts 2>/dev/null || echo MISSING`
If MISSING, the test will be created fresh. If present, append to it.

- [ ] **Step 2: Write the failing test**

Create or extend `packages/data/tests/schemas/house-rules.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  HouseRulesSchema,
  STOCK_HOUSE_RULES,
  DEFAULT_HOUSE_RULES,
  HOUSE_RULES_META,
} from '../../src/schemas/house-rules.js';

describe('playInvalidActionBeep house rule', () => {
  it('is required by the schema', () => {
    const { schemaVersion: _v, ...rest } = DEFAULT_HOUSE_RULES;
    void _v;
    // Missing the new key must fail validation
    expect(() =>
      HouseRulesSchema.parse({ schemaVersion: 1, ...rest, playInvalidActionBeep: undefined }),
    ).toThrow();
  });

  it('stock value is true (engine plays the beep)', () => {
    expect(STOCK_HOUSE_RULES.playInvalidActionBeep).toBe(true);
  });

  it('default value is true (default ON; users can disable)', () => {
    expect(DEFAULT_HOUSE_RULES.playInvalidActionBeep).toBe(true);
  });

  it('appears in HOUSE_RULES_META', () => {
    const entry = HOUSE_RULES_META.find((m) => m.key === 'playInvalidActionBeep');
    expect(entry).toBeDefined();
    expect(entry?.category).toBe('creation');
    expect(entry?.control).toBe('boolean');
  });
});

describe('engineFaithfulSkillExit house rule', () => {
  it('stock value is true (engine allows exit with leftover points)', () => {
    expect(STOCK_HOUSE_RULES.engineFaithfulSkillExit).toBe(true);
  });

  it('default value is false (port keeps stricter UX)', () => {
    expect(DEFAULT_HOUSE_RULES.engineFaithfulSkillExit).toBe(false);
  });

  it('appears in HOUSE_RULES_META', () => {
    const entry = HOUSE_RULES_META.find((m) => m.key === 'engineFaithfulSkillExit');
    expect(entry).toBeDefined();
    expect(entry?.category).toBe('creation');
    expect(entry?.control).toBe('boolean');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @wiz6/data vitest run tests/schemas/house-rules.test.ts`
Expected: FAIL — both new keys absent from schema/defaults/meta.

- [ ] **Step 4: Extend the schema, defaults, and meta**

Edit `packages/data/src/schemas/house-rules.ts`:

Inside `HouseRulesSchema`, after `pinMaxBonusRoll`, add:

```ts
  /**
   * When TRUE, the port plays SOUND00 ("clack") on rejected character-creation
   * inputs (bonus decrease at floor, increase at cap, confirm with leftover
   * points, duplicate-name commit, skill-untrain at floor). When FALSE,
   * rejected actions are silent — useful if you find the engine's beep
   * annoying. Category: creation. Default: TRUE (matches the engine).
   */
  playInvalidActionBeep: z.boolean(),
  /**
   * When TRUE, the skill-training screen allows exiting with leftover skill
   * points (engine-faithful — the engine permits this). When FALSE, the
   * screen blocks exit until budget==0 (port's stricter default). Category:
   * creation. Default: FALSE (stricter UX).
   */
  engineFaithfulSkillExit: z.boolean(),
```

Update `STOCK_HOUSE_RULES`:

```ts
export const STOCK_HOUSE_RULES: HouseRules = {
  schemaVersion: 1,
  pinMaxBonusRoll: false,
  playInvalidActionBeep: true,
  engineFaithfulSkillExit: true,
};
```

Update `DEFAULT_HOUSE_RULES`:

```ts
export const DEFAULT_HOUSE_RULES: HouseRules = {
  schemaVersion: 1,
  pinMaxBonusRoll: true,
  playInvalidActionBeep: true,
  engineFaithfulSkillExit: false,
};
```

Append two entries to `HOUSE_RULES_META`:

```ts
  {
    key: 'playInvalidActionBeep',
    label: 'Beep on rejected inputs (creation)',
    description:
      'The engine plays a short "clack" sound (SOUND00) when you press a key that the character-creation screens reject — pushing an attribute past its 18 cap, pressing Enter to confirm bonus distribution with points still in the pool, typing a name that already exists in your roster, untraining a skill below its baseline value, and so on. Some players find the beep annoying. Turn OFF to make rejected actions silent. (The screens still reject the action; only the sound changes.)',
    category: 'creation',
    stockValue: true,
    control: 'boolean',
  },
  {
    key: 'engineFaithfulSkillExit',
    label: 'Allow skill-train exit with leftover points',
    description:
      'On the SKILL POINTS screen during character creation, the original engine lets you press Escape to exit even if you have skill points remaining (forfeiting them). The port defaults to a stricter rule: you must spend the whole skill budget before you can leave. Turn ON to match the engine and allow forfeit-exits. Most players prefer the stricter default — forfeiting points is almost always a mistake, and the engine offers no warning.',
    category: 'creation',
    stockValue: true,
    control: 'boolean',
  },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @wiz6/data vitest run tests/schemas/house-rules.test.ts`
Expected: PASS — all 8 new test cases green.

- [ ] **Step 6: Run the full data-package suite for no regressions**

Run: `pnpm --filter @wiz6/data test`
Expected: PASS — all tests green. If older tests assumed the schema only had `pinMaxBonusRoll`, they'd need updating, but the schema additions are additive so this should be fine.

- [ ] **Step 7: Commit**

```bash
git add packages/data/src/schemas/house-rules.ts packages/data/tests/schemas/house-rules.test.ts
git commit -m "feat(data): add playInvalidActionBeep + engineFaithfulSkillExit house rules"
```

---

## Task 2: Add `findDuplicateName` helper to roster-store

**Files:**
- Modify: `packages/viewer/src/lib/roster-store.ts`
- Test: `packages/viewer/tests/lib/roster-store.test.ts` (create if missing — check first)

- [ ] **Step 1: Read existing roster-store test file for its helper pattern**

`packages/viewer/tests/lib/roster-store.test.ts` already exists. It has a `makeCharacter(id, name)` helper that returns a valid `Character`. Append the new test cases to this file (do NOT redefine `makeCharacter`).

- [ ] **Step 2: Write the failing test**

Append to `packages/viewer/tests/lib/roster-store.test.ts`:

```ts
import { findDuplicateName } from '../../src/lib/roster-store.js';

describe('findDuplicateName', () => {
  // beforeEach already clears localStorage at the top of this file.

  it('returns undefined for an empty roster', () => {
    expect(findDuplicateName('NATHAN')).toBeUndefined();
  });

  it('returns the matching character when name exists', () => {
    writeRoster({
      schemaVersion: 1,
      characters: [makeCharacter(ID_A, 'NATHAN'), makeCharacter(ID_B, 'GANDALF')],
    });
    expect(findDuplicateName('NATHAN')?.id).toBe(ID_A);
  });

  it('is case-sensitive (engine byte-exact compare)', () => {
    writeRoster({
      schemaVersion: 1,
      characters: [makeCharacter(ID_A, 'NATHAN')],
    });
    expect(findDuplicateName('nathan')).toBeUndefined();
    expect(findDuplicateName('Nathan')).toBeUndefined();
    expect(findDuplicateName('NATHAN')).toBeDefined();
  });

  it('excludeId skips the named character (rename use case)', () => {
    writeRoster({
      schemaVersion: 1,
      characters: [makeCharacter(ID_A, 'NATHAN'), makeCharacter(ID_B, 'GANDALF')],
    });
    expect(findDuplicateName('NATHAN', ID_A)).toBeUndefined();
    expect(findDuplicateName('GANDALF', ID_A)?.id).toBe(ID_B);
  });

  it('returns the first match if duplicates exist in storage', () => {
    writeRoster({
      schemaVersion: 1,
      characters: [makeCharacter(ID_A, 'NATHAN'), makeCharacter(ID_B, 'NATHAN')],
    });
    expect(findDuplicateName('NATHAN')?.id).toBe(ID_A);
  });
});
```

Also extend the existing top-of-file import:

```ts
import {
  readRoster,
  writeRoster,
  addCharacter,
  removeCharacter,
  updateCharacter,
  syncFromSave,
  findDuplicateName,
} from '../../src/lib/roster-store.js';
```

(Remove the duplicate `import { findDuplicateName }` line above if you added it.)

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @wiz6/viewer vitest run tests/lib/roster-store.test.ts`
Expected: FAIL — `findDuplicateName` is not exported.

- [ ] **Step 4: Add `findDuplicateName` to roster-store.ts**

Append to `packages/viewer/src/lib/roster-store.ts`:

```ts
/**
 * Find a roster character whose name byte-exactly matches `name`. Optionally
 * skip the character with id `excludeId` (used by the rename flow so a
 * character can keep its own name). Returns undefined if no match.
 *
 * Engine reference: `roster_check_name_unique` @ wpcmk.ovr 0x5011 walks
 * PCFILE slots 0..15 with `strcmp_2byte_step`, returning -1 on collision.
 * The compare is byte-exact (case-sensitive ASCII).
 */
export function findDuplicateName(name: string, excludeId?: string): Character | undefined {
  const r = readRoster();
  return r.characters.find((c) => c.name === name && c.id !== excludeId);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @wiz6/viewer vitest run tests/lib/roster-store.test.ts`
Expected: PASS — all 5 cases green.

- [ ] **Step 6: Commit**

```bash
git add packages/viewer/src/lib/roster-store.ts packages/viewer/tests/lib/roster-store.test.ts
git commit -m "feat(viewer): findDuplicateName helper for roster name-uniqueness gate"
```

---

## Task 3: Add `playInvalidActionBeep` audio helper

**Files:**
- Modify: `packages/viewer/src/lib/audio.ts`
- Test: `packages/viewer/tests/lib/audio.test.ts` (create if missing — check first)

- [ ] **Step 1: Check for an existing audio test file**

Run: `ls packages/viewer/tests/lib/audio.test.ts 2>/dev/null || echo MISSING`
If MISSING, create fresh. If present, append.

- [ ] **Step 2: Write the failing test**

Create or extend `packages/viewer/tests/lib/audio.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setHouseRule } from '../../src/lib/house-rules-store.js';

describe('playInvalidActionBeep', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it('is a no-op when playInvalidActionBeep house rule is FALSE', async () => {
    // Import fresh so module-scope state is reset.
    const { playInvalidActionBeep } = await import('../../src/lib/audio.js');
    setHouseRule('playInvalidActionBeep', false);
    // No throw; no audio context interaction. Validates the early return path.
    expect(() => playInvalidActionBeep()).not.toThrow();
  });

  it('does not throw when called before audio is unlocked (silent no-op)', async () => {
    const { playInvalidActionBeep } = await import('../../src/lib/audio.js');
    setHouseRule('playInvalidActionBeep', true);
    // No user gesture has happened → playSnd path is gated by maybeInitContext.
    expect(() => playInvalidActionBeep()).not.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @wiz6/viewer vitest run tests/lib/audio.test.ts`
Expected: FAIL — `playInvalidActionBeep` is not exported from audio.ts.

- [ ] **Step 4: Add `playInvalidActionBeep` to audio.ts**

Edit `packages/viewer/src/lib/audio.ts`. Add a new import at the top:

```ts
import { getHouseRules } from './house-rules-store.js';
```

Append to the file (after the existing exports):

```ts
// Cached SOUND00 for the invalid-action beep. Loaded lazily on first call so
// screens that don't trigger it pay no asset cost.
let cachedInvalidActionBeep: PlayableSnd | null = null;
let invalidActionBeepLoading: Promise<PlayableSnd | null> | null = null;

/**
 * Play the engine's "clack" sound (SOUND00) on a rejected character-creation
 * input. Gated by the `playInvalidActionBeep` house rule — silent no-op when
 * the rule is OFF. Also silent until the user has gestured (browser autoplay
 * policy; same as `playSnd`).
 *
 * First call kicks off a one-time lazy fetch of `/sounds/sound00.json`; the
 * actual sound plays from the second call onward (and on every call once the
 * fetch resolves). The first rejected action being silent is an acceptable
 * UX tradeoff vs. preloading on every screen.
 */
export function playInvalidActionBeep(): void {
  if (!getHouseRules().playInvalidActionBeep) return;
  if (cachedInvalidActionBeep) {
    playSnd(cachedInvalidActionBeep);
    return;
  }
  if (invalidActionBeepLoading) return; // load in flight; let it resolve
  invalidActionBeepLoading = loadSnd('/sounds/sound00.json', { slotN: 0 })
    .then((snd) => {
      cachedInvalidActionBeep = snd;
      return snd;
    })
    .catch(() => null);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @wiz6/viewer vitest run tests/lib/audio.test.ts`
Expected: PASS — both cases green.

- [ ] **Step 6: Commit**

```bash
git add packages/viewer/src/lib/audio.ts packages/viewer/tests/lib/audio.test.ts
git commit -m "feat(viewer): playInvalidActionBeep helper (gated by house rule)"
```

---

## Task 4: Extend `CreationState` with `modalErrorMsgId` + `skillFloors`

**Files:**
- Modify: `packages/viewer/src/pages/roster/creation/state.ts`
- Test: `packages/viewer/tests/pages/roster/creation/state.test.ts` (extend)

This task adds the new state fields, the `MODAL_DISMISS` and `UNTRAIN_SKILL` events, and the skill-floors snapshot at the `portrait → skillTrain` transition. It also exports two pure predicates (`canAdjustBonus`, `canUntrainSkill`) that screens use to play the rejection beep BEFORE dispatching (since the reducer is pure).

- [ ] **Step 1: Write failing tests for `skillFloors` snapshot at portrait→skillTrain**

Append to `packages/viewer/tests/pages/roster/creation/state.test.ts`:

```ts
import { creationReducer, initialCreationState } from '../../../../src/pages/roster/creation/state.js';

describe('skillFloors snapshot at portrait → skillTrain', () => {
  it('captures draft.skills at the moment screen becomes skillTrain', () => {
    // Drive a state into 'portrait' screen with a non-zero skillBudget so the
    // next screen will be 'skillTrain'. (Use the existing test helpers above —
    // buildToClassScreen + a Fighter path, then ALLOC_CONFIRM, ACCEPT_PERSONALITY,
    // PICK_PORTRAIT.) For determinism we just hand-construct a state:
    const rng = new WichmannHill(3000, 1, 29999);
    const s0 = initialCreationState(rng);
    const stateOnPortrait = {
      ...s0,
      screen: 'portrait' as const,
      draft: {
        ...s0.draft,
        class: 0, // Fighter — non-caster
        skillBudget: 5,
        skills: [3, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
      skillFloors: new Array(30).fill(0) as number[],
    };
    const next = creationReducer(stateOnPortrait, { type: 'PICK_PORTRAIT', index: 0 });
    expect(next.screen).toBe('skillTrain');
    expect(next.skillFloors).toEqual([3, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('UNTRAIN_SKILL', () => {
  it('decrements skill and increments budget when above floor', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    const s0 = initialCreationState(rng);
    const skills = new Array(30).fill(0) as number[];
    skills[2] = 5; // floor = 3, current = 5 → trainable to 4 then 3, no further
    const state = {
      ...s0,
      screen: 'skillTrain' as const,
      draft: { ...s0.draft, skillBudget: 1, skills },
      skillFloors: (() => {
        const f = new Array(30).fill(0) as number[];
        f[2] = 3;
        return f;
      })(),
    };
    const next = creationReducer(state, { type: 'UNTRAIN_SKILL', slot: 2 });
    expect(next.draft.skills[2]).toBe(4);
    expect(next.draft.skillBudget).toBe(2);
  });

  it('is a no-op when at or below floor', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    const s0 = initialCreationState(rng);
    const skills = new Array(30).fill(0) as number[];
    skills[2] = 3;
    const state = {
      ...s0,
      screen: 'skillTrain' as const,
      draft: { ...s0.draft, skillBudget: 0, skills },
      skillFloors: (() => {
        const f = new Array(30).fill(0) as number[];
        f[2] = 3;
        return f;
      })(),
    };
    const next = creationReducer(state, { type: 'UNTRAIN_SKILL', slot: 2 });
    expect(next).toBe(state); // identical reference: no-op
  });

  it('round-trip TRAIN then UNTRAIN returns to original state', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    const s0 = initialCreationState(rng);
    const skills = new Array(30).fill(0) as number[];
    skills[5] = 4;
    const state = {
      ...s0,
      screen: 'skillTrain' as const,
      draft: { ...s0.draft, skillBudget: 3, skills: [...skills] },
      skillFloors: (() => {
        const f = new Array(30).fill(0) as number[];
        f[5] = 4;
        return f;
      })(),
    };
    let next = creationReducer(state, { type: 'TRAIN_SKILL', slot: 5 });
    expect(next.draft.skills[5]).toBe(5);
    expect(next.draft.skillBudget).toBe(2);
    next = creationReducer(next, { type: 'UNTRAIN_SKILL', slot: 5 });
    expect(next.draft.skills[5]).toBe(4);
    expect(next.draft.skillBudget).toBe(3);
  });
});

describe('MODAL_DISMISS', () => {
  it('clears modalErrorMsgId when set', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    const s0 = initialCreationState(rng);
    const state = { ...s0, modalErrorMsgId: 0x044e };
    const next = creationReducer(state, { type: 'MODAL_DISMISS' });
    expect(next.modalErrorMsgId).toBeUndefined();
  });

  it('is a no-op when modalErrorMsgId is unset', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    const s0 = initialCreationState(rng);
    const next = creationReducer(s0, { type: 'MODAL_DISMISS' });
    expect(next).toBe(s0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @wiz6/viewer vitest run tests/pages/roster/creation/state.test.ts -t "skillFloors|UNTRAIN_SKILL|MODAL_DISMISS"`
Expected: FAIL — new fields, events, and the snapshot behavior don't exist yet.

- [ ] **Step 3: Extend `CreationState` interface**

In `packages/viewer/src/pages/roster/creation/state.ts`, edit the `CreationState` interface (around line 159):

```ts
export interface CreationState {
  screen: ScreenId;
  rng: WichmannHill;
  draft: DraftState;
  cursor: number;
  scratch: Record<string, unknown>;
  pinMaxBonusRoll: boolean;
  rosterIndex: number | null;
  /**
   * Snapshotted skill values at skillTrain screen entry. `UNTRAIN_SKILL`
   * cannot decrement a slot below `skillFloors[slot]` — the floor is the
   * baseline the player walked in with (race/class init + any prior
   * skill-init grants). Empty (zeroed) on non-skillTrain screens.
   */
  skillFloors: number[];
  /**
   * When set, the active screen renders an engine-style error-modal overlay.
   * Value is the msg.dbs id to display (e.g. 0x044e = "* CHARACTER ALREADY
   * EXISTS *"). Cleared on `MODAL_DISMISS`.
   */
  modalErrorMsgId?: number;
}
```

- [ ] **Step 4: Update `initialCreationState`**

Add `skillFloors` to the initial state object (around line 267):

```ts
export function initialCreationState(
  rng: WichmannHill,
  opts?: { pinMaxBonusRoll?: boolean },
): CreationState {
  return {
    screen: 'characterMenu',
    rng,
    draft: blankDraft(),
    cursor: 0,
    scratch: {},
    pinMaxBonusRoll: opts?.pinMaxBonusRoll ?? false,
    rosterIndex: null,
    skillFloors: new Array(30).fill(0) as number[],
  };
}
```

- [ ] **Step 5: Add the two new events to the `CreationEvent` union**

In the union around line 184, add:

```ts
  | { type: 'UNTRAIN_SKILL'; slot: number }   // screen-13: refund 1 skill point from slot (floor-gated)
  | { type: 'MODAL_DISMISS' }                 // any screen: dismiss modalErrorMsgId
```

- [ ] **Step 6: Snapshot `skillFloors` at portrait→skillTrain**

Edit the `portrait` case in the reducer (around line 819). Replace:

```ts
        const s: CreationState = {
          ...state,
          draft: { ...state.draft, portrait: event.index },
        };
        const nextScreen = screenAfterCharSheet(s);
        return { ...s, screen: nextScreen };
```

with:

```ts
        const s: CreationState = {
          ...state,
          draft: { ...state.draft, portrait: event.index },
        };
        const nextScreen = screenAfterCharSheet(s);
        // Snapshot the entry-time skill values as the untrain floor at the
        // moment we enter skillTrain. The user can train UP and back DOWN to
        // these floors, but not below — they represent baseline grants from
        // race/class init that pre-date this allocation phase.
        const skillFloors =
          nextScreen === 'skillTrain' ? [...s.draft.skills] : s.skillFloors;
        return { ...s, screen: nextScreen, skillFloors };
```

- [ ] **Step 7: Add `UNTRAIN_SKILL` and `MODAL_DISMISS` handlers**

In the `skillTrain` case (around line 840), add after the existing `TRAIN_SKILL` branch:

```ts
      if (event.type === 'UNTRAIN_SKILL') {
        // Floor = skillFloors[slot] (snapshotted at skillTrain entry).
        // Refund 1 point if above the floor; no-op (identical state) otherwise.
        // The screen plays the invalid-action beep on the no-op path via
        // `canUntrainSkill` BEFORE dispatching, so the reducer stays pure.
        const slot = event.slot;
        const cur = state.draft.skills[slot] ?? 0;
        const floor = state.skillFloors[slot] ?? 0;
        if (cur <= floor) return state;
        const skills = [...state.draft.skills];
        skills[slot] = cur - 1;
        return {
          ...state,
          draft: { ...state.draft, skills, skillBudget: state.draft.skillBudget + 1 },
        };
      }
```

Add a `MODAL_DISMISS` branch at the top of the reducer switch (it must work from any screen). Find the outer `switch (state.screen)` and add this BEFORE the switch:

```ts
  // Modal dismiss is screen-agnostic — clear modalErrorMsgId and return.
  if (event.type === 'MODAL_DISMISS') {
    if (state.modalErrorMsgId === undefined) return state;
    return { ...state, modalErrorMsgId: undefined };
  }
```

- [ ] **Step 8: Add the `canUntrainSkill` and `canAdjustBonus` exports**

The reducer is pure (no audio side effects), so screens need predicates to decide when to play the rejection beep BEFORE dispatching. Append to `state.ts`:

```ts
// ---------------------------------------------------------------------------
// Pure predicates for screens to check before dispatching.
// Screens use these to decide whether to play the invalid-action beep — the
// reducer can't because it must stay pure (no I/O).
// ---------------------------------------------------------------------------

/** Returns true if UNTRAIN_SKILL on `slot` would actually decrement.
 *  Screens beep on false. */
export function canUntrainSkill(state: CreationState, slot: number): boolean {
  const cur = state.draft.skills[slot] ?? 0;
  const floor = state.skillFloors[slot] ?? 0;
  return cur > floor;
}

/** Returns true if ALLOC_ADJUST{attr, delta} would actually mutate state.
 *  Screens beep on false. Mirrors the gate logic in the bonusAllocator case. */
export function canAdjustBonus(state: CreationState, attr: number, delta: number): boolean {
  if (attr < 0 || attr > 6) return false;
  const key = ATTR_KEYS[attr];
  if (!key) return false;
  const current = state.draft.attributes[key];
  if (delta > 0) {
    if (current >= 18) return false;
    if (state.draft.bonusPool <= 0) return false;
    return true;
  }
  if (delta < 0) {
    const undo = (state.scratch['undo'] as number[] | undefined) ?? new Array(7).fill(0) as number[];
    const undoCount = undo[attr] ?? 0;
    const floor = (state.draft.race === null)
      ? 0
      : ((): number => {
          const base = getRaceBaseStats(state.draft.race);
          return base[key];
        })();
    if (undoCount <= 0 || current <= floor) return false;
    return true;
  }
  return false;
}

/** Returns true if ALLOC_CONFIRM would advance (pool drained). */
export function canConfirmBonus(state: CreationState): boolean {
  return state.draft.bonusPool === 0;
}
```

Note: if `ATTR_KEYS` is not exported, export it; if `getRaceBaseStats` is not in scope here, it already is per the existing imports.

- [ ] **Step 9: Run tests to verify they pass**

Run: `pnpm --filter @wiz6/viewer vitest run tests/pages/roster/creation/state.test.ts`
Expected: PASS — all new cases green, no regressions.

- [ ] **Step 10: Run the full viewer suite for no regressions**

Run: `pnpm --filter @wiz6/viewer test`
Expected: PASS — existing tests still green.

- [ ] **Step 11: Commit**

```bash
git add packages/viewer/src/pages/roster/creation/state.ts \
        packages/viewer/tests/pages/roster/creation/state.test.ts
git commit -m "feat(creation): MODAL_DISMISS + UNTRAIN_SKILL + skillFloors snapshot"
```

---

## Task 5: Render bonus-pool exit prompt when pool == 0

**Files:**
- Modify: `packages/viewer/src/pages/roster/creation/screens/BonusAllocatorScreen.tsx`
- Test: `packages/viewer/tests/pages/roster/creation/screens/BonusAllocatorScreen.test.tsx`

The engine renders msg 0x0456 ("PRESS ▶ TO EXIT") in bottomBar row 3 when bonus pool is drained (gate at wpcmk.ovr 0x35be). The port already has the confirm gate in the reducer — only the visual prompt is missing.

`MSG.skillExit` (already defined in messages.ts as 0x0456) is the right constant to reuse — same msg id, same text.

- [ ] **Step 1: Write a failing test**

Append to `packages/viewer/tests/pages/roster/creation/screens/BonusAllocatorScreen.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { BonusAllocatorScreen } from '../../../../../src/pages/roster/creation/screens/BonusAllocatorScreen.js';
// ... reuse existing test setup helpers from this file (fontSet, palette, db mock)
// then:

describe('bonus pool zero exit prompt', () => {
  it('renders "PRESS ▶ TO EXIT" in bottomBar row 3 when bonusPool === 0', () => {
    const state = makeBonusState({ bonusPool: 0 }); // helper from existing tests
    const { container } = render(
      <BonusAllocatorScreen
        state={state}
        dispatch={() => {}}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={stubDb()}
      />,
    );
    // Dump cells from the bottomBar window; row 3 should contain msg 0x0456.
    // Validation strategy depends on the harness — if the existing test file
    // has a cell-inspection helper, use it; otherwise read the rendered
    // canvas via the same path other screen tests use.
    expect(getBottomBarRow3Text(container)).toContain('PRESS');
  });

  it('does NOT render the exit prompt when bonusPool > 0', () => {
    const state = makeBonusState({ bonusPool: 3 });
    const { container } = render(
      <BonusAllocatorScreen
        state={state}
        dispatch={() => {}}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={stubDb()}
      />,
    );
    expect(getBottomBarRow3Text(container)).toBe('');
  });
});
```

If `makeBonusState` / `getBottomBarRow3Text` / `STUB_FONT_SET` / `stubDb()` don't exist in the file, look at how `creation/screens/SkillTrainScreen.test.tsx` (which has the analogous row-3 toggle) constructs them and copy that pattern.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wiz6/viewer vitest run tests/pages/roster/creation/screens/BonusAllocatorScreen.test.tsx -t "exit prompt"`
Expected: FAIL — row 3 is never written.

- [ ] **Step 3: Add the row-3 render in BonusAllocatorScreen.tsx**

Edit `packages/viewer/src/pages/roster/creation/screens/BonusAllocatorScreen.tsx`. After the existing row-2 writes (around line 136), append:

```tsx
  // When the pool is drained, render the engine's "PRESS ▶ TO EXIT" prompt
  // centered in bottomBar row 3 (verified vs wpcmk.ovr 0x35be — same msg.dbs
  // id 0x0456 as the skill-train exit prompt). The confirm gate itself lives
  // in the reducer (ALLOC_CONFIRM no-ops when bonusPool > 0).
  if (state.draft.bonusPool === 0) {
    const exitText = creationString(db, MSG.skillExit);
    setCursor(
      bottomBar,
      Math.max(0, Math.floor((bottomBar.widthCells - exitText.length) / 2)),
      3,
    );
    puts(bottomBar, exitText, 0x03);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wiz6/viewer vitest run tests/pages/roster/creation/screens/BonusAllocatorScreen.test.tsx`
Expected: PASS — both new cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/roster/creation/screens/BonusAllocatorScreen.tsx \
        packages/viewer/tests/pages/roster/creation/screens/BonusAllocatorScreen.test.tsx
git commit -m "feat(creation): render exit prompt when bonus pool drained"
```

---

## Task 6: Wire `playInvalidActionBeep` into bonus-allocator key handler

**Files:**
- Modify: `packages/viewer/src/pages/roster/creation/screens/BonusAllocatorScreen.tsx`

- [ ] **Step 1: Write a failing test**

Append to `BonusAllocatorScreen.test.tsx`:

```tsx
import { vi } from 'vitest';
import * as audio from '../../../../../src/lib/audio.js';

describe('invalid-action beep', () => {
  beforeEach(() => {
    vi.spyOn(audio, 'playInvalidActionBeep').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('plays the beep on ALLOC_ADJUST that would no-op (increase at cap)', () => {
    // Set state with one attr at 18, cursor on it. Press ArrowRight → beep.
    const state = makeBonusState({ cursorAttr: 0, str: 18, bonusPool: 5 });
    const dispatch = vi.fn();
    render(
      <BonusAllocatorScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={stubDb()}
      />,
    );
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(audio.playInvalidActionBeep).toHaveBeenCalledOnce();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does NOT beep on a valid adjust', () => {
    const state = makeBonusState({ cursorAttr: 0, str: 12, bonusPool: 5 });
    const dispatch = vi.fn();
    render(
      <BonusAllocatorScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={stubDb()}
      />,
    );
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(audio.playInvalidActionBeep).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: 'ALLOC_ADJUST', attr: 0, delta: 1 });
  });

  it('plays the beep on ALLOC_CONFIRM with pool > 0', () => {
    const state = makeBonusState({ bonusPool: 3 });
    const dispatch = vi.fn();
    render(
      <BonusAllocatorScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={stubDb()}
      />,
    );
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(audio.playInvalidActionBeep).toHaveBeenCalledOnce();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wiz6/viewer vitest run tests/pages/roster/creation/screens/BonusAllocatorScreen.test.tsx -t "invalid-action beep"`
Expected: FAIL — current handler always dispatches; no beep call.

- [ ] **Step 3: Wire the beep via predicates**

Edit `BonusAllocatorScreen.tsx`. Add imports:

```tsx
import { playInvalidActionBeep } from '../../../../lib/audio.js';
import { canAdjustBonus, canConfirmBonus } from '../state.js';
```

Replace the existing `handleKeyDown` switch (cases 1, 3, 5):

```tsx
        case 1: // ArrowLeft — decrease current attr
          if (canAdjustBonus(state, cursor, -1)) {
            dispatch({ type: 'ALLOC_ADJUST', attr: cursor, delta: -1 });
          } else {
            playInvalidActionBeep();
          }
          break;
        case 3: // ArrowRight — increase current attr
          if (canAdjustBonus(state, cursor, 1)) {
            dispatch({ type: 'ALLOC_ADJUST', attr: cursor, delta: 1 });
          } else {
            playInvalidActionBeep();
          }
          break;
        case 5: // Enter — confirm (only with pool drained)
          if (canConfirmBonus(state)) {
            dispatch({ type: 'ALLOC_CONFIRM' });
          } else {
            playInvalidActionBeep();
          }
          break;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wiz6/viewer vitest run tests/pages/roster/creation/screens/BonusAllocatorScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/roster/creation/screens/BonusAllocatorScreen.tsx \
        packages/viewer/tests/pages/roster/creation/screens/BonusAllocatorScreen.test.tsx
git commit -m "feat(creation): beep on rejected bonus-allocator inputs"
```

---

## Task 7: Wire LEFT-key UNTRAIN_SKILL in SkillTrainScreen

**Files:**
- Modify: `packages/viewer/src/pages/roster/creation/screens/SkillTrainScreen.tsx`
- Test: `packages/viewer/tests/pages/roster/creation/screens/SkillTrainScreen.test.tsx`

- [ ] **Step 1: Write failing tests**

Append to `SkillTrainScreen.test.tsx`:

```tsx
import { vi } from 'vitest';
import * as audio from '../../../../../src/lib/audio.js';

describe('UNTRAIN_SKILL via ArrowLeft', () => {
  beforeEach(() => {
    vi.spyOn(audio, 'playInvalidActionBeep').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches UNTRAIN_SKILL on ArrowLeft when slot is above floor', () => {
    // Use the existing skill-train test setup. Place cursor on slot 0 (WAND&DAGGER)
    // for a class whose skill slot 0 is trainable. Set draft.skills[0] = 5,
    // skillFloors[0] = 3. ArrowLeft → UNTRAIN_SKILL{slot:0}.
    const state = makeSkillTrainState({ slot0: 5, floor0: 3 });
    const dispatch = vi.fn();
    render(<SkillTrainScreen state={state} dispatch={dispatch} fontSet={STUB_FONT_SET} palette={WIZ6_MAIN} db={stubDb()} />);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'UNTRAIN_SKILL', slot: 0 });
    expect(audio.playInvalidActionBeep).not.toHaveBeenCalled();
  });

  it('beeps and does NOT dispatch when slot is at floor', () => {
    const state = makeSkillTrainState({ slot0: 3, floor0: 3 });
    const dispatch = vi.fn();
    render(<SkillTrainScreen state={state} dispatch={dispatch} fontSet={STUB_FONT_SET} palette={WIZ6_MAIN} db={stubDb()} />);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(dispatch).not.toHaveBeenCalled();
    expect(audio.playInvalidActionBeep).toHaveBeenCalledOnce();
  });
});
```

If `makeSkillTrainState` doesn't exist, look at the existing test file's setup pattern and add a helper.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wiz6/viewer vitest run tests/pages/roster/creation/screens/SkillTrainScreen.test.tsx -t "UNTRAIN_SKILL"`
Expected: FAIL — ArrowLeft is currently a no-op (line 17 comment confirms it).

- [ ] **Step 3: Add ArrowLeft handler in SkillTrainScreen.tsx**

Edit `SkillTrainScreen.tsx`. Add imports:

```tsx
import { playInvalidActionBeep } from '../../../../lib/audio.js';
import { canUntrainSkill } from '../state.js';
```

In the `handleKeyDown` switch, add an `ArrowLeft` case:

```tsx
        case 'ArrowLeft': {
          // Refund 1 point from the cursor skill (floor = skillFloors[slot]).
          // Mirrors the bonus-allocator's bidirectional pattern.
          const slot = trainable[cursorIdx];
          if (slot === undefined) break;
          if (canUntrainSkill(state, slot)) {
            dispatch({ type: 'UNTRAIN_SKILL', slot });
          } else {
            playInvalidActionBeep();
          }
          break;
        }
```

Update the docstring comment block at the top of the file (around line 17) to reflect ArrowLeft is now a real action:

```ts
 *   - ArrowLeft (key 1) → refund 1 point from the cursor skill (UNTRAIN_SKILL),
 *                          floor-gated by skillFloors[slot]. At-floor → beep.
```

Update the dependency list of `useCallback` to include `state` (replacing `state.draft.skillBudget`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wiz6/viewer vitest run tests/pages/roster/creation/screens/SkillTrainScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/roster/creation/screens/SkillTrainScreen.tsx \
        packages/viewer/tests/pages/roster/creation/screens/SkillTrainScreen.test.tsx
git commit -m "feat(creation): ArrowLeft untrains a skill (floor = entry-time value)"
```

---

## Task 8: Wire `engineFaithfulSkillExit` rule (Escape → SKILLS_DONE)

**Files:**
- Modify: `packages/viewer/src/pages/roster/creation/screens/SkillTrainScreen.tsx`

When the rule is TRUE, Escape exits the skill-train screen (forfeiting any remaining budget). When FALSE (default), Escape is a no-op — the port's stricter UX.

- [ ] **Step 1: Write failing tests**

Append to `SkillTrainScreen.test.tsx`:

```tsx
import { setHouseRule, resetToDefaults } from '../../../../../src/lib/house-rules-store.js';

describe('engineFaithfulSkillExit house rule', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetToDefaults();
  });

  it('does NOT dispatch SKILLS_DONE on Escape when rule is OFF (default)', () => {
    const state = makeSkillTrainState({ skillBudget: 5 });
    const dispatch = vi.fn();
    render(<SkillTrainScreen state={state} dispatch={dispatch} fontSet={STUB_FONT_SET} palette={WIZ6_MAIN} db={stubDb()} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('dispatches SKILLS_DONE on Escape when rule is ON', () => {
    setHouseRule('engineFaithfulSkillExit', true);
    const state = makeSkillTrainState({ skillBudget: 5 });
    const dispatch = vi.fn();
    render(<SkillTrainScreen state={state} dispatch={dispatch} fontSet={STUB_FONT_SET} palette={WIZ6_MAIN} db={stubDb()} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SKILLS_DONE' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @wiz6/viewer vitest run tests/pages/roster/creation/screens/SkillTrainScreen.test.tsx -t "engineFaithfulSkillExit"`
Expected: FAIL — Escape currently has no handler (line 17 comment says "no-op").

- [ ] **Step 3: Add Escape handler**

In `SkillTrainScreen.tsx`, add import:

```tsx
import { getHouseRules } from '../../../../lib/house-rules-store.js';
```

In the `handleKeyDown` switch, add:

```tsx
        case 'Escape': {
          // House rule: if engineFaithfulSkillExit is ON, Escape forfeits any
          // remaining budget and exits the screen — matches the engine. When
          // OFF (default), Escape is a no-op — the port keeps a stricter UX
          // because forfeiting skill points is almost always a mistake.
          if (getHouseRules().engineFaithfulSkillExit) {
            dispatch({ type: 'SKILLS_DONE' });
          }
          break;
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @wiz6/viewer vitest run tests/pages/roster/creation/screens/SkillTrainScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/roster/creation/screens/SkillTrainScreen.tsx \
        packages/viewer/tests/pages/roster/creation/screens/SkillTrainScreen.test.tsx
git commit -m "feat(creation): Escape exits skill-train when engineFaithfulSkillExit rule is on"
```

---

## Task 9: Modal composer (`ega/modal-frame.ts`)

**Files:**
- Create: `packages/viewer/src/pages/roster/creation/ega/modal-frame.ts`
- Test: `packages/viewer/tests/pages/roster/creation/ega/modal-frame.test.ts`

A pure composer that returns a TileWindow positioned over the status-bar area, displaying a centered msg.dbs string. Used by NameInputScreen + RenameInputScreen overlays.

- [ ] **Step 1: Write failing test**

Create `packages/viewer/tests/pages/roster/creation/ega/modal-frame.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { composeModalFrame } from '../../../../../src/pages/roster/creation/ega/modal-frame.js';
import type { MessageDb } from '@wiz6/data';

function fakeDb(messages: Record<number, string>): MessageDb {
  return {
    indexedMessages: Object.entries(messages).map(([id, decodedText]) => ({
      id: Number(id),
      decodedText,
    })),
  } as unknown as MessageDb;
}

describe('composeModalFrame', () => {
  it('returns a TileWindow whose cells contain the centered msg text', () => {
    const db = fakeDb({ 0x044e: '* CHARACTER ALREADY EXISTS *' });
    const win = composeModalFrame(db, 0x044e);
    expect(win).toBeDefined();
    // The window should contain the message text at attr 0x03 (plain wfont3,
    // matching engine FUN_505b style 0x12 → wfont3 attr 0x03).
    // Exact cell layout verified during implementation against the engine's
    // status-bar window — for the unit test, just confirm the text appears.
    const cells = win.cells; // TileWindow.cells: 2D array of {char, attr}
    const flatChars: string = cells
      .map((row) => row.map((c) => String.fromCharCode(c.char)).join(''))
      .join('\n');
    expect(flatChars).toContain('* CHARACTER ALREADY EXISTS *');
  });

  it('returns an empty-text TileWindow when msg id is unknown', () => {
    const db = fakeDb({});
    const win = composeModalFrame(db, 0x044e);
    // Either: no text, or the entire cell grid empty. Implementation-dependent;
    // just assert no throw and the window is non-null.
    expect(win).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wiz6/viewer vitest run tests/pages/roster/creation/ega/modal-frame.test.ts`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Create the composer**

Create `packages/viewer/src/pages/roster/creation/ega/modal-frame.ts`:

```ts
/**
 * composeModalFrame — render an engine-style error-modal overlay.
 *
 * The engine renders status-bar modals via `FUN_505b(msg_id, row, col)`
 * (wpcmk.ovr 0x505b): set cursor → puts msg at attr style 0x12 →
 * play SOUND00 → wait_for_key_or_timeout. We mirror the visual half here;
 * audio + dismiss is wired by the caller.
 *
 * Position: the engine writes into `*0x56ca` (the bottomBar status window)
 * at (row 6, col 2) for the dup-name case. Our port renders the modal as a
 * dedicated overlay TileWindow at the same screen coordinates so it draws on
 * top of the underlying screen without mutating its window cells.
 *
 * Style: 0x12 in the engine's centeredPuts maps to wfont3 attr 0x03 (plain
 * highlighted text on default bg) — same style the bottomBar uses for its
 * regular prompts.
 */

import { createTileWindow, setCursor, puts } from '@wiz6/parser';
import type { TileWindow } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import { creationString } from '../messages.js';

/** Engine status-bar dimensions (bottomBar). Cross-check vs the
 *  CREATION_WINDOW_GEOMETRY entry for 'bottomBar' in ega/windows.ts —
 *  exact values must match the engine's *0x56ca window. */
const STATUS_WIDTH_CELLS = 40;
const STATUS_HEIGHT_CELLS = 5;
const STATUS_SCREEN_X = 0;
const STATUS_SCREEN_Y = 160;

export function composeModalFrame(db: MessageDb, msgId: number): TileWindow {
  const text = creationString(db, msgId);
  const win = createTileWindow({
    widthCells: STATUS_WIDTH_CELLS,
    heightCells: STATUS_HEIGHT_CELLS,
    screenX: STATUS_SCREEN_X,
    screenY: STATUS_SCREEN_Y,
  });
  // Center horizontally on row 2 (the modal text row — engine writes at
  // row 6 in the status window, which is row 2 in 0-indexed bottomBar rows
  // 0..3; double-check during implementation against an engine fixture if
  // one is available).
  const col = Math.max(0, Math.floor((STATUS_WIDTH_CELLS - text.length) / 2));
  setCursor(win, col, 2);
  puts(win, text, 0x03);
  return win;
}
```

If `createWindow` / `TileWindow` import paths differ, check `packages/viewer/src/pages/roster/creation/ega/windows.ts` for the project's actual window-creation idiom (`createPersistentWindows` uses lower-level primitives there).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wiz6/viewer vitest run tests/pages/roster/creation/ega/modal-frame.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/roster/creation/ega/modal-frame.ts \
        packages/viewer/tests/pages/roster/creation/ega/modal-frame.test.ts
git commit -m "feat(creation): composeModalFrame — engine-style error modal overlay"
```

---

## Task 10: Dup-name modal in NameInputScreen

**Files:**
- Modify: `packages/viewer/src/pages/roster/creation/screens/NameInputScreen.tsx`
- Modify: `packages/viewer/src/pages/roster/creation/state.ts` (new `SHOW_DUP_NAME_MODAL` event)
- Test: `packages/viewer/tests/pages/roster/creation/screens/NameInputScreen.test.tsx`

The component does the duplicate check (it knows the buffer and has access to roster-store), then either dispatches `SET_NAME` to advance OR dispatches a new event to set the modal flag. Keys while modal is open dispatch `MODAL_DISMISS`.

- [ ] **Step 1: Add `SHOW_DUP_NAME_MODAL` event**

Edit `packages/viewer/src/pages/roster/creation/state.ts`. In the `CreationEvent` union, add:

```ts
  | { type: 'SHOW_DUP_NAME_MODAL' }           // any screen: open the dup-name modal
```

Add a top-level handler (above the `state.screen` switch — alongside `MODAL_DISMISS`):

```ts
  if (event.type === 'SHOW_DUP_NAME_MODAL') {
    return { ...state, modalErrorMsgId: 0x044e };
  }
```

- [ ] **Step 2: Write failing test**

Append to `NameInputScreen.test.tsx`. The file already has `STUB_FONT_SET` and `stubDb()`; reuse them. For the `state` prop, build it inline from `initialCreationState(new WichmannHill(3000, 1, 29999))` and overwrite fields as needed. `makeCharacter` + `ID_A`/`ID_B` can be copied from `packages/viewer/tests/lib/roster-store.test.ts`.

```tsx
import { writeRoster } from '../../../../../src/lib/roster-store.js';
import * as audio from '../../../../../src/lib/audio.js';

describe('dup-name modal', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(audio, 'playInvalidActionBeep').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the modal (dispatches SHOW_DUP_NAME_MODAL) on Enter with duplicate name', () => {
    writeRoster({ schemaVersion: 1, characters: [makeCharacter(ID_A, 'NATHAN')] });
    const dispatch = vi.fn();
    const state = makeNameState({});
    render(<NameInputScreen state={state} dispatch={dispatch} fontSet={STUB_FONT_SET} palette={WIZ6_MAIN} db={stubDb()} />);
    // Type 'NATHAN' then Enter
    for (const ch of 'NATHAN') {
      fireEvent.keyDown(window, { key: ch });
    }
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SHOW_DUP_NAME_MODAL' });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_NAME' }));
    expect(audio.playInvalidActionBeep).toHaveBeenCalledOnce();
  });

  it('dispatches SET_NAME on Enter with unique name', () => {
    writeRoster({ schemaVersion: 1, characters: [makeCharacter(ID_A, 'NATHAN')] });
    const dispatch = vi.fn();
    const state = makeNameState({});
    render(<NameInputScreen state={state} dispatch={dispatch} fontSet={STUB_FONT_SET} palette={WIZ6_MAIN} db={stubDb()} />);
    for (const ch of 'GANDALF') {
      fireEvent.keyDown(window, { key: ch });
    }
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_NAME', name: 'GANDALF' });
    expect(audio.playInvalidActionBeep).not.toHaveBeenCalled();
  });

  it('any key while modal is open dispatches MODAL_DISMISS', () => {
    const dispatch = vi.fn();
    const state = makeNameState({ modalErrorMsgId: 0x044e });
    render(<NameInputScreen state={state} dispatch={dispatch} fontSet={STUB_FONT_SET} palette={WIZ6_MAIN} db={stubDb()} />);
    fireEvent.keyDown(window, { key: 'a' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'MODAL_DISMISS' });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_NAME' }));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @wiz6/viewer vitest run tests/pages/roster/creation/screens/NameInputScreen.test.tsx -t "dup-name modal"`
Expected: FAIL — no duplicate check, no modal rendering.

- [ ] **Step 4: Wire NameInputScreen**

Edit `packages/viewer/src/pages/roster/creation/screens/NameInputScreen.tsx`. Add imports:

```tsx
import { findDuplicateName } from '../../../../lib/roster-store.js';
import { playInvalidActionBeep } from '../../../../lib/audio.js';
import { composeModalFrame } from '../ega/modal-frame.js';
```

Replace the `handleKeyDown` function with the modal-aware version:

```tsx
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const { key } = e;

      // Modal-active path: any key dismisses; nothing else happens.
      if (_state.modalErrorMsgId !== undefined) {
        dispatch({ type: 'MODAL_DISMISS' });
        return;
      }

      if (key === 'Enter') {
        if (buffer.length === 0) return;
        const name = buffer.toUpperCase();
        if (findDuplicateName(name)) {
          playInvalidActionBeep();
          dispatch({ type: 'SHOW_DUP_NAME_MODAL' });
          return;
        }
        dispatch({ type: 'SET_NAME', name });
        return;
      }

      if (key === 'Backspace') {
        setBuffer((prev) => prev.slice(0, -1));
        return;
      }

      if (key === 'Escape') return;

      if (isPrintableAscii(key)) {
        setBuffer((prev) => (prev.length >= NAME_MAX_LENGTH ? prev : prev + key));
        return;
      }
    },
    [buffer, dispatch, _state.modalErrorMsgId],
  );
```

Rename the destructured prop `state: _state` → `state` (we now read `modalErrorMsgId`):

Change the signature:

```tsx
export function NameInputScreen({
  state,
  dispatch,
  fontSet,
  palette,
  db,
}: NameInputScreenProps) {
```

…and update the callback dependency + reference (`state.modalErrorMsgId`).

In the render section, after building the existing `[top, bottomBar, menuPanel]` windows array, append the modal overlay conditionally:

```tsx
  const windows = [top, bottomBar, menuPanel];
  if (state.modalErrorMsgId !== undefined) {
    windows.push(composeModalFrame(db, state.modalErrorMsgId));
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @wiz6/viewer vitest run tests/pages/roster/creation/screens/NameInputScreen.test.tsx`
Expected: PASS.

- [ ] **Step 6: Add the 5s auto-dismiss effect**

Append a `useEffect` to NameInputScreen.tsx that schedules dismissal:

```tsx
  // Engine's `wait_for_key_or_timeout` busy-waits ~param×10 iterations on a
  // ~20Hz timer; ~5s on a 486DX/33 was the wall-clock feel. Pick 5000ms.
  useEffect(() => {
    if (state.modalErrorMsgId === undefined) return;
    const id = window.setTimeout(() => dispatch({ type: 'MODAL_DISMISS' }), 5000);
    return () => window.clearTimeout(id);
  }, [state.modalErrorMsgId, dispatch]);
```

- [ ] **Step 7: Add a test for auto-dismiss (optional but cheap)**

```tsx
  it('auto-dismisses after 5 seconds', async () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    const state = makeNameState({ modalErrorMsgId: 0x044e });
    render(<NameInputScreen state={state} dispatch={dispatch} fontSet={STUB_FONT_SET} palette={WIZ6_MAIN} db={stubDb()} />);
    vi.advanceTimersByTime(5000);
    expect(dispatch).toHaveBeenCalledWith({ type: 'MODAL_DISMISS' });
    vi.useRealTimers();
  });
```

Run: `pnpm --filter @wiz6/viewer vitest run tests/pages/roster/creation/screens/NameInputScreen.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/viewer/src/pages/roster/creation/screens/NameInputScreen.tsx \
        packages/viewer/src/pages/roster/creation/state.ts \
        packages/viewer/tests/pages/roster/creation/screens/NameInputScreen.test.tsx \
        packages/viewer/tests/pages/roster/creation/state.test.ts
git commit -m "feat(creation): dup-name modal in NameInputScreen (block, beep, auto-dismiss)"
```

---

## Task 11: Dup-name modal in RenameInputScreen

**Files:**
- Modify: `packages/viewer/src/pages/roster/creation/screens/RenameInputScreen.tsx`
- Test: `packages/viewer/tests/pages/roster/creation/screens/RenameInputScreen.test.tsx` (create if absent)

Same pattern as NameInputScreen but uses `findDuplicateName(name, currentCharacterId)` so renaming a character to its own name is allowed.

- [ ] **Step 1: Check whether a test file exists**

Run: `ls packages/viewer/tests/pages/roster/creation/screens/RenameInputScreen.test.tsx 2>/dev/null || echo MISSING`

- [ ] **Step 2: Write the failing test**

Create or extend the test file with:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { RenameInputScreen } from '../../../../../src/pages/roster/creation/screens/RenameInputScreen.js';
import { writeRoster } from '../../../../../src/lib/roster-store.js';
import * as audio from '../../../../../src/lib/audio.js';
// Copy the `makeCharacter(id, name)` helper from
// packages/viewer/tests/lib/roster-store.test.ts (top of file). It returns
// a valid Character with all required schema fields filled in.

describe('RenameInputScreen dup-name modal', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(audio, 'playInvalidActionBeep').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('blocks rename to another character\'s name', () => {
    writeRoster({
      schemaVersion: 1,
      characters: [makeCharacter(ID_A, 'NATHAN'), makeCharacter(ID_B, 'GANDALF')],
    });
    const dispatch = vi.fn();
    const state = makeRenameState({ rosterIndex: 0 }); // character 'a' = NATHAN
    render(<RenameInputScreen state={state} dispatch={dispatch} fontSet={STUB_FONT_SET} palette={WIZ6_MAIN} db={stubDb()} />);
    for (const ch of 'GANDALF') {
      fireEvent.keyDown(window, { key: ch });
    }
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SHOW_DUP_NAME_MODAL' });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'CONFIRM_RENAME' }));
  });

  it('allows renaming a character to its own current name (no-op rename)', () => {
    writeRoster({
      schemaVersion: 1,
      characters: [makeCharacter(ID_A, 'NATHAN'), makeCharacter(ID_B, 'GANDALF')],
    });
    const dispatch = vi.fn();
    const state = makeRenameState({ rosterIndex: 0 });
    render(<RenameInputScreen state={state} dispatch={dispatch} fontSet={STUB_FONT_SET} palette={WIZ6_MAIN} db={stubDb()} />);
    for (const ch of 'NATHAN') {
      fireEvent.keyDown(window, { key: ch });
    }
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'CONFIRM_RENAME', name: 'NATHAN' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @wiz6/viewer vitest run tests/pages/roster/creation/screens/RenameInputScreen.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Wire RenameInputScreen**

Edit `RenameInputScreen.tsx`. Add imports:

```tsx
import { findDuplicateName, readRoster, updateCharacter } from '../../../../lib/roster-store.js';
import { playInvalidActionBeep } from '../../../../lib/audio.js';
import { composeModalFrame } from '../ega/modal-frame.js';
```

Replace the `handleKeyDown` Enter branch:

```tsx
      if (key === 'Enter') {
        if (state.modalErrorMsgId !== undefined) {
          dispatch({ type: 'MODAL_DISMISS' });
          return;
        }
        if (buffer.length === 0 || !character) return;
        const newName = buffer.toUpperCase();
        if (findDuplicateName(newName, character.id)) {
          playInvalidActionBeep();
          dispatch({ type: 'SHOW_DUP_NAME_MODAL' });
          return;
        }
        updateCharacter({ ...character, name: newName });
        dispatch({ type: 'CONFIRM_RENAME', name: newName });
        return;
      }
```

…and at the top of the handler, before the Enter branch, intercept all keys when the modal is active:

```tsx
      if (state.modalErrorMsgId !== undefined && key !== 'Enter') {
        dispatch({ type: 'MODAL_DISMISS' });
        return;
      }
```

In the render, append the modal overlay to the windows array (analogous to NameInputScreen):

```tsx
  const windows = [top, bottomBar, menuPanel];
  if (state.modalErrorMsgId !== undefined) {
    windows.push(composeModalFrame(db, state.modalErrorMsgId));
  }
  return (
    <CreationCanvas windows={windows} fontSet={fontSetWithPortrait} palette={pal} />
  );
```

Also add the auto-dismiss `useEffect` from NameInputScreen.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @wiz6/viewer vitest run tests/pages/roster/creation/screens/RenameInputScreen.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/viewer/src/pages/roster/creation/screens/RenameInputScreen.tsx \
        packages/viewer/tests/pages/roster/creation/screens/RenameInputScreen.test.tsx
git commit -m "feat(creation): dup-name modal in RenameInputScreen (excludeId allows self)"
```

---

## Task 12: Verify spell-pick byte5 sentinel filter

**Files:**
- Test: `packages/data/tests/character-creation/spell-table.test.ts` (extend or create)

Reading `packages/data/src/character-creation/spell-table.ts:132` confirms the filter is already correct: `(entry.byte5 & mask) !== 0` excludes sentinel entries (byte5 === 0). This task adds a unit test to lock that behavior in and close the open survey gate.

- [ ] **Step 1: Check existing tests**

Run: `ls packages/data/tests/character-creation/spell-table.test.ts 2>/dev/null || echo MISSING`

- [ ] **Step 2: Write the verification test**

Create or extend `packages/data/tests/character-creation/spell-table.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SPELL_TABLE, spellsInBook } from '../../src/character-creation/spell-table.js';

describe('spellsInBook excludes sentinel entries (byte5 === 0)', () => {
  it('does not include entries 79, 80, 81 (all bookIdx values)', () => {
    for (const bookIdx of [0, 1, 2, 3]) {
      const list = spellsInBook(bookIdx);
      const indices = list.map((e) => e.entryIdx);
      expect(indices).not.toContain(79);
      expect(indices).not.toContain(80);
      expect(indices).not.toContain(81);
    }
  });

  it('SPELL_TABLE itself has 82 entries (sentinels included for indexing)', () => {
    expect(SPELL_TABLE.length).toBe(82);
    expect(SPELL_TABLE[79]!.byte5).toBe(0);
    expect(SPELL_TABLE[80]!.byte5).toBe(0);
    expect(SPELL_TABLE[81]!.byte5).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm --filter @wiz6/data vitest run tests/character-creation/spell-table.test.ts`
Expected: PASS — the filter has been correct since `spell-table.ts` was written.

- [ ] **Step 4: Commit**

```bash
git add packages/data/tests/character-creation/spell-table.test.ts
git commit -m "test(data): lock spell-pick byte5 sentinel filter (entries 79-81 excluded)"
```

---

## Task 13: Final integration check — full viewer suite + smoke

**Files:** None (verification only)

- [ ] **Step 1: Run the full monorepo test suite**

Run: `pnpm -r test`
Expected: PASS — all packages green.

- [ ] **Step 2: Launch the dev viewer and smoke-test**

Run: `pnpm dev:viewer`

In a browser, exercise each fixed gate:

1. **Bonus exit prompt**: start a new character, allocate the entire bonus pool → see "PRESS ▶ TO EXIT" appear at the bottom of the bonus screen.
2. **Dup-name modal (create)**: create a character named "NATHAN". Start another new character, type "NATHAN", press Enter → modal pops up with "* CHARACTER ALREADY EXISTS *". Press any key OR wait 5s → modal dismisses, you're back on name input.
3. **Dup-name modal (rename)**: pick RENAME PC, choose a character, type the name of another existing character, press Enter → modal pops up. Type the same character's own name → renames cleanly with no modal.
4. **Invalid-action beep**: with the rule ON (default), in bonus-allocator push STR to 18 then press Right again → audible "clack". Toggle the rule OFF at `/settings` → silent.
5. **Skill untrain**: enter skill-train, increment a slot (e.g. WAND&DAGGER) twice, then press Left twice → budget restored each time. Press Left a third time → beep, no further decrement (you're at the floor).
6. **Skill-train exit relax**: with `engineFaithfulSkillExit` OFF (default), pressing Escape on skill-train does nothing. Toggle the rule ON in `/settings` → Escape on skill-train commits the character with whatever skill points are still left.

- [ ] **Step 3: Report manual-smoke results to the user**

If any of the 6 paths above misbehave, file an issue and fix before declaring done. Otherwise: report back with a brief summary of what was verified.

---

## What is NOT in this plan (intentionally)

- **Pixel-parity tests for the new screens.** Engine fixtures for the bonus-pool-zero state and dup-name modal don't exist yet. The cell-grid-level tests in this plan cover behavior; pixel-parity is a future backfill once we capture saves at those checkpoints (already filed in spec's out-of-scope section).
- **Beep at every other rejected-input site** (combat actions, dungeon actions, etc.). Those are separate overlays; spec scopes this work to wpcmk only.
- **Modal pixel-parity** against the engine's `FUN_505b` rendering. Cell-grid test confirms text placement; pixel comparison requires an engine fixture.
- **A separate audit of "uniqueness should be enforced elsewhere"** (active-party member names, save slot names). Filed as a TODO; not in this plan.

## Notes for the implementer

- All tasks are sequential. Task N+1 depends on Task N for the most part — don't parallelize.
- The reducer is **pure** (no I/O). Audio side effects MUST live in the components. The exported `canAdjustBonus` / `canUntrainSkill` / `canConfirmBonus` predicates exist so the components can decide whether to beep BEFORE dispatching.
- When in doubt about a `MessageDb` shape or a `TileWindow` API, the project's existing screens are the reference — copy patterns rather than inventing them.
- Each task ends with a commit. **Do not skip the commit** even if the next task is small — small commits are the project convention.
