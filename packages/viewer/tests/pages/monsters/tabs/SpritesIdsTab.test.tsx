import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SpritesIdsTab } from '../../../../src/pages/monsters/tabs/SpritesIdsTab.js';
import { FIXTURE_SCENARIO_DB } from '../../../fixtures/scenario-fixture.js';

const PIT_FIEND = FIXTURE_SCENARIO_DB.monsters[2]!;

function renderTab(monster = PIT_FIEND) {
  return render(
    <MemoryRouter>
      <SpritesIdsTab monster={monster} allMonsters={FIXTURE_SCENARIO_DB.monsters} />
    </MemoryRouter>,
  );
}

describe('SpritesIdsTab', () => {
  it('renders each sprite / ID field', () => {
    renderTab(PIT_FIEND);
    for (const label of [
      /^combat sprite$/i,
      /secondary sprite/i,
      /magic resist/i,
      /spell power/i,
      /aux save .* 103/i,
      /aux save .* 106/i,
      /fly evade/i,
      /combat trait/i,
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows the field's decoded value", () => {
    renderTab(PIT_FIEND);
    // PIT FIEND magicResistChance = 80
    expect(screen.getByText(/^80(%| )?/)).toBeInTheDocument();
  });

  it('renders a sprite placeholder slot', () => {
    renderTab(PIT_FIEND);
    expect(screen.getByTestId('sprite-placeholder')).toBeInTheDocument();
  });

  it('shows zero "shared with" when the value is unique', () => {
    renderTab(PIT_FIEND);
    expect(screen.getByText(/magic resist/i)).toBeInTheDocument();
  });

  it('shows shared-with names when other monsters have the same value', () => {
    const monsters = [...FIXTURE_SCENARIO_DB.monsters];
    monsters[6] = {
      ...monsters[6]!,
      nameIdSingular: 'GREATER DEMON',
      empty: false,
      magicResistChance: 80,
    };
    render(
      <MemoryRouter>
        <SpritesIdsTab monster={PIT_FIEND} allMonsters={monsters} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/GREATER DEMON/)).toBeInTheDocument();
  });
});
