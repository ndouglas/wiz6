import type { BssStruct } from './bss-types.js';

/**
 * One combatant slot. 0x2c bytes (44). 13 slots per group, 7 groups max.
 *
 * Source: `docs/re/findings/wmele-naming-pass.json` (HP/SP/status fields)
 * plus `docs/re/findings/wmexe-naming-pass.json` (initiative + sub-action
 * queue at +0x18..+0x1b and +0x192..+0x195 of the broader monster-group
 * record — fields kept here track per-slot state).
 *
 * Many fields are still inferred from call patterns rather than direct
 * decompile; treat the byte map as best-effort v1. Easy to refine as
 * more RE lands.
 */
export const COMBAT_SLOT: BssStruct = {
  name: 'combat_slot',
  bytes: 0x2c,
  source: 'docs/re/findings/wmele-naming-pass.json + wmexe-naming-pass.json',
  description: '44-byte per-combatant slot. 13 slots/group, 7 groups/encounter.',
  fields: [
    {
      name: 'hp_current',
      offset: 0x00,
      type: { kind: 'scalar', scalar: 'u16_le' },
    },
    {
      name: 'hp_max',
      offset: 0x02,
      type: { kind: 'scalar', scalar: 'u16_le' },
    },
    {
      name: 'sp_current',
      offset: 0x04,
      type: { kind: 'scalar', scalar: 'u16_le' },
    },
    {
      name: 'sp_max',
      offset: 0x06,
      type: { kind: 'scalar', scalar: 'u16_le' },
    },
    {
      name: 'status_level',
      offset: 0x08,
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Sorted by this in combat_resolve_round_for_party.',
    },
    {
      name: 'status_flags',
      offset: 0x0a,
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Bitfield: dead / paralyzed / asleep / charmed / etc.',
    },
    {
      name: 'action_queue',
      offset: 0x18,
      type: {
        kind: 'array',
        length: 4,
        element: { kind: 'scalar', scalar: 'u8' },
      },
      description: 'Up to four queued sub-actions per round (see wmexe findings).',
    },
    {
      name: 'initiative',
      offset: 0x25,
      type: { kind: 'scalar', scalar: 'u8' },
      description: 'Tick value 0..100 the initiative-down loop matches against.',
    },
  ],
};
