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
        <Route path="/monsters/compare" element={<MonstersPage />} />
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

  it('renders compare placeholder when path is /monsters/compare', async () => {
    renderAt('/monsters/compare');
    await waitFor(() => {
      expect(screen.getByTestId('compare-placeholder')).toBeInTheDocument();
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
