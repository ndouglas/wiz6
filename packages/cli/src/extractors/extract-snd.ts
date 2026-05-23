import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { decodeSnd, sndSampleRateHz } from '@wiz6/parser';

export interface ExtractSndOpts {
  originalPath: string;
  outputDir: string;
  id: string;
}

export interface SndMetadata {
  id: string;
  sourceFile: string;
  compression: 'raw' | 'huffman';
  rateDivisor: number | null;
  sampleCount: number;
  sampleRateHz: number;
}

/**
 * Extract a `.snd` file: copies the raw bytes to `<outputDir>/<basename>` so
 * the viewer can fetch + decode in-browser, and writes a small JSON metadata
 * file alongside. We don't store decoded samples in JSON — they're large
 * (10k+ entries per file) and the browser-side decoder is fast.
 */
export function extractSnd(opts: ExtractSndOpts): SndMetadata {
  mkdirSync(opts.outputDir, { recursive: true });

  const source = basename(opts.originalPath);
  copyFileSync(opts.originalPath, join(opts.outputDir, source));

  const bytes = new Uint8Array(readFileSync(opts.originalPath));
  const snd = decodeSnd(bytes, { id: opts.id, sourceFile: source });

  const meta: SndMetadata = {
    id: snd.id,
    sourceFile: snd.sourceFile,
    compression: snd.compression,
    rateDivisor: snd.rateDivisor,
    sampleCount: snd.samples.length,
    sampleRateHz: sndSampleRateHz(snd.rateDivisor),
  };
  writeFileSync(join(opts.outputDir, `${opts.id}.json`), JSON.stringify(meta, null, 2));

  return meta;
}
