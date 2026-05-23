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
    const samples = Array.from(bytes.subarray(4));
    return SndSchema.parse({
      id: opts.id,
      sourceFile: opts.sourceFile,
      compression: 'raw',
      rateDivisor,
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
