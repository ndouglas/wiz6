import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AttacksTab } from '../../../../src/pages/monsters/tabs/AttacksTab.js';
import { FIXTURE_SCENARIO_DB } from '../../../fixtures/scenario-fixture.js';

const RAT = FIXTURE_SCENARIO_DB.monsters[0]!;
const FAERIE = FIXTURE_SCENARIO_DB.monsters[4]!;

describe('AttacksTab', () => {
  it('renders three columns labelled Atk1/Atk2/Atk3', () => {
    render(<AttacksTab monster={RAT} />);
    expect(screen.getByText('Atk 1')).toBeInTheDocument();
    expect(screen.getByText('Atk 2')).toBeInTheDocument();
    expect(screen.getByText('Atk 3')).toBeInTheDocument();
  });

  it('renders dice for active attacks', () => {
    render(<AttacksTab monster={RAT} />);
    expect(screen.getByText('1d4')).toBeInTheDocument(); // RAT atk1
  });

  it('renders em-dash for unused attacks', () => {
    render(<AttacksTab monster={RAT} />);
    // RAT has no atk2/atk3
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('renders poison chance and strength when set', () => {
    render(<AttacksTab monster={RAT} />);
    expect(screen.getByText(/poison.*25%/i)).toBeInTheDocument();
    expect(screen.getByText(/strength.*3/i)).toBeInTheDocument();
  });

  it('dims unused attack columns', () => {
    render(<AttacksTab monster={RAT} />);
    const atk2Col = screen.getByText('Atk 2').closest('[role="group"]')!;
    expect(atk2Col.className).toMatch(/unused/i);
  });

  it('renders ultra-high special-effect chances', () => {
    render(<AttacksTab monster={FAERIE} />);
    // FAERIE QUEEN atk1 special is 100%
    expect(screen.getByText(/100%/)).toBeInTheDocument();
  });
});
