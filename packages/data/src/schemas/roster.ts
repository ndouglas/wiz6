import { z } from 'zod';
import { CharacterSchema } from './character.js';

/**
 * The per-visitor character collection. Lives in localStorage at
 * `wiz6:roster`. Pre-seeded on first visit from the curated gallery at
 * `/gallery/characters.json` (see packages/viewer/src/lib/gallery.ts).
 *
 * Saves do NOT reference the roster directly — saves embed full
 * `PartyMemberSchema` snapshots that optionally carry a `rosterCharacterId`
 * back-reference for sync-on-save.
 */
export const RosterSchema = z
  .object({
    schemaVersion: z.literal(1),
    characters: z.array(CharacterSchema),
  })
  .refine(
    (r) => new Set(r.characters.map((c) => c.id)).size === r.characters.length,
    { message: 'characters[].id must be unique', path: ['characters'] },
  );

export type Roster = z.infer<typeof RosterSchema>;
