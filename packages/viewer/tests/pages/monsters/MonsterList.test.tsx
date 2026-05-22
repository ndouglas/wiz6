import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { MonsterList } from '../../../src/pages/monsters/MonsterList.js';
import { FIXTURE_SCENARIO_DB } from '../../fixtures/scenario-fixture.js';

const FILLED = FIXTURE_SCENARIO_DB.monsters.filter((m) => !m.empty);

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="location">{loc.pathname}{loc.search}</p>;
}

function renderList(monsters = FILLED, selectedSlug?: string) {
  return render(
    <MemoryRouter initialEntries={[selectedSlug ? `/monsters/${selectedSlug}` : '/monsters']}>
      <Routes>
        <Route
          path="/monsters"
          element={
            <>
              <MonsterList monsters={monsters} totalFilled={FILLED.length} />
              <LocationProbe />
            </>
          }
        />
        <Route
          path="/monsters/:slug"
          element={
            <>
              <MonsterList monsters={monsters} totalFilled={FILLED.length} />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MonsterList', () => {
  it('renders one button per monster', () => {
    renderList();
    expect(screen.getAllByRole('button').length).toBe(FILLED.length);
  });

  it('renders monster names', () => {
    renderList();
    expect(screen.getByText('GIANT RAT')).toBeInTheDocument();
    expect(screen.getByText('PIT FIEND')).toBeInTheDocument();
  });

  it('renders the level range when min !== max', () => {
    renderList();
    // GIANT RAT has level 8-15 in the fixture
    expect(screen.getByText(/8-15/)).toBeInTheDocument();
  });

  it('renders the AC for each filled monster', () => {
    renderList();
    expect(screen.getByText(/AC -6/i)).toBeInTheDocument(); // FAERIE QUEEN
    expect(screen.getByText(/AC 10/i)).toBeInTheDocument(); // ZOMBIE
  });

  it('shows footer count', () => {
    renderList();
    expect(screen.getByText(/showing 5 \/ 5/i)).toBeInTheDocument();
  });

  it('shows filtered count when subset is shown', () => {
    renderList(FILLED.slice(0, 2));
    expect(screen.getByText(/showing 2 \/ 5/i)).toBeInTheDocument();
  });

  it('clicking a row navigates to /monsters/:slug', () => {
    renderList();
    fireEvent.click(screen.getByText('GIANT RAT'));
    expect(screen.getByTestId('location')).toHaveTextContent('/monsters/giant-rat');
  });

  it('marks the selected row via aria-current', () => {
    renderList(FILLED, 'wraith');
    const wraithRow = screen.getByText('WRAITH').closest('button')!;
    expect(wraithRow).toHaveAttribute('aria-current', 'true');
    const ratRow = screen.getByText('GIANT RAT').closest('button')!;
    expect(ratRow).not.toHaveAttribute('aria-current', 'true');
  });

  it('shift-clicking a row toggles it in the compare set (?ids=)', () => {
    renderList();
    const ratRow = screen.getByText('GIANT RAT').closest('button')!;
    fireEvent.click(ratRow, { shiftKey: true });
    expect(screen.getByTestId('location')).toHaveTextContent('giant-rat');
  });

  it('caps compare set at 4 monsters', () => {
    renderList();
    const rows = screen.getAllByRole('button');
    fireEvent.click(rows[0]!, { shiftKey: true });
    fireEvent.click(rows[1]!, { shiftKey: true });
    fireEvent.click(rows[2]!, { shiftKey: true });
    fireEvent.click(rows[3]!, { shiftKey: true });
    fireEvent.click(rows[4]!, { shiftKey: true });
    const marked = screen.getAllByRole('button').filter((r) => r.className.match(/rowCompare/i));
    expect(marked.length).toBe(4);
  });
});
