import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { MonsterFilters } from '../../../src/pages/monsters/MonsterFilters.js';
import { uniqueFilterValues } from '@wiz6/parser';
import { FIXTURE_SCENARIO_DB } from '../../fixtures/scenario-fixture.js';

const VALUES = uniqueFilterValues(FIXTURE_SCENARIO_DB.monsters);

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="location">{loc.pathname}{loc.search || '(empty)'}</p>;
}

function renderFilters(initial = '/monsters') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <MonsterFilters values={VALUES} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('MonsterFilters', () => {
  it('renders a search box', () => {
    renderFilters();
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it('typing into search updates the URL', () => {
    renderFilters();
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'rat' } });
    expect(screen.getByTestId('location')).toHaveTextContent('search=rat');
  });

  it('renders a sort dropdown defaulting to name', () => {
    renderFilters();
    const sort = screen.getByLabelText(/sort/i) as HTMLSelectElement;
    expect(sort.value).toBe('name');
  });

  it('changing sort updates the URL', () => {
    renderFilters();
    fireEvent.change(screen.getByLabelText(/sort/i), { target: { value: 'level' } });
    expect(screen.getByTestId('location')).toHaveTextContent('sort=level');
  });

  it('toggling direction adds dir=desc to the URL', () => {
    renderFilters();
    fireEvent.click(screen.getByRole('button', { name: /asc|desc/i }));
    expect(screen.getByTestId('location')).toHaveTextContent('dir=desc');
  });

  it('renders an "include empty" toggle', () => {
    renderFilters();
    expect(screen.getByLabelText(/include empty/i)).toBeInTheDocument();
  });

  it('toggling include-empty updates the URL', () => {
    renderFilters();
    fireEvent.click(screen.getByLabelText(/include empty/i));
    expect(screen.getByTestId('location')).toHaveTextContent('empty=1');
  });

  it('renders a class filter with checkboxes for each known class', () => {
    renderFilters();
    fireEvent.click(screen.getByText(/class/i));
    for (const c of VALUES.classes) {
      expect(screen.getByLabelText(`class ${c}`)).toBeInTheDocument();
    }
  });

  it('checking a class adds it to the URL filter', () => {
    renderFilters();
    fireEvent.click(screen.getByText(/class/i));
    fireEvent.click(screen.getByLabelText('class 2'));
    expect(screen.getByTestId('location')).toHaveTextContent('class=2');
  });

  it('shows Compare button when 2+ ids in URL', () => {
    renderFilters('/monsters?ids=giant-rat,zombie');
    expect(screen.getByRole('button', { name: /compare \(2\)/i })).toBeInTheDocument();
  });

  it('hides Compare button when fewer than 2 ids in URL', () => {
    renderFilters('/monsters?ids=giant-rat');
    expect(screen.queryByRole('button', { name: /^compare/i })).not.toBeInTheDocument();
  });

  it('clicking Compare navigates to /monsters/compare with same ids', () => {
    renderFilters('/monsters?ids=giant-rat,zombie');
    fireEvent.click(screen.getByRole('button', { name: /compare \(2\)/i }));
    // URL encodes the comma as %2C in some setups; check for either form
    const loc = screen.getByTestId('location');
    expect(loc.textContent).toMatch(/\/monsters\/compare\?ids=giant-rat(,|%2C)zombie/);
  });
});
