import { z } from 'zod';

const ByteSchema = z.number().int().min(0).max(255);

/**
 * Decoded `.snd` file: 8-bit unsigned PCM samples + sample-rate metadata.
 *
 * Compression on disk:
 *   - 'raw': bytes after the 4-byte header are the samples directly.
 *   - 'huffman': bytes after the header hold a Huffman tree followed by
 *     a bitstream that decodes to samples (see docs/re/snd-format.md).
 *
 * Sample rate:
 *   - `rateDivisor` is the on-disk PIT divisor. Engine sample rate ≈
 *     1.193182 MHz / divisor / 2 (the ISR ticks the PIT and DI advances
 *     half a sample per tick).
 *   - `null` means the on-disk value was 0xFFFF — use the engine default.
 *     Default isn't statically recoverable (calibrated at C-runtime
 *     boot); see `DEFAULT_SND_RATE_DIVISOR` in @wiz6/parser for the
 *     placeholder.
 */
export const SndSchema = z.object({
  id: z.string().min(1),
  sourceFile: z.string().min(1),
  // 'huffman' is the normal case (tree_size > 0).
  // 'raw' = tree_size == 0 with a plausible rate_word; treat following bytes as PCM.
  // 'unknown' = tree_size == 0 with an implausible rate_word — these 4 files
  //   (sound28/30/32/35) use a different format we haven't reverse-engineered yet.
  compression: z.enum(['raw', 'huffman', 'unknown']),
  rateDivisor: z.number().int().min(1).nullable(),
  samples: z.array(ByteSchema),
});

export type Snd = z.infer<typeof SndSchema>;
