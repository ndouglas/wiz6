import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { Font } from '@wiz6/data';
import { decodeWfont } from '../formats/wfont.js';

export interface ExtractWfontOpts {
  originalPath: string;
  outputPath: string;
  id: string;
}

export function extractWfont(opts: ExtractWfontOpts): Font {
  const bytes = new Uint8Array(readFileSync(opts.originalPath));
  const font = decodeWfont(bytes, {
    id: opts.id,
    sourceFile: basename(opts.originalPath),
  });
  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, JSON.stringify(font, null, 2));
  return font;
}
