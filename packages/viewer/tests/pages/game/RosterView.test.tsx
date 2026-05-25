import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RosterView } from '../../../src/pages/game/RosterView.js';

const FAKE_GALLERY = {
  schemaVersion: 1,
  characters: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Thesus',
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
      expect(screen.getByText('Thesus')).toBeInTheDocument();
    });
  });

  it('renders existing roster characters (no re-seed needed)', async () => {
    render(<MemoryRouter><RosterView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Thesus')).toBeInTheDocument();
    });
  });
});

describe('RosterView gallery badge', () => {
  it('renders a "from gallery" badge on seed-imported characters', async () => {
    render(<MemoryRouter><RosterView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Thesus')).toBeInTheDocument();
      expect(screen.getByText(/from gallery/i)).toBeInTheDocument();
    });
  });
});

describe('RosterView character download', () => {
  it('renders a Download button on each character card', async () => {
    render(<MemoryRouter><RosterView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Thesus')).toBeInTheDocument();
    });
    const downloadBtns = screen.getAllByRole('button', { name: /download/i });
    expect(downloadBtns.length).toBeGreaterThan(0);
  });
});

describe('RosterView character upload', () => {
  it('renders an Upload Character control', async () => {
    render(<MemoryRouter><RosterView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByLabelText(/upload character/i)).toBeInTheDocument();
    });
  });

  it('adds the uploaded character to the roster under a new uuid', async () => {
    render(<MemoryRouter><RosterView /></MemoryRouter>);
    await waitFor(() => screen.getByText('Thesus'));

    const upload = screen.getByLabelText(/upload character/i) as HTMLInputElement;
    const payload = JSON.stringify({
      schemaVersion: 1,
      character: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Visitor',
        race: 0, class: 0, level: 3, savedOldLevel: 0, xp: 9999, gold: 50,
        conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        dead: false, paralyzed: false,
        attributes: { str: 9, int: 14, pie: 9, vit: 9, dex: 9, spd: 9, personality: 50, karma: 50 },
        schoolMana: [0, 0, 0, 0, 0, 0],
        skills: new Array(14).fill(0),
        reaction: 50,
      },
    });
    const file = new File([payload], 'visitor.wiz6char.json', { type: 'application/json' });
    fireEvent.change(upload, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Visitor')).toBeInTheDocument();
    });
  });
});
