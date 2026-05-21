import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useUrlState } from '../../../src/lib/hooks/useUrlState.js';

function Probe({ keyName }: { keyName: string }) {
  const [value, setValue] = useUrlState(keyName);
  const location = useLocation();
  return (
    <>
      <p data-testid="value">{value ?? 'null'}</p>
      <p data-testid="search">{location.search}</p>
      <button onClick={() => setValue('hello')}>set</button>
      <button onClick={() => setValue(null)}>clear</button>
    </>
  );
}

function ListProbe({ keyName }: { keyName: string }) {
  const [values, setValues] = useUrlState.list(keyName);
  return (
    <>
      <p data-testid="values">{values.join('|')}</p>
      <button onClick={() => setValues(['a', 'b'])}>set-ab</button>
      <button onClick={() => setValues([])}>clear</button>
    </>
  );
}

describe('useUrlState', () => {
  it('reads a string value from the URL', () => {
    render(
      <MemoryRouter initialEntries={['/?tab=overview']}>
        <Probe keyName="tab" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('value')).toHaveTextContent('overview');
  });

  it('returns null when key is absent', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Probe keyName="tab" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('value')).toHaveTextContent('null');
  });

  it('setting a value updates the URL', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Probe keyName="tab" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('set'));
    expect(screen.getByTestId('search')).toHaveTextContent('?tab=hello');
  });

  it('clearing a value removes it from the URL', () => {
    render(
      <MemoryRouter initialEntries={['/?tab=hello']}>
        <Probe keyName="tab" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('clear'));
    expect(screen.getByTestId('search')).not.toHaveTextContent('tab');
  });

  it('list variant reads comma-separated values', () => {
    render(
      <MemoryRouter initialEntries={['/?class=1,2,3']}>
        <ListProbe keyName="class" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('values')).toHaveTextContent('1|2|3');
  });

  it('list variant returns empty array when key is absent', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <ListProbe keyName="class" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('values')).toHaveTextContent('');
  });

  it('list variant writes comma-separated values', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <ListProbe keyName="class" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('set-ab'));
    expect(screen.getByTestId('values')).toHaveTextContent('a|b');
  });
});
