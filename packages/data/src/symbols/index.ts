/**
 * Wiz6 symbol resolver — name-↔-address index across all binaries
 * (wroot.exe + the 11 overlays), built from the naming-pass JSONs in
 * `docs/re/findings/`.
 *
 * Pure data and pure lookups; no I/O. A Node-side loader in `@wiz6/cli`
 * reads the JSON files and feeds entries through `parseAllFindingsDocs`
 * → `buildSymbolIndex`.
 *
 * Primary consumer: the eventual DOSBox-X MCP server (#017), which needs
 * to turn engine-supplied addresses (e.g. instruction pointers at a
 * breakpoint) into named functions for AI agents.
 */

export type { Binary, Confidence, SymbolEntry } from './types.js';
export type { RawFinding, RawFindingsDoc } from './parse-findings.js';
export { parseFindingsDoc, parseAllFindingsDocs } from './parse-findings.js';
export { buildSymbolIndex, type SymbolIndex } from './index-builder.js';
export {
  WROOT_THUNK_DELTA,
  resolveThunkToWrootOffset,
  wrootOffsetToThunkAddress,
} from './thunks.js';
