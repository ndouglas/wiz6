import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { decodePcfile } from '@wiz6/parser';
import type { DecodedPcfile } from '@wiz6/data';

export interface ExtractPcfileOpts {
  originalPath: string;
  outputPath: string;
}

export function extractPcfile(opts: ExtractPcfileOpts): DecodedPcfile {
  const bytes = new Uint8Array(readFileSync(opts.originalPath));
  const decoded = decodePcfile(bytes);
  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, JSON.stringify(decoded, null, 2));
  return decoded;
}
