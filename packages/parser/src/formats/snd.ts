import { SndSchema, type Snd } from '@wiz6/data';

export interface DecodeSndOpts {
  id: string;
  sourceFile: string;
}

/**
 * Engine-derived sample rate for .snd playback.
 *
 * The audio engine sets PIT counter 0 to 0x48 (72) for the common "slow"
 * variant, giving IRQ0 = 1.193182 MHz / 72 ≈ 16572 Hz. The ISR advances the
 * sample pointer fractionally: `add ah, FRAC; adc di, 0`, where FRAC is
 * patched at runtime from `(-param_5 - 1) & 0xFF`. For the engine's default
 * `param_5 = 100`, FRAC = 0x9B = 155, giving an effective sample rate of
 * 16572 × 155/256 ≈ 10026 Hz. Confirmed by listening — sounds correct.
 */
export const SND_SAMPLE_RATE_HZ = 10026;

/**
 * Decode a `.snd` file per the format below.
 *
 * Layout (all little-endian):
 *   bytes 0..1: tree_size_bytes (u16)
 *     - if 0: raw 8-bit unsigned PCM follows directly (bytes 2..end).
 *     - if >0: huffman-compressed; tree spans bytes 2..1+tree_size_bytes.
 *   if huffman:
 *     bytes 2..1+tree_size_bytes: tree, 4 bytes per node = (left, right) as
 *       signed i16. Top-bit-clear (`child & 0x8000 == 0`) → leaf with sample
 *       value (low byte of child). Top-bit-set → internal link; next node
 *       index = -child (treating child as signed).
 *     bytes 2+tree_size_bytes..3+tree_size_bytes: decoded_length (u16),
 *       the number of 8-bit samples that should be produced.
 *     bytes 4+tree_size_bytes..end: bitstream, MSB-first within each byte.
 *       Each bit walks the current tree node left (0) or right (1). On a
 *       leaf, emit the sample and reset to root.
 *
 * Verified against wroot.exe's `huffman_decode_bitstream` at image 0x134D5
 * and the decode-loop wrapper at 0x134BC. See docs/re/snd-format.md.
 */
export function decodeSnd(bytes: Uint8Array, opts: DecodeSndOpts): Snd {
  if (bytes.length < 2) {
    throw new Error(`snd: file too short (${bytes.length} bytes; need at least 2)`);
  }

  const treeSize = bytes[0]! | (bytes[1]! << 8);

  if (treeSize === 0) {
    return SndSchema.parse({
      id: opts.id,
      sourceFile: opts.sourceFile,
      compression: 'raw',
      samples: Array.from(bytes.subarray(2)),
    });
  }

  if (treeSize % 4 !== 0) {
    throw new Error(`snd: tree_size_bytes=${treeSize} is not a multiple of 4`);
  }

  const treeEnd = 2 + treeSize;
  if (bytes.length < treeEnd + 2) {
    throw new Error(`snd: file too short for tree + length prefix (need ${treeEnd + 2} bytes, got ${bytes.length})`);
  }

  const nodeCount = treeSize / 4;
  const tree = new Uint16Array(nodeCount * 2);
  for (let i = 0; i < tree.length; i++) {
    tree[i] = bytes[2 + i * 2]! | (bytes[2 + i * 2 + 1]! << 8);
  }

  const decodedLength = bytes[treeEnd]! | (bytes[treeEnd + 1]! << 8);
  const bitstream = bytes.subarray(treeEnd + 2);

  const samples: number[] = [];
  let node = 0;

  outer: for (let bi = 0; bi < bitstream.length && samples.length < decodedLength; bi++) {
    const byte = bitstream[bi]!;
    for (let shift = 7; shift >= 0 && samples.length < decodedLength; shift--) {
      const bit = (byte >> shift) & 1;
      const child = tree[node * 2 + bit]!;
      if ((child & 0x8000) === 0) {
        samples.push(child & 0xff);
        node = 0;
      } else {
        node = 0x10000 - child;
        if (node >= nodeCount) break outer;
      }
    }
  }

  return SndSchema.parse({
    id: opts.id,
    sourceFile: opts.sourceFile,
    compression: 'huffman',
    samples,
  });
}
