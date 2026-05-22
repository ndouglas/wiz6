import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { CompareView } from '../../../src/pages/monsters/CompareView.js';
import { FIXTURE_SCENARIO_DB } from '../../fixtures/scenario-fixture.js';

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="location">{loc.pathname}{loc.search}</p>;
}

function renderCompare(initial = '/monsters/compare?ids=giant-rat,zombie,pit-fiend') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <CompareView allMonsters={FIXTURE_SCENARIO_DB.monsters} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('CompareView', () => {
  it('shows an empty state when no ids are selected', () => {
    render(
      <MemoryRouter initialEntries={['/monsters/compare']}>
        <CompareView allMonsters={FIXTURE_SCENARIO_DB.monsters} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/no monsters selected/i)).toBeInTheDocument();
  });

  it('renders one column per id (up to 4)', () => {
    renderCompare();
    expect(screen.getByRole('columnheader', { name: /giant rat/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /zombie/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /pit fiend/i })).toBeInTheDocument();
  });

  it('renders each comparable field as a row', () => {
    renderCompare();
    expect(screen.getByText(/level/i)).toBeInTheDocument();
    expect(screen.getByText(/^ac$/i)).toBeInTheDocument();
    expect(screen.getByText(/xp/i)).toBeInTheDocument();
  });

  it('highlights cells where values differ across columns', () => {
    renderCompare();
    const levelRow = screen.getByText(/^level$/i).closest('tr')!;
    const cells = levelRow.querySelectorAll('td');
    const diffs = Array.from(cells).filter((c) => c.className.match(/diff/i));
    expect(diffs.length).toBeGreaterThanOrEqual(2);
  });

  it('does not highlight cells when all values are equal', () => {
    render(
      <MemoryRouter initialEntries={['/monsters/compare?ids=giant-rat,giant-rat']}>
        <CompareView allMonsters={FIXTURE_SCENARIO_DB.monsters} />
      </MemoryRouter>,
    );
    const levelRow = screen.getByText(/^level$/i).closest('tr')!;
    const cells = levelRow.querySelectorAll('td');
    const diffs = Array.from(cells).filter((c) => c.className.match(/diff/i));
    expect(diffs.length).toBe(0);
  });

  it('clicking the column remove button drops that id from the URL', () => {
    renderCompare();
    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    expect(removeButtons.length).toBe(3);
    fireEvent.click(removeButtons[1]!); // remove ZOMBIE
    expect(screen.getByTestId('location')).toHaveTextContent('giant-rat');
    expect(screen.getByTestId('location')).not.toHaveTextContent('zombie');
  });

  it('shows "not found" for unknown slugs but keeps other columns', () => {
    render(
      <MemoryRouter initialEntries={['/monsters/compare?ids=giant-rat,nope']}>
        <CompareView allMonsters={FIXTURE_SCENARIO_DB.monsters} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('columnheader', { name: /giant rat/i })).toBeInTheDocument();
    expect(screen.getByText(/nope/i)).toBeInTheDocument();
  });
});
