import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { MonsterListFamilies } from '../../../src/pages/monsters/MonsterListFamilies.js';
import { FIXTURE_SCENARIO_DB } from '../../fixtures/scenario-fixture.js';

const FILLED = FIXTURE_SCENARIO_DB.monsters.filter((m) => !m.empty);

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="location">{loc.pathname}</p>;
}

function renderFamilies(monsters = FILLED) {
  return render(
    <MemoryRouter initialEntries={['/explore/monsters']}>
      <Routes>
        <Route
          path="/explore/monsters"
          element={
            <>
              <MonsterListFamilies monsters={monsters} totalFilled={FILLED.length} />
              <LocationProbe />
            </>
          }
        />
        <Route
          path="/explore/monsters/:slug"
          element={
            <>
              <MonsterListFamilies monsters={monsters} totalFilled={FILLED.length} />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MonsterListFamilies', () => {
  it('groups monsters by familyId', () => {
    renderFamilies();
    // GIANT RAT family = [6,4,14,16]
    expect(screen.getByText(/6,4,14,16/)).toBeInTheDocument();
  });

  it('shows monster names within their family group', () => {
    renderFamilies();
    expect(screen.getByText('GIANT RAT')).toBeInTheDocument();
    expect(screen.getByText('PIT FIEND')).toBeInTheDocument();
  });

  it('clicking a monster name navigates to its slug', () => {
    renderFamilies();
    fireEvent.click(screen.getByText('GIANT RAT'));
    expect(screen.getByTestId('location')).toHaveTextContent('/explore/monsters/giant-rat');
  });

  it('shows the family member count', () => {
    renderFamilies();
    expect(screen.getAllByText(/\(\d+ members?\)/i).length).toBeGreaterThan(0);
  });
});
