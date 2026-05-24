import type { BssStruct } from './bss-types.js';

/**
 * Monster-type "prejudice" table — 3 bytes at offset `+0x80` of each monster
 * type record. Each byte is either zero (target the party) or another monster
 * type ID (target a group of that type if present). Source:
 * `docs/re/findings/wpops-naming-pass.json` (used by
 * `wpops_target_pick_random_with_prejudice` at 0x3ed7).
 *
 * Mechanic doc: `/explore/notes#monster-prejudice-table`.
 */
export const MONSTER_PREJUDICE: BssStruct = {
  name: 'monster_prejudice',
  bytes: 3,
  source: 'docs/re/findings/wpops-naming-pass.json',
  description: '3 bytes at monster_type+0x80..+0x82; each slot is a monster type ID or 0 (party).',
  fields: [
    {
      name: 'slots',
      offset: 0,
      type: {
        kind: 'array',
        length: 3,
        element: { kind: 'scalar', scalar: 'u8' },
      },
      description: 'Three target type IDs. rng(3) picks one per target-pick attempt.',
    },
  ],
};
