import { z } from 'zod';

const ByteSchema = z.number().int().min(0).max(255);

export const Font4bppGlyphSchema = z.array(ByteSchema).length(32);

export const Font4bppSchema = z
  .object({
    id: z.string().min(1),
    sourceFile: z.string().min(1),
    glyphCount: z.number().int().positive(),
    glyphs: z.array(Font4bppGlyphSchema),
    palette: z.string().min(1).optional(),
  })
  .refine((f) => f.glyphCount === f.glyphs.length, {
    message: 'glyphCount must equal glyphs.length',
    path: ['glyphCount'],
  });

export type Font4bppGlyph = z.infer<typeof Font4bppGlyphSchema>;
export type Font4bpp = z.infer<typeof Font4bppSchema>;
