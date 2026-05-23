import { SndSchema, type Snd } from '@wiz6/data';

export interface DecodeSndOpts {
  id: string;
  sourceFile: string;
}

/**
 * Engine default PIT divisor used when the header's rate_word is 0xFFFF.
 *
 * The engine calibrates this at C-runtime boot from the host CPU's busy-wait
 * speed; we can't recover the exact value statically. 150 is a reasonable
 * placeholder — gives ~4 kHz sample rate, consistent with 1990-era PC speaker
 * digitized speech. Tunable here if files sound wrong at the default rate.
 */
export const DEFAULT_SND_RATE_DIVISOR = 150;

/**
 * Log-attenuation LUT extracted from `wroot.exe` at file offset `0x1C4B`
 * (= image offset `0x1A4B` after subtracting the 0x200-byte MZ header).
 *
 * The engine's slow ISRs use `xlatb` to translate each .snd sample byte
 * through this table before writing to PC speaker / AdLib / PSG hardware.
 * The LUT maps sample byte (0..255) → output level (0..63), with output 0
 * at samples >= 219 (silence) and output 63 at sample 0 (max amplitude).
 *
 * Crucially, the leaf values in the Huffman trees of .snd files are NOT
 * raw PCM amplitudes — they're indices INTO this LUT. Direct PCM playback
 * of the decoded sample bytes sounds like noise because the bytes encode
 * log-quantized loudness levels, not waveform amplitudes. Use
 * `sndApplyLut(samples)` to get a flat amplitude stream suitable for
 * Web Audio playback.
 */
export const SND_LOG_LUT: readonly number[] = Object.freeze([
  0x3f, 0x3e, 0x36, 0x32, 0x2e, 0x2c, 0x2a, 0x28, 0x26, 0x25, 0x24, 0x23, 0x22, 0x21, 0x20, 0x1f,
  0x1e, 0x1e, 0x1d, 0x1c, 0x1c, 0x1b, 0x1b, 0x1a, 0x1a, 0x19, 0x19, 0x18, 0x18, 0x17, 0x17, 0x17,
  0x16, 0x16, 0x16, 0x15, 0x15, 0x15, 0x14, 0x14, 0x14, 0x13, 0x13, 0x13, 0x13, 0x12, 0x12, 0x12,
  0x12, 0x11, 0x11, 0x11, 0x11, 0x11, 0x10, 0x10, 0x10, 0x10, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f,
  0x0e, 0x0e, 0x0e, 0x0e, 0x0e, 0x0d, 0x0d, 0x0d, 0x0d, 0x0d, 0x0d, 0x0c, 0x0c, 0x0c, 0x0c, 0x0c,
  0x0c, 0x0c, 0x0b, 0x0b, 0x0b, 0x0b, 0x0b, 0x0b, 0x0b, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a,
  0x0a, 0x0a, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08,
  0x08, 0x08, 0x08, 0x08, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x06, 0x06,
  0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05,
  0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04,
  0x04, 0x04, 0x04, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03,
  0x03, 0x03, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02,
  0x02, 0x02, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01,
  0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

/**
 * Translate `.snd` sample bytes through the log-attenuation LUT to produce
 * a flat (linear) amplitude stream suitable for direct PCM playback.
 *
 * Output: array of 0..255 8-bit unsigned PCM samples, centered around 128
 * (silence), with peaks toward 0 and 255 representing positive/negative
 * waveform deviations. The PC speaker output is unipolar in hardware, but
 * we AC-couple by subtracting the per-file mean so the signal is centered
 * for Web Audio.
 */
export function sndApplyLut(samples: readonly number[]): number[] {
  if (samples.length === 0) return [];
  const lutValues: number[] = new Array(samples.length);
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = SND_LOG_LUT[samples[i]!]!; // 0..63
    lutValues[i] = v;
    sum += v;
  }
  const mean = sum / samples.length;
  const out: number[] = new Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    // Scale (LUT - mean) by 4 → range ~-mean*4..(63-mean)*4. Bias to 128 PCM center.
    out[i] = Math.max(0, Math.min(255, Math.round(128 + (lutValues[i]! - mean) * 4)));
  }
  return out;
}

/** PIT input frequency in Hz (Intel 8253 timer chip standard). */
const PIT_FREQ_HZ = 1_193_182;

/**
 * Compute the wall-clock sample rate (Hz) for a decoded SND.
 *
 * Engine path: PIT counter 0 fires IRQ0 at `PIT_FREQ_HZ / divisor`. The ISR
 * advances the sample pointer by 0.5 samples per tick, so the effective sample
 * rate is half the timer tick rate.
 */
export function sndSampleRateHz(rateDivisor: number | null): number {
  const div = rateDivisor ?? DEFAULT_SND_RATE_DIVISOR;
  return Math.round(PIT_FREQ_HZ / div / 2);
}

/**
 * Decode a `.snd` file per the format spec in docs/re/snd-format.md.
 *
 * Layout:
 *   bytes 0..1: tree_size_bytes (u16 LE) — 0 means raw PCM follows
 *   bytes 2..3: rate_word (u16 LE)        — 0xFFFF means engine-default
 *   if tree_size_bytes > 0:
 *     bytes 4..4+tree_size_bytes: tree (4 bytes per node = i16 left + i16 right)
 *     bytes 4+tree_size_bytes..end: bitstream (MSB-first)
 *   else:
 *     bytes 4..end: raw 8-bit unsigned PCM samples
 *
 * Tree leaf rule: child & 0x8000 == 0 means leaf with sample value (child & 0xFF).
 * Internal node: next_node_index = (0x10000 - child) (unsigned).
 *
 * Bitstream terminates either when input is exhausted or when a child index
 * falls outside the tree's node range (engine's natural overrun signal).
 */
export function decodeSnd(bytes: Uint8Array, opts: DecodeSndOpts): Snd {
  if (bytes.length < 4) {
    throw new Error(`snd: file too short (${bytes.length} bytes; need at least 4)`);
  }

  const treeSize = bytes[0]! | (bytes[1]! << 8);
  const rateWord = bytes[2]! | (bytes[3]! << 8);
  const rateDivisor = rateWord === 0xffff ? null : rateWord;

  if (treeSize === 0) {
    // Anomalous case: 4 files in the standard set (sound28/30/32/35) have
    // tree_size=0 with rate_word values that aren't plausible PIT divisors
    // (21183, 25469, 12605, 32896). The format spec wrongly says these are
    // "raw PCM"; the absurd rate_words show they're not. Until we know what
    // they actually are, surface the bytes but mark compression 'unknown'
    // when the rate is implausible.
    const samples = Array.from(bytes.subarray(4));
    const PLAUSIBLE_MAX_DIVISOR = 1000;
    const compression =
      rateDivisor !== null && rateDivisor > PLAUSIBLE_MAX_DIVISOR ? 'unknown' : 'raw';
    return SndSchema.parse({
      id: opts.id,
      sourceFile: opts.sourceFile,
      compression,
      rateDivisor: compression === 'unknown' ? null : rateDivisor,
      samples,
    });
  }

  const treeStart = 4;
  const treeEnd = 4 + treeSize;
  if (bytes.length < treeEnd) {
    throw new Error(`snd: file too short for tree (need ${treeEnd} bytes, got ${bytes.length})`);
  }

  if (treeSize % 4 !== 0) {
    throw new Error(`snd: tree_size_bytes=${treeSize} is not a multiple of 4`);
  }

  const nodeCount = treeSize / 4;
  // Words stored as UNSIGNED u16 — top bit (0x8000) is the leaf/link flag.
  const tree = new Uint16Array(nodeCount * 2);
  for (let i = 0; i < tree.length; i++) {
    tree[i] = bytes[treeStart + i * 2]! | (bytes[treeStart + i * 2 + 1]! << 8);
  }

  const bitstream = bytes.subarray(treeEnd);
  const samples: number[] = [];
  let node = 0;

  outer: for (let bi = 0; bi < bitstream.length; bi++) {
    const byte = bitstream[bi]!;
    for (let shift = 7; shift >= 0; shift--) {
      const bit = (byte >> shift) & 1;
      const child = tree[node * 2 + bit]!;
      if ((child & 0x8000) === 0) {
        samples.push(child & 0xff);
        node = 0;
      } else {
        // Internal link: next_node = (0x10000 - child) as unsigned.
        node = 0x10000 - child;
        if (node >= nodeCount) {
          // Overrun = engine's natural end-of-stream signal.
          break outer;
        }
      }
    }
  }

  return SndSchema.parse({
    id: opts.id,
    sourceFile: opts.sourceFile,
    compression: 'huffman',
    rateDivisor,
    samples,
  });
}
