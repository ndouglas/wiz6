/**
 * Engine sound-table runtime state.
 *
 * The Wiz6 engine keeps a 14-slot sound dispatch table at DGROUP 0x3344
 * (12 bytes per slot). Each slot tells `audio_play_sound(N)` which buffer
 * to play, at what rate, and at what volume. The values are populated at
 * boot by `winit_preload_sounds` from per-record fields in MASTER.HDR.
 *
 * This file ships a SNAPSHOT of those values taken from a wroot-loaded
 * save state via the DOSBox-X MCP server's `dosbox_read_memory` on
 * 2026-05-24. Knowing them is what lets the viewer play each `.snd` at
 * the engine's actual rate rather than the global default 10026 Hz — see
 * `packages/viewer/src/lib/audio.ts` for the wiring.
 *
 * If a future build of the engine changes any of these, dump again via
 * the MCP and update this file.
 */

/** PIT input clock frequency. Wiz6's per-slot `duration` field divides it. */
export const PIT_CLOCK_HZ = 1_193_182;

export interface SoundTableSlot {
  /** Slot index 0..13 (engine-side). */
  n: number;
  /** Fallback slot index if buf_lo == buf_hi == 0 (otherwise unused). */
  alias_id: number;
  /** Low-half buffer pointer. 0 indicates aliased slot. */
  buf_lo: number;
  /** High-half buffer pointer. */
  buf_hi: number;
  /** PIT counter divisor — sets the playback sample rate. */
  duration: number;
  /** Volume index, possibly modified by music-mode flag at *0x3590. */
  rate_or_vol: number;
  /** Per-slot flags. Meaning not fully decoded. */
  flags: number;
}

/**
 * Sound table as captured from in-dungeon save state (party = THESUS etc.,
 * game_state = 5). Verified slot 13 plays SOUND13.SND at rate 6280 Hz
 * (PIT_CLOCK_HZ / 0xBE), explaining the user-reported "too brief and too
 * high-pitched" perception at the default rate.
 */
export const SOUND_TABLE: readonly SoundTableSlot[] = [
  { n: 0,  alias_id: 0, buf_lo: 0x516, buf_hi: 0, duration: 0x7e, rate_or_vol: 0x49, flags: 1 },
  { n: 1,  alias_id: 0, buf_lo: 0x000, buf_hi: 0, duration: 0x7e, rate_or_vol: 0x49, flags: 1 }, // empty
  { n: 2,  alias_id: 0, buf_lo: 0x7da, buf_hi: 0, duration: 0x56, rate_or_vol: 0x49, flags: 0 },
  { n: 3,  alias_id: 0, buf_lo: 0x15bc, buf_hi: 0, duration: 0x56, rate_or_vol: 0x49, flags: 1 },
  { n: 4,  alias_id: 0, buf_lo: 0x154, buf_hi: 0, duration: 0x56, rate_or_vol: 0x49, flags: 1 },
  { n: 5,  alias_id: 0, buf_lo: 0xc90, buf_hi: 0, duration: 0xa2, rate_or_vol: 0x52, flags: 0 },
  { n: 6,  alias_id: 0, buf_lo: 0x5ce, buf_hi: 0, duration: 0x7e, rate_or_vol: 0x49, flags: 1 },
  { n: 7,  alias_id: 0, buf_lo: 0x889, buf_hi: 0, duration: 0x7e, rate_or_vol: 0x34, flags: 1 },
  { n: 8,  alias_id: 0, buf_lo: 0xd39, buf_hi: 0, duration: 0x56, rate_or_vol: 0x49, flags: 0 },
  { n: 9,  alias_id: 8, buf_lo: 0x000, buf_hi: 0, duration: 0x00, rate_or_vol: 0x49, flags: 0 }, // aliased → 8
  { n: 10, alias_id: 0, buf_lo: 0x4bd, buf_hi: 0, duration: 0x94, rate_or_vol: 0x52, flags: 2 },
  { n: 11, alias_id: 0, buf_lo: 0x4a0, buf_hi: 0, duration: 0x7e, rate_or_vol: 0x30, flags: 2 },
  { n: 12, alias_id: 0, buf_lo: 0x406, buf_hi: 0, duration: 0x7e, rate_or_vol: 0x14, flags: 2 },
  { n: 13, alias_id: 0, buf_lo: 0x6b0, buf_hi: 0, duration: 0xbe, rate_or_vol: 0x3c, flags: 1 },
  { n: 14, alias_id: 5, buf_lo: 0xc90, buf_hi: 0, duration: 0xa2, rate_or_vol: 0x52, flags: 1 }, // shares buffer with slot 5
];

/** Engine playback rate (Hz) for a given slot. */
export function slotPlaybackRateHz(slotN: number): number {
  const slot = SOUND_TABLE.find((s) => s.n === slotN);
  if (!slot || slot.duration === 0) return PIT_CLOCK_HZ / 0x7e; // default ≈ 9469 Hz
  return PIT_CLOCK_HZ / slot.duration;
}

/** Returns true if slot N redirects to another slot via alias_id. */
export function slotIsAliased(slotN: number): boolean {
  const slot = SOUND_TABLE.find((s) => s.n === slotN);
  if (!slot) return false;
  return slot.buf_lo === 0 && slot.buf_hi === 0 && slot.alias_id !== 0;
}

/**
 * If slot N is aliased, returns the effective slot. Note that slot 14's
 * alias_id=5 doesn't trigger aliasing because its buf_lo/buf_hi are
 * non-zero (it shares slot 5's buffer pointer directly).
 */
export function resolveSlot(slotN: number): number {
  if (slotIsAliased(slotN)) {
    const slot = SOUND_TABLE.find((s) => s.n === slotN);
    return slot ? slot.alias_id : slotN;
  }
  return slotN;
}
