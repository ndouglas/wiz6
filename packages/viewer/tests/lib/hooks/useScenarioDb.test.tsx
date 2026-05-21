import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ScenarioDbProvider, useScenarioDb } from '../../../src/lib/hooks/useScenarioDb.js';
import { FIXTURE_SCENARIO_DB } from '../../fixtures/scenario-fixture.js';

function Probe() {
  const { data, loading, error } = useScenarioDb();
  if (loading) return <p>loading</p>;
  if (error) return <p>error: {error.message}</p>;
  if (!data) return <p>no data</p>;
  return (
    <p data-testid="probe">
      monsters={data.monsters.length} first={data.monsters[0]?.nameIdSingular}
    </p>
  );
}

describe('useScenarioDb', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches /scenario/scenario.json and provides data via context', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(FIXTURE_SCENARIO_DB), { status: 200 })),
    );
    render(
      <ScenarioDbProvider>
        <Probe />
      </ScenarioDbProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('monsters=250 first=GIANT RAT');
    });
  });

  it('exposes the error when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    render(
      <ScenarioDbProvider>
        <Probe />
      </ScenarioDbProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText(/error/)).toBeInTheDocument();
    });
  });

  it('throws if used outside the provider', () => {
    expect(() => render(<Probe />)).toThrow(/ScenarioDbProvider/);
  });
});
