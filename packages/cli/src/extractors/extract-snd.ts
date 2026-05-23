import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { decodeSnd, SND_SAMPLE_RATE_HZ } from '@wiz6/parser';

export interface ExtractSndOpts {
  originalPath: string;
  outputDir: string;
  id: string;
}

export interface SndMetadata {
  id: string;
  sourceFile: string;
  compression: 'raw' | 'huffman';
  sampleCount: number;
  sampleRateHz: number;
}

function encodeWav(samples: number[], sampleRate: number): Uint8Array {
  const n = samples.length;
  const out = new Uint8Array(44 + n);
  const view = new DataView(out.buffer);
  out.set([0x52, 0x49, 0x46, 0x46], 0);
  view.setUint32(4, 36 + n, true);
  out.set([0x57, 0x41, 0x56, 0x45], 8);
  out.set([0x66, 0x6d, 0x74, 0x20], 12);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  out.set([0x64, 0x61, 0x74, 0x61], 36);
  view.setUint32(40, n, true);
  for (let i = 0; i < n; i++) out[44 + i] = samples[i]!;
  return out;
}

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
    sampleCount: snd.samples.length,
    sampleRateHz: SND_SAMPLE_RATE_HZ,
  };
  writeFileSync(join(opts.outputDir, `${opts.id}.json`), JSON.stringify(meta, null, 2));
  writeFileSync(join(opts.outputDir, `${opts.id}.wav`), encodeWav(snd.samples, SND_SAMPLE_RATE_HZ));

  return meta;
}
