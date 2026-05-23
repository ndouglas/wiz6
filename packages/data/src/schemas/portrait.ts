import { z } from 'zod';
import { Font4bppGlyphSchema } from './font-4bpp.js';

// A portrait is a 24×24 image (3 × 3 8×8 tiles, row-major).
export const PortraitSchema = z.object({
  index: z.number().int().nonnegative(),
  tiles: z.array(Font4bppGlyphSchema).length(9),
});

export const PortraitSetSchema = z
  .object({
    id: z.string().min(1),
    sourceFile: z.string().min(1),
    portraitCount: z.number().int().positive(),
    portraits: z.array(PortraitSchema),
    palette: z.string().min(1).optional(),
  })
  .refine((s) => s.portraitCount === s.portraits.length, {
    message: 'portraitCount must equal portraits.length',
    path: ['portraitCount'],
  });

export type Portrait = z.infer<typeof PortraitSchema>;
export type PortraitSet = z.infer<typeof PortraitSetSchema>;
