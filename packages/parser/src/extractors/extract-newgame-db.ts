import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { NewgameDb } from '@wiz6/data';
import { decodeNewgameDb } from '../formats/newgame-db.js';

export interface ExtractNewgameDbOpts {
  originalPath: string;
  outputPath: string;
  id: string;
}

export function extractNewgameDb(opts: ExtractNewgameDbOpts): NewgameDb {
  const bytes = new Uint8Array(readFileSync(opts.originalPath));
  const db = decodeNewgameDb(bytes, {
    id: opts.id,
    sourceFile: basename(opts.originalPath),
  });
  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, JSON.stringify(db, null, 2));
  return db;
}
