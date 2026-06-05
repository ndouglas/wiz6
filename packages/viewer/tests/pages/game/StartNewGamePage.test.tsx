/**
 * StartNewGamePage tests — B3 handler behaviour:
 *   - Empty active party → renders "no party" message, stays at /castle/start-new-game
 *   - Non-empty party → calls initGameSession with the loaded DungeonLevel + navigates to /game/maze
 *
 * Follows the component test pattern (MemoryRouter + Routes, vi.mock for async deps).
 * loadDungeonLevel and the game-session-store are mocked so the test has no I/O.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { StartNewGamePage } from '../../../src/pages/game/StartNewGamePage.js';
import type { DungeonLevel } from '@wiz6/data';

// ── mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../../src/data-loader.js', () => ({
  loadDungeonLevel: vi.fn(),
}));

vi.mock('../../../src/game/game-session-store.js', () => ({
  initGameSession: vi.fn(),
}));

vi.mock('../../../src/lib/active-party-store.js', () => ({
  readActiveParty: vi.fn(),
}));

import { loadDungeonLevel } from '../../../src/data-loader.js';
import { initGameSession } from '../../../src/game/game-session-store.js';
import { readActiveParty } from '../../../src/lib/active-party-store.js';

const mockLoadDungeonLevel = vi.mocked(loadDungeonLevel);
const mockInitGameSession  = vi.mocked(initGameSession);
const mockReadActiveParty  = vi.mocked(readActiveParty);

// Minimal valid DungeonLevel fixture.
const LEVEL_0: DungeonLevel = {
  id: 0,
  entrance: { gx: 127, gy: 120, z: 0, facing: 0 },
  mazeBlock: {
    gxBase: new Array(12).fill(0),
    gyBase: new Array(12).fill(0),
    regions: [[]],
  },
};

// Helper: render StartNewGamePage inside a MemoryRouter with a /game/maze sentinel.
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/castle/start-new-game']}>
      <Routes>
        <Route path="/castle/start-new-game" element={<StartNewGamePage />} />
        <Route path="/game/maze" element={<div role="main" aria-label="maze" />} />
        <Route path="/castle" element={<div role="main" aria-label="castle" />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ── setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
  mockInitGameSession.mockImplementation(() => undefined);
});

// ── tests ──────────────────────────────────────────────────────────────────

describe('StartNewGamePage — empty party', () => {
  beforeEach(() => {
    mockReadActiveParty.mockReturnValue({ schemaVersion: 1, members: [] });
  });

  it('shows the "no party" message', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });
    expect(screen.getByText(/at least one party member/i)).toBeInTheDocument();
  });

  it('does NOT call loadDungeonLevel', () => {
    renderPage();
    expect(mockLoadDungeonLevel).not.toHaveBeenCalled();
  });

  it('does NOT call initGameSession', () => {
    renderPage();
    expect(mockInitGameSession).not.toHaveBeenCalled();
  });

  it('shows a back link to /castle', async () => {
    renderPage();
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /back to master options/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/castle');
    });
  });
});

describe('StartNewGamePage — non-empty party', () => {
  beforeEach(() => {
    mockReadActiveParty.mockReturnValue({
      schemaVersion: 1,
      members: [
        {
          id: 'aabbccdd-0000-4000-8000-000000000001',
          rosterCharacterId: 'aabbccdd-0000-4000-8000-000000000001',
          portraitSlotId: 0,
          name: 'THESUS',
          race: 0, class: 0, sex: 0, level: 1, xp: 0, gold: 0,
          conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          dead: false, paralyzed: false,
          attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
          schoolMana: [0, 0, 0, 0, 0, 0],
          schoolManaMax: [0, 0, 0, 0, 0, 0],
          skills: new Array(30).fill(0),
          savedOldLevel: 0,
          reaction: 0,
        },
      ],
    });
    mockLoadDungeonLevel.mockResolvedValue(LEVEL_0);
  });

  it('calls loadDungeonLevel(0)', async () => {
    renderPage();
    await waitFor(() => expect(mockLoadDungeonLevel).toHaveBeenCalledWith(0));
  });

  it('calls initGameSession with the loaded level', async () => {
    renderPage();
    await waitFor(() => expect(mockInitGameSession).toHaveBeenCalledWith(LEVEL_0));
  });

  it('navigates to /game/maze after session init', async () => {
    renderPage();
    await waitFor(() => {
      // The /game/maze sentinel element should appear in the DOM after navigate.
      expect(screen.getByRole('main', { name: /maze/i })).toBeInTheDocument();
    });
  });
});

describe('StartNewGamePage — load error', () => {
  beforeEach(() => {
    mockReadActiveParty.mockReturnValue({
      schemaVersion: 1,
      members: [
        {
          id: 'aabbccdd-0000-4000-8000-000000000002',
          rosterCharacterId: 'aabbccdd-0000-4000-8000-000000000002',
          portraitSlotId: 0,
          name: 'TEMPEST',
          race: 0, class: 0, sex: 0, level: 1, xp: 0, gold: 0,
          conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          dead: false, paralyzed: false,
          attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
          schoolMana: [0, 0, 0, 0, 0, 0],
          schoolManaMax: [0, 0, 0, 0, 0, 0],
          skills: new Array(30).fill(0),
          savedOldLevel: 0,
          reaction: 0,
        },
      ],
    });
    mockLoadDungeonLevel.mockRejectedValue(new Error('network error'));
  });

  it('shows the error state when loadDungeonLevel rejects', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/failed to load the dungeon level/i)).toBeInTheDocument();
    });
  });

  it('does NOT call initGameSession on load failure', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/failed to load the dungeon level/i)).toBeInTheDocument();
    });
    expect(mockInitGameSession).not.toHaveBeenCalled();
  });
});
