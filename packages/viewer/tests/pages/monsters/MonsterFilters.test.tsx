import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { MonsterFilters } from '../../../src/pages/monsters/MonsterFilters.js';
import { uniqueFilterValues } from '@wiz6/parser';
import { FIXTURE_SCENARIO_DB } from '../../fixtures/scenario-fixture.js';

const VALUES = uniqueFilterValues(FIXTURE_SCENARIO_DB.monsters);

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="location">{loc.search || '(empty)'}</p>;
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
});
