import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RosterView } from '../../../src/pages/game/RosterView.js';

const FAKE_GALLERY = {
  schemaVersion: 1,
  characters: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Hawkwind',
      race: 0, class: 0, level: 1, savedOldLevel: 0, xp: 0, gold: 100,
      conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      dead: false, paralyzed: false,
      attributes: { str: 14, int: 9, pie: 8, vit: 13, dex: 11, spd: 12, personality: 60, karma: 50 },
      schoolMana: [0, 0, 0, 0, 0, 0],
      skills: [10, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      reaction: 50,
    },
  ],
};

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
    ok: true,
    json: async () => FAKE_GALLERY,
  } as unknown as Response));
});

describe('RosterView', () => {
  it('renders the page heading and seeds the roster from the gallery on first mount', async () => {
    render(<MemoryRouter><RosterView /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: /roster/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Hawkwind')).toBeInTheDocument();
    });
  });

  it('renders existing roster characters (no re-seed needed)', async () => {
    render(<MemoryRouter><RosterView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Hawkwind')).toBeInTheDocument();
    });
  });
});
