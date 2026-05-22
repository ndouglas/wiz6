import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TopNav } from '../../src/components/TopNav.js';

function renderWithRouter(path = '/explore') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TopNav />
    </MemoryRouter>,
  );
}

describe('TopNav', () => {
  it('renders the site title linking to /explore', () => {
    renderWithRouter('/explore/items');
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
    ['Files', '/explore/files'],
  ])('renders a nav link to %s → %s', (label, href) => {
    renderWithRouter();
    const link = screen.getByRole('link', { name: label });
    expect(link).toHaveAttribute('href', href);
  });

  it('marks the current route as active via aria-current', () => {
    renderWithRouter('/explore/monsters');
    const link = screen.getByRole('link', { name: 'Monsters' });
    expect(link).toHaveAttribute('aria-current', 'page');
  });
});
