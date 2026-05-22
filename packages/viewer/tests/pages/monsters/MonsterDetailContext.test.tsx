import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  MonsterDetailProvider,
  useMonsterDetail,
} from '../../../src/pages/monsters/MonsterDetailContext.js';

function Probe() {
  const { highlightedField, setHighlightedField } = useMonsterDetail();
  return (
    <>
      <p data-testid="value">{highlightedField ?? 'null'}</p>
      <button onClick={() => setHighlightedField('saveTable')}>set</button>
      <button onClick={() => setHighlightedField(null)}>clear</button>
    </>
  );
}

describe('MonsterDetailContext', () => {
  it('starts with no highlighted field', () => {
    render(
      <MonsterDetailProvider>
        <Probe />
      </MonsterDetailProvider>,
    );
    expect(screen.getByTestId('value')).toHaveTextContent('null');
  });

  it('updates when setHighlightedField is called', () => {
    render(
      <MonsterDetailProvider>
        <Probe />
      </MonsterDetailProvider>,
    );
    fireEvent.click(screen.getByText('set'));
    expect(screen.getByTestId('value')).toHaveTextContent('saveTable');
    fireEvent.click(screen.getByText('clear'));
    expect(screen.getByTestId('value')).toHaveTextContent('null');
  });

  it('throws when used outside the provider', () => {
    expect(() => render(<Probe />)).toThrow(/MonsterDetailProvider/);
  });
});
