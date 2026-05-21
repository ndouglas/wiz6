import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { EgaScreen } from '@wiz6/data';
import { decodeEgaScreen } from '@wiz6/parser';

export interface ExtractEgaScreenOpts {
  originalPath: string;
  outputPath: string;
  id: string;
}

export function extractEgaScreen(opts: ExtractEgaScreenOpts): EgaScreen {
  const bytes = new Uint8Array(readFileSync(opts.originalPath));
  const screen = decodeEgaScreen(bytes, {
    id: opts.id,
    sourceFile: basename(opts.originalPath),
  });
  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, JSON.stringify(screen, null, 2));
  return screen;
}
