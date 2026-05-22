import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { FamilyTab } from '../../../../src/pages/monsters/tabs/FamilyTab.js';
import { FIXTURE_SCENARIO_DB } from '../../../fixtures/scenario-fixture.js';

const FIXTURE = FIXTURE_SCENARIO_DB;
const WRAITH = FIXTURE.monsters[3]!; // familyId [10,12,12,12]

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="location">{loc.pathname}</p>;
}

function renderFamily(monster = WRAITH) {
  return render(
    <MemoryRouter initialEntries={['/monsters/wraith']}>
      <FamilyTab monster={monster} allMonsters={FIXTURE.monsters} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('FamilyTab', () => {
  it('shows the current monster as the family anchor', () => {
    renderFamily(WRAITH);
    expect(screen.getByRole('heading', { name: /wraith/i })).toBeInTheDocument();
  });

  it('shows the family ID', () => {
    renderFamily(WRAITH);
    expect(screen.getByText(/10,12,12,12/)).toBeInTheDocument();
  });

  it('lists no other family members when the family is unique', () => {
    renderFamily(WRAITH);
    expect(screen.getByText(/no other monsters in this family/i)).toBeInTheDocument();
  });

  it('lists family sharers when present', () => {
    const monsters = [...FIXTURE.monsters];
    monsters[5] = {
      ...monsters[5]!,
      nameIdSingular: 'PHANTASM',
      empty: false,
      familyId: [10, 12, 12, 12],
    };
    render(
      <MemoryRouter initialEntries={['/monsters/wraith']}>
        <FamilyTab monster={WRAITH} allMonsters={monsters} />
      </MemoryRouter>,
    );
    expect(screen.getByText('PHANTASM')).toBeInTheDocument();
  });

  it('clicking a family-sharer navigates to their slug', () => {
    const monsters = [...FIXTURE.monsters];
    monsters[5] = {
      ...monsters[5]!,
      nameIdSingular: 'PHANTASM',
      empty: false,
      familyId: [10, 12, 12, 12],
    };
    render(
      <MemoryRouter initialEntries={['/monsters/wraith']}>
        <FamilyTab monster={WRAITH} allMonsters={monsters} />
        <LocationProbe />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('PHANTASM'));
    expect(screen.getByTestId('location')).toHaveTextContent('/monsters/phantasm');
  });

  it('excludes the current monster from the family list', () => {
    const monsters = [...FIXTURE.monsters];
    monsters[5] = {
      ...monsters[5]!,
      nameIdSingular: 'PHANTASM',
      empty: false,
      familyId: [10, 12, 12, 12],
    };
    render(
      <MemoryRouter initialEntries={['/monsters/wraith']}>
        <FamilyTab monster={WRAITH} allMonsters={monsters} />
      </MemoryRouter>,
    );
    const familyList = screen.getByRole('list', { name: /family members/i });
    expect(familyList.textContent).not.toMatch(/WRAITH/);
    expect(familyList.textContent).toMatch(/PHANTASM/);
  });
});
