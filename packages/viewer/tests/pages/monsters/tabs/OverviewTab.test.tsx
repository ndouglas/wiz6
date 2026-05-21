import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OverviewTab } from '../../../../src/pages/monsters/tabs/OverviewTab.js';
import { FIXTURE_SCENARIO_DB } from '../../../fixtures/scenario-fixture.js';

const PIT_FIEND = FIXTURE_SCENARIO_DB.monsters[2]!;
const GIANT_RAT = FIXTURE_SCENARIO_DB.monsters[0]!;

describe('OverviewTab', () => {
  it('renders class with its label', () => {
    render(<OverviewTab monster={PIT_FIEND} />);
    expect(screen.getByText(/3.*demon\/elite/i)).toBeInTheDocument();
  });

  it('renders level range when min !== max', () => {
    render(<OverviewTab monster={GIANT_RAT} />);
    expect(screen.getByText(/8-15/)).toBeInTheDocument();
  });

  it('renders single level when min === max', () => {
    render(<OverviewTab monster={PIT_FIEND} />);
    const levelCell = screen.getByLabelText(/^level$/i);
    expect(levelCell).toHaveTextContent('12');
  });

  it('renders AC with the wiz6 convention note', () => {
    render(<OverviewTab monster={GIANT_RAT} />);
    expect(screen.getByText(/AC/i)).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();
    expect(screen.getByText(/lower = better/i)).toBeInTheDocument();
  });

  it('renders HP dice', () => {
    render(<OverviewTab monster={PIT_FIEND} />);
    expect(screen.getByText('14d4')).toBeInTheDocument();
  });

  it('renders XP-on-kill', () => {
    render(<OverviewTab monster={PIT_FIEND} />);
    expect(screen.getByText(/56,?786/)).toBeInTheDocument();
  });

  it('renders gold drop with the tens-of-gold gloss', () => {
    render(<OverviewTab monster={PIT_FIEND} />);
    expect(screen.getByText(/140/)).toBeInTheDocument();
    expect(screen.getByText(/≈ 1,?400 gp/i)).toBeInTheDocument();
  });

  it('renders element badge with element label', () => {
    render(<OverviewTab monster={PIT_FIEND} />);
    expect(screen.getByText(/fire/i)).toBeInTheDocument();
  });

  it('renders family pip pattern', () => {
    render(<OverviewTab monster={GIANT_RAT} />);
    expect(screen.getByText(/6,4,14,16/)).toBeInTheDocument();
  });
});
