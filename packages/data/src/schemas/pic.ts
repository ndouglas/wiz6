import { z } from 'zod';

const byte = z.number().int().min(0).max(255);

export const PicLitOpSchema = z.object({
  type: z.literal('lit'),
  bytes: z.array(byte),
});

export const PicRunOpSchema = z.object({
  type: z.literal('run'),
  count: z.number().int().min(1).max(128),
  fillByte: byte,
});

export const PicOpSchema = z.discriminatedUnion('type', [
  PicLitOpSchema,
  PicRunOpSchema,
]);

export const PicSegmentSchema = z.object({
  segmentIndex: z.number().int().nonnegative(),
  encodedOffset: z.number().int().nonnegative(),
  encodedLength: z.number().int().positive(),
  ops: z.array(PicOpSchema),
  decodedBytes: z.array(byte),
});

export const PicDescriptorSchema = z.object({
  /** Position of this descriptor in the file's descriptor list (0-based). */
  index: z.number().int().nonnegative(),
  /** Byte offset into the concatenated decoded buffer where this descriptor's first cell lives. */
  pos: z.number().int().min(0).max(0xffff),
  /** Sprite width in 8-pixel cells. */
  width: byte,
  /** Sprite height in 8-pixel cells. */
  height: byte,
  /** 20-byte cell-population mask. Bit (row * width + col), LSB-first, set => the cell at (col, row) is in the atlas. */
  mask: z.array(byte).length(20),
});

export const PicSchema = z.object({
  id: z.string().min(1),
  sourceFile: z.string().min(1),
  segments: z.array(PicSegmentSchema),
  descriptors: z.array(PicDescriptorSchema),
  totalBytes: z.number().int().positive(),
  palette: z.string().min(1).optional(),
});

export type PicLitOp = z.infer<typeof PicLitOpSchema>;
export type PicRunOp = z.infer<typeof PicRunOpSchema>;
export type PicOp = z.infer<typeof PicOpSchema>;
export type PicSegment = z.infer<typeof PicSegmentSchema>;
export type PicDescriptor = z.infer<typeof PicDescriptorSchema>;
export type Pic = z.infer<typeof PicSchema>;
