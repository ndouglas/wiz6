import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  buildSymbolIndex,
  parseAllFindingsDocs,
  type RawFindingsDoc,
  type SymbolEntry,
  type SymbolIndex,
} from '@wiz6/data';

/**
 * Node-side loader for the Wiz6 symbol resolver. Reads every
 * `<name>-naming-pass.json` in `docs/re/findings/` and feeds its findings
 * through `parseAllFindingsDocs` → `buildSymbolIndex`.
 *
 * The pure-TS parts of the resolver (parsing, indexing, thunk-delta math)
 * live in `@wiz6/data`. This module is the I/O wrapper.
 */

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
 * Resolve the on-disk location of `docs/re/findings/`. Walks up from `cwd`
 * until it finds a `docs/re/findings` directory, mirroring the layout we
 * standardise on for the repo.
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
 * Read every `*-naming-pass.json` in the given directory and return the
 * parsed JSON documents. Non-naming-pass findings (palette-loads,
 * snd-format, etc.) are skipped — they don't carry `applied_name` rows.
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
