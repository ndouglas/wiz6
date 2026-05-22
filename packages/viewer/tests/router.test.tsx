import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes } from 'react-router-dom';
import { Suspense } from 'react';
import { routes } from '../src/router.js';
import { FIXTURE_SCENARIO_DB } from './fixtures/scenario-fixture.js';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(FIXTURE_SCENARIO_DB), { status: 200 })),
  );
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
  describe('game shell', () => {
    it('mounts the game title screen at /', async () => {
      renderAt('/');
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: /wizardry/i })).toBeInTheDocument();
      });
    });

    it('mounts the castle screen at /castle', async () => {
      renderAt('/castle');
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: /castle/i })).toBeInTheDocument();
      });
    });

    it('mounts the roster screen at /roster', async () => {
      renderAt('/roster');
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: /roster/i })).toBeInTheDocument();
      });
    });
  });

  describe('explore (data viewer)', () => {
    it.each<[string, RegExp]>([
      ['/explore', /wiz6 data explorer/i],
      ['/explore/items', /items/i],
      ['/explore/quest', /quest records/i],
      ['/explore/screens', /screens/i],
      ['/explore/portraits', /portraits/i],
      ['/explore/fonts', /fonts/i],
      ['/explore/msg', /messages/i],
      ['/explore/newgame', /newgame/i],
      ['/explore/files', /files/i],
    ])('mounts a page at %s with an h1 matching %s', async (path, pattern) => {
      renderAt(path);
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: pattern })).toBeInTheDocument();
      });
    });

    it('mounts MonstersPage at /explore/monsters with list + detail regions', async () => {
      renderAt('/explore/monsters');
      await waitFor(() => {
        expect(screen.getByRole('region', { name: /monster list/i })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: /monster detail/i })).toBeInTheDocument();
      });
    });

    it('mounts MonstersPage at /explore/monsters/compare', async () => {
      renderAt('/explore/monsters/compare');
      await waitFor(() => {
        expect(screen.getByRole('region', { name: /monster list/i })).toBeInTheDocument();
        expect(screen.getByText(/no monsters selected/i)).toBeInTheDocument();
      });
    });
  });
});
