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
