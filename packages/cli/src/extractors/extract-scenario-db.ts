import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { ScenarioDb } from '@wiz6/data';
import { decodeScenarioDb } from '@wiz6/parser';

export interface ExtractScenarioDbOpts {
  originalPath: string;
  outputPath: string;
  id: string;
}

export function extractScenarioDb(opts: ExtractScenarioDbOpts): ScenarioDb {
  const bytes = new Uint8Array(readFileSync(opts.originalPath));
  const db = decodeScenarioDb(bytes, {
    id: opts.id,
    sourceFile: basename(opts.originalPath),
  });
  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, JSON.stringify(db, null, 2));
  return db;
}
