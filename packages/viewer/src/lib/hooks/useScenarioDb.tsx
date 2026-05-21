import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ScenarioDbSchema, type ScenarioDb } from '@wiz6/data';

interface ScenarioDbState {
  data: ScenarioDb | null;
  loading: boolean;
  error: Error | null;
}

const ScenarioDbContext = createContext<ScenarioDbState | undefined>(undefined);

export function ScenarioDbProvider({
  children,
  url = '/scenario/scenario.json',
}: {
  children: ReactNode;
  url?: string;
}) {
  const [state, setState] = useState<ScenarioDbState>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);
        const json = await res.json();
        const parsed = ScenarioDbSchema.parse(json);
        if (!cancelled) setState({ data: parsed, loading: false, error: null });
      } catch (err) {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return <ScenarioDbContext.Provider value={state}>{children}</ScenarioDbContext.Provider>;
}

export function useScenarioDb(): ScenarioDbState {
  const ctx = useContext(ScenarioDbContext);
  if (!ctx) throw new Error('useScenarioDb must be used inside ScenarioDbProvider');
  return ctx;
}
