import type { BssStruct } from './bss-types.js';

/**
 * Party position state at DGROUP `0x4f8a..0x4faa`. The engine keeps the
 * current party position + a saved-position slot + a maze-data pointer
 * in this contiguous block. Source: `docs/re/wmaze-functions.md` §
 * "Key BSS globals discovered".
 *
 * Note: this is a "virtual" struct — the engine doesn't access these
 * via a base pointer; each global has its own absolute address. We
 * model them as one BssStruct here for convenient typed reads against
 * a buffer covering the `0x4f8a..0x4fac` range.
 */
export const POSITION_STATE: BssStruct = {
  name: 'position_state',
  bytes: 0x24, // 0x4faa - 0x4f8a + 4 (maze_data_ptr is a 32-bit far pointer)
  source: 'docs/re/wmaze-functions.md',
  description: 'Party position + saved-position + maze-data pointer. Base = 0x4f8a.',
  fields: [
    {
      name: 'saved_facing',
      offset: 0x4f8a - 0x4f8a,
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Saved-position slot: facing.',
    },
    {
      name: 'saved_level',
      offset: 0x4f8c - 0x4f8a,
      type: { kind: 'scalar', scalar: 'u16_le' },
    },
    {
      name: 'saved_y',
      offset: 0x4f8e - 0x4f8a,
      type: { kind: 'scalar', scalar: 'u16_le' },
    },
    {
      name: 'saved_x',
      offset: 0x4f90 - 0x4f8a,
      type: { kind: 'scalar', scalar: 'u16_le' },
    },
    {
      name: 'saved_global_y',
      offset: 0x4f92 - 0x4f8a,
      type: { kind: 'scalar', scalar: 'u16_le' },
    },
    {
      name: 'saved_global_x',
      offset: 0x4f94 - 0x4f8a,
      type: { kind: 'scalar', scalar: 'u16_le' },
    },
    {
      name: 'saved_zone',
      offset: 0x4f96 - 0x4f8a,
      type: { kind: 'scalar', scalar: 'u16_le' },
    },
    {
      name: 'facing',
      offset: 0x4f9a - 0x4f8a,
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: '0..3 for player UI; 0..11 for cell-coordinate calculations.',
    },
    {
      name: 'level_z',
      offset: 0x4f9c - 0x4f8a,
      type: { kind: 'scalar', scalar: 'u16_le' },
    },
    {
      name: 'y',
      offset: 0x4f9e - 0x4f8a,
      type: { kind: 'scalar', scalar: 'u16_le' },
    },
    {
      name: 'x',
      offset: 0x4fa0 - 0x4f8a,
      type: { kind: 'scalar', scalar: 'u16_le' },
    },
    {
      name: 'global_y',
      offset: 0x4fa2 - 0x4f8a,
      type: { kind: 'scalar', scalar: 'u16_le' },
    },
    {
      name: 'global_x',
      offset: 0x4fa4 - 0x4f8a,
      type: { kind: 'scalar', scalar: 'u16_le' },
    },
    {
      name: 'fwd_cache',
      offset: 0x4fa6 - 0x4f8a,
      type: { kind: 'scalar', scalar: 'u16_le' },
    },
    {
      name: 'maze_data_ptr',
      offset: 0x4faa - 0x4f8a,
      type: { kind: 'scalar', scalar: 'u32_le' },
      description: 'Far pointer to the per-zone maze data table.',
    },
  ],
};
