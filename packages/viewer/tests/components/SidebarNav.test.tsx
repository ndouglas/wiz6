import { describe, expect, it, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SidebarNav } from '../../src/components/SidebarNav.js';

const STORAGE_KEY = 'wiz6:explore-sidebar-open';

beforeEach(() => {
  window.localStorage.clear();
});

function renderAt(path = '/explore') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarNav />
    </MemoryRouter>,
  );
}

describe('SidebarNav', () => {
  it('renders the site title linking to /explore', () => {
    renderAt('/explore/items');
    const title = screen.getByRole('link', { name: /wiz6 data explorer/i });
    expect(title).toHaveAttribute('href', '/explore');
  });

  it.each([
    ['Monsters', '/explore/monsters'],
    ['Items', '/explore/items'],
    ['Quest', '/explore/quest'],
    ['Screens', '/explore/screens'],
    ['Portraits', '/explore/portraits'],
    ['Fonts', '/explore/fonts'],
    ['Messages', '/explore/msg'],
    ['Newgame', '/explore/newgame'],
    ['Pics', '/explore/pics'],
    ['Sounds', '/explore/sounds'],
    ['Notes', '/explore/notes'],
    ['Calibrate', '/explore/calibrate'],
    ['Docs', '/explore/docs'],
    ['Files', '/explore/files'],
  ])('renders a nav link to %s → %s', (label, href) => {
    renderAt();
    const link = screen.getByRole('link', { name: label });
    expect(link).toHaveAttribute('href', href);
  });

  it('marks the current route as active via aria-current', () => {
    renderAt('/explore/monsters');
    const link = screen.getByRole('link', { name: 'Monsters' });
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('renders the back-link to the game (/)', () => {
    renderAt();
    const back = screen.getByRole('link', { name: /wizardry vi/i });
    expect(back).toHaveAttribute('href', '/');
  });

  it('starts open by default and toggles closed on click', () => {
    renderAt();
    const toggle = screen.getByRole('button', { name: /collapse sidebar/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /expand sidebar/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('persists open/closed state to localStorage', () => {
    renderAt();
    const toggle = screen.getByRole('button', { name: /collapse sidebar/i });
    fireEvent.click(toggle); // close
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: /expand sidebar/i })); // open
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1');
  });

  it('reads initial open/closed state from localStorage', () => {
    window.localStorage.setItem(STORAGE_KEY, '0');
    renderAt();
    expect(screen.getByRole('button', { name: /expand sidebar/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
