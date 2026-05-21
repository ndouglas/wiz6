# Viewer Redesign — Stage 2b (Monsters Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `MonstersPage` stub with a working split-view section. Left rail: searchable, filterable, sortable list of 250 monsters. Right pane: detail view of the currently selected monster with three tabs (Overview / Attacks / Saves & Resistances). All state (selection, filters, tab) URL-driven so reloads and back/forward work. Keyboard shortcuts for fast navigation.

**Architecture:** All scenario data already fetched once via a new `useScenarioDb` hook and shared via React context. Monster filtering/sorting/searching done by pure helpers over `ScenarioMonster[]`. Selection lives in the URL path (`/monsters/:slug`); filter/sort/tab state lives in query params via a new `useUrlState` hook. The detail view uses URL query `?tab=` to pick the active tab. No virtualisation in v1 — 250 rows render fine without it.

**Tech Stack:** React 18, TypeScript, Vite 5, react-router-dom 6, vitest 2, @testing-library/react 16. Reference spec: `docs/superpowers/specs/2026-05-21-viewer-redesign-design.md` (section "Monsters"). Prior stage: 2a (foundation) — `docs/superpowers/plans/2026-05-21-viewer-redesign-stage-2a.md`.

**Out of scope for 2b** (handled in later stages):
- Raw bytes tab + byte-field highlighting → Stage 2c
- Family tab + Sprites & IDs tab → Stage 2c
- Compare mode + family-grouped view + "Copy raw bytes / Copy as JSON" header buttons → Stage 2d
- Quest-records toggle in the monster list — `/quest` page in stage 2f is the home for those records; the list toggle deferred until then so we don't have to invent a half-rendered row layout for non-monster records in 2b
- wfont3 as a heading font — deferred entirely

---

## Pre-flight

Set up a fresh worktree on the latest `main` (which now has stage 2a merged) and confirm baseline.

- [ ] **Create worktree at `~/.config/superpowers/worktrees/wiz6/stage-2b-monsters-core/` on branch `stage-2b-monsters-core`**

```bash
git worktree add ~/.config/superpowers/worktrees/wiz6/stage-2b-monsters-core -b stage-2b-monsters-core
cd ~/.config/superpowers/worktrees/wiz6/stage-2b-monsters-core
pnpm install --frozen-lockfile
```

Expected: worktree created, dependencies install cleanly.

- [ ] **Run baseline tests to confirm a clean starting state**

```bash
pnpm -r test
```

Expected: 82 data + 64 parser + 134 viewer = 280 tests passing.

---

## Task 1: Shared test fixture + `useScenarioDb` hook

Every subsequent task needs realistic `ScenarioMonster` data. Centralise a small but representative fixture (5 monsters spanning different classes/families/elements), plus a hook + provider that fetches `/scenario/scenario.json` once and shares the data across the tree.

**Files:**
- Create: `packages/viewer/src/lib/hooks/useScenarioDb.tsx`
- Create: `packages/viewer/tests/fixtures/scenario-fixture.ts`
- Test: `packages/viewer/tests/lib/hooks/useScenarioDb.test.tsx`

- [ ] **Step 1: Write the fixture (no test needed for raw fixtures)**

Create `packages/viewer/tests/fixtures/scenario-fixture.ts`:

```typescript
import type { ScenarioDb, ScenarioMonster, ScenarioQuestData } from '@wiz6/data';

const empty158 = (): number[] => Array(158).fill(0);
const empty222 = (): number[] => Array(222).fill(0);

const baseMonsterFields = {
  xpOnKill: 0,
  attack1DiceCount: 0,
  attack1DiceSides: 0,
  attack1SpecialChance: 0,
  attack2DiceCount: 0,
  attack2DiceSides: 0,
  attack2SpecialChance: 0,
  attack3DiceCount: 0,
  attack3DiceSides: 0,
  attack3SpecialChance: 0,
  groupDiceCount: 0,
  groupDiceSides: 0,
  hpDiceCount: 0,
  hpDiceSides: 0,
  monsterClass: 0,
  monsterSubClass: 0,
  saveTable: [0, 0, 0, 0, 0],
  effectChanceTable: [0, 0, 0, 0, 0],
  monsterLevel: 0,
  monsterLevelMax: 0,
  familyId: [0, 0, 0, 0],
  creatureKind: 0,
  monsterSex: 0,
  moveStat: 0,
  spriteGroup: 0,
  monsterAC: 0,
  attributeSaves: [0, 0, 0, 0],
  goldStat: 0,
  specialAttackElement: 0,
  monsterBehaviorClass: 0,
  attack1Extra: [0, 0],
  attack2Extra: [0, 0],
  attack3Extra: [0, 0],
  attack1PoisonChance: 0,
  attack1DrainChance: 0,
  attack1StunChance: 0,
  attack2PoisonChance: 0,
  attack2DrainChance: 0,
  attack2StunChance: 0,
  attack3PoisonChance: 0,
  attack3DrainChance: 0,
  attack3StunChance: 0,
  attack1HpDrainChance: 0,
  attack1AgeChance: 0,
  attack1DecapitateChance: 0,
  attack2HpDrainChance: 0,
  attack2AgeChance: 0,
  attack2DecapitateChance: 0,
  attack3HpDrainChance: 0,
  attack3AgeChance: 0,
  attack3DecapitateChance: 0,
  attack1Style: 0,
  attack1DamageBonus: 0,
  attack2Style: 0,
  attack2DamageBonus: 0,
  attack3Style: 0,
  attack3DamageBonus: 0,
  attack1PoisonStrength: 0,
  attack2PoisonStrength: 0,
  attack3PoisonStrength: 0,
  extendedSaves: Array(12).fill(0) as number[],
  combatSpriteId: 0,
  combatSpriteAlt: 0,
  secondarySpriteId: 0,
  magicResistChance: 0,
  combatTraitId: 0,
  auxSave103: 0,
  spellPowerChance: 0,
  auxSave106: 0,
  flyEvadeChance: 0,
};

const emptyMonster = (i: number): ScenarioMonster => ({
  index: i,
  nameIdSingular: '',
  nameIdPlural: '',
  nameUnidSingular: '',
  nameUnidPlural: '',
  statBytes: empty158(),
  empty: true,
  ...baseMonsterFields,
});

const FIXTURE_MONSTERS: ScenarioMonster[] = Array.from({ length: 250 }, (_, i) => emptyMonster(i));

// Replace a handful of slots with representative real monsters.
FIXTURE_MONSTERS[0] = {
  ...emptyMonster(0),
  nameIdSingular: 'GIANT RAT',
  nameIdPlural: 'GIANT RATS',
  nameUnidSingular: 'RAT',
  nameUnidPlural: 'RATS',
  empty: false,
  xpOnKill: 450,
  attack1DiceCount: 1,
  attack1DiceSides: 4,
  attack1SpecialChance: 25,
  attack1PoisonChance: 25,
  attack1PoisonStrength: 3,
  hpDiceCount: 4,
  hpDiceSides: 2,
  groupDiceCount: 1,
  groupDiceSides: 3,
  monsterClass: 1,
  monsterSubClass: 1,
  monsterLevel: 8,
  monsterLevelMax: 15,
  familyId: [6, 4, 14, 16],
  creatureKind: 4,
  monsterSex: 2,
  monsterAC: 3,
  specialAttackElement: 8,
  monsterBehaviorClass: 0,
  goldStat: 1,
};

FIXTURE_MONSTERS[1] = {
  ...emptyMonster(1),
  nameIdSingular: 'ZOMBIE',
  nameIdPlural: 'ZOMBIES',
  nameUnidSingular: 'CORPSE',
  nameUnidPlural: 'CORPSES',
  empty: false,
  xpOnKill: 2200,
  attack1DiceCount: 1,
  attack1DiceSides: 3,
  attack1SpecialChance: 80,
  hpDiceCount: 6,
  hpDiceSides: 6,
  monsterClass: 2,
  monsterSubClass: 1,
  monsterLevel: 10,
  monsterLevelMax: 10,
  familyId: [12, 12, 16, 12],
  creatureKind: 8,
  monsterSex: 2,
  monsterAC: 10,
  specialAttackElement: 5,
  monsterBehaviorClass: 2,
  goldStat: 20,
  saveTable: [15, 40, 30, 10, 5],
  effectChanceTable: [15, 40, 30, 10, 5],
};

FIXTURE_MONSTERS[2] = {
  ...emptyMonster(2),
  nameIdSingular: 'PIT FIEND',
  nameIdPlural: 'PIT FIENDS',
  nameUnidSingular: 'DEMON',
  nameUnidPlural: 'DEMONS',
  empty: false,
  xpOnKill: 56786,
  attack1DiceCount: 4,
  attack1DiceSides: 4,
  attack1SpecialChance: 75,
  hpDiceCount: 14,
  hpDiceSides: 4,
  monsterClass: 3,
  monsterSubClass: 1,
  monsterLevel: 12,
  monsterLevelMax: 12,
  familyId: [22, 16, 17, 17],
  creatureKind: 10,
  monsterSex: 2,
  monsterAC: 2,
  specialAttackElement: 1,
  monsterBehaviorClass: 0,
  goldStat: 140,
  magicResistChance: 80,
};

FIXTURE_MONSTERS[3] = {
  ...emptyMonster(3),
  nameIdSingular: 'WRAITH',
  nameIdPlural: 'WRAITHS',
  nameUnidSingular: 'SPIRIT',
  nameUnidPlural: 'SPIRITS',
  empty: false,
  xpOnKill: 8400,
  attack1DiceCount: 1,
  attack1DiceSides: 6,
  attack1SpecialChance: 100,
  attack1DrainChance: 100,
  hpDiceCount: 8,
  hpDiceSides: 6,
  monsterClass: 2,
  monsterSubClass: 3,
  monsterLevel: 16,
  monsterLevelMax: 16,
  familyId: [10, 12, 12, 12],
  creatureKind: 8,
  monsterSex: 2,
  monsterAC: -2,
  specialAttackElement: 11,
  monsterBehaviorClass: 2,
  goldStat: 80,
  magicResistChance: 40,
  spellPowerChance: 90,
  extendedSaves: [65, 65, 65, 125, 125, 125, 125, 125, 125, 125, 0, 0],
};

FIXTURE_MONSTERS[4] = {
  ...emptyMonster(4),
  nameIdSingular: 'FAERIE QUEEN',
  nameIdPlural: 'FAERIE QUEENS',
  nameUnidSingular: 'FAERIE',
  nameUnidPlural: 'FAERIES',
  empty: false,
  xpOnKill: 65535, // u16 max (ScenarioMonsterSchema caps xpOnKill at 0xffff)
  attack1DiceCount: 2,
  attack1DiceSides: 10,
  attack1SpecialChance: 100,
  hpDiceCount: 20,
  hpDiceSides: 10,
  monsterClass: 4,
  monsterSubClass: 1,
  monsterLevel: 50,
  monsterLevelMax: 50,
  familyId: [99, 99, 99, 99],
  creatureKind: 5,
  monsterSex: 1,
  monsterAC: -6,
  specialAttackElement: 12,
  monsterBehaviorClass: 11,
  goldStat: 150,
  magicResistChance: 100,
};

const emptyQuestData = (i: number): ScenarioQuestData => ({
  index: i,
  names: ['', '', '', ''],
  rawBytes: empty222(),
  empty: true,
});

const emptyItem = (i: number) => ({
  index: i,
  name1: '',
  name2: '',
  bytes: Array(74).fill(0) as number[],
  empty: true,
  price: 0,
  hitBonus: 0,
  damageDiceCount: 0,
  damageDiceSides: 0,
  spellOrSongId: 0,
  weight: 0,
  classMask: 0,
  equipSlot: 0,
});

export const FIXTURE_SCENARIO_DB: ScenarioDb = {
  id: 'scenario',
  sourceFile: 'scenario.dbs',
  xpTables: Array.from({ length: 14 }, (_, i) => ({
    classIndex: i,
    levels: Array.from({ length: 16 }, (_, j) => 1000 * (j + 1) * (i + 1)),
  })),
  itemCount: 1,
  items: [emptyItem(0)],
  unknownPreMonster: [],
  monsterCount: 250,
  monsters: FIXTURE_MONSTERS,
  questDataCount: 3,
  questData: Array.from({ length: 3 }, (_, i) => emptyQuestData(i)),
  unknownTail: [],
};

export { baseMonsterFields, emptyItem, emptyMonster, emptyQuestData };
```

`ScenarioItemSchema` requires `itemCount: z.number().int().positive()` (excludes 0), so we ship one empty item record. The schema's `itemCount === items.length` refinement is also satisfied.

- [ ] **Step 2: Write the failing test for `useScenarioDb`**

Create `packages/viewer/tests/lib/hooks/useScenarioDb.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ScenarioDbProvider, useScenarioDb } from '../../../src/lib/hooks/useScenarioDb.js';
import { FIXTURE_SCENARIO_DB } from '../../fixtures/scenario-fixture.js';

function Probe() {
  const { data, loading, error } = useScenarioDb();
  if (loading) return <p>loading</p>;
  if (error) return <p>error: {error.message}</p>;
  if (!data) return <p>no data</p>;
  return (
    <p data-testid="probe">
      monsters={data.monsters.length} first={data.monsters[0]?.nameIdSingular}
    </p>
  );
}

describe('useScenarioDb', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches /scenario/scenario.json and provides data via context', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(FIXTURE_SCENARIO_DB), { status: 200 })),
    );
    render(
      <ScenarioDbProvider>
        <Probe />
      </ScenarioDbProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('monsters=250 first=GIANT RAT');
    });
  });

  it('exposes the error when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    render(
      <ScenarioDbProvider>
        <Probe />
      </ScenarioDbProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText(/error/)).toBeInTheDocument();
    });
  });

  it('throws if used outside the provider', () => {
    expect(() => render(<Probe />)).toThrow(/ScenarioDbProvider/);
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

```bash
pnpm --filter @wiz6/viewer test tests/lib/hooks/useScenarioDb.test.tsx
```

Expected: FAIL (hook + provider do not exist yet).

- [ ] **Step 4: Implement the hook + provider**

Create `packages/viewer/src/lib/hooks/useScenarioDb.tsx`:

```typescript
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ScenarioDbSchema, type ScenarioDb } from '@wiz6/data';

interface ScenarioDbState {
  data: ScenarioDb | null;
  loading: boolean;
  error: Error | null;
}

const ScenarioDbContext = createContext<ScenarioDbState | undefined>(undefined);

export function ScenarioDbProvider({
  children,
  url = '/scenario/scenario.json',
}: {
  children: ReactNode;
  url?: string;
}) {
  const [state, setState] = useState<ScenarioDbState>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);
        const json = await res.json();
        const parsed = ScenarioDbSchema.parse(json);
        if (!cancelled) setState({ data: parsed, loading: false, error: null });
      } catch (err) {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return <ScenarioDbContext.Provider value={state}>{children}</ScenarioDbContext.Provider>;
}

export function useScenarioDb(): ScenarioDbState {
  const ctx = useContext(ScenarioDbContext);
  if (!ctx) throw new Error('useScenarioDb must be used inside ScenarioDbProvider');
  return ctx;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @wiz6/viewer test tests/lib/hooks/useScenarioDb.test.tsx
```

Expected: 3/3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/viewer/src/lib/hooks/useScenarioDb.tsx packages/viewer/tests/lib/hooks/useScenarioDb.test.tsx packages/viewer/tests/fixtures/scenario-fixture.ts
git commit -m "feat(viewer): useScenarioDb hook + shared ScenarioDb test fixture"
```

---

## Task 2: Monster helper utilities

Pure functions over `ScenarioMonster[]`: slugify lookup, filter, sort, search, and derive-unique-values for filter chips. All testable in isolation, no React.

**Files:**
- Create: `packages/viewer/src/lib/monsters.ts`
- Test: `packages/viewer/tests/lib/monsters.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/lib/monsters.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { FIXTURE_SCENARIO_DB } from '../fixtures/scenario-fixture.js';
import {
  monsterSlug,
  findMonsterBySlug,
  searchMonsters,
  filterMonsters,
  sortMonsters,
  uniqueFilterValues,
  formatLevelRange,
  formatHpDice,
  formatAttackDice,
  type MonsterFilter,
  type MonsterSortField,
} from '../../src/lib/monsters.js';

const ALL = FIXTURE_SCENARIO_DB.monsters;
const FILLED = ALL.filter((m) => !m.empty);

describe('monsterSlug', () => {
  it('uses nameIdSingular when present', () => {
    const rat = ALL[0]!;
    expect(monsterSlug(rat)).toBe('giant-rat');
  });

  it('falls back to index for empty slots', () => {
    const empty = ALL[100]!;
    expect(monsterSlug(empty)).toBe('slot-100');
  });
});

describe('findMonsterBySlug', () => {
  it('returns the monster matching the slug', () => {
    expect(findMonsterBySlug(ALL, 'giant-rat')?.nameIdSingular).toBe('GIANT RAT');
    expect(findMonsterBySlug(ALL, 'wraith')?.nameIdSingular).toBe('WRAITH');
  });

  it('returns null for an unknown slug', () => {
    expect(findMonsterBySlug(ALL, 'nope')).toBeNull();
  });

  it('finds empty slots by their fallback slug', () => {
    expect(findMonsterBySlug(ALL, 'slot-100')?.index).toBe(100);
  });
});

describe('searchMonsters', () => {
  it('matches case-insensitively across all four name slots', () => {
    expect(searchMonsters(FILLED, 'rat').map((m) => m.nameIdSingular)).toEqual(['GIANT RAT']);
    // 'spirit' is the unid-singular of WRAITH
    expect(searchMonsters(FILLED, 'spirit').map((m) => m.nameIdSingular)).toEqual(['WRAITH']);
    // partial match
    expect(searchMonsters(FILLED, 'rats').map((m) => m.nameIdSingular)).toEqual(['GIANT RAT']);
  });

  it('returns input unchanged for empty query', () => {
    expect(searchMonsters(FILLED, '')).toEqual(FILLED);
    expect(searchMonsters(FILLED, '   ')).toEqual(FILLED);
  });
});

describe('filterMonsters', () => {
  it('filters by monsterClass', () => {
    const f: MonsterFilter = { classes: [2] };
    const names = filterMonsters(FILLED, f).map((m) => m.nameIdSingular);
    expect(names).toEqual(['ZOMBIE', 'WRAITH']);
  });

  it('filters by specialAttackElement', () => {
    const f: MonsterFilter = { elements: [1] }; // fire
    expect(filterMonsters(FILLED, f).map((m) => m.nameIdSingular)).toEqual(['PIT FIEND']);
  });

  it('filters by family (stringified 4-byte tuple)', () => {
    const f: MonsterFilter = { families: ['10,12,12,12'] };
    expect(filterMonsters(FILLED, f).map((m) => m.nameIdSingular)).toEqual(['WRAITH']);
  });

  it('combines filters with AND semantics', () => {
    const f: MonsterFilter = { classes: [2], elements: [11] }; // undead AND mental
    expect(filterMonsters(FILLED, f).map((m) => m.nameIdSingular)).toEqual(['WRAITH']);
  });

  it('hides empty slots when includeEmpty is false', () => {
    expect(filterMonsters(ALL, { includeEmpty: false }).length).toBe(FILLED.length);
  });

  it('includes empty slots when includeEmpty is true', () => {
    expect(filterMonsters(ALL, { includeEmpty: true }).length).toBe(ALL.length);
  });
});

describe('sortMonsters', () => {
  it('sorts by name ascending by default', () => {
    const sorted = sortMonsters(FILLED, 'name', 'asc').map((m) => m.nameIdSingular);
    expect(sorted).toEqual(['FAERIE QUEEN', 'GIANT RAT', 'PIT FIEND', 'WRAITH', 'ZOMBIE']);
  });

  it('sorts by level descending', () => {
    const sorted = sortMonsters(FILLED, 'level', 'desc').map((m) => m.monsterLevel);
    expect(sorted).toEqual([50, 16, 12, 10, 8]);
  });

  it('sorts by AC ascending (lower is better in Wiz6 AC)', () => {
    const sorted = sortMonsters(FILLED, 'ac', 'asc').map((m) => m.monsterAC);
    expect(sorted).toEqual([-6, -2, 2, 3, 10]);
  });

  it.each<MonsterSortField>(['name', 'level', 'ac', 'hp', 'xp', 'gold'])(
    'is stable for field %s',
    (field) => {
      const a = sortMonsters(FILLED, field, 'asc');
      const b = sortMonsters(FILLED, field, 'asc');
      expect(a.map((m) => m.index)).toEqual(b.map((m) => m.index));
    },
  );
});

describe('uniqueFilterValues', () => {
  it('extracts distinct class/element/family/etc. values from filled monsters', () => {
    const v = uniqueFilterValues(FILLED);
    expect(v.classes.sort()).toEqual([1, 2, 3, 4]);
    expect(v.elements.sort()).toEqual([1, 5, 8, 11, 12]);
    expect(v.families).toContain('6,4,14,16');
    expect(v.families).toContain('10,12,12,12');
    expect(v.creatureKinds.sort()).toEqual([4, 5, 8, 10]);
    expect(v.sexes.sort()).toEqual([1, 2]);
    expect(v.behaviorClasses.sort()).toEqual([0, 2, 11]);
  });

  it('ignores empty slots', () => {
    const v = uniqueFilterValues(ALL);
    // Empty slots all have class=0, which should NOT appear in classes
    expect(v.classes).not.toContain(0);
  });
});

describe('formatters', () => {
  it('formatLevelRange shows a single value when min === max', () => {
    expect(formatLevelRange(10, 10)).toBe('10');
  });
  it('formatLevelRange shows a range when min !== max', () => {
    expect(formatLevelRange(8, 15)).toBe('8-15');
  });
  it('formatHpDice renders as NdM', () => {
    expect(formatHpDice(4, 2)).toBe('4d2');
  });
  it('formatHpDice returns "—" for unused', () => {
    expect(formatHpDice(0, 0)).toBe('—');
  });
  it('formatAttackDice renders as NdM', () => {
    expect(formatAttackDice(2, 10)).toBe('2d10');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @wiz6/viewer test tests/lib/monsters.test.ts
```

Expected: FAIL (module does not exist).

- [ ] **Step 3: Implement the helpers**

Create `packages/viewer/src/lib/monsters.ts`:

```typescript
import type { ScenarioMonster } from '@wiz6/data';
import { slugify } from './slug.js';

export type MonsterSortField = 'name' | 'level' | 'ac' | 'hp' | 'xp' | 'gold';
export type SortDir = 'asc' | 'desc';

export interface MonsterFilter {
  classes?: readonly number[];
  elements?: readonly number[];
  families?: readonly string[]; // "a,b,c,d" stringified familyId tuples
  creatureKinds?: readonly number[];
  sexes?: readonly number[];
  behaviorClasses?: readonly number[];
  includeEmpty?: boolean;
}

export function monsterSlug(m: ScenarioMonster): string {
  if (m.nameIdSingular) return slugify(m.nameIdSingular);
  return `slot-${m.index}`;
}

export function findMonsterBySlug(
  monsters: readonly ScenarioMonster[],
  slug: string,
): ScenarioMonster | null {
  return monsters.find((m) => monsterSlug(m) === slug) ?? null;
}

export function searchMonsters(
  monsters: readonly ScenarioMonster[],
  query: string,
): ScenarioMonster[] {
  const q = query.trim().toLowerCase();
  if (q === '') return monsters.slice();
  return monsters.filter((m) => {
    const haystack = [m.nameIdSingular, m.nameIdPlural, m.nameUnidSingular, m.nameUnidPlural]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function familyKey(familyId: readonly number[]): string {
  return familyId.join(',');
}

export function filterMonsters(
  monsters: readonly ScenarioMonster[],
  filter: MonsterFilter,
): ScenarioMonster[] {
  const includeEmpty = filter.includeEmpty ?? false;
  return monsters.filter((m) => {
    if (!includeEmpty && m.empty) return false;
    if (filter.classes && filter.classes.length > 0 && !filter.classes.includes(m.monsterClass))
      return false;
    if (
      filter.elements &&
      filter.elements.length > 0 &&
      !filter.elements.includes(m.specialAttackElement)
    )
      return false;
    if (
      filter.families &&
      filter.families.length > 0 &&
      !filter.families.includes(familyKey(m.familyId))
    )
      return false;
    if (
      filter.creatureKinds &&
      filter.creatureKinds.length > 0 &&
      !filter.creatureKinds.includes(m.creatureKind)
    )
      return false;
    if (filter.sexes && filter.sexes.length > 0 && !filter.sexes.includes(m.monsterSex))
      return false;
    if (
      filter.behaviorClasses &&
      filter.behaviorClasses.length > 0 &&
      !filter.behaviorClasses.includes(m.monsterBehaviorClass)
    )
      return false;
    return true;
  });
}

function compareNumbers(a: number, b: number): number {
  return a - b;
}

function sortKey(m: ScenarioMonster, field: MonsterSortField): number | string {
  switch (field) {
    case 'name':
      return m.nameIdSingular || `~slot-${m.index}`; // empty names sort to end
    case 'level':
      return m.monsterLevel;
    case 'ac':
      return m.monsterAC;
    case 'hp':
      return m.hpDiceCount * (m.hpDiceSides + 1); // approximate expected HP
    case 'xp':
      return m.xpOnKill;
    case 'gold':
      return m.goldStat;
  }
}

export function sortMonsters(
  monsters: readonly ScenarioMonster[],
  field: MonsterSortField,
  dir: SortDir,
): ScenarioMonster[] {
  const decorated = monsters.map((m, i) => ({ m, i, k: sortKey(m, field) }));
  decorated.sort((a, b) => {
    let cmp: number;
    if (typeof a.k === 'string' && typeof b.k === 'string') cmp = a.k.localeCompare(b.k);
    else cmp = compareNumbers(a.k as number, b.k as number);
    if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
    return a.i - b.i; // stable tiebreaker
  });
  return decorated.map((d) => d.m);
}

export interface UniqueFilterValues {
  classes: number[];
  elements: number[];
  families: string[];
  creatureKinds: number[];
  sexes: number[];
  behaviorClasses: number[];
}

export function uniqueFilterValues(monsters: readonly ScenarioMonster[]): UniqueFilterValues {
  const filled = monsters.filter((m) => !m.empty);
  const collect = <K extends keyof ScenarioMonster>(key: K): number[] => {
    const seen = new Set<number>();
    for (const m of filled) seen.add(m[key] as unknown as number);
    return Array.from(seen);
  };
  const families = Array.from(new Set(filled.map((m) => familyKey(m.familyId))));
  return {
    classes: collect('monsterClass'),
    elements: collect('specialAttackElement'),
    families,
    creatureKinds: collect('creatureKind'),
    sexes: collect('monsterSex'),
    behaviorClasses: collect('monsterBehaviorClass'),
  };
}

export function formatLevelRange(min: number, max: number): string {
  if (min === max) return String(min);
  return `${min}-${max}`;
}

export function formatHpDice(count: number, sides: number): string {
  if (count === 0 || sides === 0) return '—';
  return `${count}d${sides}`;
}

export function formatAttackDice(count: number, sides: number): string {
  if (count === 0 || sides === 0) return '—';
  return `${count}d${sides}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @wiz6/viewer test tests/lib/monsters.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/lib/monsters.ts packages/viewer/tests/lib/monsters.test.ts
git commit -m "feat(viewer): monster helper utilities (slug, search, filter, sort, formatters)"
```

---

## Task 3: `useUrlState` hook

A small hook over `useSearchParams` that exposes a key/value API for our filter/search/sort/tab state, with multi-value support via comma-separation.

**Files:**
- Create: `packages/viewer/src/lib/hooks/useUrlState.ts`
- Test: `packages/viewer/tests/lib/hooks/useUrlState.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/lib/hooks/useUrlState.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useUrlState } from '../../../src/lib/hooks/useUrlState.js';

function Probe({ keyName }: { keyName: string }) {
  const [value, setValue] = useUrlState(keyName);
  const location = useLocation();
  return (
    <>
      <p data-testid="value">{value ?? 'null'}</p>
      <p data-testid="search">{location.search}</p>
      <button onClick={() => setValue('hello')}>set</button>
      <button onClick={() => setValue(null)}>clear</button>
    </>
  );
}

function ListProbe({ keyName }: { keyName: string }) {
  const [values, setValues] = useUrlState.list(keyName);
  return (
    <>
      <p data-testid="values">{values.join('|')}</p>
      <button onClick={() => setValues(['a', 'b'])}>set-ab</button>
      <button onClick={() => setValues([])}>clear</button>
    </>
  );
}

describe('useUrlState', () => {
  it('reads a string value from the URL', () => {
    render(
      <MemoryRouter initialEntries={['/?tab=overview']}>
        <Probe keyName="tab" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('value')).toHaveTextContent('overview');
  });

  it('returns null when key is absent', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Probe keyName="tab" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('value')).toHaveTextContent('null');
  });

  it('setting a value updates the URL', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Probe keyName="tab" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('set'));
    expect(screen.getByTestId('search')).toHaveTextContent('?tab=hello');
  });

  it('clearing a value removes it from the URL', () => {
    render(
      <MemoryRouter initialEntries={['/?tab=hello']}>
        <Probe keyName="tab" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('clear'));
    expect(screen.getByTestId('search')).not.toHaveTextContent('tab');
  });

  it('list variant reads comma-separated values', () => {
    render(
      <MemoryRouter initialEntries={['/?class=1,2,3']}>
        <ListProbe keyName="class" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('values')).toHaveTextContent('1|2|3');
  });

  it('list variant returns empty array when key is absent', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <ListProbe keyName="class" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('values')).toHaveTextContent('');
  });

  it('list variant writes comma-separated values', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <ListProbe keyName="class" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('set-ab'));
    expect(screen.getByTestId('values')).toHaveTextContent('a|b');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @wiz6/viewer test tests/lib/hooks/useUrlState.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement the hook**

Create `packages/viewer/src/lib/hooks/useUrlState.ts`:

```typescript
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

type SetScalar = (next: string | null) => void;
type SetList = (next: readonly string[]) => void;

function useUrlStateScalar(key: string): [string | null, SetScalar] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key);
  const setter = useCallback<SetScalar>(
    (next) => {
      setParams(
        (prev) => {
          const np = new URLSearchParams(prev);
          if (next === null || next === '') np.delete(key);
          else np.set(key, next);
          return np;
        },
        { replace: true },
      );
    },
    [key, setParams],
  );
  return [value, setter];
}

function useUrlStateList(key: string): [string[], SetList] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const values = raw === null || raw === '' ? [] : raw.split(',');
  const setter = useCallback<SetList>(
    (next) => {
      setParams(
        (prev) => {
          const np = new URLSearchParams(prev);
          if (next.length === 0) np.delete(key);
          else np.set(key, next.join(','));
          return np;
        },
        { replace: true },
      );
    },
    [key, setParams],
  );
  return [values, setter];
}

// `Object.assign` gives us a single callable export with a `.list` property,
// typed correctly under strict TypeScript settings (no implicit-any errors when
// reading `useUrlState.list`).
export const useUrlState = Object.assign(useUrlStateScalar, { list: useUrlStateList });
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @wiz6/viewer test tests/lib/hooks/useUrlState.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/lib/hooks/useUrlState.ts packages/viewer/tests/lib/hooks/useUrlState.test.tsx
git commit -m "feat(viewer): useUrlState hook for URL-driven filter and tab state"
```

---

## Task 4: `MonstersPage` split-view shell

Replace the stub in `pages/monsters/MonstersPage.tsx` with the actual split-view layout. It mounts `ScenarioDbProvider`, reads the `:slug` from the URL, and lays out left rail + right pane (both will be filled in by later tasks; this task uses placeholder children so the shell test passes).

Note: the `Routes` config in `src/router.tsx` currently has `/monsters` → `MonstersPage`. We need to add `/monsters/:slug` → `MonstersPage` too so the slug param works. Tasks 4 includes that edit.

**Files:**
- Modify: `packages/viewer/src/router.tsx` (add `/monsters/:slug` route)
- Modify: `packages/viewer/src/pages/monsters/MonstersPage.tsx`
- Create: `packages/viewer/src/pages/monsters/MonstersPage.module.css`
- Test: `packages/viewer/tests/pages/monsters/MonstersPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/pages/monsters/MonstersPage.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MonstersPage } from '../../../src/pages/monsters/MonstersPage.js';
import { FIXTURE_SCENARIO_DB } from '../../fixtures/scenario-fixture.js';

function renderAt(path: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(FIXTURE_SCENARIO_DB), { status: 200 })),
  );
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/monsters" element={<MonstersPage />} />
        <Route path="/monsters/:slug" element={<MonstersPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MonstersPage', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('shows a list region and a detail region', async () => {
    renderAt('/monsters');
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /monster list/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('region', { name: /monster detail/i })).toBeInTheDocument();
  });

  it('shows an empty-detail message when no slug is selected', async () => {
    renderAt('/monsters');
    await waitFor(() => {
      expect(screen.getByText(/select a monster/i)).toBeInTheDocument();
    });
  });

  it('shows the selected monster name when slug is in URL', async () => {
    renderAt('/monsters/giant-rat');
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: /giant rat/i }),
      ).toBeInTheDocument();
    });
  });

  it('shows a "not found" message for an unknown slug', async () => {
    renderAt('/monsters/no-such-monster');
    await waitFor(() => {
      expect(screen.getByText(/no monster matches/i)).toBeInTheDocument();
    });
  });

  it('shows loading state before fetch resolves', async () => {
    // override the fetch with a never-resolving promise
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(
      <MemoryRouter initialEntries={['/monsters']}>
        <Routes>
          <Route path="/monsters" element={<MonstersPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/MonstersPage.test.tsx
```

Expected: FAIL — MonstersPage is currently a stub showing only the stage 2b banner.

- [ ] **Step 3: Add the `/monsters/:slug` route to the router**

In `packages/viewer/src/router.tsx`, find the line:

```typescript
    <Route path="/monsters" element={<MonstersPage />} />
```

and replace it with these two lines:

```typescript
    <Route path="/monsters" element={<MonstersPage />} />
    <Route path="/monsters/:slug" element={<MonstersPage />} />
```

- [ ] **Step 4: Create the CSS**

Create `packages/viewer/src/pages/monsters/MonstersPage.module.css`:

```css
.page {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 0;
  height: calc(100vh - 56px); /* viewport minus top nav */
  overflow: hidden;
}

.list {
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.detail {
  overflow: auto;
  padding: var(--space-5);
}

.emptyDetail {
  color: var(--color-text-muted);
  text-align: center;
  margin-top: var(--space-7);
}

.loading {
  padding: var(--space-5);
  color: var(--color-text-muted);
}

.errorBox {
  padding: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  color: var(--color-element-fire);
  margin: var(--space-4);
}

@media (max-width: 720px) {
  .page {
    grid-template-columns: 1fr;
    height: auto;
  }
  .list {
    height: 50vh;
    border-right: none;
    border-bottom: 1px solid var(--color-border);
  }
}
```

- [ ] **Step 5: Replace the `MonstersPage` stub**

Overwrite `packages/viewer/src/pages/monsters/MonstersPage.tsx`:

```typescript
import { useParams } from 'react-router-dom';
import { ScenarioDbProvider, useScenarioDb } from '../../lib/hooks/useScenarioDb.js';
import { findMonsterBySlug } from '../../lib/monsters.js';
import styles from './MonstersPage.module.css';

function MonstersPageInner() {
  const { data, loading, error } = useScenarioDb();
  const { slug } = useParams<{ slug?: string }>();

  if (loading) return <p className={styles.loading}>loading scenario data…</p>;
  if (error)
    return (
      <div className={styles.errorBox}>
        failed to load scenario data: {error.message}
      </div>
    );
  if (!data) return null;

  const selected = slug ? findMonsterBySlug(data.monsters, slug) : null;

  return (
    <div className={styles.page}>
      <section className={styles.list} aria-label="monster list">
        {/* Placeholder until Task 5 wires the list. */}
        <p style={{ padding: 'var(--space-4)', color: 'var(--color-text-faint)' }}>
          list pane
        </p>
      </section>
      <section className={styles.detail} aria-label="monster detail">
        {slug && !selected ? (
          <p className={styles.emptyDetail}>no monster matches slug “{slug}”</p>
        ) : !selected ? (
          <p className={styles.emptyDetail}>
            Select a monster from the list to view its details.
          </p>
        ) : (
          <>
            {/* Placeholder header — full MonsterDetail comes in Task 7. */}
            <h2>{selected.nameIdSingular}</h2>
          </>
        )}
      </section>
    </div>
  );
}

export function MonstersPage() {
  return (
    <ScenarioDbProvider>
      <MonstersPageInner />
    </ScenarioDbProvider>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/MonstersPage.test.tsx
```

Expected: 5/5 tests pass.

- [ ] **Step 7: Confirm the existing stub-pages test still recognises something at /monsters**

The stub test imports `MonstersPage` directly and asserts an h1. The new shell no longer renders an h1 — the stub test will fail. We need to update that test to assert the new behaviour.

Open `packages/viewer/tests/pages/stub-pages.test.tsx`. Remove the `MonstersPage` entry from BOTH `it.each` blocks. The file should now test only `ItemsPage`, `QuestRecords`, and `FilesOverview`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ItemsPage } from '../../src/pages/items/ItemsPage.js';
import { QuestRecords } from '../../src/pages/QuestRecords.js';
import { FilesOverview } from '../../src/pages/FilesOverview.js';

function renderInRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe('stub pages', () => {
  it.each([
    [ItemsPage, /items/i],
    [QuestRecords, /quest records/i],
    [FilesOverview, /files/i],
  ])('renders an h1 matching %s', (Comp, pattern) => {
    renderInRouter(<Comp />);
    expect(screen.getByRole('heading', { level: 1, name: pattern })).toBeInTheDocument();
  });

  it.each([ItemsPage, QuestRecords, FilesOverview])(
    'shows a "coming in stage" banner',
    (Comp) => {
      renderInRouter(<Comp />);
      expect(screen.getByText(/coming in stage/i)).toBeInTheDocument();
    },
  );
});
```

- [ ] **Step 8: Confirm the router test still passes**

The existing `tests/router.test.tsx` asserts that `/monsters` renders a heading matching `/monsters/i`. The new MonstersPage doesn't render an h1 — there's no "Monsters" heading at all when no monster is selected. The router test needs adjustment:

Open `packages/viewer/tests/router.test.tsx`. Find the line:

```typescript
    ['/monsters', /monsters/i],
```

Replace it with:

```typescript
    ['/monsters', /select a monster/i],
```

This asserts the empty-detail message instead.

But the router test uses `screen.getByRole('heading', { level: 1, name: headingPattern })`. The `Select a monster…` text isn't a heading. Adjust the test scaffold to handle two cases. Replace the entire `tests/router.test.tsx` with:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes } from 'react-router-dom';
import { Suspense } from 'react';
import { routes } from '../src/router.js';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Suspense fallback={<p>loading</p>}>
        <Routes>{routes}</Routes>
      </Suspense>
    </MemoryRouter>,
  );
}

describe('router', () => {
  it.each<[string, RegExp, 'heading' | 'text']>([
    ['/', /wiz6 data explorer/i, 'heading'],
    ['/items', /items/i, 'heading'],
    ['/quest', /quest records/i, 'heading'],
    ['/screens', /screens/i, 'heading'],
    ['/portraits', /portraits/i, 'heading'],
    ['/fonts', /fonts/i, 'heading'],
    ['/msg', /messages/i, 'heading'],
    ['/newgame', /newgame/i, 'heading'],
    ['/files', /files/i, 'heading'],
  ])('mounts a page at %s with an h1 matching %s', async (path, pattern, kind) => {
    renderAt(path);
    await waitFor(() => {
      if (kind === 'heading')
        expect(screen.getByRole('heading', { level: 1, name: pattern })).toBeInTheDocument();
      else expect(screen.getByText(pattern)).toBeInTheDocument();
    });
  });

  it('mounts MonstersPage at /monsters with list + detail regions', async () => {
    renderAt('/monsters');
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /monster list/i })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: /monster detail/i })).toBeInTheDocument();
    });
  });
});
```

The `/monsters` case is now its own test (verifies the regions exist instead of an h1).

- [ ] **Step 9: Run the full viewer test suite to confirm no regressions**

```bash
pnpm --filter @wiz6/viewer test
```

Expected: all tests pass. Approximate count: 134 (stage 2a baseline) + 3 (useScenarioDb) + lots-from-monsters.test (>20) + 7 (useUrlState) + 5 (MonstersPage) − 1 (one fewer stub test) + small adjustments to router test. Acceptable range: 165-185 viewer tests. No failures.

- [ ] **Step 10: Commit**

```bash
git add packages/viewer/src/router.tsx packages/viewer/src/pages/monsters/MonstersPage.tsx packages/viewer/src/pages/monsters/MonstersPage.module.css packages/viewer/tests/pages/monsters/MonstersPage.test.tsx packages/viewer/tests/pages/stub-pages.test.tsx packages/viewer/tests/router.test.tsx
git commit -m "feat(viewer): MonstersPage split-view shell + /monsters/:slug route"
```

---

## Task 5: `MonsterList` component (rows + selection)

The left rail. Renders all monsters (after filter/sort/search applied at the page level), navigates to `/monsters/:slug` on click, highlights the selected row, shows a footer count.

For 2b: no virtualisation, plain scrollable div. Filters/search/sort come in Task 6.

**Files:**
- Create: `packages/viewer/src/pages/monsters/MonsterList.tsx`
- Create: `packages/viewer/src/pages/monsters/MonsterList.module.css`
- Create: `packages/viewer/src/pages/monsters/MonsterRow.tsx`
- Test: `packages/viewer/tests/pages/monsters/MonsterList.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/pages/monsters/MonsterList.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { MonsterList } from '../../../src/pages/monsters/MonsterList.js';
import { FIXTURE_SCENARIO_DB } from '../../fixtures/scenario-fixture.js';

const FILLED = FIXTURE_SCENARIO_DB.monsters.filter((m) => !m.empty);

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="location">{loc.pathname}</p>;
}

function renderList(monsters = FILLED, selectedSlug?: string) {
  return render(
    <MemoryRouter initialEntries={[selectedSlug ? `/monsters/${selectedSlug}` : '/monsters']}>
      <Routes>
        <Route
          path="/monsters"
          element={
            <>
              <MonsterList monsters={monsters} totalFilled={FILLED.length} />
              <LocationProbe />
            </>
          }
        />
        <Route
          path="/monsters/:slug"
          element={
            <>
              <MonsterList monsters={monsters} totalFilled={FILLED.length} />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MonsterList', () => {
  it('renders one button per monster', () => {
    renderList();
    expect(screen.getAllByRole('button').length).toBe(FILLED.length);
  });

  it('renders monster names', () => {
    renderList();
    expect(screen.getByText('GIANT RAT')).toBeInTheDocument();
    expect(screen.getByText('PIT FIEND')).toBeInTheDocument();
  });

  it('renders the level range when min !== max', () => {
    renderList();
    // GIANT RAT has level 8-15 in the fixture
    expect(screen.getByText(/8-15/)).toBeInTheDocument();
  });

  it('renders the AC for each filled monster', () => {
    renderList();
    expect(screen.getByText(/AC -6/i)).toBeInTheDocument(); // FAERIE QUEEN
    expect(screen.getByText(/AC 10/i)).toBeInTheDocument(); // ZOMBIE
  });

  it('shows footer count', () => {
    renderList();
    expect(screen.getByText(/showing 5 \/ 5/i)).toBeInTheDocument();
  });

  it('shows filtered count when subset is shown', () => {
    renderList(FILLED.slice(0, 2));
    expect(screen.getByText(/showing 2 \/ 5/i)).toBeInTheDocument();
  });

  it('clicking a row navigates to /monsters/:slug', () => {
    renderList();
    fireEvent.click(screen.getByText('GIANT RAT'));
    expect(screen.getByTestId('location')).toHaveTextContent('/monsters/giant-rat');
  });

  it('marks the selected row via aria-current', () => {
    renderList(FILLED, 'wraith');
    const wraithRow = screen.getByText('WRAITH').closest('button')!;
    expect(wraithRow).toHaveAttribute('aria-current', 'true');
    const ratRow = screen.getByText('GIANT RAT').closest('button')!;
    expect(ratRow).not.toHaveAttribute('aria-current', 'true');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/MonsterList.test.tsx
```

Expected: FAIL (component doesn't exist).

- [ ] **Step 3: Create the row CSS**

Create `packages/viewer/src/pages/monsters/MonsterList.module.css`:

```css
.list {
  flex: 1;
  overflow-y: auto;
  font-size: 0.88rem;
}

.row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-2) var(--space-3);
  border: none;
  border-left: 3px solid transparent;
  background: transparent;
  color: var(--color-text);
  width: 100%;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  font-size: inherit;
}

.row:hover {
  background: var(--color-surface-elevated);
}

.rowActive {
  background: var(--color-surface-elevated);
  border-left-color: var(--color-accent);
}

.rowClass1 {
  border-left-color: var(--color-class-1);
}
.rowClass2 {
  border-left-color: var(--color-class-2);
}
.rowClass3 {
  border-left-color: var(--color-class-3);
}
.rowClass4 {
  border-left-color: var(--color-class-4);
}

.name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.level {
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 0.85rem;
}

.ac {
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 0.85rem;
}

.footer {
  padding: var(--space-2) var(--space-3);
  border-top: 1px solid var(--color-border);
  color: var(--color-text-faint);
  font-family: var(--font-mono);
  font-size: 0.85rem;
}
```

- [ ] **Step 4: Implement `MonsterRow`**

Create `packages/viewer/src/pages/monsters/MonsterRow.tsx`:

```typescript
import { useNavigate } from 'react-router-dom';
import type { ScenarioMonster } from '@wiz6/data';
import { monsterSlug, formatLevelRange } from '../../lib/monsters.js';
import styles from './MonsterList.module.css';

interface MonsterRowProps {
  monster: ScenarioMonster;
  selected: boolean;
}

const CLASS_STYLES: Record<number, string> = {
  1: styles.rowClass1!,
  2: styles.rowClass2!,
  3: styles.rowClass3!,
  4: styles.rowClass4!,
};

export function MonsterRow({ monster, selected }: MonsterRowProps) {
  const navigate = useNavigate();
  const slug = monsterSlug(monster);
  const classClass = CLASS_STYLES[monster.monsterClass] ?? '';
  const rowClass = `${styles.row} ${classClass} ${selected ? styles.rowActive : ''}`.trim();
  const name = monster.nameIdSingular || `(empty slot ${monster.index})`;
  const range = formatLevelRange(monster.monsterLevel, monster.monsterLevelMax);

  return (
    <button
      type="button"
      className={rowClass}
      aria-current={selected ? 'true' : undefined}
      onClick={() => navigate(`/monsters/${slug}`)}
    >
      <span className={styles.name}>{name}</span>
      <span className={styles.level}>lvl {range}</span>
      <span className={styles.ac}>AC {monster.monsterAC}</span>
    </button>
  );
}
```

- [ ] **Step 5: Implement `MonsterList`**

Create `packages/viewer/src/pages/monsters/MonsterList.tsx`:

```typescript
import { useParams } from 'react-router-dom';
import type { ScenarioMonster } from '@wiz6/data';
import { monsterSlug } from '../../lib/monsters.js';
import { MonsterRow } from './MonsterRow.js';
import styles from './MonsterList.module.css';

interface MonsterListProps {
  monsters: readonly ScenarioMonster[];
  totalFilled: number;
}

export function MonsterList({ monsters, totalFilled }: MonsterListProps) {
  const { slug } = useParams<{ slug?: string }>();
  return (
    <>
      <div className={styles.list} role="list">
        {monsters.map((m) => (
          <MonsterRow
            key={m.index}
            monster={m}
            selected={!!slug && monsterSlug(m) === slug}
          />
        ))}
      </div>
      <p className={styles.footer}>
        showing {monsters.length} / {totalFilled}
      </p>
    </>
  );
}
```

- [ ] **Step 6: Wire `MonsterList` into `MonstersPage`**

In `packages/viewer/src/pages/monsters/MonstersPage.tsx`, replace the placeholder `<p>list pane</p>` block with:

```typescript
import { MonsterList } from './MonsterList.js';
```

(at the top, with the other imports) and replace:

```typescript
      <section className={styles.list} aria-label="monster list">
        {/* Placeholder until Task 5 wires the list. */}
        <p style={{ padding: 'var(--space-4)', color: 'var(--color-text-faint)' }}>
          list pane
        </p>
      </section>
```

with:

```typescript
      <section className={styles.list} aria-label="monster list">
        <MonsterList
          monsters={data.monsters.filter((m) => !m.empty)}
          totalFilled={data.monsters.filter((m) => !m.empty).length}
        />
      </section>
```

This shows ALL filled monsters with no filtering — Task 6 adds the controls.

- [ ] **Step 7: Run the MonsterList test + the MonstersPage test**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/
```

Expected: both files green.

- [ ] **Step 8: Commit**

```bash
git add packages/viewer/src/pages/monsters/MonsterList.tsx packages/viewer/src/pages/monsters/MonsterList.module.css packages/viewer/src/pages/monsters/MonsterRow.tsx packages/viewer/src/pages/monsters/MonstersPage.tsx packages/viewer/tests/pages/monsters/MonsterList.test.tsx
git commit -m "feat(viewer): MonsterList + MonsterRow rendering filled monsters"
```

---

## Task 6: `MonsterFilters` (search, sort, filters)

The controls strip atop the list: search box, sort dropdown + direction toggle, "include empty" toggle, and a row of per-property filter dropdowns (each rendered as a `<details>` element with checkboxes inside — no popover lib needed). State is read from + written to URL via `useUrlState`.

**Files:**
- Create: `packages/viewer/src/pages/monsters/MonsterFilters.tsx`
- Create: `packages/viewer/src/pages/monsters/MonsterFilters.module.css`
- Test: `packages/viewer/tests/pages/monsters/MonsterFilters.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/pages/monsters/MonsterFilters.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { MonsterFilters } from '../../../src/pages/monsters/MonsterFilters.js';
import { uniqueFilterValues } from '../../../src/lib/monsters.js';
import { FIXTURE_SCENARIO_DB } from '../../fixtures/scenario-fixture.js';

const VALUES = uniqueFilterValues(FIXTURE_SCENARIO_DB.monsters);

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="location">{loc.search || '(empty)'}</p>;
}

function renderFilters(initial = '/monsters') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <MonsterFilters values={VALUES} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('MonsterFilters', () => {
  it('renders a search box', () => {
    renderFilters();
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it('typing into search updates the URL', () => {
    renderFilters();
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'rat' } });
    expect(screen.getByTestId('location')).toHaveTextContent('search=rat');
  });

  it('renders a sort dropdown defaulting to name', () => {
    renderFilters();
    const sort = screen.getByLabelText(/sort/i) as HTMLSelectElement;
    expect(sort.value).toBe('name');
  });

  it('changing sort updates the URL', () => {
    renderFilters();
    fireEvent.change(screen.getByLabelText(/sort/i), { target: { value: 'level' } });
    expect(screen.getByTestId('location')).toHaveTextContent('sort=level');
  });

  it('toggling direction adds dir=desc to the URL', () => {
    renderFilters();
    fireEvent.click(screen.getByRole('button', { name: /asc|desc/i }));
    expect(screen.getByTestId('location')).toHaveTextContent('dir=desc');
  });

  it('renders an "include empty" toggle', () => {
    renderFilters();
    expect(screen.getByLabelText(/include empty/i)).toBeInTheDocument();
  });

  it('toggling include-empty updates the URL', () => {
    renderFilters();
    fireEvent.click(screen.getByLabelText(/include empty/i));
    expect(screen.getByTestId('location')).toHaveTextContent('empty=1');
  });

  it('renders a class filter with checkboxes for each known class', () => {
    renderFilters();
    fireEvent.click(screen.getByText(/class/i));
    // After opening the details, checkboxes for each class should be present
    for (const c of VALUES.classes) {
      expect(screen.getByLabelText(`class ${c}`)).toBeInTheDocument();
    }
  });

  it('checking a class adds it to the URL filter', () => {
    renderFilters();
    fireEvent.click(screen.getByText(/class/i));
    fireEvent.click(screen.getByLabelText('class 2'));
    expect(screen.getByTestId('location')).toHaveTextContent('class=2');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/MonsterFilters.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Create the CSS**

Create `packages/viewer/src/pages/monsters/MonsterFilters.module.css`:

```css
.controls {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.searchRow {
  display: flex;
  gap: var(--space-2);
}

.search {
  flex: 1;
  padding: var(--space-2);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  border-radius: 2px;
  font-family: inherit;
  font-size: 0.92rem;
}

.search:focus {
  outline: 1px solid var(--color-accent);
  outline-offset: -1px;
}

.sortRow {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.sortRow select {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: var(--space-1) var(--space-2);
  border-radius: 2px;
  font-family: inherit;
}

.dirButton {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: var(--space-1) var(--space-2);
  border-radius: 2px;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.85rem;
}

.toggleRow {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.toggleRow input[type='checkbox'] {
  margin-right: var(--space-1);
}

.filtersRow {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.filterDetails {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 2px;
  padding: 0;
  font-size: 0.85rem;
}

.filterDetails summary {
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
  list-style: none;
  color: var(--color-text-muted);
}

.filterDetails summary::-webkit-details-marker {
  display: none;
}

.filterDetails[open] summary {
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border);
}

.filterOptions {
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  max-height: 220px;
  overflow-y: auto;
}

.filterOptions label {
  display: flex;
  gap: var(--space-1);
  align-items: center;
  color: var(--color-text);
}

.filterCount {
  margin-left: var(--space-1);
  color: var(--color-text-faint);
  font-family: var(--font-mono);
  font-size: 0.78rem;
}
```

- [ ] **Step 4: Implement `MonsterFilters`**

Create `packages/viewer/src/pages/monsters/MonsterFilters.tsx`:

```typescript
import { useUrlState } from '../../lib/hooks/useUrlState.js';
import type { UniqueFilterValues, MonsterSortField } from '../../lib/monsters.js';
import styles from './MonsterFilters.module.css';

const SORT_FIELDS: { value: MonsterSortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'level', label: 'Level' },
  { value: 'ac', label: 'AC' },
  { value: 'hp', label: 'HP' },
  { value: 'xp', label: 'XP-on-kill' },
  { value: 'gold', label: 'Gold' },
];

interface MonsterFiltersProps {
  values: UniqueFilterValues;
}

function FilterDetails({
  label,
  urlKey,
  options,
  formatOption,
}: {
  label: string;
  urlKey: string;
  options: readonly (string | number)[];
  formatOption: (opt: string | number) => string;
}) {
  const [selected, setSelected] = useUrlState.list(urlKey);
  return (
    <details className={styles.filterDetails}>
      <summary>
        {label}
        {selected.length > 0 ? <span className={styles.filterCount}> ({selected.length})</span> : null}
      </summary>
      <div className={styles.filterOptions}>
        {options.map((opt) => {
          const optStr = String(opt);
          const checked = selected.includes(optStr);
          return (
            <label key={optStr}>
              <input
                type="checkbox"
                aria-label={formatOption(opt)}
                checked={checked}
                onChange={() => {
                  if (checked) setSelected(selected.filter((v) => v !== optStr));
                  else setSelected([...selected, optStr]);
                }}
              />
              {formatOption(opt)}
            </label>
          );
        })}
      </div>
    </details>
  );
}

export function MonsterFilters({ values }: MonsterFiltersProps) {
  const [search, setSearch] = useUrlState('search');
  const [sort, setSort] = useUrlState('sort');
  const [dir, setDir] = useUrlState('dir');
  const [empty, setEmpty] = useUrlState('empty');

  const currentSort = (sort as MonsterSortField | null) ?? 'name';
  const currentDir = dir === 'desc' ? 'desc' : 'asc';

  return (
    <div className={styles.controls}>
      <div className={styles.searchRow}>
        <input
          className={styles.search}
          type="search"
          placeholder="search names…"
          value={search ?? ''}
          onChange={(e) => setSearch(e.target.value || null)}
        />
      </div>

      <div className={styles.sortRow}>
        <label htmlFor="monster-sort">Sort</label>
        <select
          id="monster-sort"
          value={currentSort}
          onChange={(e) => setSort(e.target.value === 'name' ? null : e.target.value)}
        >
          {SORT_FIELDS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.dirButton}
          onClick={() => setDir(currentDir === 'asc' ? 'desc' : null)}
          aria-label={`sort direction ${currentDir}`}
        >
          {currentDir === 'asc' ? '↑ asc' : '↓ desc'}
        </button>
      </div>

      <div className={styles.toggleRow}>
        <label>
          <input
            type="checkbox"
            checked={empty === '1'}
            onChange={(e) => setEmpty(e.target.checked ? '1' : null)}
          />
          include empty slots
        </label>
      </div>

      <div className={styles.filtersRow}>
        <FilterDetails
          label="class"
          urlKey="class"
          options={values.classes}
          formatOption={(c) => `class ${c}`}
        />
        <FilterDetails
          label="element"
          urlKey="element"
          options={values.elements}
          formatOption={(e) => `element ${e}`}
        />
        <FilterDetails
          label="family"
          urlKey="family"
          options={values.families}
          formatOption={(f) => `family ${f}`}
        />
        <FilterDetails
          label="creature kind"
          urlKey="creatureKind"
          options={values.creatureKinds}
          formatOption={(k) => `kind ${k}`}
        />
        <FilterDetails
          label="sex"
          urlKey="sex"
          options={values.sexes}
          formatOption={(s) => `sex ${s}`}
        />
        <FilterDetails
          label="behavior"
          urlKey="behavior"
          options={values.behaviorClasses}
          formatOption={(b) => `behavior ${b}`}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire `MonsterFilters` into `MonstersPage` (and use filter state)**

Update `packages/viewer/src/pages/monsters/MonstersPage.tsx` so it reads URL state, applies filters via the helpers, and passes the result to `MonsterList`. Replace the file contents with:

```typescript
import { useParams } from 'react-router-dom';
import { ScenarioDbProvider, useScenarioDb } from '../../lib/hooks/useScenarioDb.js';
import { useUrlState } from '../../lib/hooks/useUrlState.js';
import {
  findMonsterBySlug,
  filterMonsters,
  searchMonsters,
  sortMonsters,
  uniqueFilterValues,
  type MonsterFilter,
  type MonsterSortField,
  type SortDir,
} from '../../lib/monsters.js';
import { MonsterFilters } from './MonsterFilters.js';
import { MonsterList } from './MonsterList.js';
import styles from './MonstersPage.module.css';

function MonstersPageInner() {
  const { data, loading, error } = useScenarioDb();
  const { slug } = useParams<{ slug?: string }>();

  const [search] = useUrlState('search');
  const [sort] = useUrlState('sort');
  const [dir] = useUrlState('dir');
  const [empty] = useUrlState('empty');
  const [classes] = useUrlState.list('class');
  const [elements] = useUrlState.list('element');
  const [families] = useUrlState.list('family');
  const [creatureKinds] = useUrlState.list('creatureKind');
  const [sexes] = useUrlState.list('sex');
  const [behaviorClasses] = useUrlState.list('behavior');

  if (loading) return <p className={styles.loading}>loading scenario data…</p>;
  if (error)
    return (
      <div className={styles.errorBox}>
        failed to load scenario data: {error.message}
      </div>
    );
  if (!data) return null;

  const filter: MonsterFilter = {
    classes: classes.map(Number),
    elements: elements.map(Number),
    families,
    creatureKinds: creatureKinds.map(Number),
    sexes: sexes.map(Number),
    behaviorClasses: behaviorClasses.map(Number),
    includeEmpty: empty === '1',
  };
  const sortField = (sort as MonsterSortField | null) ?? 'name';
  const sortDir: SortDir = dir === 'desc' ? 'desc' : 'asc';

  const filtered = sortMonsters(
    searchMonsters(filterMonsters(data.monsters, filter), search ?? ''),
    sortField,
    sortDir,
  );
  const totalFilled = data.monsters.filter((m) => !m.empty).length;
  const selected = slug ? findMonsterBySlug(data.monsters, slug) : null;
  const filterValues = uniqueFilterValues(data.monsters);

  return (
    <div className={styles.page}>
      <section className={styles.list} aria-label="monster list">
        <MonsterFilters values={filterValues} />
        <MonsterList monsters={filtered} totalFilled={totalFilled} />
      </section>
      <section className={styles.detail} aria-label="monster detail">
        {slug && !selected ? (
          <p className={styles.emptyDetail}>no monster matches slug “{slug}”</p>
        ) : !selected ? (
          <p className={styles.emptyDetail}>
            Select a monster from the list to view its details.
          </p>
        ) : (
          <h2>{selected.nameIdSingular}</h2>
        )}
      </section>
    </div>
  );
}

export function MonstersPage() {
  return (
    <ScenarioDbProvider>
      <MonstersPageInner />
    </ScenarioDbProvider>
  );
}
```

- [ ] **Step 6: Run the new test + the MonstersPage test + the MonsterList test**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/viewer/src/pages/monsters/MonsterFilters.tsx packages/viewer/src/pages/monsters/MonsterFilters.module.css packages/viewer/src/pages/monsters/MonstersPage.tsx packages/viewer/tests/pages/monsters/MonsterFilters.test.tsx
git commit -m "feat(viewer): MonsterFilters wired to URL state (search, sort, filters)"
```

---

## Task 7: `MonsterDetail` shell with tab bar

The right pane structure: header strip (name + name slots) and a tab bar across the top (Overview / Attacks / Saves). Active tab driven by `?tab=` URL param. Each tab's content is rendered by a tab component (Task 8, 11, 12); for now place stub `<p>` placeholders.

**Files:**
- Create: `packages/viewer/src/pages/monsters/MonsterDetail.tsx`
- Create: `packages/viewer/src/pages/monsters/MonsterDetail.module.css`
- Test: `packages/viewer/tests/pages/monsters/MonsterDetail.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/pages/monsters/MonsterDetail.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { MonsterDetail } from '../../../src/pages/monsters/MonsterDetail.js';
import { FIXTURE_SCENARIO_DB } from '../../fixtures/scenario-fixture.js';

const WRAITH = FIXTURE_SCENARIO_DB.monsters[3]!;

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="location">{loc.search || '(empty)'}</p>;
}

function renderDetail(initial = '/monsters/wraith') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <MonsterDetail monster={WRAITH} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('MonsterDetail', () => {
  it('shows monster name as h2', () => {
    renderDetail();
    expect(screen.getByRole('heading', { level: 2, name: /wraith/i })).toBeInTheDocument();
  });

  it('shows all four name slots in the header', () => {
    renderDetail();
    expect(screen.getByText('WRAITHS')).toBeInTheDocument();
    expect(screen.getByText('SPIRIT')).toBeInTheDocument();
    expect(screen.getByText('SPIRITS')).toBeInTheDocument();
  });

  it.each([
    ['Overview', 'overview'],
    ['Attacks', 'attacks'],
    ['Saves & Resistances', 'saves'],
  ])('renders the %s tab button', (label) => {
    renderDetail();
    expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
  });

  it('defaults to Overview when ?tab is not set', () => {
    renderDetail('/monsters/wraith');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it('reads active tab from ?tab=', () => {
    renderDetail('/monsters/wraith?tab=saves');
    expect(screen.getByRole('tab', { name: 'Saves & Resistances' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('clicking a tab updates the URL', () => {
    renderDetail();
    fireEvent.click(screen.getByRole('tab', { name: 'Attacks' }));
    expect(screen.getByTestId('location')).toHaveTextContent('tab=attacks');
  });

  it('renders a placeholder body for each tab', () => {
    renderDetail('/monsters/wraith?tab=attacks');
    expect(screen.getByTestId('tab-attacks')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/MonsterDetail.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Create CSS**

Create `packages/viewer/src/pages/monsters/MonsterDetail.module.css`:

```css
.header {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-bottom: var(--space-4);
}

.title {
  font-size: 1.6rem;
  margin: 0;
  color: var(--color-text);
}

.subHeader {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 0.85rem;
}

.subHeader span::before {
  content: '·';
  margin-right: var(--space-2);
  color: var(--color-text-faint);
}

.subHeader span:first-child::before {
  content: '';
  margin: 0;
}

.tabBar {
  display: flex;
  gap: var(--space-2);
  border-bottom: 1px solid var(--color-border);
  margin-bottom: var(--space-4);
}

.tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  color: var(--color-text-muted);
  font-family: inherit;
  font-size: 0.92rem;
}

.tab:hover {
  color: var(--color-text);
}

.tabActive {
  color: var(--color-text);
  border-bottom-color: var(--color-accent);
}

.placeholder {
  color: var(--color-text-faint);
  font-style: italic;
}
```

- [ ] **Step 4: Implement `MonsterDetail`**

Create `packages/viewer/src/pages/monsters/MonsterDetail.tsx`:

```typescript
import type { ScenarioMonster } from '@wiz6/data';
import { useUrlState } from '../../lib/hooks/useUrlState.js';
import styles from './MonsterDetail.module.css';

type TabId = 'overview' | 'attacks' | 'saves';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'attacks', label: 'Attacks' },
  { id: 'saves', label: 'Saves & Resistances' },
];

interface MonsterDetailProps {
  monster: ScenarioMonster;
}

export function MonsterDetail({ monster }: MonsterDetailProps) {
  const [rawTab, setTab] = useUrlState('tab');
  const currentTab: TabId = (TABS.find((t) => t.id === rawTab)?.id ?? 'overview') as TabId;
  const name = monster.nameIdSingular || `(empty slot ${monster.index})`;

  return (
    <>
      <header className={styles.header}>
        <h2 className={styles.title}>{name}</h2>
        <div className={styles.subHeader}>
          {monster.nameIdSingular ? <span>{monster.nameIdSingular}</span> : null}
          {monster.nameIdPlural ? <span>{monster.nameIdPlural}</span> : null}
          {monster.nameUnidSingular ? <span>{monster.nameUnidSingular}</span> : null}
          {monster.nameUnidPlural ? <span>{monster.nameUnidPlural}</span> : null}
        </div>
      </header>

      <div className={styles.tabBar} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={currentTab === t.id}
            className={`${styles.tab} ${currentTab === t.id ? styles.tabActive : ''}`.trim()}
            onClick={() => setTab(t.id === 'overview' ? null : t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" data-testid={`tab-${currentTab}`}>
        <p className={styles.placeholder}>
          {currentTab} content arrives in subsequent tasks (8 / 11 / 12).
        </p>
      </div>
    </>
  );
}
```

- [ ] **Step 5: Wire `MonsterDetail` into `MonstersPage`**

In `packages/viewer/src/pages/monsters/MonstersPage.tsx`, replace the inline detail rendering:

```typescript
        ) : (
          <h2>{selected.nameIdSingular}</h2>
        )}
```

with:

```typescript
        ) : (
          <MonsterDetail monster={selected} />
        )}
```

Add the import at the top:

```typescript
import { MonsterDetail } from './MonsterDetail.js';
```

- [ ] **Step 6: Run the tests**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/viewer/src/pages/monsters/MonsterDetail.tsx packages/viewer/src/pages/monsters/MonsterDetail.module.css packages/viewer/src/pages/monsters/MonstersPage.tsx packages/viewer/tests/pages/monsters/MonsterDetail.test.tsx
git commit -m "feat(viewer): MonsterDetail shell with tab bar (URL-driven)"
```

---

## Task 8: `OverviewTab`

The at-a-glance stat card: two-column key-value layout with every overview-relevant field.

**Files:**
- Create: `packages/viewer/src/pages/monsters/tabs/OverviewTab.tsx`
- Create: `packages/viewer/src/pages/monsters/tabs/OverviewTab.module.css`
- Test: `packages/viewer/tests/pages/monsters/tabs/OverviewTab.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/pages/monsters/tabs/OverviewTab.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OverviewTab } from '../../../../src/pages/monsters/tabs/OverviewTab.js';
import { FIXTURE_SCENARIO_DB } from '../../../fixtures/scenario-fixture.js';

const PIT_FIEND = FIXTURE_SCENARIO_DB.monsters[2]!;
const GIANT_RAT = FIXTURE_SCENARIO_DB.monsters[0]!;

describe('OverviewTab', () => {
  it('renders class with its label', () => {
    render(<OverviewTab monster={PIT_FIEND} />);
    expect(screen.getByText(/3.*demon\/elite/i)).toBeInTheDocument();
  });

  it('renders level range when min !== max', () => {
    render(<OverviewTab monster={GIANT_RAT} />);
    expect(screen.getByText(/8-15/)).toBeInTheDocument();
  });

  it('renders single level when min === max', () => {
    render(<OverviewTab monster={PIT_FIEND} />);
    const levelCell = screen.getByLabelText(/^level$/i);
    expect(levelCell).toHaveTextContent('12');
  });

  it('renders AC with the wiz6 convention note', () => {
    render(<OverviewTab monster={GIANT_RAT} />);
    expect(screen.getByText(/AC/i)).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();
    expect(screen.getByText(/lower = better/i)).toBeInTheDocument();
  });

  it('renders HP dice', () => {
    render(<OverviewTab monster={PIT_FIEND} />);
    expect(screen.getByText('14d4')).toBeInTheDocument();
  });

  it('renders XP-on-kill', () => {
    render(<OverviewTab monster={PIT_FIEND} />);
    expect(screen.getByText(/56,?786/)).toBeInTheDocument();
  });

  it('renders gold drop with the tens-of-gold gloss', () => {
    render(<OverviewTab monster={PIT_FIEND} />);
    expect(screen.getByText(/140/)).toBeInTheDocument();
    expect(screen.getByText(/≈ 1,?400 gp/i)).toBeInTheDocument();
  });

  it('renders element badge with element label', () => {
    render(<OverviewTab monster={PIT_FIEND} />);
    expect(screen.getByText(/fire/i)).toBeInTheDocument();
  });

  it('renders family pip pattern', () => {
    render(<OverviewTab monster={GIANT_RAT} />);
    expect(screen.getByText(/6,4,14,16/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/tabs/OverviewTab.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Create CSS**

Create `packages/viewer/src/pages/monsters/tabs/OverviewTab.module.css`:

```css
.grid {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: var(--space-2) var(--space-4);
  align-items: baseline;
}

.label {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  text-transform: lowercase;
  letter-spacing: 0.02em;
}

.value {
  color: var(--color-text);
  font-family: var(--font-mono);
}

.gloss {
  color: var(--color-text-faint);
  font-size: 0.85rem;
  margin-left: var(--space-2);
}

.badge {
  display: inline-block;
  padding: 2px var(--space-2);
  border-radius: 2px;
  font-size: 0.78rem;
  font-family: var(--font-mono);
  background: var(--color-surface-elevated);
  color: var(--color-text);
}

.badgeFire { color: var(--color-element-fire); }
.badgeCold { color: var(--color-element-cold); }
.badgePoison { color: var(--color-element-poison); }
.badgeMental { color: var(--color-element-mental); }

.badgeClass1 { color: var(--color-class-1); }
.badgeClass2 { color: var(--color-class-2); }
.badgeClass3 { color: var(--color-class-3); }
.badgeClass4 { color: var(--color-class-4); }
```

- [ ] **Step 4: Implement `OverviewTab`**

Create `packages/viewer/src/pages/monsters/tabs/OverviewTab.tsx`:

```typescript
import type { ScenarioMonster } from '@wiz6/data';
import {
  familyKey,
  formatHpDice,
  formatLevelRange,
} from '../../../lib/monsters.js';
import styles from './OverviewTab.module.css';

const CLASS_LABEL: Record<number, string> = {
  1: '1 — animal/beast',
  2: '2 — humanoid/undead',
  3: '3 — demon/elite',
  4: '4 — ultimate boss',
};

const ELEMENT_LABEL: Record<number, { label: string; cls?: string }> = {
  1: { label: 'fire', cls: 'badgeFire' },
  2: { label: 'earth' },
  3: { label: 'cold', cls: 'badgeCold' },
  4: { label: 'acid' },
  5: { label: 'disease' },
  6: { label: 'water' },
  7: { label: 'vampiric' },
  8: { label: 'poison', cls: 'badgePoison' },
  9: { label: 'plant poison' },
  11: { label: 'mental', cls: 'badgeMental' },
  12: { label: 'charm' },
};

const CREATURE_KIND_LABEL: Record<number, string> = {
  1: 'humanoid soldier',
  2: 'stone elemental',
  3: 'elite humanoid',
  4: 'rodent/cat',
  5: 'flying',
  6: 'plant',
  7: 'blob/slime',
  8: 'undead',
  10: 'elite warrior',
};

const SEX_LABEL: Record<number, string> = {
  0: 'male humanoid',
  1: 'female',
  2: 'neuter/creature',
};

const CLASS_BADGE: Record<number, string | undefined> = {
  1: styles.badgeClass1,
  2: styles.badgeClass2,
  3: styles.badgeClass3,
  4: styles.badgeClass4,
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className={styles.label} aria-label={label}>
        {label}
      </div>
      <div className={styles.value}>{children}</div>
    </>
  );
}

interface OverviewTabProps {
  monster: ScenarioMonster;
}

export function OverviewTab({ monster: m }: OverviewTabProps) {
  const elem = ELEMENT_LABEL[m.specialAttackElement];
  const elemBadgeClass = elem?.cls ? styles[elem.cls] : undefined;
  return (
    <div className={styles.grid}>
      <Row label="class">
        <span className={`${styles.badge} ${CLASS_BADGE[m.monsterClass] ?? ''}`.trim()}>
          {CLASS_LABEL[m.monsterClass] ?? `class ${m.monsterClass}`}
        </span>
        <span className={styles.gloss}>· sub {m.monsterSubClass}</span>
      </Row>
      <Row label="level">{formatLevelRange(m.monsterLevel, m.monsterLevelMax)}</Row>
      <Row label="ac">
        {m.monsterAC}
        <span className={styles.gloss}>(wiz6: lower = better)</span>
      </Row>
      <Row label="hp">{formatHpDice(m.hpDiceCount, m.hpDiceSides)}</Row>
      <Row label="group dice">{formatHpDice(m.groupDiceCount, m.groupDiceSides)}</Row>
      <Row label="xp on kill">{m.xpOnKill.toLocaleString()}</Row>
      <Row label="gold">
        {m.goldStat}
        <span className={styles.gloss}>≈ {(m.goldStat * 10).toLocaleString()} gp</span>
      </Row>
      <Row label="element">
        {elem ? (
          <span className={`${styles.badge} ${elemBadgeClass ?? ''}`.trim()}>{elem.label}</span>
        ) : (
          <span className={styles.gloss}>element {m.specialAttackElement}</span>
        )}
      </Row>
      <Row label="sex">{SEX_LABEL[m.monsterSex] ?? `sex ${m.monsterSex}`}</Row>
      <Row label="creature kind">
        {CREATURE_KIND_LABEL[m.creatureKind] ?? `kind ${m.creatureKind}`}
      </Row>
      <Row label="behavior">
        {m.monsterBehaviorClass}
        <span className={styles.gloss}>(see docs/re/scenario-dbs.md)</span>
      </Row>
      <Row label="move stat">{m.moveStat}</Row>
      <Row label="sprite group">{m.spriteGroup}</Row>
      <Row label="family">
        <span className={styles.gloss}>{familyKey(m.familyId)}</span>
      </Row>
    </div>
  );
}
```

- [ ] **Step 5: Wire `OverviewTab` into `MonsterDetail`**

In `packages/viewer/src/pages/monsters/MonsterDetail.tsx`, replace:

```typescript
      <div role="tabpanel" data-testid={`tab-${currentTab}`}>
        <p className={styles.placeholder}>
          {currentTab} content arrives in subsequent tasks (8 / 11 / 12).
        </p>
      </div>
```

with:

```typescript
      <div role="tabpanel" data-testid={`tab-${currentTab}`}>
        {currentTab === 'overview' ? (
          <OverviewTab monster={monster} />
        ) : (
          <p className={styles.placeholder}>
            {currentTab} content arrives in a subsequent task (11 / 12).
          </p>
        )}
      </div>
```

Add the import:

```typescript
import { OverviewTab } from './tabs/OverviewTab.js';
```

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/viewer/src/pages/monsters/tabs/OverviewTab.tsx packages/viewer/src/pages/monsters/tabs/OverviewTab.module.css packages/viewer/src/pages/monsters/MonsterDetail.tsx packages/viewer/tests/pages/monsters/tabs/OverviewTab.test.tsx
git commit -m "feat(viewer): OverviewTab — at-a-glance monster stats"
```

---

## Task 9: `HeatmapRow` component

Reusable cell row that renders a sequence of percentage values as coloured cells (cold → hot, with a glow on the 125 immunity sentinel). Hover a cell shows a tooltip with byte offset + percentage. Used by `SavesTab` (Task 10), and later (stage 2c) by other resistance-style displays.

**Files:**
- Create: `packages/viewer/src/components/HeatmapRow.tsx`
- Create: `packages/viewer/src/components/HeatmapRow.module.css`
- Test: `packages/viewer/tests/components/HeatmapRow.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/components/HeatmapRow.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeatmapRow } from '../../src/components/HeatmapRow.js';

describe('HeatmapRow', () => {
  it('renders one cell per value', () => {
    render(<HeatmapRow label="saves" values={[0, 25, 50, 75, 100]} startOffset={113} />);
    expect(screen.getAllByRole('cell').length).toBe(5);
  });

  it('shows the value inside each cell', () => {
    render(<HeatmapRow label="saves" values={[0, 25, 50, 75, 100]} startOffset={113} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('renders the label as a row header', () => {
    render(<HeatmapRow label="extendedSaves" values={[0]} startOffset={85} />);
    expect(screen.getByText('extendedSaves')).toBeInTheDocument();
  });

  it('annotates each cell with its byte offset via title attribute', () => {
    render(<HeatmapRow label="saves" values={[15, 40, 30, 10, 5]} startOffset={113} />);
    const firstCell = screen.getByText('15').closest('[role="cell"]')!;
    expect(firstCell).toHaveAttribute('title', expect.stringMatching(/byte 113/i));
    const lastCell = screen.getByText('5').closest('[role="cell"]')!;
    expect(lastCell).toHaveAttribute('title', expect.stringMatching(/byte 117/i));
  });

  it('marks the 125 immunity sentinel with the immunity class', () => {
    render(<HeatmapRow label="ext" values={[0, 125, 50]} startOffset={85} />);
    const immune = screen.getByText('125').closest('[role="cell"]')!;
    expect(immune.className).toMatch(/immunity/i);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @wiz6/viewer test tests/components/HeatmapRow.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Create CSS**

Create `packages/viewer/src/components/HeatmapRow.module.css`:

```css
.row {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: var(--space-3);
  align-items: center;
  margin-bottom: var(--space-2);
}

.label {
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 0.85rem;
}

.cells {
  display: flex;
  gap: 2px;
}

.cell {
  flex: 1;
  min-width: 32px;
  padding: var(--space-1) var(--space-2);
  text-align: center;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--color-text);
  background: var(--color-heatmap-cold);
  border-radius: 2px;
}

.immunity {
  background: var(--color-immunity-glow);
  color: #1a1500;
  box-shadow: 0 0 4px var(--color-immunity-glow);
}
```

- [ ] **Step 4: Implement `HeatmapRow`**

Create `packages/viewer/src/components/HeatmapRow.tsx`:

```typescript
import styles from './HeatmapRow.module.css';

const COLD = [12, 12, 20]; // var(--color-heatmap-cold) #2a2f44 ≈ (42,47,68); using darker for low-saturation start
const HOT = [216, 168, 80]; // var(--color-heatmap-hot) #d8a850
const IMMUNITY = 125;

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function cellColor(value: number): string {
  if (value >= IMMUNITY) return ''; // immunity styling applied via class
  const t = Math.min(1, Math.max(0, value / 100));
  const r = lerp(COLD[0]!, HOT[0]!, t);
  const g = lerp(COLD[1]!, HOT[1]!, t);
  const b = lerp(COLD[2]!, HOT[2]!, t);
  return `rgb(${r}, ${g}, ${b})`;
}

interface HeatmapRowProps {
  label: string;
  values: readonly number[];
  startOffset: number;
}

export function HeatmapRow({ label, values, startOffset }: HeatmapRowProps) {
  return (
    <div className={styles.row}>
      <div className={styles.label}>{label}</div>
      <div className={styles.cells} role="row">
        {values.map((v, i) => {
          const offset = startOffset + i;
          const isImmunity = v >= IMMUNITY;
          const className = `${styles.cell} ${isImmunity ? styles.immunity : ''}`.trim();
          const inlineColor = isImmunity ? undefined : cellColor(v);
          return (
            <div
              key={i}
              role="cell"
              className={className}
              style={inlineColor ? { background: inlineColor } : undefined}
              title={`byte ${offset}: ${v}${isImmunity ? ' (immunity)' : '%'}`}
            >
              {v}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @wiz6/viewer test tests/components/HeatmapRow.test.tsx
```

Expected: 5/5 pass.

- [ ] **Step 6: Commit**

```bash
git add packages/viewer/src/components/HeatmapRow.tsx packages/viewer/src/components/HeatmapRow.module.css packages/viewer/tests/components/HeatmapRow.test.tsx
git commit -m "feat(viewer): HeatmapRow component with immunity-glow rendering"
```

---

## Task 10: `SavesTab`

Renders all four save/resistance arrays as heatmap rows: `saveTable[5]`, `effectChanceTable[5]`, `extendedSaves[12]`, `attributeSaves[4]`. Each labelled.

**Files:**
- Create: `packages/viewer/src/pages/monsters/tabs/SavesTab.tsx`
- Test: `packages/viewer/tests/pages/monsters/tabs/SavesTab.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/pages/monsters/tabs/SavesTab.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SavesTab } from '../../../../src/pages/monsters/tabs/SavesTab.js';
import { FIXTURE_SCENARIO_DB } from '../../../fixtures/scenario-fixture.js';

const WRAITH = FIXTURE_SCENARIO_DB.monsters[3]!;
const ZOMBIE = FIXTURE_SCENARIO_DB.monsters[1]!;

describe('SavesTab', () => {
  it('renders four heatmap rows labelled correctly', () => {
    render(<SavesTab monster={WRAITH} />);
    expect(screen.getByText('saveTable')).toBeInTheDocument();
    expect(screen.getByText('effectChanceTable')).toBeInTheDocument();
    expect(screen.getByText('extendedSaves')).toBeInTheDocument();
    expect(screen.getByText('attributeSaves')).toBeInTheDocument();
  });

  it('renders 5 + 5 + 12 + 4 = 26 cells', () => {
    render(<SavesTab monster={WRAITH} />);
    expect(screen.getAllByRole('cell').length).toBe(26);
  });

  it('renders the SPIRIT-family extended-saves pattern (seven 125s)', () => {
    render(<SavesTab monster={WRAITH} />);
    const immunity = screen.getAllByText('125');
    expect(immunity.length).toBe(7);
  });

  it('renders the zombie save template', () => {
    render(<SavesTab monster={ZOMBIE} />);
    // ZOMBIE has saveTable = [15, 40, 30, 10, 5]
    expect(screen.getAllByText('15').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('40').length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/tabs/SavesTab.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `SavesTab`**

Create `packages/viewer/src/pages/monsters/tabs/SavesTab.tsx`:

```typescript
import type { ScenarioMonster } from '@wiz6/data';
import { HeatmapRow } from '../../../components/HeatmapRow.js';

interface SavesTabProps {
  monster: ScenarioMonster;
}

export function SavesTab({ monster: m }: SavesTabProps) {
  return (
    <div>
      <HeatmapRow label="saveTable" values={m.saveTable} startOffset={113} />
      <HeatmapRow label="effectChanceTable" values={m.effectChanceTable} startOffset={121} />
      <HeatmapRow label="extendedSaves" values={m.extendedSaves} startOffset={85} />
      <HeatmapRow label="attributeSaves" values={m.attributeSaves} startOffset={144} />
    </div>
  );
}
```

- [ ] **Step 4: Wire into `MonsterDetail`**

In `packages/viewer/src/pages/monsters/MonsterDetail.tsx`, replace the existing tab-panel block:

```typescript
      <div role="tabpanel" data-testid={`tab-${currentTab}`}>
        {currentTab === 'overview' ? (
          <OverviewTab monster={monster} />
        ) : (
          <p className={styles.placeholder}>
            {currentTab} content arrives in a subsequent task (11 / 12).
          </p>
        )}
      </div>
```

with:

```typescript
      <div role="tabpanel" data-testid={`tab-${currentTab}`}>
        {currentTab === 'overview' ? (
          <OverviewTab monster={monster} />
        ) : currentTab === 'saves' ? (
          <SavesTab monster={monster} />
        ) : (
          <p className={styles.placeholder}>
            {currentTab} content arrives in task 11.
          </p>
        )}
      </div>
```

Add the import:

```typescript
import { SavesTab } from './tabs/SavesTab.js';
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/viewer/src/pages/monsters/tabs/SavesTab.tsx packages/viewer/src/pages/monsters/MonsterDetail.tsx packages/viewer/tests/pages/monsters/tabs/SavesTab.test.tsx
git commit -m "feat(viewer): SavesTab — four heatmap rows for resistance / save patterns"
```

---

## Task 11: `AttacksTab`

Three columns side-by-side, one per attack record. Each column shows: dice + bonus + style, the per-attack special-effect chances, poison strength, attack extra bytes. Unused attacks (dice count = 0) are visibly dimmed.

**Files:**
- Create: `packages/viewer/src/pages/monsters/tabs/AttacksTab.tsx`
- Create: `packages/viewer/src/pages/monsters/tabs/AttacksTab.module.css`
- Test: `packages/viewer/tests/pages/monsters/tabs/AttacksTab.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/pages/monsters/tabs/AttacksTab.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AttacksTab } from '../../../../src/pages/monsters/tabs/AttacksTab.js';
import { FIXTURE_SCENARIO_DB } from '../../../fixtures/scenario-fixture.js';

const RAT = FIXTURE_SCENARIO_DB.monsters[0]!;
const FAERIE = FIXTURE_SCENARIO_DB.monsters[4]!;

describe('AttacksTab', () => {
  it('renders three columns labelled Atk1/Atk2/Atk3', () => {
    render(<AttacksTab monster={RAT} />);
    expect(screen.getByText('Atk 1')).toBeInTheDocument();
    expect(screen.getByText('Atk 2')).toBeInTheDocument();
    expect(screen.getByText('Atk 3')).toBeInTheDocument();
  });

  it('renders dice for active attacks', () => {
    render(<AttacksTab monster={RAT} />);
    expect(screen.getByText('1d4')).toBeInTheDocument(); // RAT atk1
  });

  it('renders em-dash for unused attacks', () => {
    render(<AttacksTab monster={RAT} />);
    // RAT has no atk2/atk3
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('renders poison chance and strength when set', () => {
    render(<AttacksTab monster={RAT} />);
    expect(screen.getByText(/poison.*25%/i)).toBeInTheDocument();
    expect(screen.getByText(/strength.*3/i)).toBeInTheDocument();
  });

  it('dims unused attack columns', () => {
    render(<AttacksTab monster={RAT} />);
    const atk2Col = screen.getByText('Atk 2').closest('[role="group"]')!;
    expect(atk2Col.className).toMatch(/unused/i);
  });

  it('renders ultra-high special-effect chances', () => {
    render(<AttacksTab monster={FAERIE} />);
    // FAERIE QUEEN atk1 special is 100%
    expect(screen.getByText(/100%/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/tabs/AttacksTab.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Create CSS**

Create `packages/viewer/src/pages/monsters/tabs/AttacksTab.module.css`:

```css
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
}

.column {
  padding: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.unused {
  opacity: 0.4;
}

.colHeader {
  font-weight: 700;
  margin: 0 0 var(--space-2);
  color: var(--color-text);
  font-size: 1rem;
}

.diceLine {
  font-family: var(--font-mono);
  color: var(--color-text);
  font-size: 1.1rem;
  margin-bottom: var(--space-3);
}

.row {
  display: flex;
  justify-content: space-between;
  color: var(--color-text-muted);
  font-size: 0.85rem;
  font-family: var(--font-mono);
  padding: 2px 0;
}

.row > .key {
  color: var(--color-text-muted);
}

.row > .val {
  color: var(--color-text);
}
```

- [ ] **Step 4: Implement `AttacksTab`**

Create `packages/viewer/src/pages/monsters/tabs/AttacksTab.tsx`:

```typescript
import type { ScenarioMonster } from '@wiz6/data';
import { formatAttackDice } from '../../../lib/monsters.js';
import styles from './AttacksTab.module.css';

const STYLE_LABEL: Record<number, string> = {
  0: 'melee',
  1: 'grapple/entangle',
  2: 'stun/crush',
  3: 'ranged/precision',
};

interface AttackRecord {
  index: 1 | 2 | 3;
  diceCount: number;
  diceSides: number;
  specialChance: number;
  style: number;
  damageBonus: number;
  poisonChance: number;
  poisonStrength: number;
  drainChance: number;
  stunChance: number;
  hpDrainChance: number;
  ageChance: number;
  decapitateChance: number;
  extra: readonly number[];
}

function attackRecords(m: ScenarioMonster): AttackRecord[] {
  return [
    {
      index: 1,
      diceCount: m.attack1DiceCount,
      diceSides: m.attack1DiceSides,
      specialChance: m.attack1SpecialChance,
      style: m.attack1Style,
      damageBonus: m.attack1DamageBonus,
      poisonChance: m.attack1PoisonChance,
      poisonStrength: m.attack1PoisonStrength,
      drainChance: m.attack1DrainChance,
      stunChance: m.attack1StunChance,
      hpDrainChance: m.attack1HpDrainChance,
      ageChance: m.attack1AgeChance,
      decapitateChance: m.attack1DecapitateChance,
      extra: m.attack1Extra,
    },
    {
      index: 2,
      diceCount: m.attack2DiceCount,
      diceSides: m.attack2DiceSides,
      specialChance: m.attack2SpecialChance,
      style: m.attack2Style,
      damageBonus: m.attack2DamageBonus,
      poisonChance: m.attack2PoisonChance,
      poisonStrength: m.attack2PoisonStrength,
      drainChance: m.attack2DrainChance,
      stunChance: m.attack2StunChance,
      hpDrainChance: m.attack2HpDrainChance,
      ageChance: m.attack2AgeChance,
      decapitateChance: m.attack2DecapitateChance,
      extra: m.attack2Extra,
    },
    {
      index: 3,
      diceCount: m.attack3DiceCount,
      diceSides: m.attack3DiceSides,
      specialChance: m.attack3SpecialChance,
      style: m.attack3Style,
      damageBonus: m.attack3DamageBonus,
      poisonChance: m.attack3PoisonChance,
      poisonStrength: m.attack3PoisonStrength,
      drainChance: m.attack3DrainChance,
      stunChance: m.attack3StunChance,
      hpDrainChance: m.attack3HpDrainChance,
      ageChance: m.attack3AgeChance,
      decapitateChance: m.attack3DecapitateChance,
      extra: m.attack3Extra,
    },
  ];
}

function AttackColumn({ atk }: { atk: AttackRecord }) {
  const unused = atk.diceCount === 0 || atk.diceSides === 0;
  return (
    <div
      role="group"
      aria-label={`attack ${atk.index}`}
      className={`${styles.column} ${unused ? styles.unused : ''}`.trim()}
    >
      <h3 className={styles.colHeader}>Atk {atk.index}</h3>
      <div className={styles.diceLine}>
        {formatAttackDice(atk.diceCount, atk.diceSides)}
        {atk.damageBonus !== 0 && atk.diceCount !== 0 ? ` +${atk.damageBonus}` : ''}
      </div>
      <div className={styles.row}>
        <span className={styles.key}>style</span>
        <span className={styles.val}>{STYLE_LABEL[atk.style] ?? atk.style}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.key}>special</span>
        <span className={styles.val}>{atk.specialChance}%</span>
      </div>
      <div className={styles.row}>
        <span className={styles.key}>poison</span>
        <span className={styles.val}>{atk.poisonChance}%</span>
      </div>
      <div className={styles.row}>
        <span className={styles.key}>poison strength</span>
        <span className={styles.val}>{atk.poisonStrength}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.key}>drain</span>
        <span className={styles.val}>{atk.drainChance}%</span>
      </div>
      <div className={styles.row}>
        <span className={styles.key}>stun</span>
        <span className={styles.val}>{atk.stunChance}%</span>
      </div>
      <div className={styles.row}>
        <span className={styles.key}>hp drain</span>
        <span className={styles.val}>{atk.hpDrainChance}%</span>
      </div>
      <div className={styles.row}>
        <span className={styles.key}>age</span>
        <span className={styles.val}>{atk.ageChance}%</span>
      </div>
      <div className={styles.row}>
        <span className={styles.key}>decapitate</span>
        <span className={styles.val}>{atk.decapitateChance}%</span>
      </div>
      <div className={styles.row}>
        <span className={styles.key}>extra</span>
        <span className={styles.val}>[{atk.extra.join(', ')}]</span>
      </div>
    </div>
  );
}

interface AttacksTabProps {
  monster: ScenarioMonster;
}

export function AttacksTab({ monster }: AttacksTabProps) {
  const atks = attackRecords(monster);
  return (
    <div className={styles.grid}>
      {atks.map((a) => (
        <AttackColumn key={a.index} atk={a} />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Wire into `MonsterDetail`**

In `packages/viewer/src/pages/monsters/MonsterDetail.tsx`, replace the existing tab-panel block:

```typescript
      <div role="tabpanel" data-testid={`tab-${currentTab}`}>
        {currentTab === 'overview' ? (
          <OverviewTab monster={monster} />
        ) : currentTab === 'saves' ? (
          <SavesTab monster={monster} />
        ) : (
          <p className={styles.placeholder}>
            {currentTab} content arrives in task 11.
          </p>
        )}
      </div>
```

with:

```typescript
      <div role="tabpanel" data-testid={`tab-${currentTab}`}>
        {currentTab === 'overview' ? (
          <OverviewTab monster={monster} />
        ) : currentTab === 'attacks' ? (
          <AttacksTab monster={monster} />
        ) : (
          <SavesTab monster={monster} />
        )}
      </div>
```

Add the import:

```typescript
import { AttacksTab } from './tabs/AttacksTab.js';
```

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/viewer/src/pages/monsters/tabs/AttacksTab.tsx packages/viewer/src/pages/monsters/tabs/AttacksTab.module.css packages/viewer/src/pages/monsters/MonsterDetail.tsx packages/viewer/tests/pages/monsters/tabs/AttacksTab.test.tsx
git commit -m "feat(viewer): AttacksTab — three-column per-attack record view"
```

---

## Task 12: Keyboard shortcuts

Page-level keyboard navigation: `↑/↓` walks the currently filtered list, `1/2/3` jumps tabs, `/` focuses search, `?` shows help. All hooked at the `MonstersPage` level via a `useKeyboardShortcuts` hook so unmount cleans up.

**Files:**
- Create: `packages/viewer/src/lib/hooks/useKeyboardShortcuts.ts`
- Modify: `packages/viewer/src/pages/monsters/MonstersPage.tsx`
- Create: `packages/viewer/src/pages/monsters/KeyboardHelp.tsx`
- Test: `packages/viewer/tests/lib/hooks/useKeyboardShortcuts.test.tsx`
- Test: `packages/viewer/tests/pages/monsters/keyboard.test.tsx`

- [ ] **Step 1: Write the failing hook test**

Create `packages/viewer/tests/lib/hooks/useKeyboardShortcuts.test.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useKeyboardShortcuts } from '../../../src/lib/hooks/useKeyboardShortcuts.js';

function HookProbe({ handlers }: { handlers: Record<string, () => void> }) {
  useKeyboardShortcuts(handlers);
  return <div data-testid="probe" />;
}

describe('useKeyboardShortcuts', () => {
  it('calls handler for matching key', () => {
    const fn = vi.fn();
    render(<HookProbe handlers={{ a: fn }} />);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not fire when target is an input', () => {
    const fn = vi.fn();
    render(
      <>
        <input data-testid="input" />
        <HookProbe handlers={{ a: fn }} />
      </>,
    );
    const input = document.querySelector('[data-testid="input"]') as HTMLInputElement;
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(fn).not.toHaveBeenCalled();
  });

  it('removes the listener on unmount', () => {
    const fn = vi.fn();
    const { unmount } = render(<HookProbe handlers={{ a: fn }} />);
    unmount();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(fn).not.toHaveBeenCalled();
  });

  it('multiple keys can map to different handlers', () => {
    const fnA = vi.fn();
    const fnB = vi.fn();
    render(<HookProbe handlers={{ a: fnA, b: fnB }} />);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
    expect(fnA).toHaveBeenCalled();
    expect(fnB).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the hook test to confirm it fails**

```bash
pnpm --filter @wiz6/viewer test tests/lib/hooks/useKeyboardShortcuts.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement the hook**

Create `packages/viewer/src/lib/hooks/useKeyboardShortcuts.ts`:

```typescript
import { useEffect } from 'react';

type Handler = (event: KeyboardEvent) => void;
type Handlers = Record<string, Handler>;

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function useKeyboardShortcuts(handlers: Handlers): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isEditable(e.target) && e.key !== 'Escape') return;
      const fn = handlers[e.key];
      if (fn) {
        fn(e);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlers]);
}
```

- [ ] **Step 4: Run the hook test to verify it passes**

```bash
pnpm --filter @wiz6/viewer test tests/lib/hooks/useKeyboardShortcuts.test.tsx
```

Expected: 4/4 pass.

- [ ] **Step 5: Write the integration test**

Create `packages/viewer/tests/pages/monsters/keyboard.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MonstersPage } from '../../../src/pages/monsters/MonstersPage.js';
import { FIXTURE_SCENARIO_DB } from '../../fixtures/scenario-fixture.js';

function setupFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(FIXTURE_SCENARIO_DB), { status: 200 })),
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/monsters" element={<MonstersPage />} />
        <Route path="/monsters/:slug" element={<MonstersPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('monsters keyboard shortcuts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setupFetch();
  });

  it('arrow-down selects the next monster in the list', async () => {
    renderAt('/monsters/giant-rat');
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: /giant rat/i }),
      ).toBeInTheDocument();
    });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    await waitFor(() => {
      // PIT FIEND comes before WRAITH and ZOMBIE alphabetically; FAERIE QUEEN before GIANT RAT
      // With default name-asc sort: FAERIE QUEEN, GIANT RAT, PIT FIEND, WRAITH, ZOMBIE
      // From giant-rat, next is pit-fiend
      expect(screen.getByRole('heading', { level: 2, name: /pit fiend/i })).toBeInTheDocument();
    });
  });

  it('arrow-up selects the previous monster', async () => {
    renderAt('/monsters/pit-fiend');
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /pit fiend/i })).toBeInTheDocument();
    });
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /giant rat/i })).toBeInTheDocument();
    });
  });

  it('pressing 2 jumps to the Attacks tab', async () => {
    renderAt('/monsters/giant-rat');
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: /giant rat/i }),
      ).toBeInTheDocument();
    });
    fireEvent.keyDown(window, { key: '2' });
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Attacks' })).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('pressing ? opens the help overlay', async () => {
    renderAt('/monsters');
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /monster list/i })).toBeInTheDocument();
    });
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByText(/keyboard shortcuts/i)).toBeInTheDocument();
    expect(screen.getByText(/↑\s*\/\s*↓/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the test to confirm it fails**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/keyboard.test.tsx
```

Expected: FAIL.

- [ ] **Step 7: Implement `KeyboardHelp`**

Create `packages/viewer/src/pages/monsters/KeyboardHelp.tsx`:

```typescript
interface KeyboardHelpProps {
  open: boolean;
  onClose: () => void;
}

const ENTRIES: { keys: string; label: string }[] = [
  { keys: '↑ / ↓', label: 'previous / next monster' },
  { keys: '1', label: 'overview tab' },
  { keys: '2', label: 'attacks tab' },
  { keys: '3', label: 'saves & resistances tab' },
  { keys: '/', label: 'focus search' },
  { keys: '?', label: 'this help' },
  { keys: 'Esc', label: 'close help' },
];

export function KeyboardHelp({ open, onClose }: KeyboardHelpProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="keyboard shortcuts"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border-strong)',
          padding: 'var(--space-5)',
          borderRadius: 4,
          minWidth: 320,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0 }}>Keyboard shortcuts</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {ENTRIES.map((e) => (
            <li
              key={e.keys}
              style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-1)' }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  minWidth: 80,
                  color: 'var(--color-accent)',
                }}
              >
                {e.keys}
              </span>
              <span>{e.label}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 'var(--space-4)',
            padding: 'var(--space-1) var(--space-3)',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
            cursor: 'pointer',
          }}
        >
          close
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Wire keyboard handling into `MonstersPage`**

Update `packages/viewer/src/pages/monsters/MonstersPage.tsx` to use the hook. Replace the existing file with:

```typescript
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ScenarioDbProvider, useScenarioDb } from '../../lib/hooks/useScenarioDb.js';
import { useUrlState } from '../../lib/hooks/useUrlState.js';
import { useKeyboardShortcuts } from '../../lib/hooks/useKeyboardShortcuts.js';
import {
  findMonsterBySlug,
  filterMonsters,
  monsterSlug,
  searchMonsters,
  sortMonsters,
  uniqueFilterValues,
  type MonsterFilter,
  type MonsterSortField,
  type SortDir,
} from '../../lib/monsters.js';
import { MonsterFilters } from './MonsterFilters.js';
import { MonsterList } from './MonsterList.js';
import { MonsterDetail } from './MonsterDetail.js';
import { KeyboardHelp } from './KeyboardHelp.js';
import styles from './MonstersPage.module.css';

function MonstersPageInner() {
  const { data, loading, error } = useScenarioDb();
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);

  const [search] = useUrlState('search');
  const [, setTab] = useUrlState('tab');
  const [sort] = useUrlState('sort');
  const [dir] = useUrlState('dir');
  const [empty] = useUrlState('empty');
  const [classes] = useUrlState.list('class');
  const [elements] = useUrlState.list('element');
  const [families] = useUrlState.list('family');
  const [creatureKinds] = useUrlState.list('creatureKind');
  const [sexes] = useUrlState.list('sex');
  const [behaviorClasses] = useUrlState.list('behavior');

  const filtered = useMemo(() => {
    if (!data) return [];
    const filter: MonsterFilter = {
      classes: classes.map(Number),
      elements: elements.map(Number),
      families,
      creatureKinds: creatureKinds.map(Number),
      sexes: sexes.map(Number),
      behaviorClasses: behaviorClasses.map(Number),
      includeEmpty: empty === '1',
    };
    const sortField = (sort as MonsterSortField | null) ?? 'name';
    const sortDir: SortDir = dir === 'desc' ? 'desc' : 'asc';
    return sortMonsters(
      searchMonsters(filterMonsters(data.monsters, filter), search ?? ''),
      sortField,
      sortDir,
    );
  }, [
    data,
    classes,
    elements,
    families,
    creatureKinds,
    sexes,
    behaviorClasses,
    empty,
    sort,
    dir,
    search,
  ]);

  useKeyboardShortcuts({
    ArrowDown: () => {
      if (filtered.length === 0) return;
      const idx = slug ? filtered.findIndex((m) => monsterSlug(m) === slug) : -1;
      const nextIdx = idx + 1 < filtered.length ? idx + 1 : 0;
      navigate(`/monsters/${monsterSlug(filtered[nextIdx]!)}`);
    },
    ArrowUp: () => {
      if (filtered.length === 0) return;
      const idx = slug ? filtered.findIndex((m) => monsterSlug(m) === slug) : 0;
      const prevIdx = idx > 0 ? idx - 1 : filtered.length - 1;
      navigate(`/monsters/${monsterSlug(filtered[prevIdx]!)}`);
    },
    '1': () => setTab(null),
    '2': () => setTab('attacks'),
    '3': () => setTab('saves'),
    '/': (e) => {
      e.preventDefault();
      const input = document.querySelector<HTMLInputElement>(
        'input[type="search"]',
      );
      input?.focus();
    },
    '?': () => setHelpOpen(true),
    Escape: () => setHelpOpen(false),
  });

  if (loading) return <p className={styles.loading}>loading scenario data…</p>;
  if (error)
    return (
      <div className={styles.errorBox}>
        failed to load scenario data: {error.message}
      </div>
    );
  if (!data) return null;

  const totalFilled = data.monsters.filter((m) => !m.empty).length;
  const selected = slug ? findMonsterBySlug(data.monsters, slug) : null;
  const filterValues = uniqueFilterValues(data.monsters);

  return (
    <>
      <div className={styles.page}>
        <section className={styles.list} aria-label="monster list">
          <MonsterFilters values={filterValues} />
          <MonsterList monsters={filtered} totalFilled={totalFilled} />
        </section>
        <section className={styles.detail} aria-label="monster detail">
          {slug && !selected ? (
            <p className={styles.emptyDetail}>no monster matches slug “{slug}”</p>
          ) : !selected ? (
            <p className={styles.emptyDetail}>
              Select a monster from the list to view its details.
            </p>
          ) : (
            <MonsterDetail monster={selected} />
          )}
        </section>
      </div>
      <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}

export function MonstersPage() {
  return (
    <ScenarioDbProvider>
      <MonstersPageInner />
    </ScenarioDbProvider>
  );
}
```

- [ ] **Step 9: Run the keyboard integration test**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/keyboard.test.tsx
```

Expected: 4/4 pass.

- [ ] **Step 10: Run the full monsters test directory**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/
```

Expected: every test in the directory passes.

- [ ] **Step 11: Commit**

```bash
git add packages/viewer/src/lib/hooks/useKeyboardShortcuts.ts packages/viewer/src/pages/monsters/KeyboardHelp.tsx packages/viewer/src/pages/monsters/MonstersPage.tsx packages/viewer/tests/lib/hooks/useKeyboardShortcuts.test.tsx packages/viewer/tests/pages/monsters/keyboard.test.tsx
git commit -m "feat(viewer): keyboard shortcuts (↑/↓ nav, 1-3 tabs, / search, ? help)"
```

---

## Task 13: Final smoke check

End-to-end verification: full test suite, typecheck, production build, dev-server curl.

- [ ] **Step 1: Run the full test suite**

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-2b-monsters-core
pnpm -r test
```

Expected:
- data: 82 (unchanged)
- parser: 64 (unchanged)
- viewer: 200-235 tests (134 baseline from 2a + new from Tasks 1-12; estimate: useScenarioDb 3 + monsters helpers ~25 + useUrlState 7 + MonstersPage 5 + MonsterList 8 + MonsterFilters 9 + MonsterDetail 7 + OverviewTab 9 + HeatmapRow 5 + SavesTab 4 + AttacksTab 6 + useKeyboardShortcuts 4 + keyboard integration 4 ≈ 96 new ≈ 230 viewer total)
- No failures.

- [ ] **Step 2: Run typecheck**

```bash
pnpm -r typecheck
```

Expected: green across data, parser, viewer.

- [ ] **Step 3: Run the production build**

```bash
pnpm --filter @wiz6/viewer build
```

Expected: `dist/` written; per-route chunks include a separate `MonstersPage.*.js` (verifying code-splitting still works).

- [ ] **Step 4: Smoke-test the dev server**

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-2b-monsters-core
pnpm dev:viewer > /tmp/wiz6-stage2b-vite.log 2>&1 &
DEV_PID=$!
# wait for vite to bind (read port from log)
for i in $(seq 1 60); do
  PORT=$(grep -oE 'localhost:[0-9]+' /tmp/wiz6-stage2b-vite.log | head -1 | sed 's/localhost://')
  if [ -n "$PORT" ] && curl -fsS "http://localhost:$PORT/" -o /dev/null 2>&1; then break; fi
  sleep 0.5
done
HTML=$(curl -fsS "http://localhost:$PORT/" 2>&1 || echo "FETCH_FAILED")
if echo "$HTML" | grep -q 'id="root"'; then
  echo "root present on port $PORT"
else
  echo "root missing"
  cat /tmp/wiz6-stage2b-vite.log | head -40
fi
kill $DEV_PID 2>/dev/null
wait $DEV_PID 2>/dev/null
```

Expected: "root present on port NNNN".

- [ ] **Step 5: Verify git state**

```bash
git status --short
```

Expected: clean working tree (no uncommitted changes; everything from Tasks 1-12 is committed).

- [ ] **Step 6: No new commit needed**

This task makes no source changes — only commits if some housekeeping was edited during verification (it shouldn't have been).

---

## Finishing the stage

Hand off to the `superpowers:finishing-a-development-branch` skill — present the four options (merge / PR / keep / discard) to the user. The user's pattern across stage 2a was "LGTM. commit and merge"; use option **1 (merge locally)** by default if the user accepts.

After merge: delete the `stage-2b-monsters-core` branch, remove the worktree, run `pnpm -r test` once on `main` to confirm.

---

## Out of scope for this plan

Captured here so an executing agent doesn't try to bundle them in:

- Raw bytes tab + byte-field highlighting → Stage 2c plan
- Family tab + Sprites & IDs tab → Stage 2c plan
- Compare mode + family-grouped view + "Copy raw bytes / Copy as JSON" header buttons → Stage 2d plan
- Quest-records toggle in the monster list → Stage 2f plan (alongside the `/quest` page)
- wfont3 as a heading font → deferred entirely
- Virtualised list rendering → revisit only if 250-row scroll performance is genuinely bad
