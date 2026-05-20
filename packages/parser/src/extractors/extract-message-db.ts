import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { MessageDb } from '@wiz6/data';
import { decodeMessageDb } from '../formats/message-db.js';

export interface ExtractMessageDbOpts {
  dbsPath: string;
  treePath: string;
  indexPath: string;
  outputPath: string;
  id: string;
}

export function extractMessageDb(opts: ExtractMessageDbOpts): MessageDb {
  const dbs = new Uint8Array(readFileSync(opts.dbsPath));
  const tree = new Uint8Array(readFileSync(opts.treePath));
  const hdr = new Uint8Array(readFileSync(opts.indexPath));
  const db = decodeMessageDb(dbs, tree, hdr, {
    id: opts.id,
    sourceFile: basename(opts.dbsPath),
    treeSourceFile: basename(opts.treePath),
    indexSourceFile: basename(opts.indexPath),
  });
  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, JSON.stringify(db, null, 2));
  return db;
}
