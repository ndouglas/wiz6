# Viewer Redesign — Stage 2a (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the monolithic `App.tsx` scroll-stack with a routed multi-page SPA shell. All existing galleries continue to work, each on its own URL. Landing page renders the `titlepag` canvas as a hero with section cards linking to every data type. New theme tokens shared across pages. Foundation only — deep monster UX comes in stage 2b.

**Architecture:** React 18 + Vite SPA (unchanged). `react-router-dom` v6 added for routing with route-based code-splitting via `React.lazy`. Theme tokens in CSS custom properties on `:root`. Existing `views/*Gallery.tsx` components stay as-is and get wrapped by new `pages/*` components. URL is the source of truth for navigation; nothing else changes architecturally in this stage.

**Tech Stack:** React 18, TypeScript, Vite 5, react-router-dom 6, vitest 2, @testing-library/react 16. Reference spec: `docs/superpowers/specs/2026-05-21-viewer-redesign-design.md`.

---

## Pre-flight

**Files:**
- Read: `docs/superpowers/specs/2026-05-21-viewer-redesign-design.md` (the spec — sections "Routes", "File-level component structure", "Theme", "Stage 2a — Foundation")

Before starting, an executing agent should set up an isolated workspace via the `superpowers:using-git-worktrees` skill and verify baseline tests pass:

- [ ] **Set up worktree at `~/.config/superpowers/worktrees/wiz6/stage-2a-foundation/` on branch `stage-2a-foundation`**

```bash
git worktree add ~/.config/superpowers/worktrees/wiz6/stage-2a-foundation -b stage-2a-foundation
cd ~/.config/superpowers/worktrees/wiz6/stage-2a-foundation
pnpm install --frozen-lockfile
```

Expected: worktree created, dependencies installed without errors.

- [ ] **Run baseline tests to confirm a clean starting state**

```bash
pnpm -r test
```

Expected: 82 data + 64 parser + 67 viewer = 213 tests passing.

---

## Task 1: Add `react-router-dom` dependency

**Files:**
- Modify: `packages/viewer/package.json`

- [ ] **Step 1: Add react-router-dom to viewer dependencies**

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-2a-foundation
pnpm --filter @wiz6/viewer add react-router-dom@^6.28.0
```

Expected: `package.json` updated with `"react-router-dom": "^6.28.0"` under `dependencies`; `pnpm-lock.yaml` updated.

- [ ] **Step 2: Verify it builds**

```bash
pnpm --filter @wiz6/viewer typecheck
```

Expected: typecheck passes (the new dep has its own types).

- [ ] **Step 3: Commit**

```bash
git add packages/viewer/package.json pnpm-lock.yaml
git commit -m "feat(viewer): add react-router-dom dependency for stage 2a"
```

---

## Task 2: Slugify helper

The router uses URL-safe slugs derived from monster/item names (e.g. `"GIANT RAT"` → `"giant-rat"`). One shared helper. This task creates the helper before any consumer needs it.

**Files:**
- Create: `packages/viewer/src/lib/slug.ts`
- Test: `packages/viewer/tests/lib/slug.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/lib/slug.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { slugify } from '../../src/lib/slug.js';

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('GIANT RAT')).toBe('giant-rat');
  });

  it('collapses internal whitespace', () => {
    expect(slugify('GIANT   RAT')).toBe('giant-rat');
  });

  it('strips leading and trailing whitespace', () => {
    expect(slugify('  GIANT RAT  ')).toBe('giant-rat');
  });

  it('drops punctuation except hyphens between words', () => {
    expect(slugify("L'MONTES")).toBe('lmontes');
    expect(slugify('* B E L A *')).toBe('b-e-l-a');
    expect(slugify('GUARDIAN=ROCK')).toBe('guardian-rock');
    expect(slugify('AMEN-TUT-BUTT')).toBe('amen-tut-butt');
  });

  it('returns an empty string for empty input', () => {
    expect(slugify('')).toBe('');
    expect(slugify('   ')).toBe('');
  });

  it('is idempotent', () => {
    const slug = slugify('GIANT RAT');
    expect(slugify(slug)).toBe(slug);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @wiz6/viewer test tests/lib/slug.test.ts
```

Expected: FAIL with module-not-found error pointing to `../../src/lib/slug.js`.

- [ ] **Step 3: Implement the helper**

Create `packages/viewer/src/lib/slug.ts`:

```typescript
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @wiz6/viewer test tests/lib/slug.test.ts
```

Expected: 6/6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/lib/slug.ts packages/viewer/tests/lib/slug.test.ts
git commit -m "feat(viewer): add slugify helper for URL-safe monster/item names"
```

---

## Task 3: Theme tokens

Shared CSS custom properties used by every page. No JS — just CSS imported once at the top of `main.tsx`.

**Files:**
- Create: `packages/viewer/src/theme/theme.css`
- Test: `packages/viewer/tests/theme/theme.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/theme/theme.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const themePath = resolve(here, '../../src/theme/theme.css');

describe('theme.css', () => {
  const css = readFileSync(themePath, 'utf8');

  it.each([
    '--color-bg',
    '--color-surface',
    '--color-surface-elevated',
    '--color-border',
    '--color-border-strong',
    '--color-text',
    '--color-text-muted',
    '--color-text-faint',
    '--color-accent',
    '--color-class-1',
    '--color-class-2',
    '--color-class-3',
    '--color-class-4',
    '--color-element-fire',
    '--color-element-cold',
    '--color-element-poison',
    '--color-element-mental',
    '--color-heatmap-cold',
    '--color-heatmap-hot',
    '--color-immunity-glow',
  ])('defines token %s on :root', (token) => {
    const pattern = new RegExp(`${token.replace(/-/g, '\\-')}\\s*:`);
    expect(css).toMatch(pattern);
  });

  it('declares the tokens on :root', () => {
    expect(css).toMatch(/:root\s*\{/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @wiz6/viewer test tests/theme/theme.test.ts
```

Expected: FAIL because `theme.css` does not exist.

- [ ] **Step 3: Create the CSS file**

Create `packages/viewer/src/theme/theme.css`:

```css
:root {
  /* Surfaces */
  --color-bg: #0c0c14;
  --color-surface: #16161e;
  --color-surface-elevated: #1e1e28;

  /* Borders */
  --color-border: #2a2f44;
  --color-border-strong: #3d4360;

  /* Text */
  --color-text: #e8e4d8;
  --color-text-muted: #8a8b95;
  --color-text-faint: #5a5b65;

  /* Accent / interaction */
  --color-accent: #6d8bd8;

  /* Class tiers */
  --color-class-1: #6da870; /* animal/beast */
  --color-class-2: #9a6dc8; /* humanoid/undead */
  --color-class-3: #c87060; /* demon/elite */
  --color-class-4: #d8a850; /* boss */

  /* Element badges */
  --color-element-fire: #d87038;
  --color-element-cold: #6db8d8;
  --color-element-poison: #6db870;
  --color-element-mental: #d8769a;

  /* Resistance heatmap */
  --color-heatmap-cold: #2a2f44;
  --color-heatmap-hot: #d8a850;
  --color-immunity-glow: #f5d870;

  /* Spacing scale */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;

  /* Type */
  --font-body: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  --font-display: var(--font-body);

  font-family: var(--font-body);
  font-feature-settings: 'tnum' 1; /* tabular numerals */
  color: var(--color-text);
  background: var(--color-bg);
}

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  min-height: 100vh;
}

a {
  color: var(--color-accent);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

code,
.mono {
  font-family: var(--font-mono);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @wiz6/viewer test tests/theme/theme.test.ts
```

Expected: 21/21 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/theme/theme.css packages/viewer/tests/theme/theme.test.ts
git commit -m "feat(viewer): theme tokens (colors, spacing, type) on :root"
```

---

## Task 4: `TopNav` component

The persistent top bar with section links. One row, fixed at the top of every page.

**Files:**
- Create: `packages/viewer/src/components/TopNav.tsx`
- Create: `packages/viewer/src/components/TopNav.module.css`
- Test: `packages/viewer/tests/components/TopNav.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/components/TopNav.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TopNav } from '../../src/components/TopNav.js';

function renderWithRouter(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TopNav />
    </MemoryRouter>,
  );
}

describe('TopNav', () => {
  it('renders the site title linking to /', () => {
    renderWithRouter('/items');
    const title = screen.getByRole('link', { name: /wiz6 data explorer/i });
    expect(title).toHaveAttribute('href', '/');
  });

  it.each([
    ['Monsters', '/monsters'],
    ['Items', '/items'],
    ['Quest', '/quest'],
    ['Screens', '/screens'],
    ['Portraits', '/portraits'],
    ['Fonts', '/fonts'],
    ['Messages', '/msg'],
    ['Newgame', '/newgame'],
    ['Files', '/files'],
  ])('renders a nav link to %s → %s', (label, href) => {
    renderWithRouter();
    const link = screen.getByRole('link', { name: label });
    expect(link).toHaveAttribute('href', href);
  });

  it('marks the current route as active via aria-current', () => {
    renderWithRouter('/monsters');
    const link = screen.getByRole('link', { name: 'Monsters' });
    expect(link).toHaveAttribute('aria-current', 'page');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @wiz6/viewer test tests/components/TopNav.test.tsx
```

Expected: FAIL (component doesn't exist).

- [ ] **Step 3: Implement the component**

Create `packages/viewer/src/components/TopNav.module.css`:

```css
.bar {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  padding: var(--space-3) var(--space-5);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 10;
}

.title {
  font-weight: 700;
  font-size: 1rem;
  color: var(--color-text);
}

.title:hover {
  text-decoration: none;
  color: var(--color-accent);
}

.links {
  display: flex;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.link {
  color: var(--color-text-muted);
  font-size: 0.92rem;
}

.link:hover {
  color: var(--color-text);
  text-decoration: none;
}

.linkActive {
  color: var(--color-text);
}
```

Create `packages/viewer/src/components/TopNav.tsx`:

```typescript
import { NavLink, Link } from 'react-router-dom';
import styles from './TopNav.module.css';

const SECTIONS: { label: string; to: string }[] = [
  { label: 'Monsters', to: '/monsters' },
  { label: 'Items', to: '/items' },
  { label: 'Quest', to: '/quest' },
  { label: 'Screens', to: '/screens' },
  { label: 'Portraits', to: '/portraits' },
  { label: 'Fonts', to: '/fonts' },
  { label: 'Messages', to: '/msg' },
  { label: 'Newgame', to: '/newgame' },
  { label: 'Files', to: '/files' },
];

export function TopNav() {
  return (
    <nav className={styles.bar} aria-label="Primary">
      <Link to="/" className={styles.title}>
        Wiz6 Data Explorer
      </Link>
      <ul className={styles.links} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {SECTIONS.map(({ label, to }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                isActive ? `${styles.link} ${styles.linkActive}` : styles.link
              }
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @wiz6/viewer test tests/components/TopNav.test.tsx
```

Expected: 11/11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/components/TopNav.tsx packages/viewer/src/components/TopNav.module.css packages/viewer/tests/components/TopNav.test.tsx
git commit -m "feat(viewer): TopNav component with section links and active state"
```

---

## Task 5: `SectionCard` component

Reusable card used on the landing page to link to each data section.

**Files:**
- Create: `packages/viewer/src/components/SectionCard.tsx`
- Create: `packages/viewer/src/components/SectionCard.module.css`
- Test: `packages/viewer/tests/components/SectionCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/components/SectionCard.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SectionCard } from '../../src/components/SectionCard.js';

function renderCard(props: { title: string; to: string; description: string; meta?: string }) {
  return render(
    <MemoryRouter>
      <SectionCard {...props} />
    </MemoryRouter>,
  );
}

describe('SectionCard', () => {
  it('renders title, description, and link', () => {
    renderCard({ title: 'Monsters', to: '/monsters', description: 'Bestiary deep dive' });
    const link = screen.getByRole('link', { name: /monsters/i });
    expect(link).toHaveAttribute('href', '/monsters');
    expect(screen.getByText('Bestiary deep dive')).toBeInTheDocument();
  });

  it('shows the optional meta line when provided', () => {
    renderCard({
      title: 'Monsters',
      to: '/monsters',
      description: 'Bestiary',
      meta: '250 monsters · 189 filled',
    });
    expect(screen.getByText('250 monsters · 189 filled')).toBeInTheDocument();
  });

  it('omits the meta line when not provided', () => {
    renderCard({ title: 'Monsters', to: '/monsters', description: 'Bestiary' });
    expect(screen.queryByText(/filled/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @wiz6/viewer test tests/components/SectionCard.test.tsx
```

Expected: FAIL (component doesn't exist).

- [ ] **Step 3: Implement the component**

Create `packages/viewer/src/components/SectionCard.module.css`:

```css
.card {
  display: block;
  padding: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: inherit;
  transition: border-color 150ms ease;
}

.card:hover {
  border-color: var(--color-accent);
  text-decoration: none;
}

.title {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 var(--space-2);
  color: var(--color-text);
}

.description {
  margin: 0 0 var(--space-2);
  color: var(--color-text-muted);
  font-size: 0.92rem;
}

.meta {
  margin: 0;
  color: var(--color-text-faint);
  font-family: var(--font-mono);
  font-size: 0.85rem;
}
```

Create `packages/viewer/src/components/SectionCard.tsx`:

```typescript
import { Link } from 'react-router-dom';
import styles from './SectionCard.module.css';

export interface SectionCardProps {
  title: string;
  to: string;
  description: string;
  meta?: string;
}

export function SectionCard({ title, to, description, meta }: SectionCardProps) {
  return (
    <Link to={to} className={styles.card}>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      {meta ? <p className={styles.meta}>{meta}</p> : null}
    </Link>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @wiz6/viewer test tests/components/SectionCard.test.tsx
```

Expected: 3/3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/components/SectionCard.tsx packages/viewer/src/components/SectionCard.module.css packages/viewer/tests/components/SectionCard.test.tsx
git commit -m "feat(viewer): SectionCard component for landing page links"
```

---

## Task 6: Landing page

Renders the `titlepag` canvas as a hero, then a grid of section cards.

**Files:**
- Create: `packages/viewer/src/pages/Landing.tsx`
- Create: `packages/viewer/src/pages/Landing.module.css`
- Test: `packages/viewer/tests/pages/Landing.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/pages/Landing.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Landing } from '../../src/pages/Landing.js';

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
}

describe('Landing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the page heading', () => {
    renderLanding();
    expect(
      screen.getByRole('heading', { name: /wiz6 data explorer/i, level: 1 }),
    ).toBeInTheDocument();
  });

  it('renders a section card for each documented data type', () => {
    renderLanding();
    for (const label of [
      'Monsters',
      'Items',
      'Quest records',
      'Screens',
      'Portraits',
      'Fonts',
      'Messages',
      'Newgame',
      'Files',
    ]) {
      expect(screen.getByRole('link', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
  });

  it('renders the titlepag canvas hero slot', () => {
    renderLanding();
    expect(screen.getByTestId('landing-hero')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @wiz6/viewer test tests/pages/Landing.test.tsx
```

Expected: FAIL (Landing doesn't exist).

- [ ] **Step 3: Implement the component**

Create `packages/viewer/src/pages/Landing.module.css`:

```css
.page {
  max-width: 1100px;
  margin: 0 auto;
  padding: var(--space-5);
}

.hero {
  margin-bottom: var(--space-6);
  border: 1px solid var(--color-border);
  background: #000;
  display: flex;
  justify-content: center;
  padding: var(--space-3);
}

.heading {
  margin: var(--space-5) 0 var(--space-3);
  font-size: 1.6rem;
}

.lede {
  color: var(--color-text-muted);
  margin: 0 0 var(--space-6);
  max-width: 60ch;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-4);
}

.footer {
  margin-top: var(--space-7);
  color: var(--color-text-faint);
  font-size: 0.85rem;
}
```

Create `packages/viewer/src/pages/Landing.tsx`:

```typescript
import { SectionCard } from '../components/SectionCard.js';
import styles from './Landing.module.css';

const SECTIONS = [
  {
    title: 'Monsters',
    to: '/monsters',
    description: 'Rogue’s gallery: 250 combat-monster records with full stat, attack, save, and raw-byte views.',
    meta: '250 records',
  },
  {
    title: 'Items',
    to: '/items',
    description: '500 item records — weapons, armor, scrolls, instruments, dust.',
    meta: '500 records',
  },
  {
    title: 'Quest records',
    to: '/quest',
    description: 'Three special records reusing the monster layout for NPC / minigame / quest data.',
    meta: '3 records',
  },
  {
    title: 'Screens',
    to: '/screens',
    description: 'EGA screen images: title, graveyard, dragon. Palette picker + alignment tool.',
    meta: '3 screens',
  },
  {
    title: 'Portraits',
    to: '/portraits',
    description: 'NPC and party portrait sets, 4bpp.',
    meta: '3 sets',
  },
  {
    title: 'Fonts',
    to: '/fonts',
    description: 'Game fonts: 1bpp UI font plus four 4bpp display fonts.',
    meta: '5 fonts',
  },
  {
    title: 'Messages',
    to: '/msg',
    description: 'Huffman-decompressed text from msg.dbs.',
  },
  {
    title: 'Newgame',
    to: '/newgame',
    description: '779 × 64-byte character-creation templates.',
    meta: '779 records',
  },
  {
    title: 'Files',
    to: '/files',
    description: 'Every parsed .dbs file with its section layout and parse status.',
  },
];

export function Landing() {
  return (
    <main className={styles.page}>
      <div className={styles.hero} data-testid="landing-hero">
        {/* titlepag canvas is wired up in Task 7 once the page is mounted by the router.
            Placeholder slot here so the test for the hero element exists from this task. */}
        <p style={{ color: 'var(--color-text-faint)', fontFamily: 'var(--font-mono)' }}>
          title screen loads here
        </p>
      </div>
      <h1 className={styles.heading}>Wiz6 Data Explorer</h1>
      <p className={styles.lede}>
        A live, browseable view of every byte we have decoded from Wizardry VI: Bane of the
        Cosmic Forge (DOS, 1990). Open a section to poke around — the site is the data, raw and
        decoded.
      </p>
      <div className={styles.grid}>
        {SECTIONS.map((s) => (
          <SectionCard key={s.to} {...s} />
        ))}
      </div>
      <p className={styles.footer}>
        Reverse-engineered from <code>scenario.dbs</code>, <code>newgame.dbs</code>,{' '}
        <code>msg.dbs</code>, <code>wfont*</code>, <code>wport*</code>, and the .scr screens.
      </p>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @wiz6/viewer test tests/pages/Landing.test.tsx
```

Expected: 3/3 tests pass (9 link assertions inside the second test).

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/Landing.tsx packages/viewer/src/pages/Landing.module.css packages/viewer/tests/pages/Landing.test.tsx
git commit -m "feat(viewer): Landing page with hero slot and section card grid"
```

---

## Task 7: Wire `ScreenGallery` into the landing hero

The landing hero in Task 6 was a placeholder. This task wires up the actual `titlepag` canvas using the existing `ScreenGallery` component, which already renders the screen properly with palette handling.

**Files:**
- Modify: `packages/viewer/src/pages/Landing.tsx`
- Modify: `packages/viewer/tests/pages/Landing.test.tsx`

- [ ] **Step 1: Extend the test to assert the screen URL is fetched**

In `packages/viewer/tests/pages/Landing.test.tsx`, add a new test inside the `describe('Landing', …)` block, after the existing tests:

```typescript
  it('fetches the titlepag screen for the hero', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    renderLanding();
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/screens/titlepag.json');
    });
  });
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @wiz6/viewer test tests/pages/Landing.test.tsx
```

Expected: 3/4 pass, the new "fetches the titlepag screen for the hero" test fails (fetch not called yet).

- [ ] **Step 3: Replace the hero placeholder with `ScreenGallery`**

In `packages/viewer/src/pages/Landing.tsx`, replace:

```typescript
      <div className={styles.hero} data-testid="landing-hero">
        {/* titlepag canvas is wired up in Task 7 once the page is mounted by the router.
            Placeholder slot here so the test for the hero element exists from this task. */}
        <p style={{ color: 'var(--color-text-faint)', fontFamily: 'var(--font-mono)' }}>
          title screen loads here
        </p>
      </div>
```

with:

```typescript
      <div className={styles.hero} data-testid="landing-hero">
        <ScreenGallery url="/screens/titlepag.json" palette={WIZ6_TITLE_PALETTE} />
      </div>
```

Add the imports near the top of `Landing.tsx`:

```typescript
import { ScreenGallery } from '../views/ScreenGallery.js';
import { WIZ6_TITLE_PALETTE } from '../palettes/index.js';
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @wiz6/viewer test tests/pages/Landing.test.tsx
```

Expected: 4/4 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/Landing.tsx packages/viewer/tests/pages/Landing.test.tsx
git commit -m "feat(viewer): wire titlepag ScreenGallery into landing hero"
```

---

## Task 8: Port-wrapper page components for existing galleries

Each existing gallery gets a thin page wrapper that the router can lazy-load. These wrappers are essentially one-liners that render the existing component with appropriate URLs. They produce no UX change — that's deliberate. Deep treatment for monsters/items/quest happens in later stages.

This is one task with sub-steps because each wrapper is trivially small (single component, one render call) and the testing strategy is identical. Pulling them apart into separate tasks would be busywork.

**Files:**
- Create: `packages/viewer/src/pages/FontsPage.tsx`
- Create: `packages/viewer/src/pages/MsgPage.tsx`
- Create: `packages/viewer/src/pages/NewgamePage.tsx`
- Create: `packages/viewer/src/pages/portraits/PortraitsIndex.tsx`
- Create: `packages/viewer/src/pages/screens/ScreensIndex.tsx`
- Test: `packages/viewer/tests/pages/wrapper-pages.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/pages/wrapper-pages.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FontsPage } from '../../src/pages/FontsPage.js';
import { MsgPage } from '../../src/pages/MsgPage.js';
import { NewgamePage } from '../../src/pages/NewgamePage.js';
import { PortraitsIndex } from '../../src/pages/portraits/PortraitsIndex.js';
import { ScreensIndex } from '../../src/pages/screens/ScreensIndex.js';

function setupFetchSpy() {
  const spy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderInRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe('wrapper pages', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('FontsPage fetches all five font assets', async () => {
    const spy = setupFetchSpy();
    renderInRouter(<FontsPage />);
    await waitFor(() => {
      const urls = spy.mock.calls.map((c) => c[0]);
      expect(urls).toContain('/fonts/wfont0.json');
      expect(urls).toContain('/fonts/wfont1.json');
      expect(urls).toContain('/fonts/wfont2.json');
      expect(urls).toContain('/fonts/wfont3.json');
      expect(urls).toContain('/fonts/wfont4.json');
    });
  });

  it('MsgPage fetches /messages/msg.json', async () => {
    const spy = setupFetchSpy();
    renderInRouter(<MsgPage />);
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith('/messages/msg.json');
    });
  });

  it('NewgamePage fetches /newgame/newgame.json', async () => {
    const spy = setupFetchSpy();
    renderInRouter(<NewgamePage />);
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith('/newgame/newgame.json');
    });
  });

  it('PortraitsIndex fetches all three portrait sets', async () => {
    const spy = setupFetchSpy();
    renderInRouter(<PortraitsIndex />);
    await waitFor(() => {
      const urls = spy.mock.calls.map((c) => c[0]);
      expect(urls).toContain('/portraits/wport1.json');
      expect(urls).toContain('/portraits/wport2.json');
      expect(urls).toContain('/portraits/wport3.json');
    });
  });

  it('ScreensIndex fetches all three screen assets', async () => {
    const spy = setupFetchSpy();
    renderInRouter(<ScreensIndex />);
    await waitFor(() => {
      const urls = spy.mock.calls.map((c) => c[0]);
      expect(urls).toContain('/screens/titlepag.json');
      expect(urls).toContain('/screens/graveyrd.json');
      expect(urls).toContain('/screens/dragonsc.json');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @wiz6/viewer test tests/pages/wrapper-pages.test.tsx
```

Expected: FAIL (none of the wrapper pages exist).

- [ ] **Step 3: Implement `FontsPage`**

Create `packages/viewer/src/pages/FontsPage.tsx`:

```typescript
import { useState } from 'react';
import type { Palette } from '@wiz6/data';
import { FontGallery } from '../views/FontGallery.js';
import { Font4bppGallery } from '../views/Font4bppGallery.js';
import {
  EGA_PALETTE,
  WIZ6_PALETTE_1,
  WIZ6_PALETTE_2,
  WIZ6_TITLE_PALETTE,
  type PaletteName,
} from '../palettes/index.js';

const PALETTE_BY_NAME: Record<PaletteName, Palette> = {
  'wiz6-main': WIZ6_PALETTE_1,
  'wiz6-dungeon': WIZ6_PALETTE_2,
  'ega-default': EGA_PALETTE,
  'wiz6-title': WIZ6_TITLE_PALETTE,
};

const PICKER_OPTIONS: { name: PaletteName; label: string }[] = [
  { name: 'wiz6-title', label: 'wiz6-title (default)' },
  { name: 'wiz6-main', label: 'wiz6-main' },
  { name: 'wiz6-dungeon', label: 'wiz6-dungeon' },
  { name: 'ega-default', label: 'ega-default (raw)' },
];

export function FontsPage() {
  const [selected, setSelected] = useState<PaletteName>('wiz6-title');
  const palette = PALETTE_BY_NAME[selected];
  return (
    <main style={{ padding: 'var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Fonts</h1>
      <fieldset>
        <legend>4bpp palette</legend>
        {PICKER_OPTIONS.map(({ name, label }) => (
          <label key={name} style={{ marginRight: '1em' }}>
            <input
              type="radio"
              name="palette"
              value={name}
              checked={selected === name}
              onChange={() => setSelected(name)}
            />{' '}
            {label}
          </label>
        ))}
      </fieldset>
      <FontGallery url="/fonts/wfont0.json" />
      <Font4bppGallery url="/fonts/wfont1.json" palette={palette} />
      <Font4bppGallery url="/fonts/wfont2.json" palette={palette} />
      <Font4bppGallery url="/fonts/wfont3.json" palette={palette} />
      <Font4bppGallery url="/fonts/wfont4.json" palette={palette} />
    </main>
  );
}
```

- [ ] **Step 4: Implement `MsgPage`**

Create `packages/viewer/src/pages/MsgPage.tsx`:

```typescript
import { MessageGallery } from '../views/MessageGallery.js';

export function MsgPage() {
  return (
    <main style={{ padding: 'var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Messages</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>
        Huffman-decompressed text from <code>msg.dbs</code>.
      </p>
      <MessageGallery url="/messages/msg.json" />
    </main>
  );
}
```

- [ ] **Step 5: Implement `NewgamePage`**

Create `packages/viewer/src/pages/NewgamePage.tsx`:

```typescript
import { NewgameGallery } from '../views/NewgameGallery.js';

export function NewgamePage() {
  return (
    <main style={{ padding: 'var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Newgame</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>
        779 × 64-byte records from <code>newgame.dbs</code> (character-creation templates).
      </p>
      <NewgameGallery url="/newgame/newgame.json" />
    </main>
  );
}
```

- [ ] **Step 6: Implement `PortraitsIndex`**

Create `packages/viewer/src/pages/portraits/PortraitsIndex.tsx`:

```typescript
import { useState } from 'react';
import type { Palette } from '@wiz6/data';
import { PortraitGallery } from '../../views/PortraitGallery.js';
import {
  EGA_PALETTE,
  WIZ6_PALETTE_1,
  WIZ6_PALETTE_2,
  WIZ6_TITLE_PALETTE,
  type PaletteName,
} from '../../palettes/index.js';

const PALETTE_BY_NAME: Record<PaletteName, Palette> = {
  'wiz6-main': WIZ6_PALETTE_1,
  'wiz6-dungeon': WIZ6_PALETTE_2,
  'ega-default': EGA_PALETTE,
  'wiz6-title': WIZ6_TITLE_PALETTE,
};

const PICKER_OPTIONS: { name: PaletteName; label: string }[] = [
  { name: 'wiz6-title', label: 'wiz6-title (default)' },
  { name: 'wiz6-main', label: 'wiz6-main' },
  { name: 'wiz6-dungeon', label: 'wiz6-dungeon' },
  { name: 'ega-default', label: 'ega-default (raw)' },
];

export function PortraitsIndex() {
  const [selected, setSelected] = useState<PaletteName>('wiz6-title');
  const palette = PALETTE_BY_NAME[selected];
  return (
    <main style={{ padding: 'var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Portraits</h1>
      <fieldset>
        <legend>4bpp palette</legend>
        {PICKER_OPTIONS.map(({ name, label }) => (
          <label key={name} style={{ marginRight: '1em' }}>
            <input
              type="radio"
              name="palette"
              value={name}
              checked={selected === name}
              onChange={() => setSelected(name)}
            />{' '}
            {label}
          </label>
        ))}
      </fieldset>
      <PortraitGallery url="/portraits/wport1.json" palette={palette} />
      <PortraitGallery url="/portraits/wport2.json" palette={palette} />
      <PortraitGallery url="/portraits/wport3.json" palette={palette} />
    </main>
  );
}
```

- [ ] **Step 7: Implement `ScreensIndex`**

Create `packages/viewer/src/pages/screens/ScreensIndex.tsx`:

```typescript
import { ScreenGallery } from '../../views/ScreenGallery.js';
import { ScreenAlignmentTool } from '../../views/ScreenAlignmentTool.js';
import { WIZ6_TITLE_PALETTE } from '../../palettes/index.js';

const SCREENS = ['titlepag', 'graveyrd', 'dragonsc'];

export function ScreensIndex() {
  return (
    <main style={{ padding: 'var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Screens</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>
        EGA screen images. Lower section is the alignment tool — drag sliders to align planes
        manually.
      </p>
      {SCREENS.map((name) => (
        <ScreenGallery key={name} url={`/screens/${name}.json`} palette={WIZ6_TITLE_PALETTE} />
      ))}
      <h2 style={{ marginTop: 'var(--space-6)' }}>Alignment tool</h2>
      {SCREENS.map((name) => (
        <ScreenAlignmentTool key={name} url={`/screens/${name}.json`} />
      ))}
    </main>
  );
}
```

- [ ] **Step 8: Run the wrapper-pages test to verify all five wrappers pass**

```bash
pnpm --filter @wiz6/viewer test tests/pages/wrapper-pages.test.tsx
```

Expected: 5/5 pass.

- [ ] **Step 9: Commit**

```bash
git add packages/viewer/src/pages/FontsPage.tsx packages/viewer/src/pages/MsgPage.tsx packages/viewer/src/pages/NewgamePage.tsx packages/viewer/src/pages/portraits/PortraitsIndex.tsx packages/viewer/src/pages/screens/ScreensIndex.tsx packages/viewer/tests/pages/wrapper-pages.test.tsx
git commit -m "feat(viewer): per-route page wrappers for fonts, msg, newgame, portraits, screens"
```

---

## Task 9: Stub pages for sections deferred to later stages

Routes that get real implementations in later stages (monsters, items, quest, files) need stub page components so the router can mount them. Each stub renders a banner explaining what's coming and what stage it ships in. This is intentionally minimal — the value is just "the route works, and visitors aren't confused".

**Files:**
- Create: `packages/viewer/src/pages/monsters/MonstersPage.tsx`
- Create: `packages/viewer/src/pages/items/ItemsPage.tsx`
- Create: `packages/viewer/src/pages/QuestRecords.tsx`
- Create: `packages/viewer/src/pages/FilesOverview.tsx`
- Test: `packages/viewer/tests/pages/stub-pages.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/pages/stub-pages.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MonstersPage } from '../../src/pages/monsters/MonstersPage.js';
import { ItemsPage } from '../../src/pages/items/ItemsPage.js';
import { QuestRecords } from '../../src/pages/QuestRecords.js';
import { FilesOverview } from '../../src/pages/FilesOverview.js';

function renderInRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe('stub pages', () => {
  it.each([
    [MonstersPage, /monsters/i],
    [ItemsPage, /items/i],
    [QuestRecords, /quest records/i],
    [FilesOverview, /files/i],
  ])('renders an h1 matching %s', (Comp, pattern) => {
    renderInRouter(<Comp />);
    expect(screen.getByRole('heading', { level: 1, name: pattern })).toBeInTheDocument();
  });

  it.each([MonstersPage, ItemsPage, QuestRecords, FilesOverview])(
    'shows a "coming in stage" banner',
    (Comp) => {
      renderInRouter(<Comp />);
      expect(screen.getByText(/coming in stage/i)).toBeInTheDocument();
    },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @wiz6/viewer test tests/pages/stub-pages.test.tsx
```

Expected: FAIL (stub pages don't exist).

- [ ] **Step 3: Create a tiny shared `<StubBanner>` component**

Create `packages/viewer/src/components/StubBanner.tsx`:

```typescript
export function StubBanner({ stage, description }: { stage: string; description: string }) {
  return (
    <p
      style={{
        padding: 'var(--space-4)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 4,
        color: 'var(--color-text-muted)',
      }}
    >
      Coming in stage {stage}: {description}
    </p>
  );
}
```

- [ ] **Step 4: Implement the four stubs**

Create `packages/viewer/src/pages/monsters/MonstersPage.tsx`:

```typescript
import { StubBanner } from '../../components/StubBanner.js';

export function MonstersPage() {
  return (
    <main style={{ padding: 'var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Monsters</h1>
      <StubBanner
        stage="2b"
        description="split-view rogue's gallery with search, filters, six detail tabs, byte-field highlighting, compare mode, and family-grouped view."
      />
    </main>
  );
}
```

Create `packages/viewer/src/pages/items/ItemsPage.tsx`:

```typescript
import { StubBanner } from '../../components/StubBanner.js';

export function ItemsPage() {
  return (
    <main style={{ padding: 'var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Items</h1>
      <StubBanner
        stage="2e"
        description="sortable, filterable items table with detail panel, raw-bytes view, and XP-tables panel."
      />
    </main>
  );
}
```

Create `packages/viewer/src/pages/QuestRecords.tsx`. Note this file lives at `pages/QuestRecords.tsx` (one level shallower than `MonstersPage` and `ItemsPage`), so its `StubBanner` import is `../components/...`, not `../../components/...`.

```typescript
import { StubBanner } from '../components/StubBanner.js';

export function QuestRecords() {
  return (
    <main style={{ padding: 'var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Quest records</h1>
      <StubBanner
        stage="2f"
        description="three quest-data records (CAPTAIN MATEY, COSMIC FORGE, L'MONTES) with name slots, raw bytes, and embedded-string annotations."
      />
    </main>
  );
}
```

Create `packages/viewer/src/pages/FilesOverview.tsx`:

```typescript
import { StubBanner } from '../components/StubBanner.js';

export function FilesOverview() {
  return (
    <main style={{ padding: 'var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Files</h1>
      <StubBanner
        stage="2f"
        description="per-file section layouts and a scenario.dbs region bar showing what is and isn't decoded yet."
      />
    </main>
  );
}
```

- [ ] **Step 5: Run the stub test to verify it passes**

```bash
pnpm --filter @wiz6/viewer test tests/pages/stub-pages.test.tsx
```

Expected: 8/8 pass (4 h1 + 4 banner).

- [ ] **Step 6: Commit**

```bash
git add packages/viewer/src/components/StubBanner.tsx packages/viewer/src/pages/monsters/MonstersPage.tsx packages/viewer/src/pages/items/ItemsPage.tsx packages/viewer/src/pages/QuestRecords.tsx packages/viewer/src/pages/FilesOverview.tsx packages/viewer/tests/pages/stub-pages.test.tsx
git commit -m "feat(viewer): stub pages for monsters, items, quest, files (later stages)"
```

---

## Task 10: Router scaffold

Wire every route to its page component. Use `React.lazy` for route-based code-splitting so the items page doesn't pull in monster-detail components and vice versa.

**Files:**
- Create: `packages/viewer/src/router.tsx`
- Test: `packages/viewer/tests/router.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/router.test.tsx`:

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
  it.each([
    ['/', /wiz6 data explorer/i],
    ['/monsters', /monsters/i],
    ['/items', /items/i],
    ['/quest', /quest records/i],
    ['/screens', /screens/i],
    ['/portraits', /portraits/i],
    ['/fonts', /fonts/i],
    ['/msg', /messages/i],
    ['/newgame', /newgame/i],
    ['/files', /files/i],
  ])('mounts a page at %s with an h1 matching %s', async (path, headingPattern) => {
    renderAt(path);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: headingPattern }),
      ).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @wiz6/viewer test tests/router.test.tsx
```

Expected: FAIL (router.tsx doesn't exist).

- [ ] **Step 3: Implement the router**

Create `packages/viewer/src/router.tsx`:

```typescript
import { lazy } from 'react';
import { Route } from 'react-router-dom';

const Landing = lazy(() => import('./pages/Landing.js').then((m) => ({ default: m.Landing })));
const MonstersPage = lazy(() =>
  import('./pages/monsters/MonstersPage.js').then((m) => ({ default: m.MonstersPage })),
);
const ItemsPage = lazy(() =>
  import('./pages/items/ItemsPage.js').then((m) => ({ default: m.ItemsPage })),
);
const QuestRecords = lazy(() =>
  import('./pages/QuestRecords.js').then((m) => ({ default: m.QuestRecords })),
);
const ScreensIndex = lazy(() =>
  import('./pages/screens/ScreensIndex.js').then((m) => ({ default: m.ScreensIndex })),
);
const PortraitsIndex = lazy(() =>
  import('./pages/portraits/PortraitsIndex.js').then((m) => ({ default: m.PortraitsIndex })),
);
const FontsPage = lazy(() =>
  import('./pages/FontsPage.js').then((m) => ({ default: m.FontsPage })),
);
const MsgPage = lazy(() =>
  import('./pages/MsgPage.js').then((m) => ({ default: m.MsgPage })),
);
const NewgamePage = lazy(() =>
  import('./pages/NewgamePage.js').then((m) => ({ default: m.NewgamePage })),
);
const FilesOverview = lazy(() =>
  import('./pages/FilesOverview.js').then((m) => ({ default: m.FilesOverview })),
);

export const routes = (
  <>
    <Route path="/" element={<Landing />} />
    <Route path="/monsters" element={<MonstersPage />} />
    <Route path="/items" element={<ItemsPage />} />
    <Route path="/quest" element={<QuestRecords />} />
    <Route path="/screens" element={<ScreensIndex />} />
    <Route path="/portraits" element={<PortraitsIndex />} />
    <Route path="/fonts" element={<FontsPage />} />
    <Route path="/msg" element={<MsgPage />} />
    <Route path="/newgame" element={<NewgamePage />} />
    <Route path="/files" element={<FilesOverview />} />
  </>
);
```

- [ ] **Step 4: Run the router test to verify it passes**

```bash
pnpm --filter @wiz6/viewer test tests/router.test.tsx
```

Expected: 10/10 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/router.tsx packages/viewer/tests/router.test.tsx
git commit -m "feat(viewer): router scaffold with lazy-loaded per-route pages"
```

---

## Task 11: Replace `App.tsx` shell

Rewrite `App.tsx` to mount the router, render `TopNav`, and wrap routes in `Suspense`. The old monolithic content disappears in this task (it's been ported into the per-route pages).

**Files:**
- Modify: `packages/viewer/src/App.tsx`
- Test: `packages/viewer/tests/App.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/App.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../src/App.js';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell />
    </MemoryRouter>,
  );
}

describe('AppShell', () => {
  it('renders the TopNav on every page', async () => {
    renderAt('/monsters');
    expect(screen.getByRole('navigation', { name: /primary/i })).toBeInTheDocument();
  });

  it('renders the Landing page content at /', async () => {
    renderAt('/');
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /wiz6 data explorer/i }),
      ).toBeInTheDocument();
    });
  });

  it('renders the Monsters stub at /monsters', async () => {
    renderAt('/monsters');
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /monsters/i })).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @wiz6/viewer test tests/App.test.tsx
```

Expected: FAIL — `AppShell` doesn't exist (current export is `App`).

- [ ] **Step 3: Rewrite `App.tsx`**

Replace the entire contents of `packages/viewer/src/App.tsx` with:

```typescript
import { Suspense } from 'react';
import { Routes } from 'react-router-dom';
import { TopNav } from './components/TopNav.js';
import { routes } from './router.js';
import './theme/theme.css';

export function AppShell() {
  return (
    <>
      <TopNav />
      <Suspense fallback={<p style={{ padding: 'var(--space-5)' }}>loading…</p>}>
        <Routes>{routes}</Routes>
      </Suspense>
    </>
  );
}
```

- [ ] **Step 4: Run the App test to verify it passes**

```bash
pnpm --filter @wiz6/viewer test tests/App.test.tsx
```

Expected: 3/3 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/App.tsx packages/viewer/tests/App.test.tsx
git commit -m "feat(viewer): replace monolithic App with routed AppShell"
```

---

## Task 12: Update `main.tsx` to wrap with `BrowserRouter`

The router needs to be mounted at the top of the React tree.

**Files:**
- Modify: `packages/viewer/src/main.tsx`

- [ ] **Step 1: Rewrite `main.tsx`**

Replace `packages/viewer/src/main.tsx` with:

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppShell } from './App.js';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');
createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  </StrictMode>,
);
```

- [ ] **Step 2: Run the full viewer test suite to confirm nothing regressed**

```bash
pnpm --filter @wiz6/viewer test
```

Expected: all viewer tests pass — original 67 + new tests from Tasks 2-11.

- [ ] **Step 3: Run typecheck**

```bash
pnpm -r typecheck
```

Expected: typecheck passes in data, parser, viewer.

- [ ] **Step 4: Run a build to confirm the production bundle compiles**

```bash
pnpm --filter @wiz6/viewer build
```

Expected: `dist/` written, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/main.tsx
git commit -m "feat(viewer): wrap AppShell with BrowserRouter in main entry"
```

---

## Task 13: Top-level `pnpm dev:viewer` alias

The user wants to leave this running. Add a top-level script so `pnpm dev:viewer` works from the repo root.

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Add the alias to the root package.json scripts block**

Inspect the current root scripts first:

```bash
node -e "console.log(JSON.stringify(require('./package.json').scripts, null, 2))"
```

Then add `"dev:viewer": "pnpm --filter @wiz6/viewer dev"` to the `scripts` block in `package.json`.

The edit can be performed with this shell command (preserves other scripts):

```bash
node -e '
const fs = require("node:fs");
const pkg = JSON.parse(fs.readFileSync("package.json","utf8"));
pkg.scripts = { ...pkg.scripts, "dev:viewer": "pnpm --filter @wiz6/viewer dev" };
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
'
```

- [ ] **Step 2: Verify the alias works**

```bash
pnpm dev:viewer --help 2>&1 | head -5
```

Expected: Vite's help output appears (the script resolves and runs).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat: pnpm dev:viewer alias for always-on viewer dev server"
```

---

## Task 14: Final smoke check and stage-summary commit

Final sanity check before marking the stage complete and merging.

**Files:** none (test-only)

- [ ] **Step 1: Run the full test suite**

```bash
pnpm -r test
```

Expected: 213 (baseline) + new viewer tests from this stage. Concrete numbers:
- data 82 unchanged
- parser 64 unchanged
- viewer: 67 baseline + ≈ 6 slug + 21 theme + 11 TopNav + 3 SectionCard + 4 Landing + 5 wrapper-pages + 8 stub-pages + 10 router + 3 App = ≈ 138 viewer tests total

Exact number may differ slightly based on test runner counting (`.each` rows count as separate tests). Acceptable range: 130-145 viewer tests. No failures.

- [ ] **Step 2: Run typecheck on the whole monorepo**

```bash
pnpm -r typecheck
```

Expected: green across data, parser, viewer.

- [ ] **Step 3: Run `pnpm dev:viewer` in the background and curl-test the home route**

```bash
pnpm dev:viewer &
DEV_PID=$!
# wait for vite to boot
until curl -fsS http://localhost:5173/ -o /dev/null 2>&1; do sleep 0.2; done
# fetch index.html and check it has a #root element
curl -fsS http://localhost:5173/ | grep -q 'id="root"' && echo "root present" || echo "root missing"
kill $DEV_PID
```

Expected: "root present".

- [ ] **Step 4: Verify there are no remaining imports of the old `App` named export**

```bash
grep -rn "import { App }" packages/viewer/src 2>&1 || echo "no stale App imports"
```

Expected: "no stale App imports" (the export was renamed to `AppShell`).

- [ ] **Step 5: Commit a stage-summary if any housekeeping changed; otherwise skip**

If anything was edited during the smoke check (it shouldn't have been), commit it. Otherwise no commit.

---

## Finishing the stage

Hand off to the `superpowers:finishing-a-development-branch` skill — present the four options (merge / PR / keep / discard) to the user. Use option **1 (merge locally)** by default if the user has previously approved the "commit and merge" pattern for stage merges (verified by prior commits like `Merge stage 1j.2.17`).

After merge: delete the branch, remove the worktree, run `pnpm -r test` once on `main` to confirm.

---

## Out of scope for this plan

Captured here so an executing agent doesn't try to bundle them in:

- Monster split-view UX → stage 2b plan
- Byte-field highlighting → stage 2c plan
- Compare mode → stage 2d plan
- Items polish → stage 2e plan
- Quest records + Files overview real content → stage 2f plan
- wfont3 as a custom heading font on `<h1>` → revisit during stage 2b polish; defer otherwise
- Pi deployment automation → separate task when user is ready to deploy
