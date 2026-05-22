import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TopNav } from '../../src/components/TopNav.js';

function renderWithRouter(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TopNav />
    </MemoryRouter>,
  );
}

describe('TopNav', () => {
  it('renders the site title linking to /', () => {
    renderWithRouter('/items');
    const title = screen.getByRole('link', { name: /wiz6 data explorer/i });
    expect(title).toHaveAttribute('href', '/');
  });

  it.each([
    ['Monsters', '/monsters'],
    ['Items', '/items'],
    ['Quest', '/quest'],
    ['Screens', '/screens'],
    ['Portraits', '/portraits'],
    ['Fonts', '/fonts'],
    ['Messages', '/msg'],
    ['Newgame', '/newgame'],
    ['Pics', '/pics'],
    ['Files', '/files'],
  ])('renders a nav link to %s → %s', (label, href) => {
    renderWithRouter();
    const link = screen.getByRole('link', { name: label });
    expect(link).toHaveAttribute('href', href);
  });

  it('marks the current route as active via aria-current', () => {
    renderWithRouter('/monsters');
    const link = screen.getByRole('link', { name: 'Monsters' });
    expect(link).toHaveAttribute('aria-current', 'page');
  });
});
