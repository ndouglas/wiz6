import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { MonsterDetail } from '../../../src/pages/monsters/MonsterDetail.js';
import { FIXTURE_SCENARIO_DB } from '../../fixtures/scenario-fixture.js';

const WRAITH = FIXTURE_SCENARIO_DB.monsters[3]!;

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="location">{loc.search || '(empty)'}</p>;
}

function renderDetail(initial = '/monsters/wraith') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <MonsterDetail monster={WRAITH} allMonsters={FIXTURE_SCENARIO_DB.monsters} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('MonsterDetail', () => {
  it('shows monster name as h2', () => {
    renderDetail();
    expect(screen.getByRole('heading', { level: 2, name: /wraith/i })).toBeInTheDocument();
  });

  it('shows all four name slots in the header', () => {
    renderDetail();
    expect(screen.getByText('WRAITHS')).toBeInTheDocument();
    expect(screen.getByText('SPIRIT')).toBeInTheDocument();
    expect(screen.getByText('SPIRITS')).toBeInTheDocument();
  });

  it.each([
    ['Overview', 'overview'],
    ['Attacks', 'attacks'],
    ['Saves & Resistances', 'saves'],
  ])('renders the %s tab button', (label) => {
    renderDetail();
    expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
  });

  it('defaults to Overview when ?tab is not set', () => {
    renderDetail('/monsters/wraith');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it('reads active tab from ?tab=', () => {
    renderDetail('/monsters/wraith?tab=saves');
    expect(screen.getByRole('tab', { name: 'Saves & Resistances' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('clicking a tab updates the URL', () => {
    renderDetail();
    fireEvent.click(screen.getByRole('tab', { name: 'Attacks' }));
    expect(screen.getByTestId('location')).toHaveTextContent('tab=attacks');
  });

  it('renders a placeholder body for each tab', () => {
    renderDetail('/monsters/wraith?tab=attacks');
    expect(screen.getByTestId('tab-attacks')).toBeInTheDocument();
  });

  it('Copy raw bytes hex button puts hex on the clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderDetail();
    const btn = screen.getByRole('button', { name: /copy raw bytes hex/i });
    fireEvent.click(btn);
    // WRAITH's statBytes in the fixture is all zeros → 158 bytes of "00"
    expect(writeText).toHaveBeenCalledWith(Array(158).fill('00').join(' '));
  });

  it('Copy as JSON button puts the monster JSON on the clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderDetail();
    const btn = screen.getByRole('button', { name: /copy as json/i });
    fireEvent.click(btn);
    const arg = writeText.mock.calls[0]![0]!;
    expect(arg).toMatch(/"nameIdSingular": "WRAITH"/);
  });
});
