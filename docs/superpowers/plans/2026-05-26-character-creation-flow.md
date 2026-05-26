# Character Creation Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an engine-faithful multi-step character creation wizard at `/roster/new` that creates new characters and adds them to the roster.

**Architecture:** Single React route with internal step state. Each of the 9 steps is its own component receiving `{ draft, onUpdate, onNext, onBack }`. The wizard shell validates step completion before forward navigation. On the final Review step, a `Character` is constructed and added to the roster via existing `addCharacter()`.

**Tech Stack:** React 18, TypeScript ESM, react-router-dom, vitest + @testing-library/react, CSS modules. Reuses existing `@wiz6/data` constants (RACE_BASE_STATS, CLASS_REQUIREMENTS, CLASS_SKILL_AVAILABILITY, CLASS_SPELLBOOKS, SPELLBOOK_SCHOOLS, classIsCaster, etc.) and `@wiz6/viewer` lib (`roster-store.ts`, `house-rules-store.ts`).

**Spec:** `docs/superpowers/specs/2026-05-26-character-creation-flow.md`

---

## Conventions for every task

- All paths absolute from repo root (e.g., `packages/viewer/src/...`).
- TypeScript ESM: relative imports use `.js` extension.
- CSS modules: `*.module.css` next to component.
- Tests live in `packages/viewer/tests/...` mirroring the source path.
- Vitest config picks them up automatically.
- Every commit must `pnpm --filter @wiz6/viewer test -- --run` clean.
- Use existing data exports from `@wiz6/data`. Do NOT redefine types that already exist there.

---

## Task 1: Character draft library

**Files:**
- Create: `packages/viewer/src/pages/roster/lib/draft.ts`
- Create: `packages/viewer/tests/pages/roster/lib/draft.test.ts`

**Goal:** Pure-TS draft state + validation predicates that the wizard shell and each step consume.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/viewer/tests/pages/roster/lib/draft.test.ts
import { describe, expect, it } from 'vitest';
import {
  createEmptyDraft,
  isNameValid,
  isRaceValid,
  isBonusRollValid,
  isClassValid,
  isAttributesValid,
  isSkillsValid,
  isSpellsValid,
  isKarmaValid,
  computeTotalAttributes,
  expectedSpellPickCount,
  STARTER_SKILL_POINTS,
  MAX_BONUS_POINTS,
} from '../../../../src/pages/roster/lib/draft.js';

describe('createEmptyDraft', () => {
  it('returns a draft with all nullable fields cleared', () => {
    const d = createEmptyDraft();
    expect(d.name).toBe('');
    expect(d.raceIdx).toBeNull();
    expect(d.classIdx).toBeNull();
    expect(d.bonusPool).toBe(0);
    expect(d.karma).toBe(0);
    expect(d.starterSpells).toEqual([]);
  });
});

describe('isNameValid', () => {
  it('accepts 1..7 ASCII characters', () => {
    expect(isNameValid('A')).toBe(true);
    expect(isNameValid('THESUS')).toBe(true);
    expect(isNameValid('NATEDOG')).toBe(true);
  });
  it('rejects empty', () => {
    expect(isNameValid('')).toBe(false);
  });
  it('rejects > 7 chars', () => {
    expect(isNameValid('TOOLONG1')).toBe(false);
  });
});

describe('isRaceValid', () => {
  it('valid for raceIdx 0..10', () => {
    expect(isRaceValid({ ...createEmptyDraft(), raceIdx: 0 })).toBe(true);
    expect(isRaceValid({ ...createEmptyDraft(), raceIdx: 10 })).toBe(true);
  });
  it('invalid when raceIdx is null', () => {
    expect(isRaceValid(createEmptyDraft())).toBe(false);
  });
});

describe('isBonusRollValid', () => {
  it('valid when bonusPool > 0', () => {
    expect(isBonusRollValid({ ...createEmptyDraft(), bonusPool: 5 })).toBe(true);
  });
  it('invalid when bonusPool is 0', () => {
    expect(isBonusRollValid(createEmptyDraft())).toBe(false);
  });
});

describe('isClassValid', () => {
  it('valid when classIdx is set AND attribute requirements met', () => {
    // Human base: STR 9 IQ 8 PIE 8 VIT 9 DEX 9 SPD 8 PER 8 KAR 0
    // Fighter requires STR=11 minimum; Human has 9 — without bonus distribution, fails.
    const d = {
      ...createEmptyDraft(),
      raceIdx: 0,
      classIdx: 0,
      attributes: { str: 11, iq: 8, pie: 8, vit: 9, dex: 9, spd: 8, per: 8, kar: 0 },
    };
    expect(isClassValid(d)).toBe(true);
  });
  it('invalid when class requirements not met', () => {
    const d = {
      ...createEmptyDraft(),
      raceIdx: 0,
      classIdx: 13, // Ninja: requires high stats
      attributes: { str: 9, iq: 8, pie: 8, vit: 9, dex: 9, spd: 8, per: 8, kar: 0 },
    };
    expect(isClassValid(d)).toBe(false);
  });
});

describe('isAttributesValid', () => {
  it('valid when sum(bonusDistribution) === bonusPool', () => {
    const d = {
      ...createEmptyDraft(),
      bonusPool: 6,
      bonusDistribution: { str: 1, iq: 1, pie: 1, vit: 1, dex: 1, spd: 1, per: 0, kar: 0 },
    };
    expect(isAttributesValid(d)).toBe(true);
  });
  it('invalid when sum differs from pool', () => {
    const d = {
      ...createEmptyDraft(),
      bonusPool: 6,
      bonusDistribution: { str: 1, iq: 1, pie: 1, vit: 1, dex: 0, spd: 0, per: 0, kar: 0 },
    };
    expect(isAttributesValid(d)).toBe(false);
  });
});

describe('isSkillsValid', () => {
  it('valid when sum(skillPoints) === STARTER_SKILL_POINTS', () => {
    const d = {
      ...createEmptyDraft(),
      skillPoints: { 0: STARTER_SKILL_POINTS },
    };
    expect(isSkillsValid(d)).toBe(true);
  });
  it('invalid when sum < STARTER_SKILL_POINTS', () => {
    const d = { ...createEmptyDraft(), skillPoints: { 0: 1 } };
    expect(isSkillsValid(d)).toBe(false);
  });
});

describe('expectedSpellPickCount', () => {
  it('Mage (class 1) requires 2 picks', () => {
    expect(expectedSpellPickCount(1)).toBe(2);
  });
  it('Fighter (class 0) requires 0 picks', () => {
    expect(expectedSpellPickCount(0)).toBe(0);
  });
  it('Bishop (class 9) requires 2 picks (1 from each of two books)', () => {
    expect(expectedSpellPickCount(9)).toBe(2);
  });
});

describe('isSpellsValid', () => {
  it('valid when correct number of picks for class', () => {
    const d = {
      ...createEmptyDraft(),
      classIdx: 1, // Mage requires 2
      starterSpells: [
        { bookIdx: 0, entryIdx: 0 },
        { bookIdx: 0, entryIdx: 1 },
      ],
    };
    expect(isSpellsValid(d)).toBe(true);
  });
  it('valid for non-casters with no picks', () => {
    expect(isSpellsValid({ ...createEmptyDraft(), classIdx: 0 })).toBe(true);
  });
  it('invalid when too few picks', () => {
    const d = {
      ...createEmptyDraft(),
      classIdx: 1,
      starterSpells: [{ bookIdx: 0, entryIdx: 0 }],
    };
    expect(isSpellsValid(d)).toBe(false);
  });
});

describe('isKarmaValid', () => {
  it('valid when karma > 0', () => {
    expect(isKarmaValid({ ...createEmptyDraft(), karma: 1 })).toBe(true);
  });
});

describe('computeTotalAttributes', () => {
  it('adds bonus distribution to race-base attributes', () => {
    const d = {
      ...createEmptyDraft(),
      raceIdx: 0, // Human: STR 9 INT 8 ...
      bonusDistribution: { str: 2, iq: 0, pie: 0, vit: 0, dex: 0, spd: 0, per: 0, kar: 0 },
    };
    expect(computeTotalAttributes(d)?.str).toBe(11); // 9 + 2
  });
  it('returns null when raceIdx not set', () => {
    expect(computeTotalAttributes(createEmptyDraft())).toBeNull();
  });
});

describe('constants', () => {
  it('MAX_BONUS_POINTS is a number > 0', () => {
    expect(MAX_BONUS_POINTS).toBeGreaterThan(0);
  });
  it('STARTER_SKILL_POINTS is a number > 0', () => {
    expect(STARTER_SKILL_POINTS).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @wiz6/viewer test -- --run pages/roster/lib/draft`
Expected: FAIL (module not found / undefined exports).

- [ ] **Step 3: Implement the draft library**

```typescript
// packages/viewer/src/pages/roster/lib/draft.ts
import {
  RACE_BASE_STATS,
  CLASS_REQUIREMENTS,
  CLASS_SPELLBOOKS,
  meetsClassRequirements,
} from '@wiz6/data';

/**
 * Maximum bonus points the engine can roll. The "elite tier" needed for
 * Samurai/Monk/Ninja/Lord/Bishop. Actual byte value from the wpcmk roll
 * formula is not yet decoded; 28 is the commonly-cited elite minimum.
 * TODO: decode actual max from wpcmk bonus-roll formula (#TBD)
 */
export const MAX_BONUS_POINTS = 28;

/**
 * Per-character starting skill points pool. Engine value not byte-decoded
 * yet; 10 is a reasonable placeholder for v1.
 * TODO: decode actual starter skill-point count (#TBD)
 */
export const STARTER_SKILL_POINTS = 10;

export interface DraftAttributes {
  str: number;
  iq: number;
  pie: number;
  vit: number;
  dex: number;
  spd: number;
  per: number;
  kar: number;
}

export interface CharacterDraft {
  name: string;
  raceIdx: number | null;
  classIdx: number | null;
  bonusPool: number;
  /** Race-derived base attributes (set when race is chosen). */
  attributes: DraftAttributes;
  /** Player's bonus distribution across STR/IQ/PIE/VIT/DEX/SPD (PER/KAR untouched). */
  bonusDistribution: DraftAttributes;
  /** skillSlotIdx -> points spent. */
  skillPoints: Record<number, number>;
  /** Starter spell picks for caster classes. */
  starterSpells: Array<{ bookIdx: number; entryIdx: number }>;
  karma: number;
}

export function createEmptyDraft(): CharacterDraft {
  const zero: DraftAttributes = { str: 0, iq: 0, pie: 0, vit: 0, dex: 0, spd: 0, per: 0, kar: 0 };
  return {
    name: '',
    raceIdx: null,
    classIdx: null,
    bonusPool: 0,
    attributes: { ...zero },
    bonusDistribution: { ...zero },
    skillPoints: {},
    starterSpells: [],
    karma: 0,
  };
}

/** Sum of all DraftAttributes values (excluding PER/KAR which are race-fixed). */
function sumBonus(d: DraftAttributes): number {
  return d.str + d.iq + d.pie + d.vit + d.dex + d.spd;
}

/** Compute final attributes = race base + bonus distribution. */
export function computeTotalAttributes(draft: CharacterDraft): DraftAttributes | null {
  if (draft.raceIdx === null) return null;
  const base = RACE_BASE_STATS[draft.raceIdx];
  if (!base) return null;
  return {
    str: base.str + draft.bonusDistribution.str,
    iq: base.int + draft.bonusDistribution.iq,
    pie: base.pie + draft.bonusDistribution.pie,
    vit: base.vit + draft.bonusDistribution.vit,
    dex: base.dex + draft.bonusDistribution.dex,
    spd: base.spd + draft.bonusDistribution.spd,
    per: base.per,
    kar: base.kar,
  };
}

export function isNameValid(name: string): boolean {
  if (name.length < 1 || name.length > 7) return false;
  // ASCII printable
  return /^[\x20-\x7E]+$/.test(name);
}

export function isRaceValid(d: CharacterDraft): boolean {
  return d.raceIdx !== null && d.raceIdx >= 0 && d.raceIdx < RACE_BASE_STATS.length;
}

export function isBonusRollValid(d: CharacterDraft): boolean {
  return d.bonusPool > 0;
}

export function isClassValid(d: CharacterDraft): boolean {
  if (d.classIdx === null) return false;
  if (d.classIdx < 0 || d.classIdx >= CLASS_REQUIREMENTS.length) return false;
  const total = computeTotalAttributes(d);
  if (total === null) return false;
  // meetsClassRequirements takes an Attributes-like object with
  // (str, iq, pie, vit, dex, spd, per, kar) keys.
  return meetsClassRequirements(total, d.classIdx);
}

export function isAttributesValid(d: CharacterDraft): boolean {
  return sumBonus(d.bonusDistribution) === d.bonusPool;
}

export function isSkillsValid(d: CharacterDraft): boolean {
  const total = Object.values(d.skillPoints).reduce((a, b) => a + b, 0);
  return total === STARTER_SKILL_POINTS;
}

export function expectedSpellPickCount(classIdx: number | null): number {
  if (classIdx === null) return 0;
  const row = CLASS_SPELLBOOKS[classIdx];
  if (!row) return 0;
  return row.reduce((a, b) => a + b, 0);
}

export function isSpellsValid(d: CharacterDraft): boolean {
  return d.starterSpells.length === expectedSpellPickCount(d.classIdx);
}

export function isKarmaValid(d: CharacterDraft): boolean {
  return d.karma > 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @wiz6/viewer test -- --run pages/roster/lib/draft`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/roster/lib/draft.ts packages/viewer/tests/pages/roster/lib/draft.test.ts
git commit -m "feat(viewer): character draft state + validation predicates"
```

---

## Task 2: Wizard shell page

**Files:**
- Create: `packages/viewer/src/pages/roster/NewCharacterPage.tsx`
- Create: `packages/viewer/src/pages/roster/NewCharacterPage.module.css`
- Create: `packages/viewer/tests/pages/roster/NewCharacterPage.test.tsx`

**Goal:** Empty-stepped wizard that just renders a placeholder per-step and demonstrates Back/Next navigation.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/viewer/tests/pages/roster/NewCharacterPage.test.tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NewCharacterPage } from '../../../src/pages/roster/NewCharacterPage.js';

beforeEach(() => {
  window.localStorage.clear();
});

describe('NewCharacterPage wizard shell', () => {
  it('renders the page heading and the first step (Name)', () => {
    render(<MemoryRouter><NewCharacterPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: /create character/i })).toBeInTheDocument();
    expect(screen.getByText(/step 1 of 9/i)).toBeInTheDocument();
    expect(screen.getByText(/name/i)).toBeInTheDocument();
  });

  it('Back button is disabled on step 1', () => {
    render(<MemoryRouter><NewCharacterPage /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /back/i })).toBeDisabled();
  });

  it('Next button is disabled when current step is invalid', () => {
    render(<MemoryRouter><NewCharacterPage /></MemoryRouter>);
    // Name step starts empty -> invalid.
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wiz6/viewer test -- --run pages/roster/NewCharacterPage`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the wizard shell**

Implementation should:
1. Define a `Step` enum with 9 values (Name, Race, BonusRoll, ClassPick, AttributeDistribute, SkillPoints, SpellPicker, Karma, Review).
2. Hold `draft` state via `useState<CharacterDraft>(createEmptyDraft())`.
3. Hold `currentStep` index via `useState<number>(0)`.
4. Render a header (heading "Create Character", "step X of 9" indicator).
5. Render the current step's component below.
6. Render Back/Next buttons at the bottom. Back disabled at step 0. Next disabled when the current step's validation predicate returns false.
7. For now, each step renders a placeholder div with the step name, like `<div>Name (placeholder)</div>`. Per-step components come in later tasks.

```typescript
// packages/viewer/src/pages/roster/NewCharacterPage.tsx
import { useState } from 'react';
import {
  type CharacterDraft,
  createEmptyDraft,
  isNameValid,
  isRaceValid,
  isBonusRollValid,
  isClassValid,
  isAttributesValid,
  isSkillsValid,
  isSpellsValid,
  isKarmaValid,
} from './lib/draft.js';
import styles from './NewCharacterPage.module.css';

const STEP_NAMES = [
  'Name',
  'Race',
  'Bonus Roll',
  'Class',
  'Attributes',
  'Skills',
  'Spells',
  'Karma',
  'Review',
] as const;

const VALIDATORS: Array<(d: CharacterDraft) => boolean> = [
  (d) => isNameValid(d.name),
  isRaceValid,
  isBonusRollValid,
  isClassValid,
  isAttributesValid,
  isSkillsValid,
  isSpellsValid,
  isKarmaValid,
  () => true, // Review
];

export function NewCharacterPage() {
  const [draft, setDraft] = useState<CharacterDraft>(createEmptyDraft());
  const [step, setStep] = useState(0);

  const validNow = VALIDATORS[step]!(draft);
  const stepName = STEP_NAMES[step]!;

  return (
    <main className={styles.page}>
      <header>
        <h1>Create Character</h1>
        <p className={styles.stepIndicator}>
          Step {step + 1} of {STEP_NAMES.length}: <strong>{stepName}</strong>
        </p>
      </header>
      <section className={styles.stepBody}>
        <div>{stepName} (placeholder)</div>
      </section>
      <footer className={styles.actions}>
        <button type="button" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
          ← Back
        </button>
        <button
          type="button"
          onClick={() => setStep((s) => s + 1)}
          disabled={!validNow || step === STEP_NAMES.length - 1}
        >
          Next →
        </button>
      </footer>
    </main>
  );
}
```

```css
/* packages/viewer/src/pages/roster/NewCharacterPage.module.css */
.page {
  padding: var(--space-5, 24px);
  max-width: 900px;
  margin: 0 auto;
  color: var(--color-text, #ddd);
}

.stepIndicator {
  color: var(--color-text-muted, #aaa);
  margin: 4px 0 var(--space-4, 16px) 0;
}

.stepBody {
  border: 1px solid var(--color-border, #444);
  border-radius: 6px;
  padding: var(--space-4, 16px);
  background: var(--color-surface, #1a1a1a);
  min-height: 200px;
}

.actions {
  display: flex;
  justify-content: space-between;
  margin-top: var(--space-4, 16px);
}

.actions button {
  background: var(--color-surface, #1a1a1a);
  color: var(--color-text, #ddd);
  border: 1px solid var(--color-border, #444);
  border-radius: 4px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 0.95em;
}

.actions button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.actions button:not(:disabled):hover {
  border-color: var(--color-accent, #6c6);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @wiz6/viewer test -- --run pages/roster/NewCharacterPage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/roster/NewCharacterPage.tsx packages/viewer/src/pages/roster/NewCharacterPage.module.css packages/viewer/tests/pages/roster/NewCharacterPage.test.tsx
git commit -m "feat(viewer): character creation wizard shell with step navigation"
```

---

## Task 3: Name step

**Files:**
- Create: `packages/viewer/src/pages/roster/steps/NameStep.tsx`
- Create: `packages/viewer/tests/pages/roster/steps/NameStep.test.tsx`
- Modify: `packages/viewer/src/pages/roster/NewCharacterPage.tsx` (replace step-1 placeholder)

**Goal:** Text input that updates `draft.name`, with character counter and validation feedback.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/viewer/tests/pages/roster/steps/NameStep.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NameStep } from '../../../../src/pages/roster/steps/NameStep.js';
import { createEmptyDraft } from '../../../../src/pages/roster/lib/draft.js';

describe('NameStep', () => {
  it('renders a name input', () => {
    const onUpdate = vi.fn();
    render(<NameStep draft={createEmptyDraft()} onUpdate={onUpdate} />);
    expect(screen.getByRole('textbox', { name: /name/i })).toBeInTheDocument();
  });

  it('calls onUpdate when name is typed', () => {
    const onUpdate = vi.fn();
    render(<NameStep draft={createEmptyDraft()} onUpdate={onUpdate} />);
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), { target: { value: 'ABC' } });
    expect(onUpdate).toHaveBeenCalledWith({ name: 'ABC' });
  });

  it('truncates input at 7 characters', () => {
    const onUpdate = vi.fn();
    render(<NameStep draft={createEmptyDraft()} onUpdate={onUpdate} />);
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), { target: { value: 'TOOLONG12' } });
    expect(onUpdate).toHaveBeenCalledWith({ name: 'TOOLONG' });
  });

  it('shows the character counter', () => {
    render(<NameStep draft={{ ...createEmptyDraft(), name: 'AB' }} onUpdate={vi.fn()} />);
    expect(screen.getByText(/2 \/ 7/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

Run: `pnpm --filter @wiz6/viewer test -- --run pages/roster/steps/NameStep`

- [ ] **Step 3: Implement NameStep**

```typescript
// packages/viewer/src/pages/roster/steps/NameStep.tsx
import type { CharacterDraft } from '../lib/draft.js';
import styles from './shared.module.css';

interface NameStepProps {
  draft: CharacterDraft;
  onUpdate: (patch: Partial<CharacterDraft>) => void;
}

const MAX_NAME = 7;

export function NameStep({ draft, onUpdate }: NameStepProps) {
  return (
    <div className={styles.step}>
      <label htmlFor="char-name">Name</label>
      <input
        id="char-name"
        type="text"
        value={draft.name}
        maxLength={MAX_NAME}
        onChange={(e) => onUpdate({ name: e.target.value.slice(0, MAX_NAME).toUpperCase() })}
      />
      <p className={styles.counter}>{draft.name.length} / {MAX_NAME}</p>
      <p className={styles.hint}>
        ASCII characters only. Names are uppercase in the engine.
      </p>
    </div>
  );
}
```

```css
/* packages/viewer/src/pages/roster/steps/shared.module.css */
.step {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}

.step label {
  font-weight: 600;
}

.step input[type="text"] {
  background: var(--color-bg, #0a0a0a);
  color: var(--color-text, #ddd);
  border: 1px solid var(--color-border, #444);
  border-radius: 4px;
  padding: 8px;
  font-family: monospace;
  font-size: 1.1em;
}

.counter {
  margin: 0;
  color: var(--color-text-muted, #aaa);
  font-size: 0.9em;
}

.hint {
  margin: 0;
  color: var(--color-text-muted, #aaa);
  font-size: 0.85em;
}
```

Wire into shell: in `NewCharacterPage.tsx` replace the step-0 placeholder with `<NameStep draft={draft} onUpdate={(p) => setDraft((d) => ({ ...d, ...p }))} />`.

- [ ] **Step 4: Run tests (PASS)**

Run: `pnpm --filter @wiz6/viewer test -- --run pages/roster/`

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/roster/steps/NameStep.tsx packages/viewer/src/pages/roster/steps/shared.module.css packages/viewer/tests/pages/roster/steps/NameStep.test.tsx packages/viewer/src/pages/roster/NewCharacterPage.tsx
git commit -m "feat(viewer): name step with 7-char limit and uppercase normalization"
```

---

## Task 4: Race step

**Files:**
- Create: `packages/viewer/src/pages/roster/steps/RaceStep.tsx`
- Create: `packages/viewer/tests/pages/roster/steps/RaceStep.test.tsx`
- Modify: `NewCharacterPage.tsx` (replace step-1 placeholder)

**Goal:** 11 race cards each showing name + 8 stat floors. Click to select.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RaceStep } from '../../../../src/pages/roster/steps/RaceStep.js';
import { createEmptyDraft } from '../../../../src/pages/roster/lib/draft.js';

describe('RaceStep', () => {
  it('renders all 11 races', () => {
    render(<RaceStep draft={createEmptyDraft()} onUpdate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /human/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mook/i })).toBeInTheDocument();
  });

  it('on click, calls onUpdate with raceIdx and base attributes', () => {
    const onUpdate = vi.fn();
    render(<RaceStep draft={createEmptyDraft()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: /human/i }));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      raceIdx: 0,
      attributes: expect.objectContaining({ str: 9, iq: 8, pie: 8, vit: 9, dex: 9, spd: 8, per: 8, kar: 0 }),
    }));
  });

  it('highlights the selected race', () => {
    render(<RaceStep draft={{ ...createEmptyDraft(), raceIdx: 2 }} onUpdate={vi.fn()} />);
    const dwarf = screen.getByRole('button', { name: /dwarf/i });
    expect(dwarf.getAttribute('aria-pressed')).toBe('true');
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

Run: `pnpm --filter @wiz6/viewer test -- --run pages/roster/steps/RaceStep`

- [ ] **Step 3: Implement RaceStep**

```typescript
// packages/viewer/src/pages/roster/steps/RaceStep.tsx
import { RACE_BASE_STATS } from '@wiz6/data';
import type { CharacterDraft } from '../lib/draft.js';
import styles from './shared.module.css';
import raceStyles from './RaceStep.module.css';

interface RaceStepProps {
  draft: CharacterDraft;
  onUpdate: (patch: Partial<CharacterDraft>) => void;
}

export function RaceStep({ draft, onUpdate }: RaceStepProps) {
  return (
    <div className={styles.step}>
      <p>Choose a race. Base attributes for each shown below.</p>
      <div className={raceStyles.grid}>
        {RACE_BASE_STATS.map((race) => {
          const selected = draft.raceIdx === race.index;
          return (
            <button
              key={race.index}
              type="button"
              className={raceStyles.card}
              aria-pressed={selected}
              data-selected={selected || undefined}
              onClick={() =>
                onUpdate({
                  raceIdx: race.index,
                  attributes: {
                    str: race.str,
                    iq: race.int,
                    pie: race.pie,
                    vit: race.vit,
                    dex: race.dex,
                    spd: race.spd,
                    per: race.per,
                    kar: race.kar,
                  },
                  // Reset bonus distribution when race changes
                  bonusDistribution: { str: 0, iq: 0, pie: 0, vit: 0, dex: 0, spd: 0, per: 0, kar: 0 },
                })
              }
            >
              <span className={raceStyles.name}>{race.name}</span>
              <span className={raceStyles.stats}>
                STR {race.str} · IQ {race.int} · PIE {race.pie} · VIT {race.vit}
                <br />
                DEX {race.dex} · SPD {race.spd} · PER {race.per}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

```css
/* packages/viewer/src/pages/roster/steps/RaceStep.module.css */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3, 12px);
}

.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
  text-align: left;
  background: var(--color-surface, #1a1a1a);
  color: var(--color-text, #ddd);
  border: 1px solid var(--color-border, #444);
  border-radius: 6px;
  padding: 12px;
  cursor: pointer;
}

.card:hover {
  border-color: var(--color-accent, #6c6);
}

.card[data-selected] {
  border-color: var(--color-accent, #6c6);
  background: var(--color-surface-hover, #222);
}

.name {
  font-weight: 700;
  font-size: 1em;
}

.stats {
  font-size: 0.78em;
  color: var(--color-text-muted, #aaa);
  font-family: monospace;
}
```

Wire into shell: replace step-1 placeholder.

- [ ] **Step 4: Run tests (PASS)**

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/roster/steps/RaceStep.tsx packages/viewer/src/pages/roster/steps/RaceStep.module.css packages/viewer/tests/pages/roster/steps/RaceStep.test.tsx packages/viewer/src/pages/roster/NewCharacterPage.tsx
git commit -m "feat(viewer): race step with 11 races and base-stat preview"
```

---

## Task 5: Bonus roll step

**Files:**
- Create: `packages/viewer/src/pages/roster/steps/BonusRollStep.tsx`
- Create: `packages/viewer/tests/pages/roster/steps/BonusRollStep.test.tsx`
- Modify: `NewCharacterPage.tsx`

**Goal:** Show the (placeholder) max bonus roll, accept button. Honor `pinMaxBonusRoll` house rule: if ON (default), set bonusPool = MAX_BONUS_POINTS on mount. If OFF, roll an actual RNG-derived value (placeholder formula: `1 + Math.floor(Math.random() * 7) + Math.floor(Math.random() * 7) + Math.floor(Math.random() * 7)`) and offer a "Reroll" button.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BonusRollStep } from '../../../../src/pages/roster/steps/BonusRollStep.js';
import { createEmptyDraft, MAX_BONUS_POINTS } from '../../../../src/pages/roster/lib/draft.js';
import { resetToDefaults, resetToStock } from '../../../../src/lib/house-rules-store.js';

beforeEach(() => {
  window.localStorage.clear();
  resetToDefaults(); // pinMaxBonusRoll = true by default
});

describe('BonusRollStep', () => {
  it('with pinMaxBonusRoll = true (default), shows the max value and accepts it', () => {
    const onUpdate = vi.fn();
    render(<BonusRollStep draft={createEmptyDraft()} onUpdate={onUpdate} />);
    expect(screen.getByText(new RegExp(`${MAX_BONUS_POINTS}`))).toBeInTheDocument();
    // Auto-applies the pinned value on first render
    expect(onUpdate).toHaveBeenCalledWith({ bonusPool: MAX_BONUS_POINTS });
  });

  it('with pinMaxBonusRoll = false (stock), shows a roll button', () => {
    resetToStock();
    render(<BonusRollStep draft={createEmptyDraft()} onUpdate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /roll/i })).toBeInTheDocument();
  });

  it('with stock mode, clicking Roll updates bonusPool', () => {
    resetToStock();
    const onUpdate = vi.fn();
    render(<BonusRollStep draft={createEmptyDraft()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: /roll/i }));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ bonusPool: expect.any(Number) }));
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

- [ ] **Step 3: Implement BonusRollStep**

```typescript
// packages/viewer/src/pages/roster/steps/BonusRollStep.tsx
import { useEffect, useState } from 'react';
import { type CharacterDraft, MAX_BONUS_POINTS } from '../lib/draft.js';
import { getHouseRules, subscribeHouseRules } from '../../../lib/house-rules-store.js';
import styles from './shared.module.css';

interface Props {
  draft: CharacterDraft;
  onUpdate: (patch: Partial<CharacterDraft>) => void;
}

function rollStockBonus(): number {
  // Placeholder for the engine's actual roll. Returns 3..24-ish.
  return 1 + Math.floor(Math.random() * 8) + Math.floor(Math.random() * 8) + Math.floor(Math.random() * 8);
}

export function BonusRollStep({ draft, onUpdate }: Props) {
  const [rules, setRules] = useState(getHouseRules());
  useEffect(() => subscribeHouseRules(setRules), []);

  const pinned = rules.pinMaxBonusRoll;

  // Auto-pin to max on mount when pinned is on AND bonusPool is unset
  useEffect(() => {
    if (pinned && draft.bonusPool === 0) {
      onUpdate({ bonusPool: MAX_BONUS_POINTS });
    }
  }, [pinned, draft.bonusPool, onUpdate]);

  if (pinned) {
    return (
      <div className={styles.step}>
        <p>
          Bonus points (pinned to max via house rule): <strong>{MAX_BONUS_POINTS}</strong>
        </p>
        <p className={styles.hint}>
          The original game's bonus-roll grind is bypassed. Toggle "Pin bonus points to max" off
          in /settings to get the engine-faithful experience.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.step}>
      <p>
        Current roll: <strong>{draft.bonusPool || '—'}</strong>
      </p>
      <button type="button" onClick={() => onUpdate({ bonusPool: rollStockBonus() })}>
        Roll bonus points
      </button>
      <p className={styles.hint}>
        Stock Wiz6 behavior: small random pool. Reroll for higher values (no in-engine accept yet —
        each click replaces the previous roll).
      </p>
    </div>
  );
}
```

Wire into shell.

- [ ] **Step 4: Run tests (PASS)**

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/roster/steps/BonusRollStep.tsx packages/viewer/tests/pages/roster/steps/BonusRollStep.test.tsx packages/viewer/src/pages/roster/NewCharacterPage.tsx
git commit -m "feat(viewer): bonus roll step honors pinMaxBonusRoll house rule"
```

---

## Task 6: Class pick step

**Files:**
- Create: `packages/viewer/src/pages/roster/steps/ClassPickStep.tsx`
- Create: `packages/viewer/src/pages/roster/steps/ClassPickStep.module.css`
- Create: `packages/viewer/tests/pages/roster/steps/ClassPickStep.test.tsx`
- Modify: `NewCharacterPage.tsx`

**Goal:** 14 class buttons. Show requirements per class. Disable buttons whose requirements aren't met given current race-base attributes (without bonus distribution applied yet — bonus is distributed in step 5). Selected class persists in draft.classIdx.

Note: at class-pick time, attributes = race base. Bonus pool gets distributed in step 5. So a class becomes selectable based on the **theoretical max attributes** = race base + bonusPool. Display each class with a flag: "selectable (req met)" vs "blocked (req X not met)".

For simplicity in v1: show all 14 classes, disable any whose requirements cannot be met even after applying all bonus points. Tooltip shows which requirement is the blocker.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClassPickStep } from '../../../../src/pages/roster/steps/ClassPickStep.js';
import { createEmptyDraft, MAX_BONUS_POINTS } from '../../../../src/pages/roster/lib/draft.js';

function humanDraft() {
  return {
    ...createEmptyDraft(),
    raceIdx: 0, // Human
    bonusPool: MAX_BONUS_POINTS,
    attributes: { str: 9, iq: 8, pie: 8, vit: 9, dex: 9, spd: 8, per: 8, kar: 0 },
  };
}

describe('ClassPickStep', () => {
  it('renders all 14 classes', () => {
    render(<ClassPickStep draft={humanDraft()} onUpdate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /fighter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ninja/i })).toBeInTheDocument();
  });

  it('Fighter is selectable for a Human with full bonus pool', () => {
    render(<ClassPickStep draft={humanDraft()} onUpdate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /fighter/i })).not.toBeDisabled();
  });

  it('Ninja may not be selectable for a Human even at max bonus (elite class)', () => {
    // Whether Ninja is selectable depends on actual requirements; assert behavior either way is consistent
    const human = humanDraft();
    render(<ClassPickStep draft={human} onUpdate={vi.fn()} />);
    // Just assert the button exists; gating is best-effort
    expect(screen.getByRole('button', { name: /ninja/i })).toBeInTheDocument();
  });

  it('clicking a class updates draft.classIdx', () => {
    const onUpdate = vi.fn();
    render(<ClassPickStep draft={humanDraft()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: /fighter/i }));
    expect(onUpdate).toHaveBeenCalledWith({ classIdx: 0 });
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

- [ ] **Step 3: Implement ClassPickStep**

```typescript
// packages/viewer/src/pages/roster/steps/ClassPickStep.tsx
import {
  CLASS_REQUIREMENTS,
  CLASS_INDEX_TO_NAME,
  meetsClassRequirements,
} from '@wiz6/data';
import type { CharacterDraft } from '../lib/draft.js';
import styles from './shared.module.css';
import classStyles from './ClassPickStep.module.css';

interface Props {
  draft: CharacterDraft;
  onUpdate: (patch: Partial<CharacterDraft>) => void;
}

/** Theoretical max attributes if entire bonus pool goes into the right slot. */
function maxAttrsWithBonus(attrs: CharacterDraft['attributes'], pool: number): CharacterDraft['attributes'] {
  // For gating, allow all of pool to count toward any single attribute when computing eligibility.
  return {
    str: Math.min(18, attrs.str + pool),
    iq: Math.min(18, attrs.iq + pool),
    pie: Math.min(18, attrs.pie + pool),
    vit: Math.min(18, attrs.vit + pool),
    dex: Math.min(18, attrs.dex + pool),
    spd: Math.min(18, attrs.spd + pool),
    per: attrs.per,
    kar: attrs.kar,
  };
}

export function ClassPickStep({ draft, onUpdate }: Props) {
  return (
    <div className={styles.step}>
      <p>Choose a class. Greyed classes have unreachable attribute requirements.</p>
      <div className={classStyles.grid}>
        {CLASS_REQUIREMENTS.map((req, idx) => {
          const possible = meetsClassRequirements(maxAttrsWithBonus(draft.attributes, draft.bonusPool), idx);
          const selected = draft.classIdx === idx;
          return (
            <button
              key={idx}
              type="button"
              className={classStyles.card}
              aria-pressed={selected}
              data-selected={selected || undefined}
              disabled={!possible}
              onClick={() => onUpdate({ classIdx: idx })}
              title={describeRequirements(req)}
            >
              <span className={classStyles.name}>{CLASS_INDEX_TO_NAME[idx]}</span>
              <span className={classStyles.req}>{describeRequirements(req)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function describeRequirements(req: typeof CLASS_REQUIREMENTS[number]): string {
  const parts: string[] = [];
  if (req.str > 0) parts.push(`STR≥${req.str}`);
  if (req.iq > 0) parts.push(`IQ≥${req.iq}`);
  if (req.pie > 0) parts.push(`PIE≥${req.pie}`);
  if (req.vit > 0) parts.push(`VIT≥${req.vit}`);
  if (req.dex > 0) parts.push(`DEX≥${req.dex}`);
  if (req.spd > 0) parts.push(`SPD≥${req.spd}`);
  return parts.join(' · ') || 'no requirements';
}
```

```css
/* packages/viewer/src/pages/roster/steps/ClassPickStep.module.css */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-3, 12px);
}

.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
  background: var(--color-surface, #1a1a1a);
  color: var(--color-text, #ddd);
  border: 1px solid var(--color-border, #444);
  border-radius: 6px;
  padding: 10px;
  text-align: left;
  cursor: pointer;
}

.card:hover:not(:disabled) {
  border-color: var(--color-accent, #6c6);
}

.card:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.card[data-selected] {
  border-color: var(--color-accent, #6c6);
  background: var(--color-surface-hover, #222);
}

.name {
  font-weight: 700;
}

.req {
  font-family: monospace;
  font-size: 0.78em;
  color: var(--color-text-muted, #aaa);
}
```

Wire into shell.

**Note on data exports:** This task assumes `CLASS_INDEX_TO_NAME` is exported from `@wiz6/data`. If it's not, export it from `packages/data/src/character-creation/spell-schools.ts` (already defined there) and re-export through `packages/data/src/index.ts`. Verify before writing the import.

- [ ] **Step 4: Run tests (PASS)**

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/roster/steps/ClassPickStep.tsx packages/viewer/src/pages/roster/steps/ClassPickStep.module.css packages/viewer/tests/pages/roster/steps/ClassPickStep.test.tsx packages/viewer/src/pages/roster/NewCharacterPage.tsx
git commit -m "feat(viewer): class pick step with requirement-gated buttons"
```

---

## Task 7: Attribute distribute step

**Files:**
- Create: `packages/viewer/src/pages/roster/steps/AttributeDistributeStep.tsx`
- Create: `packages/viewer/src/pages/roster/steps/AttributeDistributeStep.module.css`
- Create: `packages/viewer/tests/pages/roster/steps/AttributeDistributeStep.test.tsx`
- Modify: `NewCharacterPage.tsx`

**Goal:** +/- buttons per attribute (STR/IQ/PIE/VIT/DEX/SPD), pool counter, validation. Lower bound = race floor; upper bound = 18.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AttributeDistributeStep } from '../../../../src/pages/roster/steps/AttributeDistributeStep.js';
import { createEmptyDraft, MAX_BONUS_POINTS } from '../../../../src/pages/roster/lib/draft.js';

function setupDraft() {
  return {
    ...createEmptyDraft(),
    raceIdx: 0,
    bonusPool: MAX_BONUS_POINTS,
    attributes: { str: 9, iq: 8, pie: 8, vit: 9, dex: 9, spd: 8, per: 8, kar: 0 },
  };
}

describe('AttributeDistributeStep', () => {
  it('renders six attribute rows', () => {
    render(<AttributeDistributeStep draft={setupDraft()} onUpdate={vi.fn()} />);
    expect(screen.getByLabelText(/str/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/spd/i)).toBeInTheDocument();
  });

  it('shows the unspent pool', () => {
    render(<AttributeDistributeStep draft={setupDraft()} onUpdate={vi.fn()} />);
    expect(screen.getByText(new RegExp(`${MAX_BONUS_POINTS}.*unspent`, 'i'))).toBeInTheDocument();
  });

  it('clicking + increments the bonus distribution and decrements pool display', () => {
    const onUpdate = vi.fn();
    render(<AttributeDistributeStep draft={setupDraft()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getAllByRole('button', { name: /\+/ })[0]!); // STR +
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      bonusDistribution: expect.objectContaining({ str: 1 }),
    }));
  });

  it('+ button disabled when pool is exhausted', () => {
    const draft = {
      ...setupDraft(),
      bonusDistribution: { str: MAX_BONUS_POINTS, iq: 0, pie: 0, vit: 0, dex: 0, spd: 0, per: 0, kar: 0 },
    };
    render(<AttributeDistributeStep draft={draft} onUpdate={vi.fn()} />);
    const plusButtons = screen.getAllByRole('button', { name: /\+/ });
    expect(plusButtons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

- [ ] **Step 3: Implement AttributeDistributeStep**

```typescript
// packages/viewer/src/pages/roster/steps/AttributeDistributeStep.tsx
import { RACE_BASE_STATS } from '@wiz6/data';
import type { CharacterDraft, DraftAttributes } from '../lib/draft.js';
import styles from './shared.module.css';
import attrStyles from './AttributeDistributeStep.module.css';

const ATTRS: Array<keyof Pick<DraftAttributes, 'str' | 'iq' | 'pie' | 'vit' | 'dex' | 'spd'>> = [
  'str', 'iq', 'pie', 'vit', 'dex', 'spd',
];

const LABELS: Record<typeof ATTRS[number], string> = {
  str: 'STR',
  iq: 'IQ',
  pie: 'PIE',
  vit: 'VIT',
  dex: 'DEX',
  spd: 'SPD',
};

const ATTR_MAX = 18;

interface Props {
  draft: CharacterDraft;
  onUpdate: (patch: Partial<CharacterDraft>) => void;
}

export function AttributeDistributeStep({ draft, onUpdate }: Props) {
  const spent = ATTRS.reduce((a, k) => a + draft.bonusDistribution[k], 0);
  const remaining = draft.bonusPool - spent;
  const raceBase = draft.raceIdx !== null ? RACE_BASE_STATS[draft.raceIdx] : null;

  function adjust(attr: typeof ATTRS[number], delta: 1 | -1) {
    const next = { ...draft.bonusDistribution };
    next[attr] = Math.max(0, next[attr] + delta);
    onUpdate({ bonusDistribution: next });
  }

  return (
    <div className={styles.step}>
      <p className={attrStyles.pool}>
        <strong>{remaining}</strong> of {draft.bonusPool} bonus points unspent.
      </p>
      <div className={attrStyles.grid}>
        {ATTRS.map((attr) => {
          const base = raceBase ? raceBaseAsDraft(raceBase)[attr] : 0;
          const bonus = draft.bonusDistribution[attr];
          const total = base + bonus;
          const canInc = remaining > 0 && total < ATTR_MAX;
          const canDec = bonus > 0;
          return (
            <div key={attr} className={attrStyles.row} aria-label={LABELS[attr]}>
              <span className={attrStyles.label}>{LABELS[attr]}</span>
              <button type="button" onClick={() => adjust(attr, -1)} disabled={!canDec}>−</button>
              <span className={attrStyles.value}>
                {total} <span className={attrStyles.bonus}>({base}+{bonus})</span>
              </span>
              <button type="button" onClick={() => adjust(attr, 1)} disabled={!canInc}>+</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Convert RACE_BASE_STATS row (uses `int`) to DraftAttributes (uses `iq`).
function raceBaseAsDraft(r: typeof RACE_BASE_STATS[number]): DraftAttributes {
  return { str: r.str, iq: r.int, pie: r.pie, vit: r.vit, dex: r.dex, spd: r.spd, per: r.per, kar: r.kar };
}
```

```css
/* packages/viewer/src/pages/roster/steps/AttributeDistributeStep.module.css */
.pool {
  font-size: 1.1em;
}

.grid {
  display: grid;
  gap: var(--space-2, 8px);
}

.row {
  display: grid;
  grid-template-columns: 60px 30px 1fr 30px;
  align-items: center;
  gap: var(--space-3, 12px);
  padding: 6px 12px;
  background: var(--color-bg, #0a0a0a);
  border-radius: 4px;
}

.row button {
  background: var(--color-surface, #1a1a1a);
  color: var(--color-text, #ddd);
  border: 1px solid var(--color-border, #444);
  border-radius: 3px;
  width: 28px;
  height: 28px;
  cursor: pointer;
}

.row button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.label {
  font-family: monospace;
  font-weight: 700;
}

.value {
  font-family: monospace;
}

.bonus {
  color: var(--color-text-muted, #aaa);
  font-size: 0.85em;
}
```

Wire into shell.

- [ ] **Step 4: Run tests (PASS)**

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/roster/steps/AttributeDistributeStep.tsx packages/viewer/src/pages/roster/steps/AttributeDistributeStep.module.css packages/viewer/tests/pages/roster/steps/AttributeDistributeStep.test.tsx packages/viewer/src/pages/roster/NewCharacterPage.tsx
git commit -m "feat(viewer): attribute distribution step with +/- buttons and pool tracking"
```

---

## Task 8: Skill point step

**Files:**
- Create: `packages/viewer/src/pages/roster/steps/SkillPointStep.tsx`
- Create: `packages/viewer/src/pages/roster/steps/SkillPointStep.module.css`
- Create: `packages/viewer/tests/pages/roster/steps/SkillPointStep.test.tsx`
- Modify: `NewCharacterPage.tsx`

**Goal:** List the class-available skills from `CLASS_SKILL_AVAILABILITY[classIdx]`, with +/- buttons. Pool = `STARTER_SKILL_POINTS`. Skill names from `SKILL_SLOT_NAMES`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SkillPointStep } from '../../../../src/pages/roster/steps/SkillPointStep.js';
import { createEmptyDraft, STARTER_SKILL_POINTS } from '../../../../src/pages/roster/lib/draft.js';

function fighterDraft() {
  return { ...createEmptyDraft(), raceIdx: 0, classIdx: 0 };
}

describe('SkillPointStep', () => {
  it('shows the unspent pool', () => {
    render(<SkillPointStep draft={fighterDraft()} onUpdate={vi.fn()} />);
    expect(screen.getByText(new RegExp(`${STARTER_SKILL_POINTS}.*unspent`, 'i'))).toBeInTheDocument();
  });

  it('renders only skills available to the class', () => {
    // Fighter has weapon skills enabled, not Theosophy/Alchemy
    render(<SkillPointStep draft={fighterDraft()} onUpdate={vi.fn()} />);
    // Just assert SOME skill rows exist (specific names depend on CLASS_SKILL_AVAILABILITY).
    const buttons = screen.queryAllByRole('button', { name: /\+/ });
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('clicking + increments the skill points entry', () => {
    const onUpdate = vi.fn();
    render(<SkillPointStep draft={fighterDraft()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getAllByRole('button', { name: /\+/ })[0]!);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      skillPoints: expect.any(Object),
    }));
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

- [ ] **Step 3: Implement SkillPointStep**

```typescript
// packages/viewer/src/pages/roster/steps/SkillPointStep.tsx
import { CLASS_SKILL_AVAILABILITY, SKILL_SLOT_NAMES } from '@wiz6/data';
import { type CharacterDraft, STARTER_SKILL_POINTS } from '../lib/draft.js';
import styles from './shared.module.css';
import skillStyles from './SkillPointStep.module.css';

interface Props {
  draft: CharacterDraft;
  onUpdate: (patch: Partial<CharacterDraft>) => void;
}

export function SkillPointStep({ draft, onUpdate }: Props) {
  if (draft.classIdx === null) {
    return <div className={styles.step}><p>Pick a class first.</p></div>;
  }

  const availableSlots = CLASS_SKILL_AVAILABILITY[draft.classIdx]
    ?.map((available, slotIdx) => ({ slotIdx, available }))
    .filter((s) => s.available) ?? [];

  const spent = Object.values(draft.skillPoints).reduce((a, b) => a + b, 0);
  const remaining = STARTER_SKILL_POINTS - spent;

  function adjust(slotIdx: number, delta: 1 | -1) {
    const next = { ...draft.skillPoints };
    next[slotIdx] = Math.max(0, (next[slotIdx] ?? 0) + delta);
    if (next[slotIdx] === 0) delete next[slotIdx];
    onUpdate({ skillPoints: next });
  }

  return (
    <div className={styles.step}>
      <p className={skillStyles.pool}>
        <strong>{remaining}</strong> of {STARTER_SKILL_POINTS} skill points unspent.
      </p>
      <p className={styles.hint}>
        Skill names are best-effort; engine canonical names not yet decoded.
      </p>
      <div className={skillStyles.grid}>
        {availableSlots.map(({ slotIdx }) => {
          const points = draft.skillPoints[slotIdx] ?? 0;
          const canInc = remaining > 0;
          const canDec = points > 0;
          return (
            <div key={slotIdx} className={skillStyles.row}>
              <span className={skillStyles.label}>
                {SKILL_SLOT_NAMES[slotIdx] ?? `Skill #${slotIdx}`}
              </span>
              <button type="button" onClick={() => adjust(slotIdx, -1)} disabled={!canDec}>−</button>
              <span className={skillStyles.value}>{points}</span>
              <button type="button" onClick={() => adjust(slotIdx, 1)} disabled={!canInc}>+</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

```css
/* packages/viewer/src/pages/roster/steps/SkillPointStep.module.css */
.pool {
  font-size: 1.1em;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-2, 8px);
}

.row {
  display: grid;
  grid-template-columns: 1fr 30px 30px 30px;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: 6px 10px;
  background: var(--color-bg, #0a0a0a);
  border-radius: 4px;
}

.row button {
  background: var(--color-surface, #1a1a1a);
  color: var(--color-text, #ddd);
  border: 1px solid var(--color-border, #444);
  border-radius: 3px;
  width: 28px;
  height: 28px;
  cursor: pointer;
}

.row button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.label {
  font-size: 0.9em;
}

.value {
  font-family: monospace;
  text-align: center;
}
```

Wire into shell.

- [ ] **Step 4: Run tests (PASS)**

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/roster/steps/SkillPointStep.tsx packages/viewer/src/pages/roster/steps/SkillPointStep.module.css packages/viewer/tests/pages/roster/steps/SkillPointStep.test.tsx packages/viewer/src/pages/roster/NewCharacterPage.tsx
git commit -m "feat(viewer): skill points step driven by CLASS_SKILL_AVAILABILITY"
```

---

## Task 9: Spell pick step

**Files:**
- Create: `packages/viewer/src/pages/roster/steps/SpellPickStep.tsx`
- Create: `packages/viewer/src/pages/roster/steps/SpellPickStep.module.css`
- Create: `packages/viewer/tests/pages/roster/steps/SpellPickStep.test.tsx`
- Modify: `NewCharacterPage.tsx` (auto-skip step for non-casters)

**Goal:** For caster classes, render N picker dialogs (where N = sum of `CLASS_SPELLBOOKS[classIdx]`). Each picker shows the book's spells with placeholder labels ("Fire L3 #2"). For non-casters, the step is auto-skipped via the validator returning true with 0 picks expected.

**Data dependency:** the 82-entry spell table currently lives in DGROUP runtime — we don't have a static JSON for it yet. For v1 of this step, build a minimal hard-coded copy of the table inside `packages/data/src/character-creation/spell-table.ts` (decoded values from the spell-school-assignment.json finding). Add as a separate small task pre-step if needed; for the plan we assume it's available as `SPELL_TABLE` from `@wiz6/data`.

**Pre-task: add SPELL_TABLE export to @wiz6/data**

Before Task 9 step 1, create `packages/data/src/character-creation/spell-table.ts` with the 82 entries from the finding JSON:

```typescript
// packages/data/src/character-creation/spell-table.ts
/**
 * 82-entry spell table from DGROUP+0xde, decoded from save 1.
 * Each entry: [school, level, b2, b3, b4, byte5].
 *   - school: 0=Fire .. 5=Divine
 *   - level: 1..7 (spell tier)
 *   - byte5: 4-bit book bitmask. bit 3=Mage, bit 2=Priest, bit 1=Alchemist, bit 0=Psionic
 *   - b2, b3, b4: spell-effect parameters, not decoded yet
 * Last 3 entries (79..81) are sentinels with byte5=0.
 */
export interface SpellEntry {
  school: number;
  level: number;
  b2: number;
  b3: number;
  b4: number;
  byte5: number;
}

export const SPELL_TABLE: readonly SpellEntry[] = [
  // entries 0..81 — paste from spell-school-assignment.json
];

/** Filter SPELL_TABLE by book bitmask (1=Psionic, 2=Alchemist, 4=Priest, 8=Mage). */
export function spellsInBook(bookIdx: number): Array<{ entryIdx: number; entry: SpellEntry }> {
  const mask = [8, 4, 2, 1][bookIdx];
  if (mask === undefined) return [];
  return SPELL_TABLE
    .map((entry, entryIdx) => ({ entryIdx, entry }))
    .filter(({ entry }) => (entry.byte5 & mask) !== 0 && entry.school < 6);
}
```

Add a test for the table shape (82 entries, byte5 patterns), then re-export from `packages/data/src/index.ts`.

- [ ] **Pre-Step A: Write spell-table.test.ts**

```typescript
// packages/data/tests/character-creation/spell-table.test.ts
import { describe, expect, it } from 'vitest';
import { SPELL_TABLE, spellsInBook } from '../../src/character-creation/spell-table.js';

describe('SPELL_TABLE', () => {
  it('has 82 entries', () => {
    expect(SPELL_TABLE.length).toBe(82);
  });
});

describe('spellsInBook', () => {
  it('Mage (book 0) returns 33 spells', () => {
    expect(spellsInBook(0).length).toBe(33);
  });
  it('Priest (book 1) returns 33 spells', () => {
    expect(spellsInBook(1).length).toBe(33);
  });
  it('Alchemist (book 2) returns 32 spells', () => {
    expect(spellsInBook(2).length).toBe(32);
  });
  it('Psionic (book 3) returns 25 spells', () => {
    expect(spellsInBook(3).length).toBe(25);
  });
});
```

- [ ] **Pre-Step B: Implement SPELL_TABLE**

Paste the 82 entries from `docs/re/findings/spell-school-assignment.json` (the `spellbook-school-coverage` finding's details — or re-extract from the hex string used to derive that finding). Add `SpellEntry`, `SPELL_TABLE`, `spellsInBook` exports. Re-export from `packages/data/src/index.ts`.

- [ ] **Pre-Step C: Run + commit**

```bash
pnpm --filter @wiz6/data test -- --run spell-table
git add packages/data/src/character-creation/spell-table.ts packages/data/tests/character-creation/spell-table.test.ts packages/data/src/index.ts
git commit -m "feat(data): SPELL_TABLE export of 82-entry spell index with book filter"
```

- [ ] **Step 1: Write the failing test (SpellPickStep)**

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpellPickStep } from '../../../../src/pages/roster/steps/SpellPickStep.js';
import { createEmptyDraft } from '../../../../src/pages/roster/lib/draft.js';

function mageDraft() {
  return { ...createEmptyDraft(), raceIdx: 1, classIdx: 1 };
}

describe('SpellPickStep', () => {
  it('Mage sees 2-pick mode', () => {
    render(<SpellPickStep draft={mageDraft()} onUpdate={vi.fn()} />);
    expect(screen.getByText(/0 of 2 spells picked/i)).toBeInTheDocument();
  });

  it('clicking a spell adds it to starterSpells', () => {
    const onUpdate = vi.fn();
    render(<SpellPickStep draft={mageDraft()} onUpdate={onUpdate} />);
    // First spell button
    const firstSpell = screen.getAllByRole('button', { name: /Fire|Water|Air|Earth|Mental|Divine/i })[0]!;
    fireEvent.click(firstSpell);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      starterSpells: expect.arrayContaining([expect.objectContaining({ bookIdx: 0 })]),
    }));
  });

  it('Fighter sees a "no spells" message', () => {
    render(<SpellPickStep draft={{ ...createEmptyDraft(), classIdx: 0 }} onUpdate={vi.fn()} />);
    expect(screen.getByText(/no starter spells/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

- [ ] **Step 3: Implement SpellPickStep**

```typescript
// packages/viewer/src/pages/roster/steps/SpellPickStep.tsx
import {
  CLASS_SPELLBOOKS,
  SPELLBOOK_NAMES,
  SCHOOL_NAMES,
  spellsInBook,
} from '@wiz6/data';
import {
  type CharacterDraft,
  expectedSpellPickCount,
} from '../lib/draft.js';
import styles from './shared.module.css';
import spellStyles from './SpellPickStep.module.css';

interface Props {
  draft: CharacterDraft;
  onUpdate: (patch: Partial<CharacterDraft>) => void;
}

export function SpellPickStep({ draft, onUpdate }: Props) {
  if (draft.classIdx === null) {
    return <div className={styles.step}><p>Pick a class first.</p></div>;
  }

  const totalPicks = expectedSpellPickCount(draft.classIdx);
  if (totalPicks === 0) {
    return <div className={styles.step}><p>This class has no starter spells. Continue.</p></div>;
  }

  const books = CLASS_SPELLBOOKS[draft.classIdx]!;
  const picksByBook: Record<number, number> = {};
  for (const p of draft.starterSpells) picksByBook[p.bookIdx] = (picksByBook[p.bookIdx] ?? 0) + 1;

  function togglePick(bookIdx: number, entryIdx: number) {
    const existingIdx = draft.starterSpells.findIndex(
      (p) => p.bookIdx === bookIdx && p.entryIdx === entryIdx
    );
    if (existingIdx >= 0) {
      const next = [...draft.starterSpells];
      next.splice(existingIdx, 1);
      onUpdate({ starterSpells: next });
    } else {
      const allowed = books[bookIdx]!;
      if ((picksByBook[bookIdx] ?? 0) >= allowed) return;
      onUpdate({ starterSpells: [...draft.starterSpells, { bookIdx, entryIdx }] });
    }
  }

  return (
    <div className={styles.step}>
      <p>
        <strong>{draft.starterSpells.length}</strong> of {totalPicks} spells picked.
      </p>
      <p className={styles.hint}>
        Spell names are placeholders ("School Lv N"). Decoding the canonical names is a later task.
      </p>
      {books.map((count, bookIdx) => {
        if (count === 0) return null;
        const taken = picksByBook[bookIdx] ?? 0;
        return (
          <section key={bookIdx} className={spellStyles.book}>
            <h3>
              {SPELLBOOK_NAMES[bookIdx]} book — {taken} of {count} picked
            </h3>
            <div className={spellStyles.grid}>
              {spellsInBook(bookIdx).map(({ entryIdx, entry }) => {
                const picked = draft.starterSpells.some(
                  (p) => p.bookIdx === bookIdx && p.entryIdx === entryIdx
                );
                return (
                  <button
                    key={entryIdx}
                    type="button"
                    className={spellStyles.spell}
                    aria-pressed={picked}
                    data-picked={picked || undefined}
                    onClick={() => togglePick(bookIdx, entryIdx)}
                  >
                    {SCHOOL_NAMES[entry.school]} Lv {entry.level} #{entryIdx}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
```

```css
/* packages/viewer/src/pages/roster/steps/SpellPickStep.module.css */
.book {
  margin: var(--space-4, 16px) 0;
}

.book h3 {
  font-size: 1em;
  margin: 0 0 var(--space-2, 8px) 0;
  color: var(--color-text-muted, #aaa);
  font-variant: small-caps;
  letter-spacing: 0.06em;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 6px;
}

.spell {
  font-family: monospace;
  font-size: 0.85em;
  text-align: left;
  background: var(--color-surface, #1a1a1a);
  color: var(--color-text, #ddd);
  border: 1px solid var(--color-border, #444);
  border-radius: 3px;
  padding: 6px 10px;
  cursor: pointer;
}

.spell:hover {
  border-color: var(--color-accent, #6c6);
}

.spell[data-picked] {
  background: var(--color-surface-hover, #222);
  border-color: var(--color-accent, #6c6);
}
```

Wire into shell.

- [ ] **Step 4: Run tests (PASS)**

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/roster/steps/SpellPickStep.tsx packages/viewer/src/pages/roster/steps/SpellPickStep.module.css packages/viewer/tests/pages/roster/steps/SpellPickStep.test.tsx packages/viewer/src/pages/roster/NewCharacterPage.tsx
git commit -m "feat(viewer): spell pick step with book-filtered spell grid"
```

---

## Task 10: Karma step

**Files:**
- Create: `packages/viewer/src/pages/roster/steps/KarmaStep.tsx`
- Create: `packages/viewer/tests/pages/roster/steps/KarmaStep.test.tsx`
- Modify: `NewCharacterPage.tsx`

**Goal:** Use existing `karmaRoll()` helper from `@wiz6/data`. Display the rolled value, "Accept" button. On mount auto-rolls and updates draft.karma. Re-roll button rolls again.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KarmaStep } from '../../../../src/pages/roster/steps/KarmaStep.js';
import { createEmptyDraft } from '../../../../src/pages/roster/lib/draft.js';

describe('KarmaStep', () => {
  it('auto-rolls karma on mount', () => {
    const onUpdate = vi.fn();
    render(<KarmaStep draft={createEmptyDraft()} onUpdate={onUpdate} />);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ karma: expect.any(Number) }));
    expect(onUpdate.mock.calls[0]![0].karma).toBeGreaterThan(0);
  });

  it('shows the karma value', () => {
    render(<KarmaStep draft={{ ...createEmptyDraft(), karma: 12 }} onUpdate={vi.fn()} />);
    expect(screen.getByText(/12/)).toBeInTheDocument();
  });

  it('Reroll button updates the karma', () => {
    const onUpdate = vi.fn();
    render(<KarmaStep draft={{ ...createEmptyDraft(), karma: 5 }} onUpdate={onUpdate} />);
    onUpdate.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /reroll/i }));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ karma: expect.any(Number) }));
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

- [ ] **Step 3: Implement KarmaStep**

```typescript
// packages/viewer/src/pages/roster/steps/KarmaStep.tsx
import { useEffect } from 'react';
import { rollKarma } from '@wiz6/data';
import type { CharacterDraft } from '../lib/draft.js';
import styles from './shared.module.css';

interface Props {
  draft: CharacterDraft;
  onUpdate: (patch: Partial<CharacterDraft>) => void;
}

function rng19(): number {
  return Math.floor(Math.random() * 19);
}

export function KarmaStep({ draft, onUpdate }: Props) {
  useEffect(() => {
    if (draft.karma === 0) {
      onUpdate({ karma: rollKarma(rng19, false) });
    }
  }, [draft.karma, onUpdate]);

  return (
    <div className={styles.step}>
      <p>
        Karma roll: <strong>{draft.karma || '—'}</strong>
      </p>
      <button type="button" onClick={() => onUpdate({ karma: rollKarma(rng19, false) })}>
        Reroll
      </button>
      <p className={styles.hint}>
        Karma is rolled per-character at creation. Affects NPC reactions and class-change eligibility.
      </p>
    </div>
  );
}
```

**Note:** verify `rollKarma` is exported from `@wiz6/data`. If the export name differs (e.g., `karmaRoll`), adjust.

Wire into shell.

- [ ] **Step 4: Run tests (PASS)**

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/roster/steps/KarmaStep.tsx packages/viewer/tests/pages/roster/steps/KarmaStep.test.tsx packages/viewer/src/pages/roster/NewCharacterPage.tsx
git commit -m "feat(viewer): karma step with auto-roll and reroll"
```

---

## Task 11: Review step + commit-to-roster

**Files:**
- Create: `packages/viewer/src/pages/roster/steps/ReviewStep.tsx`
- Create: `packages/viewer/src/pages/roster/steps/ReviewStep.module.css`
- Create: `packages/viewer/src/pages/roster/lib/build-character.ts`
- Create: `packages/viewer/tests/pages/roster/lib/build-character.test.ts`
- Create: `packages/viewer/tests/pages/roster/steps/ReviewStep.test.tsx`
- Modify: `NewCharacterPage.tsx`

**Goal:** Final card summary + "Create character" button. Builds a `Character` from the draft, adds to roster, navigates to `/roster`.

- [ ] **Step 1a: Write failing test for build-character helper**

```typescript
// packages/viewer/tests/pages/roster/lib/build-character.test.ts
import { describe, expect, it } from 'vitest';
import { buildCharacter } from '../../../../src/pages/roster/lib/build-character.js';
import { createEmptyDraft } from '../../../../src/pages/roster/lib/draft.js';

function fullDraft() {
  return {
    ...createEmptyDraft(),
    name: 'TESTGUY',
    raceIdx: 0,
    classIdx: 0,
    bonusPool: 6,
    attributes: { str: 9, iq: 8, pie: 8, vit: 9, dex: 9, spd: 8, per: 8, kar: 0 },
    bonusDistribution: { str: 1, iq: 1, pie: 1, vit: 1, dex: 1, spd: 1, per: 0, kar: 0 },
    skillPoints: { 0: 10 },
    karma: 7,
  };
}

describe('buildCharacter', () => {
  it('builds a Character with the draft values + derived fields', () => {
    const c = buildCharacter(fullDraft());
    expect(c.name).toBe('TESTGUY');
    expect(c.race).toBe(0);
    expect(c.class).toBe(0);
    expect(c.level).toBe(1);
    expect(c.attributes.str).toBe(10); // base 9 + bonus 1
    expect(c.attributes.kar).toBe(7);  // from karma roll
    expect(c.portraitIndex).toBe(10);  // SPD (9) + 1
    expect(c.dead).toBe(false);
    expect(c.conditions.length).toBe(10);
    expect(c.skills.length).toBe(30);
    expect(c.skills[0]).toBe(10); // skill slot 0 received 10 points
  });

  it('id is a valid UUID', () => {
    const c = buildCharacter(fullDraft());
    expect(c.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
```

- [ ] **Step 1b: Implement buildCharacter**

```typescript
// packages/viewer/src/pages/roster/lib/build-character.ts
import type { Character } from '@wiz6/data';
import { computeTotalAttributes, type CharacterDraft } from './draft.js';

export function buildCharacter(draft: CharacterDraft): Character {
  const attrs = computeTotalAttributes(draft);
  if (attrs === null) {
    throw new Error('buildCharacter: draft has no race; cannot compute attributes');
  }
  if (draft.classIdx === null) {
    throw new Error('buildCharacter: draft has no class');
  }
  const skills = Array<number>(30).fill(0);
  for (const [slotIdxStr, pts] of Object.entries(draft.skillPoints)) {
    skills[Number(slotIdxStr)] = pts;
  }
  return {
    id: crypto.randomUUID(),
    name: draft.name,
    race: draft.raceIdx ?? 0,
    class: draft.classIdx,
    level: 1,
    savedOldLevel: 0,
    xp: 0,
    gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false,
    paralyzed: false,
    attributes: { ...attrs, kar: draft.karma },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills,
    reaction: 50,
    portraitIndex: attrs.spd + 1,
  };
}
```

- [ ] **Step 1c: Run build-character tests (PASS)**

- [ ] **Step 2: Write failing test for ReviewStep**

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReviewStep } from '../../../../src/pages/roster/steps/ReviewStep.js';
import { createEmptyDraft } from '../../../../src/pages/roster/lib/draft.js';
import { readRoster } from '../../../../src/lib/roster-store.js';

beforeEach(() => {
  window.localStorage.clear();
});

function readyDraft() {
  return {
    ...createEmptyDraft(),
    name: 'HERO',
    raceIdx: 0,
    classIdx: 0,
    bonusPool: 6,
    attributes: { str: 9, iq: 8, pie: 8, vit: 9, dex: 9, spd: 8, per: 8, kar: 0 },
    bonusDistribution: { str: 6, iq: 0, pie: 0, vit: 0, dex: 0, spd: 0, per: 0, kar: 0 },
    skillPoints: { 0: 10 },
    karma: 7,
  };
}

describe('ReviewStep', () => {
  it('renders the character summary', () => {
    const onCreate = vi.fn();
    render(<MemoryRouter><ReviewStep draft={readyDraft()} onCreate={onCreate} /></MemoryRouter>);
    expect(screen.getByText(/HERO/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument();
  });

  it('Create button calls onCreate', () => {
    const onCreate = vi.fn();
    render(<MemoryRouter><ReviewStep draft={readyDraft()} onCreate={onCreate} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(onCreate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Implement ReviewStep**

```typescript
// packages/viewer/src/pages/roster/steps/ReviewStep.tsx
import { CLASS_INDEX_TO_NAME, RACE_BASE_STATS } from '@wiz6/data';
import { computeTotalAttributes, type CharacterDraft } from '../lib/draft.js';
import styles from './shared.module.css';
import reviewStyles from './ReviewStep.module.css';

interface Props {
  draft: CharacterDraft;
  onCreate: () => void;
}

export function ReviewStep({ draft, onCreate }: Props) {
  const total = computeTotalAttributes(draft);
  const race = draft.raceIdx !== null ? RACE_BASE_STATS[draft.raceIdx]?.name : '?';
  const klass = draft.classIdx !== null ? CLASS_INDEX_TO_NAME[draft.classIdx] : '?';

  return (
    <div className={styles.step}>
      <div className={reviewStyles.card}>
        <h2>{draft.name}</h2>
        <p className={reviewStyles.meta}>
          {race} {klass} · Karma {draft.karma} · Portrait #{(total?.spd ?? 0) + 1}
        </p>
        <dl className={reviewStyles.stats}>
          <dt>STR</dt><dd>{total?.str}</dd>
          <dt>IQ</dt><dd>{total?.iq}</dd>
          <dt>PIE</dt><dd>{total?.pie}</dd>
          <dt>VIT</dt><dd>{total?.vit}</dd>
          <dt>DEX</dt><dd>{total?.dex}</dd>
          <dt>SPD</dt><dd>{total?.spd}</dd>
          <dt>PER</dt><dd>{total?.per}</dd>
          <dt>KAR</dt><dd>{draft.karma}</dd>
        </dl>
        <p className={reviewStyles.spells}>
          Starter spells: {draft.starterSpells.length || 'none'}
        </p>
      </div>
      <button type="button" onClick={onCreate} className={reviewStyles.create}>
        Create character
      </button>
    </div>
  );
}
```

```css
/* packages/viewer/src/pages/roster/steps/ReviewStep.module.css */
.card {
  border: 1px solid var(--color-accent, #6c6);
  border-radius: 6px;
  padding: var(--space-4, 16px);
  background: var(--color-bg, #0a0a0a);
}

.card h2 {
  margin: 0 0 var(--space-2, 8px) 0;
  font-family: monospace;
  letter-spacing: 0.15em;
}

.meta {
  margin: 0 0 var(--space-3, 12px) 0;
  color: var(--color-text-muted, #aaa);
}

.stats {
  display: grid;
  grid-template-columns: auto auto auto auto auto auto auto auto;
  gap: 4px 16px;
  font-family: monospace;
  margin: 0;
}

.stats dt {
  font-weight: 700;
}

.stats dd {
  margin: 0;
}

.spells {
  margin-top: var(--space-3, 12px);
  color: var(--color-text-muted, #aaa);
}

.create {
  margin-top: var(--space-4, 16px);
  background: var(--color-accent, #6c6);
  color: var(--color-bg, #0a0a0a);
  border: none;
  border-radius: 4px;
  padding: 12px 24px;
  font-size: 1.05em;
  cursor: pointer;
}

.create:hover {
  filter: brightness(1.15);
}
```

- [ ] **Step 4: Wire ReviewStep into shell with commit logic**

In `NewCharacterPage.tsx`, render `<ReviewStep draft={draft} onCreate={handleCreate} />` on step 8, where `handleCreate`:
1. Calls `buildCharacter(draft)`.
2. Calls `addCharacter(c)` from `roster-store.ts`.
3. Calls `navigate('/roster')` from `useNavigate()`.

- [ ] **Step 5: Run all tests (PASS)**

- [ ] **Step 6: Commit**

```bash
git add packages/viewer/src/pages/roster/lib/build-character.ts packages/viewer/src/pages/roster/steps/ReviewStep.tsx packages/viewer/src/pages/roster/steps/ReviewStep.module.css packages/viewer/tests/pages/roster/lib/build-character.test.ts packages/viewer/tests/pages/roster/steps/ReviewStep.test.tsx packages/viewer/src/pages/roster/NewCharacterPage.tsx
git commit -m "feat(viewer): review step + buildCharacter + roster commit"
```

---

## Task 12: Route wiring + RosterView link

**Files:**
- Modify: `packages/viewer/src/router.tsx`
- Modify: `packages/viewer/src/pages/game/RosterView.tsx`
- Optional test: integration test confirming the route renders.

**Goal:** Add `<Route path="/roster/new" element={<NewCharacterPage />} />` and a "+ New Character" button on RosterView linking to `/roster/new`.

- [ ] **Step 1: Modify router**

Add a lazy import for `NewCharacterPage` and a `<Route>` entry. Follow the existing pattern of `RosterView`.

- [ ] **Step 2: Modify RosterView**

Add a Link or button at the top of the page: `<Link to="/roster/new">+ New Character</Link>` styled consistently with existing buttons.

- [ ] **Step 3: Run viewer tests (PASS)**

Run: `pnpm --filter @wiz6/viewer test -- --run`

- [ ] **Step 4: Commit**

```bash
git add packages/viewer/src/router.tsx packages/viewer/src/pages/game/RosterView.tsx
git commit -m "feat(viewer): wire /roster/new route and roster page link"
```

---

## Task 13: Integration test — Fighter happy-path

**Files:**
- Create: `packages/viewer/tests/pages/roster/NewCharacterPage.integration.test.tsx`

**Goal:** Drive the wizard from step 1 to "Create character", asserting a Human Fighter lands in the roster.

- [ ] **Step 1: Write the test**

```typescript
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { NewCharacterPage } from '../../../src/pages/roster/NewCharacterPage.js';
import { resetToDefaults } from '../../../src/lib/house-rules-store.js';
import { readRoster } from '../../../src/lib/roster-store.js';

beforeEach(() => {
  window.localStorage.clear();
  resetToDefaults();
});

function clickNext() {
  fireEvent.click(screen.getByRole('button', { name: /next/i }));
}

describe('Fighter happy-path integration', () => {
  it('creates a Human Fighter and adds to roster', () => {
    render(
      <MemoryRouter initialEntries={['/roster/new']}>
        <Routes>
          <Route path="/roster/new" element={<NewCharacterPage />} />
          <Route path="/roster" element={<div>roster page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    // Step 1: Name
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), { target: { value: 'THESUS' } });
    clickNext();

    // Step 2: Race
    fireEvent.click(screen.getByRole('button', { name: /human/i }));
    clickNext();

    // Step 3: Bonus roll — pinned to max auto-applies
    clickNext();

    // Step 4: Class
    fireEvent.click(screen.getByRole('button', { name: /fighter/i }));
    clickNext();

    // Step 5: Attributes — spend all 28 into STR
    const plusButtons = screen.getAllByRole('button', { name: /\+/ });
    // STR is first attribute → first + button
    for (let i = 0; i < 28; i++) {
      const btn = screen.getAllByRole('button', { name: /\+/ })[0]!;
      if ((btn as HTMLButtonElement).disabled) break;
      fireEvent.click(btn);
    }
    clickNext();

    // Step 6: Skills — dump all 10 into first available slot
    const skillPlusButtons = screen.getAllByRole('button', { name: /\+/ });
    for (let i = 0; i < 10; i++) {
      const btn = screen.getAllByRole('button', { name: /\+/ })[0]!;
      if ((btn as HTMLButtonElement).disabled) break;
      fireEvent.click(btn);
    }
    clickNext();

    // Step 7: Spells — non-caster, auto-skip
    clickNext();

    // Step 8: Karma — auto-rolled
    clickNext();

    // Step 9: Review — Create character
    fireEvent.click(screen.getByRole('button', { name: /create character/i }));

    // Assert: roster now has 1 character
    const roster = readRoster();
    expect(roster.characters.length).toBe(1);
    expect(roster.characters[0]!.name).toBe('THESUS');
    expect(roster.characters[0]!.class).toBe(0); // Fighter
    expect(roster.characters[0]!.race).toBe(0);  // Human
  });
});
```

- [ ] **Step 2: Run tests (PASS)**

- [ ] **Step 3: Commit**

```bash
git add packages/viewer/tests/pages/roster/NewCharacterPage.integration.test.tsx
git commit -m "test(viewer): Fighter happy-path integration test for /roster/new"
```

---

## Task 14: Integration test — Mage with spell picker

**Files:**
- Create: `packages/viewer/tests/pages/roster/NewCharacterPage.caster.integration.test.tsx`

**Goal:** Same flow but for a Mage, asserting 2 spell picks are required and the resulting character has them recorded.

- [ ] **Step 1: Write the test**

```typescript
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { NewCharacterPage } from '../../../src/pages/roster/NewCharacterPage.js';
import { resetToDefaults } from '../../../src/lib/house-rules-store.js';
import { readRoster } from '../../../src/lib/roster-store.js';

beforeEach(() => {
  window.localStorage.clear();
  resetToDefaults();
});

function clickNext() {
  fireEvent.click(screen.getByRole('button', { name: /next/i }));
}

describe('Mage with spell picker integration', () => {
  it('creates an Elf Mage with 2 starter spells', () => {
    render(
      <MemoryRouter initialEntries={['/roster/new']}>
        <Routes>
          <Route path="/roster/new" element={<NewCharacterPage />} />
          <Route path="/roster" element={<div>roster page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), { target: { value: 'TREON' } });
    clickNext();

    fireEvent.click(screen.getByRole('button', { name: /elf/i }));
    clickNext();

    clickNext(); // bonus roll auto-pinned

    fireEvent.click(screen.getByRole('button', { name: /^mage$/i }));
    clickNext();

    // dump bonus into IQ
    for (let i = 0; i < 28; i++) {
      const plusButtons = screen.getAllByRole('button', { name: /\+/ });
      const btn = plusButtons[1]!; // IQ + button (assumes STR is index 0, IQ is index 1)
      if ((btn as HTMLButtonElement).disabled) break;
      fireEvent.click(btn);
    }
    clickNext();

    // skills
    for (let i = 0; i < 10; i++) {
      const btn = screen.getAllByRole('button', { name: /\+/ })[0]!;
      if ((btn as HTMLButtonElement).disabled) break;
      fireEvent.click(btn);
    }
    clickNext();

    // spells — pick 2 from Mage book
    expect(screen.getByText(/0 of 2 spells picked/i)).toBeInTheDocument();
    const spellButtons = screen.getAllByRole('button', { name: /Fire|Water|Air|Earth|Mental|Divine/ });
    fireEvent.click(spellButtons[0]!);
    fireEvent.click(spellButtons[1]!);
    expect(screen.getByText(/2 of 2 spells picked/i)).toBeInTheDocument();
    clickNext();

    clickNext(); // karma

    fireEvent.click(screen.getByRole('button', { name: /create character/i }));

    const roster = readRoster();
    expect(roster.characters.length).toBe(1);
    expect(roster.characters[0]!.name).toBe('TREON');
    expect(roster.characters[0]!.class).toBe(1); // Mage
  });
});
```

- [ ] **Step 2: Run tests (PASS)**

- [ ] **Step 3: Commit**

```bash
git add packages/viewer/tests/pages/roster/NewCharacterPage.caster.integration.test.tsx
git commit -m "test(viewer): Mage integration test exercising spell picker"
```

---

## Task 15: Final test pass + branch push

- [ ] **Step 1: Run the full viewer test suite**

Run: `pnpm --filter @wiz6/viewer test -- --run`
Expected: All tests pass; new count = previous baseline (342) + all the new tests added.

- [ ] **Step 2: Run all workspace tests**

Run: `pnpm -r test -- --run`
Expected: All packages green.

- [ ] **Step 3: Typecheck**

Run: `pnpm -r typecheck` — verify only pre-existing errors remain (the EngineeringNotes Tag / OverlayDetail RenamedFunctionEntry issues mentioned in the spec).

- [ ] **Step 4: Push the branch**

```bash
git push -u origin feat/character-creation-flow
```

Do NOT merge to main — that's a separate user-driven step.

---

## Out-of-scope deferrals (do NOT implement in this plan)

- Resuming a draft after navigation (no localStorage persistence of in-progress draft).
- Editing an existing character.
- Engine-RNG-byte-exact bonus roll and karma roll.
- DOS-EGA-themed styling.
- Spell name decoding (placeholder labels OK).
- Bonus-roll max value decode (placeholder `MAX_BONUS_POINTS = 28`).
- Starter skill-points decode (placeholder `STARTER_SKILL_POINTS = 10`).
