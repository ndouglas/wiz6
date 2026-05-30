import { z } from 'zod';
import { CharacterSchema } from './character.js';

const CharacterList = z.array(CharacterSchema).max(16);

/** A named, ≤16-character preset in the library. `readOnly` is true only for
 *  the built-in Stock preset (which is not persisted to localStorage). */
export const PresetSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  name: z.string().min(1),
  readOnly: z.boolean().optional(),
  characters: CharacterList,
});
export type Preset = z.infer<typeof PresetSchema>;

/** The persisted presets library (custom + imported only; Stock is built-in). */
export const PresetsFileSchema = z
  .object({ schemaVersion: z.literal(1), presets: z.array(PresetSchema) })
  .refine((f) => new Set(f.presets.map((p) => p.id)).size === f.presets.length, {
    message: 'preset ids must be unique',
    path: ['presets'],
  });
export type PresetsFile = z.infer<typeof PresetsFileSchema>;

/** Lossless native import/export envelope (a PC File or single character). */
export const PcFileJsonSchema = z.object({
  format: z.literal('wiz6-pcfile'),
  version: z.literal(1),
  characters: CharacterList,
});
export type PcFileJson = z.infer<typeof PcFileJsonSchema>;
