import { z } from 'zod';
import { Font4bppGlyphSchema } from './font-4bpp.js';

export const PortraitSchema = z.object({
  index: z.number().int().nonnegative(),
  tiles: z.array(Font4bppGlyphSchema).length(16),
});

export const PortraitSetSchema = z
  .object({
    id: z.string().min(1),
    sourceFile: z.string().min(1),
    portraitCount: z.number().int().positive(),
    portraits: z.array(PortraitSchema),
  })
  .refine((s) => s.portraitCount === s.portraits.length, {
    message: 'portraitCount must equal portraits.length',
    path: ['portraitCount'],
  });

export type Portrait = z.infer<typeof PortraitSchema>;
export type PortraitSet = z.infer<typeof PortraitSetSchema>;
