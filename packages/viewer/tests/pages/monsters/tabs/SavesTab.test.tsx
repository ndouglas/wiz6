import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SavesTab } from '../../../../src/pages/monsters/tabs/SavesTab.js';
import { FIXTURE_SCENARIO_DB } from '../../../fixtures/scenario-fixture.js';

const WRAITH = FIXTURE_SCENARIO_DB.monsters[3]!;
const ZOMBIE = FIXTURE_SCENARIO_DB.monsters[1]!;

describe('SavesTab', () => {
  it('renders four heatmap rows labelled correctly', () => {
    render(<SavesTab monster={WRAITH} />);
    expect(screen.getByText('saveTable')).toBeInTheDocument();
    expect(screen.getByText('effectChanceTable')).toBeInTheDocument();
    expect(screen.getByText('extendedSaves')).toBeInTheDocument();
    expect(screen.getByText('attributeSaves')).toBeInTheDocument();
  });

  it('renders 5 + 5 + 12 + 4 = 26 cells', () => {
    render(<SavesTab monster={WRAITH} />);
    expect(screen.getAllByRole('cell').length).toBe(26);
  });

  it('renders the SPIRIT-family extended-saves pattern (seven 125s)', () => {
    render(<SavesTab monster={WRAITH} />);
    const immunity = screen.getAllByText('125');
    expect(immunity.length).toBe(7);
  });

  it('renders the zombie save template', () => {
    render(<SavesTab monster={ZOMBIE} />);
    // ZOMBIE has saveTable = [15, 40, 30, 10, 5]
    expect(screen.getAllByText('15').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('40').length).toBeGreaterThanOrEqual(1);
  });
});
