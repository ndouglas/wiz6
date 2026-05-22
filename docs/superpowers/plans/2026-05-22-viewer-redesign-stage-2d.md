# Viewer Redesign — Stage 2d (Monsters Power-Tools) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three power-user features to the monsters section:
1. **Compare mode** — multi-select up to 4 monsters, see their stats side-by-side in a comparison table with diffs highlighted. URL-shareable.
2. **Family-grouped index view** — toggle the left rail from a flat list to monsters grouped by familyId (collapsible per-family cards), making family-shared resistance / sprite patterns visible at a glance.
3. **Detail header buttons** — "Copy raw bytes hex" and "Copy as JSON" on the MonsterDetail header for fast inspection in external tools.

**Architecture:**
- New route `/monsters/compare` (added BEFORE `/monsters/:slug` in router so it takes priority).
- Compare state in URL: `?ids=slug1,slug2,slug3`. Reuses the existing `useUrlState.list` hook.
- `MonstersPage` detects compare mode from `location.pathname` and renders `CompareView` instead of `MonsterDetail`.
- Multi-select state stored in URL (via `?ids=`). Shift-click on `MonsterRow` toggles inclusion. Capped at 4.
- New `CompareView` component: 4-column table with diff highlighting + remove buttons.
- Family-grouped view is a URL toggle (`?view=families`) read by `MonsterList`; the list switches its render strategy.
- Detail header buttons use `navigator.clipboard.writeText`.

**Tech Stack:** React 18, TypeScript, Vite, vitest. Reference spec: `docs/superpowers/specs/2026-05-21-viewer-redesign-design.md` (sections "Compare mode" and "Family-grouped view"). Prior stage plan: `docs/superpowers/plans/2026-05-22-viewer-redesign-stage-2c.md`.

**Out of scope (deferred):**
- Stage 2e items polish
- Stage 2f breadth polish (quest records page, files overview)
- CLI `wiz6 diff` command (parallel to compare mode, deferred)
- `.pic` monster sprites (still blocked on stage 1j.6)

---

## Pre-flight

- [ ] **Worktree on latest `main`**

```bash
cd ~/Projects/ndouglas/wiz6
git worktree add ~/.config/superpowers/worktrees/wiz6/stage-2d -b stage-2d
cd ~/.config/superpowers/worktrees/wiz6/stage-2d
pnpm install --frozen-lockfile
```

- [ ] **Baseline tests**

```bash
pnpm -r test 2>&1 | grep "Tests" | tail -5
```

Expected: 82 data + 96 parser + 41 cli + 270 viewer = 489 tests.

---

## Task 1: `/monsters/compare` route + URL state for `?ids=`

Wire the new route so `/monsters/compare` reaches `MonstersPage`. Add a helper that reads/writes the compare-set as a list of slugs in `?ids=`.

**Files:**
- Modify: `packages/viewer/src/router.tsx` — add `/monsters/compare` route BEFORE `/monsters/:slug`
- Modify: `packages/viewer/src/pages/monsters/MonstersPage.tsx` — detect compare mode, render `CompareView` placeholder
- Test: `packages/viewer/tests/router.test.tsx` — assert `/monsters/compare` mounts `MonstersPage`
- Test: `packages/viewer/tests/pages/monsters/MonstersPage.test.tsx` — add a compare-mode test

- [ ] **Step 1: Inspect current router**

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-2d
cat packages/viewer/src/router.tsx | head -40
```

Find the `/monsters` and `/monsters/:slug` lines. New `/monsters/compare` route must be added BEFORE the `:slug` route so React Router matches the literal path first.

- [ ] **Step 2: Update router.tsx**

Insert `<Route path="/monsters/compare" element={<MonstersPage />} />` immediately BEFORE `<Route path="/monsters/:slug" element={<MonstersPage />} />`.

- [ ] **Step 3: Update MonstersPage to detect compare mode**

Open `packages/viewer/src/pages/monsters/MonstersPage.tsx`. Inside `MonstersPageInner`:

a) Import `useLocation`:

```typescript
import { useLocation, useNavigate, useParams } from 'react-router-dom';
```

b) Compute `isCompareMode`:

```typescript
  const location = useLocation();
  const isCompareMode = location.pathname.endsWith('/monsters/compare');
```

c) In the right-pane render, branch on compare mode. Find the existing dispatch:

```typescript
        <section className={styles.detail} aria-label="monster detail">
          {slug && !selected ? (
            <p className={styles.emptyDetail}>no monster matches slug "{slug}"</p>
          ) : !selected ? (
            <p className={styles.emptyDetail}>
              Select a monster from the list to view its details.
            </p>
          ) : (
            <MonsterDetail monster={selected} allMonsters={data.monsters} />
          )}
        </section>
```

Replace with:

```typescript
        <section className={styles.detail} aria-label="monster detail">
          {isCompareMode ? (
            <p data-testid="compare-placeholder">Compare mode (CompareView arrives in Task 4)</p>
          ) : slug && !selected ? (
            <p className={styles.emptyDetail}>no monster matches slug "{slug}"</p>
          ) : !selected ? (
            <p className={styles.emptyDetail}>
              Select a monster from the list to view its details.
            </p>
          ) : (
            <MonsterDetail monster={selected} allMonsters={data.monsters} />
          )}
        </section>
```

The placeholder will be replaced by the real CompareView in Task 4.

- [ ] **Step 4: Add a router test for the new route**

Open `packages/viewer/tests/router.test.tsx`. Add a new `it` that mounts `/monsters/compare`:

```typescript
  it('mounts MonstersPage at /monsters/compare', async () => {
    renderAt('/monsters/compare');
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /monster list/i })).toBeInTheDocument();
      expect(screen.getByTestId('compare-placeholder')).toBeInTheDocument();
    });
  });
```

Add it next to the existing `mounts MonstersPage at /monsters with list + detail regions` test.

- [ ] **Step 5: Add a MonstersPage compare-mode test**

Open `packages/viewer/tests/pages/monsters/MonstersPage.test.tsx`. Add a new test:

```typescript
  it('renders compare placeholder when path is /monsters/compare', async () => {
    renderAt('/monsters/compare');
    await waitFor(() => {
      expect(screen.getByTestId('compare-placeholder')).toBeInTheDocument();
    });
  });
```

The existing `renderAt` helper should pass through whatever path is given.

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @wiz6/viewer test tests/router.test.tsx tests/pages/monsters/MonstersPage.test.tsx
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/viewer/src/router.tsx packages/viewer/src/pages/monsters/MonstersPage.tsx packages/viewer/tests/router.test.tsx packages/viewer/tests/pages/monsters/MonstersPage.test.tsx
git commit -m "feat(viewer): /monsters/compare route + compare-mode placeholder"
```

---

## Task 2: Multi-select in `MonsterList`

Shift-click a row toggles it in the compare set (`?ids=`). Limit to 4. Selected rows get a visible marker. A "Compare" button appears in the filter controls when 2+ are selected.

**Files:**
- Modify: `packages/viewer/src/pages/monsters/MonsterRow.tsx` — shift-click handler
- Modify: `packages/viewer/src/pages/monsters/MonsterList.module.css` — add a `.rowCompare` style
- Modify: `packages/viewer/src/pages/monsters/MonsterFilters.tsx` — add a "Compare (N)" button when ≥ 2 monsters are in `?ids=`
- Test: `packages/viewer/tests/pages/monsters/MonsterList.test.tsx` — add shift-click test
- Test: `packages/viewer/tests/pages/monsters/MonsterFilters.test.tsx` — add Compare-button test

- [ ] **Step 1: Add the `.rowCompare` style**

Open `packages/viewer/src/pages/monsters/MonsterList.module.css`. Add:

```css
.rowCompare {
  background: var(--color-surface-elevated);
  outline: 1px solid var(--color-accent);
  outline-offset: -1px;
}

.compareBadge {
  display: inline-block;
  background: var(--color-accent);
  color: var(--color-bg);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  padding: 1px 4px;
  border-radius: 2px;
  margin-right: var(--space-1);
}
```

- [ ] **Step 2: Update `MonsterRow` to react to shift-click**

Open `packages/viewer/src/pages/monsters/MonsterRow.tsx`. Replace the existing onClick logic.

Add an import:

```typescript
import { useUrlState } from '../../lib/hooks/useUrlState.js';
```

In `MonsterRow`, before the `return`, compute compare state:

```typescript
  const [compareIds, setCompareIds] = useUrlState.list('ids');
  const inCompare = compareIds.includes(slug);
```

Where `slug` is already computed via `monsterSlug(monster)`.

Add `rowCompare` to the className when `inCompare`:

```typescript
const rowClass = `${styles.row} ${classClass} ${selected ? styles.rowActive : ''} ${inCompare ? styles.rowCompare : ''}`.trim();
```

Update the `onClick`:

```typescript
      onClick={(event) => {
        if (event.shiftKey) {
          if (inCompare) {
            setCompareIds(compareIds.filter((id) => id !== slug));
          } else if (compareIds.length < 4) {
            setCompareIds([...compareIds, slug]);
          }
          return;
        }
        navigate(`/monsters/${slug}`);
      }}
```

Optionally add a small badge to show inclusion. Replace the name span:

```typescript
        <span className={styles.name}>
          {inCompare ? <span className={styles.compareBadge}>{compareIds.indexOf(slug) + 1}</span> : null}
          {name}
        </span>
```

- [ ] **Step 3: Add Compare button in `MonsterFilters`**

Open `packages/viewer/src/pages/monsters/MonsterFilters.tsx`. Add a `useNavigate`+`useUrlState.list('ids')`-driven Compare button.

a) Imports:

```typescript
import { useNavigate } from 'react-router-dom';
```

b) Inside the component, before the return:

```typescript
  const navigate = useNavigate();
  const [compareIds] = useUrlState.list('ids');
```

c) After the `searchRow` block (so it appears right under the search box):

```typescript
      {compareIds.length >= 2 ? (
        <div style={{ marginTop: 'var(--space-1)' }}>
          <button
            type="button"
            onClick={() => navigate(`/monsters/compare?ids=${compareIds.join(',')}`)}
            className={styles.dirButton}
          >
            Compare ({compareIds.length})
          </button>
        </div>
      ) : null}
```

(Reuses the `dirButton` style for visual consistency. The compare button only shows when 2+ monsters are selected.)

- [ ] **Step 4: Write the failing test for shift-click**

Open `packages/viewer/tests/pages/monsters/MonsterList.test.tsx`. Add:

```typescript
  it('shift-clicking a row toggles it in the compare set (?ids=)', () => {
    renderList();
    const ratRow = screen.getByText('GIANT RAT').closest('button')!;
    fireEvent.click(ratRow, { shiftKey: true });
    // After shift-click, URL should contain ids=giant-rat
    expect(screen.getByTestId('location')).toHaveTextContent('giant-rat');
    // Plain click on a DIFFERENT row should navigate, not toggle.
    // (We re-render via the new URL state already updated above.)
  });

  it('cap compare set at 4 monsters', () => {
    renderList();
    const filled = screen.getAllByRole('button');
    fireEvent.click(filled[0]!, { shiftKey: true });
    fireEvent.click(filled[1]!, { shiftKey: true });
    fireEvent.click(filled[2]!, { shiftKey: true });
    fireEvent.click(filled[3]!, { shiftKey: true });
    // 5th shift-click should be ignored.
    fireEvent.click(filled[4]!, { shiftKey: true });
    // We can't easily inspect URL state without a probe; instead verify
    // four rows are marked rowCompare and the fifth isn't.
    const rows = screen.getAllByRole('button');
    const marked = rows.filter((r) => r.className.match(/rowCompare/i));
    expect(marked.length).toBe(4);
  });
```

NOTE: The existing `LocationProbe` in `MonsterList.test.tsx` shows `pathname`; we need to also see the search string for the first new test. Adjust the `LocationProbe` to render both:

```typescript
function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="location">{loc.pathname}{loc.search}</p>;
}
```

(Updated in place.) The "search" portion includes `?ids=...`, so the `toHaveTextContent('giant-rat')` assertion will pass.

- [ ] **Step 5: Write the Compare-button test**

Open `packages/viewer/tests/pages/monsters/MonsterFilters.test.tsx`. Add:

```typescript
  it('shows Compare button when 2+ ids in URL', () => {
    renderFilters('/monsters?ids=giant-rat,zombie');
    expect(screen.getByRole('button', { name: /compare \(2\)/i })).toBeInTheDocument();
  });

  it('hides Compare button when fewer than 2 ids in URL', () => {
    renderFilters('/monsters?ids=giant-rat');
    expect(screen.queryByRole('button', { name: /compare/i })).not.toBeInTheDocument();
  });

  it('clicking Compare navigates to /monsters/compare with same ids', () => {
    renderFilters('/monsters?ids=giant-rat,zombie');
    fireEvent.click(screen.getByRole('button', { name: /compare \(2\)/i }));
    expect(screen.getByTestId('location')).toHaveTextContent('/monsters/compare?ids=giant-rat%2Czombie');
  });
```

The comma in URL gets encoded as `%2C` — adjust expectation if your implementation doesn't encode (test the actual result and accept whichever is correct).

- [ ] **Step 6: Run the new tests**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/MonsterList.test.tsx tests/pages/monsters/MonsterFilters.test.tsx
```

Expected: green. The original tests should still pass.

- [ ] **Step 7: Commit**

```bash
git add packages/viewer/src/pages/monsters/MonsterRow.tsx packages/viewer/src/pages/monsters/MonsterList.module.css packages/viewer/src/pages/monsters/MonsterFilters.tsx packages/viewer/tests/pages/monsters/MonsterList.test.tsx packages/viewer/tests/pages/monsters/MonsterFilters.test.tsx
git commit -m "feat(viewer): shift-click multi-select + Compare button (max 4 monsters)"
```

---

## Task 3: `CompareView` component

The actual side-by-side comparison table. Up to 4 monster columns; rows are decoded stat fields. Cells where values differ across columns are highlighted. Each column has a remove button.

**Files:**
- Create: `packages/viewer/src/pages/monsters/CompareView.tsx`
- Create: `packages/viewer/src/pages/monsters/CompareView.module.css`
- Test: `packages/viewer/tests/pages/monsters/CompareView.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/pages/monsters/CompareView.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { CompareView } from '../../../src/pages/monsters/CompareView.js';
import { FIXTURE_SCENARIO_DB } from '../../fixtures/scenario-fixture.js';

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="location">{loc.pathname}{loc.search}</p>;
}

function renderCompare(initial = '/monsters/compare?ids=giant-rat,zombie,pit-fiend') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <CompareView allMonsters={FIXTURE_SCENARIO_DB.monsters} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('CompareView', () => {
  it('shows an empty state when no ids are selected', () => {
    render(
      <MemoryRouter initialEntries={['/monsters/compare']}>
        <CompareView allMonsters={FIXTURE_SCENARIO_DB.monsters} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/no monsters selected/i)).toBeInTheDocument();
  });

  it('renders one column per id (up to 4)', () => {
    renderCompare();
    // 3 monster columns
    expect(screen.getByRole('columnheader', { name: /giant rat/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /zombie/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /pit fiend/i })).toBeInTheDocument();
  });

  it('renders each comparable field as a row', () => {
    renderCompare();
    expect(screen.getByText(/level/i)).toBeInTheDocument();
    expect(screen.getByText(/^ac$/i)).toBeInTheDocument();
    expect(screen.getByText(/xp/i)).toBeInTheDocument();
  });

  it('highlights cells where values differ across columns', () => {
    renderCompare();
    // Find the "level" row cell — values differ (8 vs 10 vs 12)
    const levelRow = screen.getByText(/^level$/i).closest('tr')!;
    const cells = levelRow.querySelectorAll('td');
    // At least one cell should have a "differs" / "diff" class
    const diffs = Array.from(cells).filter((c) => c.className.match(/diff/i));
    expect(diffs.length).toBeGreaterThanOrEqual(2);
  });

  it('does not highlight cells when all values are equal', () => {
    // Construct two identical monsters in the URL
    render(
      <MemoryRouter initialEntries={['/monsters/compare?ids=giant-rat,giant-rat']}>
        <CompareView allMonsters={FIXTURE_SCENARIO_DB.monsters} />
      </MemoryRouter>,
    );
    const levelRow = screen.getByText(/^level$/i).closest('tr')!;
    const cells = levelRow.querySelectorAll('td');
    const diffs = Array.from(cells).filter((c) => c.className.match(/diff/i));
    expect(diffs.length).toBe(0);
  });

  it('clicking the column remove button drops that id from the URL', () => {
    renderCompare();
    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    // 3 columns → 3 remove buttons
    expect(removeButtons.length).toBe(3);
    fireEvent.click(removeButtons[1]!); // remove ZOMBIE
    expect(screen.getByTestId('location')).toHaveTextContent('giant-rat');
    expect(screen.getByTestId('location')).not.toHaveTextContent('zombie');
  });

  it('shows "no monster matches" for unknown slugs but keeps other columns', () => {
    render(
      <MemoryRouter initialEntries={['/monsters/compare?ids=giant-rat,nope']}>
        <CompareView allMonsters={FIXTURE_SCENARIO_DB.monsters} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('columnheader', { name: /giant rat/i })).toBeInTheDocument();
    expect(screen.getByText(/nope/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/CompareView.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Create the CSS**

Create `packages/viewer/src/pages/monsters/CompareView.module.css`:

```css
.wrapper {
  padding: var(--space-2);
}

.empty {
  color: var(--color-text-muted);
  margin-top: var(--space-7);
  text-align: center;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 0.85rem;
}

.fieldHeader {
  text-align: left;
  color: var(--color-text-muted);
  padding: var(--space-1) var(--space-2);
  min-width: 140px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.colHeader {
  padding: var(--space-2);
  color: var(--color-text);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
}

.colName {
  font-weight: 600;
  margin-bottom: var(--space-1);
}

.removeBtn {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: 0.75rem;
  padding: 2px 6px;
  border-radius: 2px;
  cursor: pointer;
}

.removeBtn:hover {
  color: var(--color-text);
  border-color: var(--color-border-strong);
}

.cell {
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
}

.diff {
  background: rgba(216, 168, 80, 0.12);
  border-left: 2px solid var(--color-class-4);
}

.notFound {
  color: var(--color-element-fire);
  font-style: italic;
}
```

- [ ] **Step 4: Implement `CompareView`**

Create `packages/viewer/src/pages/monsters/CompareView.tsx`:

```typescript
import type { ScenarioMonster } from '@wiz6/data';
import { findMonsterBySlug, formatHpDice, formatLevelRange } from '@wiz6/parser';
import { useUrlState } from '../../lib/hooks/useUrlState.js';
import styles from './CompareView.module.css';

interface CompareViewProps {
  allMonsters: readonly ScenarioMonster[];
}

type Row = {
  label: string;
  read: (m: ScenarioMonster) => string;
};

const ROWS: Row[] = [
  { label: 'class', read: (m) => String(m.monsterClass) },
  { label: 'sub-class', read: (m) => String(m.monsterSubClass) },
  { label: 'level', read: (m) => formatLevelRange(m.monsterLevel, m.monsterLevelMax) },
  { label: 'ac', read: (m) => String(m.monsterAC) },
  { label: 'hp', read: (m) => formatHpDice(m.hpDiceCount, m.hpDiceSides) },
  { label: 'xp', read: (m) => m.xpOnKill.toLocaleString() },
  { label: 'gold', read: (m) => String(m.goldStat) },
  { label: 'element', read: (m) => String(m.specialAttackElement) },
  { label: 'sex', read: (m) => String(m.monsterSex) },
  { label: 'creature kind', read: (m) => String(m.creatureKind) },
  { label: 'behavior', read: (m) => String(m.monsterBehaviorClass) },
  { label: 'sprite group', read: (m) => String(m.spriteGroup) },
  { label: 'move stat', read: (m) => String(m.moveStat) },
  { label: 'family', read: (m) => m.familyId.join(',') },
  { label: 'magic resist', read: (m) => `${m.magicResistChance}%` },
  { label: 'spell power', read: (m) => `${m.spellPowerChance}%` },
  { label: 'fly evade', read: (m) => `${m.flyEvadeChance}%` },
  { label: 'combat sprite', read: (m) => String(m.combatSpriteId) },
  { label: 'secondary sprite', read: (m) => String(m.secondarySpriteId) },
  { label: 'save table', read: (m) => `[${m.saveTable.join(',')}]` },
  { label: 'effect chance', read: (m) => `[${m.effectChanceTable.join(',')}]` },
  { label: 'attribute saves', read: (m) => `[${m.attributeSaves.join(',')}]` },
];

interface Column {
  id: string;
  monster: ScenarioMonster | null;
}

export function CompareView({ allMonsters }: CompareViewProps) {
  const [ids, setIds] = useUrlState.list('ids');

  if (ids.length === 0) {
    return (
      <div className={styles.wrapper}>
        <p className={styles.empty}>no monsters selected — shift-click rows in the list to add</p>
      </div>
    );
  }

  const columns: Column[] = ids.slice(0, 4).map((id) => ({
    id,
    monster: findMonsterBySlug(allMonsters, id),
  }));

  const removeAt = (id: string) => () => setIds(ids.filter((i) => i !== id));

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.fieldHeader}>field</th>
            {columns.map((col) => (
              <th key={col.id} className={styles.colHeader} scope="col">
                <div className={styles.colName}>
                  {col.monster ? col.monster.nameIdSingular : (
                    <span className={styles.notFound}>{col.id} (not found)</span>
                  )}
                </div>
                <button
                  type="button"
                  className={styles.removeBtn}
                  aria-label={`remove ${col.id}`}
                  onClick={removeAt(col.id)}
                >
                  remove
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            // Read each column's value. Missing monsters → '—'.
            const values = columns.map((col) =>
              col.monster ? row.read(col.monster) : '—',
            );
            // Determine if values differ. If all values are the same, no diff.
            const allSame = values.every((v) => v === values[0]);
            return (
              <tr key={row.label}>
                <th className={styles.fieldHeader} scope="row">
                  {row.label}
                </th>
                {values.map((v, i) => (
                  <td
                    key={columns[i]!.id}
                    className={`${styles.cell} ${!allSame ? styles.diff : ''}`.trim()}
                  >
                    {v}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Run the CompareView test**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/CompareView.test.tsx
```

Expected: 7/7 pass.

- [ ] **Step 6: Commit**

```bash
git add packages/viewer/src/pages/monsters/CompareView.tsx packages/viewer/src/pages/monsters/CompareView.module.css packages/viewer/tests/pages/monsters/CompareView.test.tsx
git commit -m "feat(viewer): CompareView — side-by-side comparison table with diff highlighting"
```

---

## Task 4: Wire `CompareView` into MonstersPage

Replace the Task 1 placeholder with the real CompareView.

**Files:**
- Modify: `packages/viewer/src/pages/monsters/MonstersPage.tsx`
- Test: `packages/viewer/tests/pages/monsters/MonstersPage.test.tsx` — update compare-mode test

- [ ] **Step 1: Update MonstersPage**

In `packages/viewer/src/pages/monsters/MonstersPage.tsx`, find the placeholder line added in Task 1:

```typescript
          {isCompareMode ? (
            <p data-testid="compare-placeholder">Compare mode (CompareView arrives in Task 4)</p>
          ) : slug && !selected ? (
```

Replace with:

```typescript
          {isCompareMode ? (
            <CompareView allMonsters={data.monsters} />
          ) : slug && !selected ? (
```

Add the import:

```typescript
import { CompareView } from './CompareView.js';
```

- [ ] **Step 2: Update the MonstersPage compare-mode test**

The Task 1 test asserts `getByTestId('compare-placeholder')`. Now that the real component is wired, change the assertion to check for the empty state OR a column header:

```typescript
  it('renders CompareView when path is /monsters/compare', async () => {
    renderAt('/monsters/compare');
    await waitFor(() => {
      expect(screen.getByText(/no monsters selected/i)).toBeInTheDocument();
    });
  });
```

(The empty state is what shows when no `?ids=` are provided.)

Also update the router test (`tests/router.test.tsx`) — the "mounts MonstersPage at /monsters/compare" test asserts `compare-placeholder`. Change to:

```typescript
      expect(screen.getByText(/no monsters selected/i)).toBeInTheDocument();
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/ tests/router.test.tsx
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add packages/viewer/src/pages/monsters/MonstersPage.tsx packages/viewer/tests/pages/monsters/MonstersPage.test.tsx packages/viewer/tests/router.test.tsx
git commit -m "feat(viewer): wire CompareView into /monsters/compare"
```

---

## Task 5: Family-grouped index view

Adds a `?view=families` URL toggle. When active, the left rail switches from a flat list to monsters grouped by familyId in collapsible cards.

**Files:**
- Create: `packages/viewer/src/pages/monsters/MonsterListFamilies.tsx`
- Create: `packages/viewer/src/pages/monsters/MonsterListFamilies.module.css`
- Modify: `packages/viewer/src/pages/monsters/MonsterFilters.tsx` — add view toggle
- Modify: `packages/viewer/src/pages/monsters/MonstersPage.tsx` — switch list components based on `?view=`
- Test: `packages/viewer/tests/pages/monsters/MonsterListFamilies.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/pages/monsters/MonsterListFamilies.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { MonsterListFamilies } from '../../../src/pages/monsters/MonsterListFamilies.js';
import { FIXTURE_SCENARIO_DB } from '../../fixtures/scenario-fixture.js';

const FILLED = FIXTURE_SCENARIO_DB.monsters.filter((m) => !m.empty);

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="location">{loc.pathname}</p>;
}

function renderFamilies(monsters = FILLED) {
  return render(
    <MemoryRouter initialEntries={['/monsters']}>
      <Routes>
        <Route
          path="/monsters"
          element={
            <>
              <MonsterListFamilies monsters={monsters} totalFilled={FILLED.length} />
              <LocationProbe />
            </>
          }
        />
        <Route
          path="/monsters/:slug"
          element={
            <>
              <MonsterListFamilies monsters={monsters} totalFilled={FILLED.length} />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MonsterListFamilies', () => {
  it('groups monsters by familyId', () => {
    renderFamilies();
    // Each family key should appear as a heading
    // GIANT RAT family = [6,4,14,16]
    expect(screen.getByText(/6,4,14,16/)).toBeInTheDocument();
  });

  it('shows monster names within their family group', () => {
    renderFamilies();
    expect(screen.getByText('GIANT RAT')).toBeInTheDocument();
    expect(screen.getByText('PIT FIEND')).toBeInTheDocument();
  });

  it('clicking a monster name navigates to its slug', () => {
    renderFamilies();
    fireEvent.click(screen.getByText('GIANT RAT'));
    expect(screen.getByTestId('location')).toHaveTextContent('/monsters/giant-rat');
  });

  it('shows the family member count', () => {
    renderFamilies();
    // Each family family-card has a "(N members)" label
    expect(screen.getAllByText(/\(\d+ members?\)/i).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to confirm fail**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/MonsterListFamilies.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Create CSS**

Create `packages/viewer/src/pages/monsters/MonsterListFamilies.module.css`:

```css
.list {
  flex: 1;
  overflow-y: auto;
  font-size: 0.88rem;
  padding: var(--space-2);
}

.family {
  margin-bottom: var(--space-3);
}

.familyHeader {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: var(--space-1) var(--space-2);
  background: var(--color-surface);
  border-radius: 2px;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--color-text-muted);
  cursor: pointer;
  margin-bottom: var(--space-1);
  border: none;
  width: 100%;
  text-align: left;
}

.familyHeader:hover {
  color: var(--color-text);
}

.familyMembers {
  list-style: none;
  padding: 0;
  margin: 0 0 0 var(--space-2);
}

.member {
  background: transparent;
  border: none;
  color: var(--color-text);
  text-align: left;
  padding: 2px var(--space-2);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.85rem;
  width: 100%;
  border-radius: 2px;
}

.member:hover {
  background: var(--color-surface-elevated);
}

.footer {
  padding: var(--space-2) var(--space-3);
  border-top: 1px solid var(--color-border);
  color: var(--color-text-faint);
  font-family: var(--font-mono);
  font-size: 0.85rem;
}
```

- [ ] **Step 4: Implement `MonsterListFamilies`**

Create `packages/viewer/src/pages/monsters/MonsterListFamilies.tsx`:

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ScenarioMonster } from '@wiz6/data';
import { familyKey, monsterSlug } from '@wiz6/parser';
import styles from './MonsterListFamilies.module.css';

interface MonsterListFamiliesProps {
  monsters: readonly ScenarioMonster[];
  totalFilled: number;
}

interface FamilyGroup {
  key: string;
  members: ScenarioMonster[];
}

function group(monsters: readonly ScenarioMonster[]): FamilyGroup[] {
  const map = new Map<string, ScenarioMonster[]>();
  for (const m of monsters) {
    if (m.empty) continue;
    const k = familyKey(m.familyId);
    const list = map.get(k) ?? [];
    list.push(m);
    map.set(k, list);
  }
  return Array.from(map.entries())
    .map(([key, members]) => ({ key, members }))
    .sort((a, b) => b.members.length - a.members.length || a.key.localeCompare(b.key));
}

export function MonsterListFamilies({ monsters, totalFilled }: MonsterListFamiliesProps) {
  const navigate = useNavigate();
  const groups = group(monsters);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (k: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  return (
    <>
      <div className={styles.list}>
        {groups.map(({ key, members }) => (
          <div key={key} className={styles.family}>
            <button
              type="button"
              className={styles.familyHeader}
              onClick={() => toggle(key)}
              aria-expanded={!collapsed.has(key)}
            >
              <span>{key}</span>
              <span>
                ({members.length} member{members.length === 1 ? '' : 's'})
              </span>
            </button>
            {!collapsed.has(key) ? (
              <ul className={styles.familyMembers}>
                {members.map((m) => (
                  <li key={m.index}>
                    <button
                      type="button"
                      className={styles.member}
                      onClick={() => navigate(`/monsters/${monsterSlug(m)}`)}
                    >
                      {m.nameIdSingular || `(empty slot ${m.index})`}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
      <p className={styles.footer}>
        showing {monsters.filter((m) => !m.empty).length} / {totalFilled}
      </p>
    </>
  );
}
```

- [ ] **Step 5: Add view toggle in MonsterFilters**

Open `packages/viewer/src/pages/monsters/MonsterFilters.tsx`. Add a small toggle near the search box:

```typescript
  const [view, setView] = useUrlState('view');
  const isFamilies = view === 'families';
```

Inside the toggleRow area (next to the "include empty" toggle), add:

```typescript
        <label>
          <input
            type="checkbox"
            checked={isFamilies}
            onChange={(e) => setView(e.target.checked ? 'families' : null)}
          />
          group by family
        </label>
```

- [ ] **Step 6: Switch list rendering in MonstersPage**

Open `packages/viewer/src/pages/monsters/MonstersPage.tsx`. Find the list rendering section that currently does:

```typescript
        <section className={styles.list} aria-label="monster list">
          <MonsterFilters values={filterValues} />
          <MonsterList monsters={filtered} totalFilled={totalFilled} />
        </section>
```

Replace `MonsterList` with a conditional:

```typescript
  const [viewMode] = useUrlState('view');
  // ...later in JSX
        <section className={styles.list} aria-label="monster list">
          <MonsterFilters values={filterValues} />
          {viewMode === 'families' ? (
            <MonsterListFamilies monsters={filtered} totalFilled={totalFilled} />
          ) : (
            <MonsterList monsters={filtered} totalFilled={totalFilled} />
          )}
        </section>
```

Add imports:

```typescript
import { MonsterListFamilies } from './MonsterListFamilies.js';
```

- [ ] **Step 7: Run tests**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add packages/viewer/src/pages/monsters/MonsterListFamilies.tsx packages/viewer/src/pages/monsters/MonsterListFamilies.module.css packages/viewer/src/pages/monsters/MonsterFilters.tsx packages/viewer/src/pages/monsters/MonstersPage.tsx packages/viewer/tests/pages/monsters/MonsterListFamilies.test.tsx
git commit -m "feat(viewer): family-grouped view (?view=families) for the monster list"
```

---

## Task 6: Copy buttons in MonsterDetail header

Two buttons: "Copy raw bytes hex" copies the statBytes as space-separated 2-char hex; "Copy as JSON" copies the entire monster record as pretty JSON.

**Files:**
- Modify: `packages/viewer/src/pages/monsters/MonsterDetail.tsx`
- Modify: `packages/viewer/src/pages/monsters/MonsterDetail.module.css`
- Test: `packages/viewer/tests/pages/monsters/MonsterDetail.test.tsx`

- [ ] **Step 1: Add CSS for the buttons**

Open `packages/viewer/src/pages/monsters/MonsterDetail.module.css`. Append:

```css
.actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-1);
}

.actionBtn {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  padding: 2px var(--space-2);
  border-radius: 2px;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  cursor: pointer;
}

.actionBtn:hover {
  color: var(--color-text);
  border-color: var(--color-border-strong);
}
```

- [ ] **Step 2: Add the buttons to MonsterDetail header**

Open `packages/viewer/src/pages/monsters/MonsterDetail.tsx`. Find the `<header>` block. After the `subHeader` div, add:

```typescript
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => {
              const hex = monster.statBytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');
              void navigator.clipboard.writeText(hex);
            }}
          >
            Copy raw bytes hex
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => {
              void navigator.clipboard.writeText(JSON.stringify(monster, null, 2));
            }}
          >
            Copy as JSON
          </button>
        </div>
```

- [ ] **Step 3: Update the test**

Open `packages/viewer/tests/pages/monsters/MonsterDetail.test.tsx`. Add two new tests:

```typescript
  it('Copy raw bytes hex button puts hex on the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderDetail();
    const btn = screen.getByRole('button', { name: /copy raw bytes hex/i });
    fireEvent.click(btn);
    // WRAITH's statBytes in the fixture is all zeros → 158 bytes of "00"
    expect(writeText).toHaveBeenCalledWith(
      Array(158).fill('00').join(' '),
    );
  });

  it('Copy as JSON button puts the monster JSON on the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderDetail();
    const btn = screen.getByRole('button', { name: /copy as json/i });
    fireEvent.click(btn);
    const arg = writeText.mock.calls[0]![0]!;
    expect(arg).toMatch(/"nameIdSingular": "WRAITH"/);
  });
```

Make sure `vi` is imported (`import { describe, expect, it, vi } from 'vitest';`).

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/MonsterDetail.test.tsx
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/monsters/MonsterDetail.tsx packages/viewer/src/pages/monsters/MonsterDetail.module.css packages/viewer/tests/pages/monsters/MonsterDetail.test.tsx
git commit -m "feat(viewer): MonsterDetail header buttons — Copy raw bytes hex + Copy as JSON"
```

---

## Task 7: Final smoke + deploy cycle

- [ ] **Step 1: Full tests**

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-2d
pnpm -r test 2>&1 | grep "Tests" | tail -5
```

Expected: 82 + 96 + 41 + ~295 viewer (270 + ~25 new) = ~514. No failures.

- [ ] **Step 2: Typecheck + build**

```bash
pnpm -r typecheck 2>&1 | tail -3
pnpm -r build 2>&1 | tail -5
```

Expected: green.

- [ ] **Step 3: Merge to main + push**

```bash
cd ~/Projects/ndouglas/wiz6
git checkout main
git merge stage-2d --no-ff -m "Merge stage 2d (monsters power-tools): compare mode + families + copy buttons"
pnpm -r test 2>&1 | grep "Tests" | tail -5
git push origin main 2>&1 | tail -3
git worktree remove --force ~/.config/superpowers/worktrees/wiz6/stage-2d
git worktree prune
git branch -d stage-2d
```

- [ ] **Step 4: Wait for build**

```bash
sleep 10
RUN_ID=$(gh run list --workflow=build-image.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status --interval 30 2>&1 | tail -5
NEW_SHA=$(gh api /users/ndouglas/packages/container/wiz6/versions --jq '.[0].metadata.container.tags[]' 2>/dev/null | grep '^sha-' | head -1)
[ -z "$NEW_SHA" ] && NEW_SHA=$(gh api /user/packages/container/wiz6/versions --jq '.[0].metadata.container.tags[]' 2>/dev/null | grep '^sha-' | head -1)
echo "new SHA: $NEW_SHA"
```

- [ ] **Step 5: Bump goldentooth + reconcile + verify**

```bash
cd ~/Projects/goldentooth/gitops
git pull
# Use the Edit tool to swap the image SHA in apps/wiz6/deployment.yaml
git diff apps/wiz6/deployment.yaml
git add apps/wiz6/deployment.yaml
git commit -m "chore(wiz6): bump image to pick up stage 2d (compare + families + copy)"
git push origin main 2>&1 | tail -3
flux reconcile kustomization apps --with-source --timeout=2m 2>&1 | tail -3
flux reconcile kustomization wiz6 --with-source --timeout=2m 2>&1 | tail -3
sleep 5
kubectl rollout status deployment/wiz6 -n wiz6 --timeout=2m 2>&1 | tail -3
curl -fsSk -o /dev/null -w "/: %{http_code}\n" https://wiz6.goldentooth.net/
curl -fsSk -o /dev/null -w "/monsters/compare: %{http_code}\n" https://wiz6.goldentooth.net/monsters/compare
```

Expected: 200, 200.

---

## Out of scope (deferred)

- Stage 2e: items polish
- Stage 2f: breadth polish (quest records, files overview)
- CLI `wiz6 diff` command (parallel to compare; deferred)
- `.pic` monster sprites
- Keyboard shortcut to enter compare mode (`c` key) — could be added later; the shift-click is sufficient for now
- Resolved-not-fixed: if you Compare 5+ monsters, only the first 4 render (cap silently). A toast saying "max 4" would be nice but not necessary.
