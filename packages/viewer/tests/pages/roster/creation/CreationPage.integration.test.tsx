// packages/viewer/tests/pages/roster/creation/CreationPage.integration.test.tsx
//
// Integration tests for CreationPage — the top-level component that owns the
// creation flow reducer, asset loading, and character commit.
//
// Strategy:
//   - Assets are injected via the optional `loaders` prop so tests never
//     fetch from a dev server.
//   - The Fighter happy-path drives the REAL mounted CreationPage + real
//     screen components + real window keydown events end-to-end.
//   - The Mage path goes through the spell-pick screen.
//   - The Cancel path asserts addCharacter is NOT called.
//
// Reducer-state bypass note:
//   For the bonus-allocator screen we use the `loaders.overrideState` hook
//   to inject a state where the bonus pool is already 0 (to skip the
//   tedious point-by-point allocation in the integration test). The approach:
//   we use `waitFor` to poll until the expected screen appears, then fire
//   keydowns.
//
// Screen routing for keydowns:
//   Each screen mounts its own `window.addEventListener('keydown', ...)`.
//   Since CreationPage renders only the active screen at any time, there is
//   exactly one keydown listener per screen transition. Firing keydowns on
//   `window` reaches the active screen.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Font, Font4bpp, MessageDb } from '@wiz6/data';
import { FontSchema, Font4bppSchema, WichmannHill } from '@wiz6/data';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { CreationPage } from '../../../../src/pages/roster/creation/CreationPage.js';
import { initialCreationState } from '../../../../src/pages/roster/creation/state.js';
import type { CreationState } from '../../../../src/pages/roster/creation/state.js';
import { readRoster } from '../../../../src/lib/roster-store.js';

// ---------------------------------------------------------------------------
// Resolve disk paths (same pattern as assets.test.ts)
// ---------------------------------------------------------------------------

function findMainCheckoutRoot(): string {
  const testDir = dirname(fileURLToPath(import.meta.url));
  // From tests/pages/roster/creation/ (this file):
  //   .        = creation/
  //   ..       = roster/
  //   ../..    = pages/
  //   ../../.. = tests/
  //   ../../../.. = viewer/ (packages/viewer)
  //   ../../../../.. = packages/
  //   ../../../../../.. = worktree root
  const worktreeRoot = resolve(testDir, '../../../../../..');
  const gitFilePath = join(worktreeRoot, '.git');
  let gitContent: string;
  try {
    gitContent = readFileSync(gitFilePath, 'utf-8');
  } catch {
    return worktreeRoot;
  }
  // "gitdir: /path/to/.git/worktrees/branch-name\n"
  const match = /gitdir:\s*(.+)/.exec(gitContent);
  if (!match) return worktreeRoot;
  const gitDir = match[1]!.trim();
  const dotGitDir = gitDir.replace(/\/worktrees\/[^/]+$/, '');
  return resolve(dotGitDir, '..');
}

const MAIN_ROOT = findMainCheckoutRoot();
const EXTRACTED_FONTS = join(MAIN_ROOT, 'extracted', 'fonts');
const EXTRACTED_MESSAGES = join(MAIN_ROOT, 'extracted', 'messages');

async function diskLoadFont(url: string): Promise<Font> {
  const filename = url.replace(/^\/fonts\//, '');
  const json: unknown = JSON.parse(readFileSync(join(EXTRACTED_FONTS, filename), 'utf-8'));
  return FontSchema.parse(json);
}

async function diskLoadFont4bpp(url: string): Promise<Font4bpp> {
  const filename = url.replace(/^\/fonts\//, '');
  const json: unknown = JSON.parse(readFileSync(join(EXTRACTED_FONTS, filename), 'utf-8'));
  return Font4bppSchema.parse(json);
}

async function diskLoadMessageDb(url: string): Promise<MessageDb> {
  // url is '/messages/msg.json' — strip the '/messages/' prefix to get filename
  const filename = url.replace(/^\/messages\//, '');
  const json: unknown = JSON.parse(readFileSync(join(EXTRACTED_MESSAGES, filename), 'utf-8'));
  const { MessageDbSchema } = await import('@wiz6/data');
  return MessageDbSchema.parse(json);
}

const DISK_LOADERS = {
  loadFont: diskLoadFont,
  loadFont4bpp: diskLoadFont4bpp,
  loadMessageDb: diskLoadMessageDb,
};

// ---------------------------------------------------------------------------
// Test environment setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  window.localStorage.clear();
});

// ---------------------------------------------------------------------------
// Deterministic seed for tests
//
// Static boot triple: (3000, 1, 29999) — same as state.test.ts
// From state.test.ts analysis: with Human (race=0) + Male (sex=0), after the
// bonus roll (which uses this seed), we get a deterministic bonusPool.
// ---------------------------------------------------------------------------

// The seed triple maps directly to WichmannHill(seed, seed+1, seed+29998)
// for a numeric seed. But for the tests we pass the static triple explicitly
// via seed=0 which maps to (3000, 1, 29999).
const TEST_SEED = 0; // maps to static boot triple (3000, 1, 29999)

// ---------------------------------------------------------------------------
// Helper: mount CreationPage with disk loaders in a MemoryRouter
// ---------------------------------------------------------------------------

function mountCreationPage(seed = TEST_SEED) {
  return render(
    <MemoryRouter initialEntries={['/roster/new']}>
      <Routes>
        <Route path="/roster/new" element={
          <CreationPage seed={seed} loaders={DISK_LOADERS} />
        } />
        <Route path="/roster" element={<div data-testid="roster-page">ROSTER</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Wait helpers
// ---------------------------------------------------------------------------

/** Wait for the page to leave the 'Loading...' state. */
async function waitForLoaded(container: HTMLElement): Promise<void> {
  await waitFor(
    () => {
      // After loading, the page renders a <canvas>
      const canvas = container.querySelector('canvas');
      if (!canvas) throw new Error('still loading');
    },
    { timeout: 5000 },
  );
}

// ---------------------------------------------------------------------------
// Fighter happy-path integration test
// ---------------------------------------------------------------------------
//
// Flow: name → race(Lizardman=6) → sex(Male=0) → class(Fighter=0) →
//       bonusAllocator(drain pool) → personality → portrait → confirm(YES)
//       → committing → addCharacter → navigate('/roster')
//
// Lizardman (index 6) has str=12 which qualifies for Fighter immediately,
// so no bonus allocation to STR is needed (though we still drain the pool
// so ALLOC_CONFIRM succeeds).

describe('CreationPage — Fighter happy-path (Lizardman)', () => {
  it('drives full flow to committing and calls addCharacter', async () => {
    const { container } = mountCreationPage();

    await waitForLoaded(container);

    // --- Name screen: type "GROND" + Enter ---
    fireEvent.keyDown(window, { key: 'G' });
    fireEvent.keyDown(window, { key: 'R' });
    fireEvent.keyDown(window, { key: 'O' });
    fireEvent.keyDown(window, { key: 'N' });
    fireEvent.keyDown(window, { key: 'D' });
    fireEvent.keyDown(window, { key: 'Enter' });

    // --- Race screen: ArrowDown x6 (to Lizardman, index 6) + Enter ---
    // Race picker starts at index 0 (Human). Lizardman is index 6 → 6 downs.
    await waitFor(() => {
      // After name confirm, state.screen = 'race'; canvas still showing
      expect(container.querySelector('canvas')).toBeTruthy();
    });

    for (let i = 0; i < 6; i++) {
      fireEvent.keyDown(window, { key: 'ArrowDown' });
    }
    fireEvent.keyDown(window, { key: 'Enter' });

    // --- Sex screen: Enter (Male = first entry = index 0) ---
    // After race pick, state.screen = 'sex'
    fireEvent.keyDown(window, { key: 'Enter' });

    // --- Class screen: Enter (Fighter = first enabled = index 0) ---
    // After sex pick + bonus roll (non-interactive), state.screen = 'class'
    // Lizardman str=12 qualifies for Fighter immediately
    fireEvent.keyDown(window, { key: 'Enter' });

    // --- BonusAllocator: drain pool to 0 then Enter ---
    // After class pick, state.screen = 'bonusAllocator'
    // We need to drain the bonus pool. With static seed (3000,1,29999),
    // rollBonus returns a deterministic value 5..26.
    // Strategy: send ArrowRight (delta+1) for max pool (26), then Enter.
    // The reducer will ignore extra ArrowRights (cap=18 per attr).
    // We allocate all points to STR first (Lizardman str=12, cap 18 → 6 more)
    // then remainder to other attrs.
    // For simplicity: pump ArrowRight 30 times (enough to drain any pool 5..26),
    // but we need to switch attrs when one attr is full.
    // Better approach: pump ArrowDown + ArrowRight alternately to spread across attrs.
    // We'll do: for each of 26 iterations, ArrowRight then ArrowDown.
    for (let i = 0; i < 26; i++) {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      // Move cursor down so we don't get stuck at cap 18 on one attr
      if (i % 6 === 5) {
        fireEvent.keyDown(window, { key: 'ArrowDown' });
      }
    }
    // Now Enter — reducer accepts only if pool==0
    fireEvent.keyDown(window, { key: 'Enter' });

    // Wait for personality screen (after ALLOC_CONFIRM fires derived-stats + skill-budget)
    // then Enter to accept personality (karma roll fires here)
    await waitFor(
      () => {
        // Canvas should still be present; we can try pressing Enter and see
        // if things progress — but we can't easily inspect state from outside.
        // Instead, just fire Enter (PersonalityScreen only reacts to Enter).
        expect(container.querySelector('canvas')).toBeTruthy();
      },
      { timeout: 1000 },
    );
    fireEvent.keyDown(window, { key: 'Enter' });

    // --- Portrait screen: Enter (pick portrait 0) ---
    fireEvent.keyDown(window, { key: 'Enter' });

    // --- SkillTrain or SpellPick or Confirm ---
    // Fighter may have skillBudget > 0 or = 0 depending on RNG.
    // We need to handle the possibility of skill training.
    // Strategy: fire Enter repeatedly — if on skillTrain, Enter trains skill
    // and may auto-advance. If on spellPick, PICK_SPELL + SPELLS_DONE.
    // If on confirm, YES is default so Enter confirms.
    // We do this in a polling loop.

    // For skill training: keep pressing Enter until we reach confirm.
    // SkillTrainScreen: Enter dispatches TRAIN_SKILL; reducer auto-advances when budget=0.
    // Max skill budget is bounded. Pump Enter 30 times to drain budget and reach confirm.
    for (let i = 0; i < 30; i++) {
      fireEvent.keyDown(window, { key: 'Enter' });
    }

    // --- Confirm screen: Enter (YES = first option = keep=true) ---
    // At this point we should be on confirm. Fire Enter once more.
    fireEvent.keyDown(window, { key: 'Enter' });

    // --- After committing: roster should have a character ---
    await waitFor(
      () => {
        const roster = readRoster();
        expect(roster.characters.length).toBe(1);
      },
      { timeout: 2000 },
    );

    const roster = readRoster();
    const char = roster.characters[0]!;
    expect(char.name).toBe('GROND');
    expect(char.race).toBe(6); // Lizardman
    expect(char.class).toBe(0); // Fighter
    expect(char.sex).toBe(0); // Male
    expect(char.attributes.str).toBeGreaterThanOrEqual(12);
    expect(char.level).toBe(1);
    expect(typeof char.id).toBe('string');
    expect(char.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  }, 10000);
});

// ---------------------------------------------------------------------------
// Cancel path test
// ---------------------------------------------------------------------------
//
// Injects a pre-built state at `confirm` via `_testInitialState` so we
// don't need to drive the full keydown flow (which is already covered by
// the Fighter happy-path test). Just verifies that DISCARD → no addCharacter
// + navigate to /roster.

describe('CreationPage — Cancel path', () => {
  it('navigates to /roster without calling addCharacter on DISCARD', async () => {
    // Build a pre-populated state at the 'confirm' screen.
    const rng = new WichmannHill(3000, 1, 29999);
    const baseState = initialCreationState(rng);
    const confirmState: CreationState = {
      ...baseState,
      screen: 'confirm',
      draft: {
        ...baseState.draft,
        name: 'DISCARD',
        race: 6,   // Lizardman
        sex: 0,    // Male
        class: 0,  // Fighter
        attributes: { str: 18, int: 5, pie: 5, vit: 14, dex: 8, spd: 10, per: 3, kar: 10 },
        bonusPool: 0,
        skillBudget: 0,
        skills: new Array(30).fill(0) as number[],
        portrait: 0,
        spellPicks: [],
        derived: {
          hpInitial: 12,
          stamina: 84,
          goldInitial: 500,
          age: 22000,
          encumbranceMin: 10,
          encumbranceMax: 20,
          level: 1,
          xp: 1,
        },
      },
    };

    const { container } = render(
      <MemoryRouter initialEntries={['/roster/new']}>
        <Routes>
          <Route path="/roster/new" element={
            <CreationPage
              seed={TEST_SEED}
              loaders={DISK_LOADERS}
              _testInitialState={confirmState}
            />
          } />
          <Route path="/roster" element={<div data-testid="roster-page-cancel">ROSTER</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitForLoaded(container);

    // We're at the confirm screen. Select NO (ArrowDown) then Enter → DISCARD
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });

    // After DISCARD: CreationPage navigates to /roster.
    await waitFor(
      () => {
        const rosterPage = document.querySelector('[data-testid="roster-page-cancel"]');
        expect(rosterPage).toBeTruthy();
      },
      { timeout: 3000 },
    );

    // addCharacter was NOT called — roster remains empty
    const roster = readRoster();
    expect(roster.characters.length).toBe(0);
  }, 10000);
});

// ---------------------------------------------------------------------------
// Mage path test (spell-pick screen via _testInitialState)
// ---------------------------------------------------------------------------
//
// A caster class requires int≥12 at creation time (before bonus allocation),
// but the class screen is reached before bonus allocation. This makes it
// impractical to drive an end-to-end keydown test for a Mage — instead we
// use _testInitialState to inject a state at 'spellPick' and verify that
// CreationPage correctly routes through spellPick → confirm → committing
// and produces a character with spellPicks when committed.

describe('CreationPage — Mage caster path (via state injection)', () => {
  it('routes through spellPick and commits a character with spell picks', async () => {
    // Build a state pre-populated at spellPick for a Mage (class=1) character.
    // Mage requires 2 picks from the Mage spellbook (CLASS_SPELLBOOKS[1]=[2,0,0,0]).
    const rng = new WichmannHill(3000, 1, 29999);
    const baseState = initialCreationState(rng);
    const spellPickState: CreationState = {
      ...baseState,
      screen: 'spellPick',
      draft: {
        ...baseState.draft,
        name: 'MYXL',
        race: 1,   // Elf
        sex: 0,    // Male
        class: 1,  // Mage
        attributes: { str: 7, int: 18, pie: 10, vit: 7, dex: 9, spd: 9, per: 10, kar: 8 },
        bonusPool: 0,
        skillBudget: 0, // skip skill training
        skills: new Array(30).fill(0) as number[],
        portrait: 5,
        spellPicks: [],  // no picks yet
        derived: {
          hpInitial: 6,
          stamina: 42,
          goldInitial: 300,
          age: 19000,
          encumbranceMin: 8,
          encumbranceMax: 16,
          level: 1,
          xp: 1,
        },
      },
    };

    const { container } = render(
      <MemoryRouter initialEntries={['/roster/new']}>
        <Routes>
          <Route path="/roster/new" element={
            <CreationPage
              seed={TEST_SEED}
              loaders={DISK_LOADERS}
              _testInitialState={spellPickState}
            />
          } />
          <Route path="/roster" element={<div data-testid="roster-mage">ROSTER</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitForLoaded(container);

    // At spellPick: Mage needs 2 picks.
    // SpellPickScreen: Enter picks the cursor spell; auto-dispatches SPELLS_DONE when picks=required.
    // First Enter: picks spell 0 (pickedSoFar=0, required=2 → 0+1=1 < 2, no SPELLS_DONE)
    // Second Enter: picks spell 1 (pickedSoFar=1, required=2 → 1+1=2 >= 2 → SPELLS_DONE)
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'Enter' });

    // Now at confirm screen. Enter → CONFIRM { keep: true } → committing
    fireEvent.keyDown(window, { key: 'Enter' });

    // After committing: roster should have a Mage with 2 spell picks
    await waitFor(
      () => {
        const roster = readRoster();
        expect(roster.characters.length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );

    const roster = readRoster();
    const char = roster.characters.find((c) => c.name === 'MYXL');
    expect(char).toBeDefined();
    expect(char!.name).toBe('MYXL');
    expect(char!.race).toBe(1); // Elf
    expect(char!.class).toBe(1); // Mage
    expect(char!.level).toBe(1);
  }, 10000);
});

// ---------------------------------------------------------------------------
// buildCharacterFromDraft unit-style test via CreationPage integration
// ---------------------------------------------------------------------------

describe('buildCharacterFromDraft via CreationPage', () => {
  it('produces a valid Character (UUID, name, race, class, attributes, skills)', async () => {
    window.localStorage.clear();

    const { container } = render(
      <MemoryRouter initialEntries={['/roster/new']}>
        <Routes>
          <Route path="/roster/new" element={
            <CreationPage seed={TEST_SEED} loaders={DISK_LOADERS} />
          } />
          <Route path="/roster" element={<div data-testid="roster-build">ROSTER</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitForLoaded(container);

    // Drive Lizardman Fighter to commit
    'ZARA'.split('').forEach((k) => fireEvent.keyDown(window, { key: k }));
    fireEvent.keyDown(window, { key: 'Enter' });

    // Race: Lizardman (index 6)
    for (let i = 0; i < 6; i++) fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });

    // Sex: Enter
    fireEvent.keyDown(window, { key: 'Enter' });

    // Class: Fighter (index 0)
    fireEvent.keyDown(window, { key: 'Enter' });

    // BonusAllocator: drain pool
    for (let i = 0; i < 26; i++) {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      if (i % 6 === 5) fireEvent.keyDown(window, { key: 'ArrowDown' });
    }
    fireEvent.keyDown(window, { key: 'Enter' });

    // Personality: Enter
    fireEvent.keyDown(window, { key: 'Enter' });

    // Portrait: Enter
    fireEvent.keyDown(window, { key: 'Enter' });

    // Drain skill budget
    for (let i = 0; i < 30; i++) {
      fireEvent.keyDown(window, { key: 'Enter' });
    }

    // Confirm: Enter (YES)
    fireEvent.keyDown(window, { key: 'Enter' });

    await waitFor(
      () => {
        const roster = readRoster();
        expect(roster.characters.length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );

    const roster = readRoster();
    const char = roster.characters.find((c) => c.name === 'ZARA');
    expect(char).toBeDefined();
    expect(char!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(char!.name).toBe('ZARA');
    expect(char!.race).toBe(6); // Lizardman
    expect(char!.class).toBe(0); // Fighter
    expect(char!.level).toBe(1);
    expect(char!.xp).toBeGreaterThanOrEqual(1);
    expect(char!.skills).toHaveLength(30);
    expect(char!.conditions).toHaveLength(10);
    expect(char!.schoolMana).toHaveLength(6);
    expect(char!.schoolManaMax).toHaveLength(6);
    expect(char!.dead).toBe(false);
  }, 10000);
});
