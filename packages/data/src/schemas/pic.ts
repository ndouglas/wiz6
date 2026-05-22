import { z } from 'zod';

const byte = z.number().int().min(0).max(255);

export const PicLitOpSchema = z.object({
  type: z.literal('lit'),
  bytes: z.array(byte),
});

export const PicRunOpSchema = z.object({
  type: z.literal('run'),
  /** Number of repetitions of `fillByte`. Derived as `256 - op` where the
   *  encoded opcode is in 0x80..0xff, giving the inclusive range 1..128. */
  count: z.number().int().min(1).max(128),
  fillByte: byte,
});

export const PicOpSchema = z.discriminatedUnion('type', [
  PicLitOpSchema,
  PicRunOpSchema,
]);

export const PicHeaderSchema = z.object({
  /** u16 little-endian destination buffer offset, parsed from decoded bytes 0-1. */
  pos: z.number().int().min(0).max(0xffff),
  /** Sprite width in some unit (TBD by Stage B). Decoded byte 2. */
  width: byte,
  /** Sprite height in some unit (TBD by Stage B). Decoded byte 3. */
  height: byte,
});

export const PicSegmentSchema = z.object({
  segmentIndex: z.number().int().nonnegative(),
  /** Start offset of this segment's encoded bytes in the source file. */
  encodedOffset: z.number().int().nonnegative(),
  /** Number of source bytes consumed by this segment (including the trailing 0x00). */
  encodedLength: z.number().int().positive(),
  ops: z.array(PicOpSchema),
  /** RLE-decoded output of this segment. First 4 bytes are the header (if length >= 4). */
  decodedBytes: z.array(byte),
  /** First 4 decoded bytes parsed as [pos_lo, pos_hi, W, H]. `null` if decoded < 4 bytes. */
  header: PicHeaderSchema.nullable(),
});

export const PicSchema = z.object({
  id: z.string().min(1),
  sourceFile: z.string().min(1),
  segments: z.array(PicSegmentSchema),
  totalBytes: z.number().int().positive(),
});

export type PicLitOp = z.infer<typeof PicLitOpSchema>;
export type PicRunOp = z.infer<typeof PicRunOpSchema>;
export type PicOp = z.infer<typeof PicOpSchema>;
export type PicHeader = z.infer<typeof PicHeaderSchema>;
export type PicSegment = z.infer<typeof PicSegmentSchema>;
export type Pic = z.infer<typeof PicSchema>;
