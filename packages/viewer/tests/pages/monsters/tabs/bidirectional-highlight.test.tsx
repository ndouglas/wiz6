import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  MonsterDetailProvider,
  useMonsterDetail,
} from '../../../../src/pages/monsters/MonsterDetailContext.js';
import { OverviewTab } from '../../../../src/pages/monsters/tabs/OverviewTab.js';
import { SavesTab } from '../../../../src/pages/monsters/tabs/SavesTab.js';
import { FIXTURE_SCENARIO_DB } from '../../../fixtures/scenario-fixture.js';

const PIT_FIEND = FIXTURE_SCENARIO_DB.monsters[2]!;

function HighlightProbe() {
  const { highlightedField } = useMonsterDetail();
  return <p data-testid="highlight">{highlightedField ?? 'null'}</p>;
}

describe('bidirectional highlighting from data tabs', () => {
  it('hovering the AC row on Overview sets highlightedField to monsterAC', () => {
    render(
      <MonsterDetailProvider>
        <OverviewTab monster={PIT_FIEND} />
        <HighlightProbe />
      </MonsterDetailProvider>,
    );
    const acLabel = screen.getByLabelText(/^ac$/i);
    fireEvent.mouseEnter(acLabel);
    expect(screen.getByTestId('highlight')).toHaveTextContent('monsterAC');
    fireEvent.mouseLeave(acLabel);
    expect(screen.getByTestId('highlight')).toHaveTextContent('null');
  });

  it('hovering the saveTable row on Saves sets highlightedField to saveTable', () => {
    render(
      <MonsterDetailProvider>
        <SavesTab monster={PIT_FIEND} />
        <HighlightProbe />
      </MonsterDetailProvider>,
    );
    const saveLabel = screen.getByText('saveTable');
    fireEvent.mouseEnter(saveLabel);
    expect(screen.getByTestId('highlight')).toHaveTextContent('saveTable');
  });
});
