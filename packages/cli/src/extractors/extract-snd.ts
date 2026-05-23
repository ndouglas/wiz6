import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { decodeSnd, sndApplyLut, sndSampleRateHz } from '@wiz6/parser';

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
 * Encode 8-bit unsigned PCM mono samples as a minimal WAV file.
 * Browsers can play this via `<audio src="...wav">` directly — useful for
 * isolating "does the decode produce real audio?" from "is the Web Audio
 * playback path correct?".
 */
function encodeWav(samples: number[], sampleRate: number): Uint8Array {
  const n = samples.length;
  const out = new Uint8Array(44 + n);
  const view = new DataView(out.buffer);
  // RIFF header
  out.set([0x52, 0x49, 0x46, 0x46], 0); // 'RIFF'
  view.setUint32(4, 36 + n, true); // chunk size
  out.set([0x57, 0x41, 0x56, 0x45], 8); // 'WAVE'
  // fmt subchunk
  out.set([0x66, 0x6d, 0x74, 0x20], 12); // 'fmt '
  view.setUint32(16, 16, true); // subchunk size (PCM)
  view.setUint16(20, 1, true); // audio format (PCM)
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true); // sample rate
  view.setUint32(28, sampleRate, true); // byte rate (= rate * 1 byte * 1 channel)
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  // data subchunk
  out.set([0x64, 0x61, 0x74, 0x61], 36); // 'data'
  view.setUint32(40, n, true); // data size
  for (let i = 0; i < n; i++) out[44 + i] = samples[i]!;
  return out;
}

/**
 * Extract a `.snd` file:
 *   - Copies the raw bytes to `<outputDir>/<basename>` (browser-fetchable for
 *     in-browser decode via the parser).
 *   - Writes a small JSON metadata file (compression / rate / sample count).
 *   - Renders a `.wav` rendering for direct `<audio>` playback — useful for
 *     verifying decode correctness without going through our Web Audio path.
 */
export function extractSnd(opts: ExtractSndOpts): SndMetadata {
  mkdirSync(opts.outputDir, { recursive: true });

  const source = basename(opts.originalPath);
  copyFileSync(opts.originalPath, join(opts.outputDir, source));

  const bytes = new Uint8Array(readFileSync(opts.originalPath));
  const snd = decodeSnd(bytes, { id: opts.id, sourceFile: source });
  const sampleRateHz = sndSampleRateHz(snd.rateDivisor);

  const meta: SndMetadata = {
    id: snd.id,
    sourceFile: snd.sourceFile,
    compression: snd.compression,
    rateDivisor: snd.rateDivisor,
    sampleCount: snd.samples.length,
    sampleRateHz,
  };
  writeFileSync(join(opts.outputDir, `${opts.id}.json`), JSON.stringify(meta, null, 2));

  // WAVs at the decoded sample rate. Two variants:
  //   - .wav    : LUT-transformed samples (linear amplitude, suitable for
  //                Web Audio / general PCM playback). Default user-facing.
  //   - .raw.wav: untransformed sample bytes (the .snd's stored values directly).
  //                Useful for diagnosing whether the LUT model is correct.
  // The "unknown" compression files don't go through the LUT — their bytes
  // aren't sample indices, so LUT'ing them produces nonsense too.
  const lutSamples = snd.compression === 'unknown' ? snd.samples : sndApplyLut(snd.samples);
  writeFileSync(join(opts.outputDir, `${opts.id}.wav`), encodeWav(lutSamples, sampleRateHz));
  writeFileSync(join(opts.outputDir, `${opts.id}.raw.wav`), encodeWav(snd.samples, sampleRateHz));

  return meta;
}
