import type { Binary, SymbolEntry } from './types.js';
import { resolveThunkToWrootOffset, WROOT_THUNK_DELTA } from './thunks.js';

/**
 * A queryable symbol index built from a flat list of SymbolEntries.
 *
 * Lookups are O(1) by name (case-sensitive), O(1) by (binary, address). All
 * keys are normalised on insert. Duplicate names across binaries are allowed
 * (each binary has its own namespace) — `byName` returns the first match;
 * `allByName` returns every match.
 */
export interface SymbolIndex {
  readonly entries: readonly SymbolEntry[];
  byName(name: string): SymbolEntry | undefined;
  allByName(name: string): readonly SymbolEntry[];
  byAddress(binary: Binary, address: number): SymbolEntry | undefined;
  /** Symbols in a given binary. */
  byBinary(binary: Binary): readonly SymbolEntry[];
  /**
   * Resolve an overlay-side BSS thunk address to the wroot.exe symbol it
   * dispatches to. Applies the thunk-delta law (see `./thunks.ts`).
   */
  resolveThunk(thunkAddress: number): SymbolEntry | undefined;
}

/** Build a `SymbolIndex` from raw entries. Stable and immutable. */
export function buildSymbolIndex(entries: readonly SymbolEntry[]): SymbolIndex {
  const byNameMap = new Map<string, SymbolEntry[]>();
  const byAddrMap = new Map<string, SymbolEntry>();
  const byBinaryMap = new Map<Binary, SymbolEntry[]>();

  for (const e of entries) {
    const nameBucket = byNameMap.get(e.name);
    if (nameBucket) nameBucket.push(e);
    else byNameMap.set(e.name, [e]);

    const addrKey = `${e.binary}@${e.address}`;
    // Last-writer-wins on (binary,address) collision; in practice the inputs
    // are deduped at parse time.
    byAddrMap.set(addrKey, e);

    const binBucket = byBinaryMap.get(e.binary);
    if (binBucket) binBucket.push(e);
    else byBinaryMap.set(e.binary, [e]);
  }

  return {
    entries,
    byName(name) {
      return byNameMap.get(name)?.[0];
    },
    allByName(name) {
      return byNameMap.get(name) ?? [];
    },
    byAddress(binary, address) {
      return byAddrMap.get(`${binary}@${address}`);
    },
    byBinary(binary) {
      return byBinaryMap.get(binary) ?? [];
    },
    resolveThunk(thunkAddress) {
      const wrootOffset = resolveThunkToWrootOffset(thunkAddress);
      return byAddrMap.get(`wroot.exe@${wrootOffset}`);
    },
  };
}

export { WROOT_THUNK_DELTA, resolveThunkToWrootOffset };
