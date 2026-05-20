import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { MessageDb } from '@wiz6/data';
import { decodeMessageDb } from '../formats/message-db.js';

export interface ExtractMessageDbOpts {
  dbsPath: string;
  treePath: string;
  outputPath: string;
  id: string;
}

export function extractMessageDb(opts: ExtractMessageDbOpts): MessageDb {
  const dbs = new Uint8Array(readFileSync(opts.dbsPath));
  const tree = new Uint8Array(readFileSync(opts.treePath));
  const db = decodeMessageDb(dbs, tree, {
    id: opts.id,
    sourceFile: basename(opts.dbsPath),
    treeSourceFile: basename(opts.treePath),
  });
  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, JSON.stringify(db, null, 2));
  return db;
}
