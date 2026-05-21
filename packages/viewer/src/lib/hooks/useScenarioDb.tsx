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
        if (!res.ok) throw new Error(`fetch failed for ${url}: HTTP ${res.status}`);
        const text = await res.text();
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          // Most common cause: Vite's SPA fallback served index.html because
          // the JSON file does not exist. Surface a clear, actionable error.
          if (text.trimStart().startsWith('<')) {
            throw new Error(
              `expected JSON at ${url} but got HTML — the file likely does not exist. Run \`pnpm extract\` from the repo root to generate extracted/ assets.`,
            );
          }
          throw new Error(`failed to parse JSON from ${url}`);
        }
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
