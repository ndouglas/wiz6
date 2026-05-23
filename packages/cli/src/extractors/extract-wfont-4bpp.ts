import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { Font4bpp } from '@wiz6/data';
import { decodeWfont4bpp } from '@wiz6/parser';

export interface ExtractWfont4bppOpts {
  originalPath: string;
  outputPath: string;
  id: string;
}

export function extractWfont4bpp(opts: ExtractWfont4bppOpts): Font4bpp {
  const bytes = new Uint8Array(readFileSync(opts.originalPath));
  const decoded = decodeWfont4bpp(bytes, {
    id: opts.id,
    sourceFile: basename(opts.originalPath),
  });
  const font: Font4bpp = { ...decoded, palette: 'ega-default' };
  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, JSON.stringify(font, null, 2));
  return font;
}
