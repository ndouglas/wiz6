import { z } from 'zod';

const ByteSchema = z.number().int().min(0).max(255);

export const FontGlyphSchema = z.array(ByteSchema).length(8);

export const FontSchema = z
  .object({
    id: z.string().min(1),
    sourceFile: z.string().min(1),
    glyphCount: z.number().int().positive(),
    glyphs: z.array(FontGlyphSchema),
  })
  .refine((f) => f.glyphCount === f.glyphs.length, {
    message: 'glyphCount must equal glyphs.length',
    path: ['glyphCount'],
  });

export type FontGlyph = z.infer<typeof FontGlyphSchema>;
export type Font = z.infer<typeof FontSchema>;
