import { createContext, useContext, useState, type ReactNode } from 'react';
import type { MonsterFieldName } from '../../lib/monster-byte-map.js';

interface MonsterDetailState {
  highlightedField: MonsterFieldName | null;
  setHighlightedField: (next: MonsterFieldName | null) => void;
}

const NOOP_STATE: MonsterDetailState = {
  highlightedField: null,
  setHighlightedField: () => {},
};

const MonsterDetailCtx = createContext<MonsterDetailState>(NOOP_STATE);

export function MonsterDetailProvider({ children }: { children: ReactNode }) {
  const [highlightedField, setHighlightedField] = useState<MonsterFieldName | null>(null);
  return (
    <MonsterDetailCtx.Provider value={{ highlightedField, setHighlightedField }}>
      {children}
    </MonsterDetailCtx.Provider>
  );
}

export function useMonsterDetail(): MonsterDetailState {
  return useContext(MonsterDetailCtx);
}
