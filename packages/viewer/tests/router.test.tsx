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

  it('mounts MonstersPage at /monsters/compare', async () => {
    renderAt('/monsters/compare');
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /monster list/i })).toBeInTheDocument();
      expect(screen.getByTestId('compare-placeholder')).toBeInTheDocument();
    });
  });
});
