import { z } from 'zod';

const ByteSchema = z.number().int().min(0).max(255);

export const RgbTupleSchema = z.tuple([ByteSchema, ByteSchema, ByteSchema]);

export const PaletteSchema = z.object({
  name: z.string().min(1),
  provenance: z.string().min(1),
  colors: z.array(RgbTupleSchema).length(16),
});

export type RgbTuple = z.infer<typeof RgbTupleSchema>;
export type Palette = z.infer<typeof PaletteSchema>;
