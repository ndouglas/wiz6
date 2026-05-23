import { z } from 'zod';

const ByteSchema = z.number().int().min(0).max(255);

/**
 * Decoded `.snd` file: 8-bit unsigned PCM samples ready for Web Audio.
 *
 * On-disk layout:
 *   - 'raw': tree_size word at bytes 0..1 == 0; bytes 2..end are the samples.
 *   - 'huffman': tree_size > 0; huffman tree + length prefix + bitstream.
 *
 * All sounds play at a single engine-derived sample rate
 * (`SND_SAMPLE_RATE_HZ` in @wiz6/parser); there is no per-sound rate field
 * on disk. See docs/re/snd-format.md.
 */
export const SndSchema = z.object({
  id: z.string().min(1),
  sourceFile: z.string().min(1),
  compression: z.enum(['raw', 'huffman']),
  samples: z.array(ByteSchema),
});

export type Snd = z.infer<typeof SndSchema>;
