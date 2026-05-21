import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decodeScenarioDb } from '@wiz6/parser';
import type { ScenarioDb } from '@wiz6/data';

interface ResolveOpts {
  cwd: string;
  override: string | null;
}

export function resolveOriginalDir(opts: ResolveOpts): string {
  if (opts.override) {
    const p = resolve(opts.override);
    try {
      if (statSync(p).isDirectory()) return p;
    } catch {
      // fall through to error below
    }
    throw new Error(`--original points at ${p} but no such directory exists`);
  }
  const candidate = join(opts.cwd, 'original');
  try {
    if (statSync(candidate).isDirectory()) return candidate;
  } catch {
    // fall through
  }
  throw new Error(
    `no original/ directory found relative to ${opts.cwd}. Use --original <path> or run from the wiz6 repo root.`,
  );
}

export function readFileBytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

export function loadScenarioDb(originalDir: string): ScenarioDb {
  const path = join(originalDir, 'scenario.dbs');
  const bytes = readFileBytes(path);
  return decodeScenarioDb(bytes, { id: 'scenario', sourceFile: 'scenario.dbs' });
}
