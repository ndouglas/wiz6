import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { PortraitSet } from '@wiz6/data';
import { decodeWport } from '@wiz6/parser';

export interface ExtractWportOpts {
  originalPath: string;
  outputPath: string;
  id: string;
}

export function extractWport(opts: ExtractWportOpts): PortraitSet {
  const bytes = new Uint8Array(readFileSync(opts.originalPath));
  const decoded = decodeWport(bytes, {
    id: opts.id,
    sourceFile: basename(opts.originalPath),
  });
  const set: PortraitSet = { ...decoded, palette: 'ega-default' };
  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, JSON.stringify(set, null, 2));
  return set;
}
