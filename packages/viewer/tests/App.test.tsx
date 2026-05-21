import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../src/App.js';
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

  it('renders the MonstersPage at /monsters', async () => {
    renderAt('/monsters');
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /monster list/i })).toBeInTheDocument();
    });
  });
});
