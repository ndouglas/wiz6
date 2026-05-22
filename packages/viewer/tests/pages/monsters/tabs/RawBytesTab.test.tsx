import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RawBytesTab } from '../../../../src/pages/monsters/tabs/RawBytesTab.js';
import { MonsterDetailProvider } from '../../../../src/pages/monsters/MonsterDetailContext.js';
import { FIXTURE_SCENARIO_DB } from '../../../fixtures/scenario-fixture.js';

const RAT = FIXTURE_SCENARIO_DB.monsters[0]!;

function renderTab(monster = RAT) {
  return render(
    <MonsterDetailProvider>
      <RawBytesTab monster={monster} />
    </MonsterDetailProvider>,
  );
}

describe('RawBytesTab', () => {
  it('renders 158 cells (one per stat byte)', () => {
    renderTab();
    expect(screen.getAllByRole('cell').length).toBe(158);
  });

  it('shows the legend', () => {
    renderTab();
    expect(screen.getByText(/legend/i)).toBeInTheDocument();
  });

  it("renders the monster's stat bytes", () => {
    renderTab();
    const cells = screen.getAllByRole('cell');
    // GIANT RAT in the fixture uses an all-zero statBytes array
    expect(cells[0]).toHaveTextContent('00');
    expect(cells[157]).toHaveTextContent('00');
  });

  it('cells inside saveTable have the save group class', () => {
    renderTab();
    const cells = screen.getAllByRole('cell');
    expect(cells[113]?.className).toMatch(/groupSave/i);
    expect(cells[117]?.className).toMatch(/groupSave/i);
  });

  it('byte 80 is unmapped (no group class)', () => {
    renderTab();
    const cells = screen.getAllByRole('cell');
    expect(cells[80]?.className).not.toMatch(/group(Core|Attack|Save|Sprite|Family|Meta)/);
  });
});
