import { createContext, useContext, useState, type ReactNode } from 'react';
import type { MonsterFieldName } from '../../lib/monster-byte-map.js';

interface MonsterDetailState {
  highlightedField: MonsterFieldName | null;
  setHighlightedField: (next: MonsterFieldName | null) => void;
}

const MonsterDetailCtx = createContext<MonsterDetailState | undefined>(undefined);

export function MonsterDetailProvider({ children }: { children: ReactNode }) {
  const [highlightedField, setHighlightedField] = useState<MonsterFieldName | null>(null);
  return (
    <MonsterDetailCtx.Provider value={{ highlightedField, setHighlightedField }}>
      {children}
    </MonsterDetailCtx.Provider>
  );
}

export function useMonsterDetail(): MonsterDetailState {
  const ctx = useContext(MonsterDetailCtx);
  if (!ctx) throw new Error('useMonsterDetail must be used inside MonsterDetailProvider');
  return ctx;
}
