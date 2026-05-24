import type { BssStruct } from './bss-types.js';

/**
 * Per-sound runtime state at DGROUP `*0x3344`. 12 bytes per entry, indexed
 * by the N argument to `audio_play_sound`. Source: `docs/re/snd-format.md`
 * § "The sound table at DGROUP 0x3344".
 *
 * The full table is 12 bytes × N_slots (N_slots=14 per the `winit_preload_sounds`
 * loop bound, with a known open question about slot 14 firing despite the
 * loop seemingly only going to 13).
 */
export const SOUND_TABLE_ENTRY: BssStruct = {
  name: 'sound_table_entry',
  bytes: 12,
  source: 'docs/re/snd-format.md',
  description: '12-byte per-sound runtime state at DGROUP 0x3344+N*0xC',
  fields: [
    {
      name: 'alias_id',
      offset: 0,
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Index into the sample-buffer table at 0x3579. Allows N sound-IDs to share one buffer.',
    },
    {
      name: 'reserved_or_status',
      offset: 2,
      type: { kind: 'scalar', scalar: 'u16_le' },
    },
    {
      name: 'buf_lo',
      offset: 4,
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: '"Is loaded" check, low word. Both buf_lo and buf_hi zero ⇒ not loaded, use alias_id.',
    },
    {
      name: 'buf_hi',
      offset: 6,
      type: { kind: 'scalar', scalar: 'u16_le' },
    },
    {
      name: 'duration',
      offset: 8,
      type: { kind: 'scalar', scalar: 'u16_le' },
      description: 'Passed as length/period to audio_engine_play.',
    },
    {
      name: 'rate_or_vol',
      offset: 10,
      type: { kind: 'scalar', scalar: 'u8' },
      description: 'Sometimes halved per device. See snd-format.md music-mode logic.',
    },
    {
      name: 'flags',
      offset: 11,
      type: { kind: 'scalar', scalar: 'u8' },
      description: 'Passed as flags arg to audio_engine_play.',
    },
  ],
};
