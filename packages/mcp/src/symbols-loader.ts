// Node-side loader for the Wiz6 symbol resolver.
//
// Copied from packages/cli/src/lib/symbols-loader.ts to keep the MCP server
// self-contained (`@wiz6/cli` doesn't export this helper from its package
// entry point, and pulling in the rest of the CLI surface costs more than
// the ~50 lines here). The pure parser/index/thunk logic still lives in
// `@wiz6/data`; this file is the I/O wrapper.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  buildSymbolIndex,
  parseAllFindingsDocs,
  type RawFindingsDoc,
  type SymbolEntry,
  type SymbolIndex,
} from '@wiz6/data';

export interface LoadSymbolsOpts {
  /** Path to the wiz6 repo root, or any ancestor containing `docs/re/findings/`. */
  cwd?: string;
  /**
   * Explicit override for the findings directory. Takes precedence over `cwd`.
   * Useful for tests.
   */
  findingsDir?: string;
}

/**
 * Walk upward from `cwd` looking for `docs/re/findings/`.
 */
export function findFindingsDir(cwd: string): string {
  let dir = resolve(cwd);
  for (let i = 0; i < 12; i++) {
    const candidate = join(dir, 'docs', 're', 'findings');
    try {
      if (statSync(candidate).isDirectory()) return candidate;
    } catch {
      // not here, walk up
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`could not locate docs/re/findings/ starting from ${cwd}`);
}

/**
 * Read every `*-naming-pass.json` in the given directory and return parsed
 * JSON. Non-naming-pass findings are skipped.
 */
export function readNamingPassDocs(findingsDir: string): RawFindingsDoc[] {
  const docs: RawFindingsDoc[] = [];
  for (const entry of readdirSync(findingsDir)) {
    if (!entry.endsWith('-naming-pass.json')) continue;
    const path = join(findingsDir, entry);
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as RawFindingsDoc;
    docs.push(parsed);
  }
  return docs;
}

/** Convenience: load + parse + index in one call. */
export function loadSymbolIndex(opts: LoadSymbolsOpts = {}): SymbolIndex {
  const dir = opts.findingsDir ?? findFindingsDir(opts.cwd ?? process.cwd());
  const docs = readNamingPassDocs(dir);
  const entries: SymbolEntry[] = parseAllFindingsDocs(docs);
  return buildSymbolIndex(entries);
}
