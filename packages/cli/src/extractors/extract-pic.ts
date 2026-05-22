import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, basename } from 'node:path';
import { decodePic } from '@wiz6/parser';
import type { Pic } from '@wiz6/data';

export interface ExtractPicOpts {
  originalPath: string;
  outputPath: string;
  id: string;
}

export function extractPic(opts: ExtractPicOpts): Pic {
  const bytes = new Uint8Array(readFileSync(opts.originalPath));
  const pic = decodePic(bytes, {
    id: opts.id,
    sourceFile: basename(opts.originalPath),
  });
  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, JSON.stringify(pic, null, 2));
  return pic;
}
