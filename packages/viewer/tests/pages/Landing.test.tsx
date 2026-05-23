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
      'Pics',
      'Files',
      'Sounds',
    ]) {
      expect(screen.getByRole('link', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
  });

  it('renders the titlepag canvas hero slot', () => {
    renderLanding();
    expect(screen.getByTestId('landing-hero')).toBeInTheDocument();
  });

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
});
