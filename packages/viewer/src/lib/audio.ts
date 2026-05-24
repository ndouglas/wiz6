import { decodeSnd, SND_SAMPLE_RATE_HZ } from '@wiz6/parser';

/**
 * Web Audio playback for Wiz6 `.snd` files.
 *
 * Browser autoplay policy: AudioContext can't actually produce sound until
 * the user has interacted with the page. We create the context lazily on
 * the first user gesture (keydown / pointerdown anywhere) and route all
 * playback through it. Until that gesture happens, `playSnd()` is a silent
 * no-op — fine for the intro (clang plays only if the user has gestured).
 */

let audioContext: AudioContext | null = null;
let userHasGestured = false;

function maybeInitContext(): AudioContext | null {
  if (!userHasGestured) return null;
  if (audioContext) return audioContext;
  const Ctx: typeof AudioContext | undefined =
    typeof window === 'undefined'
      ? undefined
      : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  audioContext = new Ctx();
  return audioContext;
}

export function installAudioUnlockListener(): () => void {
  if (typeof window === 'undefined') return () => {};
  const onGesture = () => {
    userHasGestured = true;
    const ctx = maybeInitContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  };
  window.addEventListener('keydown', onGesture, { once: true });
  window.addEventListener('pointerdown', onGesture, { once: true });
  return () => {
    window.removeEventListener('keydown', onGesture);
    window.removeEventListener('pointerdown', onGesture);
  };
}

export interface PlayableSnd {
  samples: number[];
  sampleRateHz: number;
}

/**
 * Per-slot playback rates derived from a wroot-loaded save state's sound
 * table at DGROUP 0x3344. The engine's runtime sound table stores a
 * `duration` field per slot which acts as the PIT counter divisor for that
 * sound's playback (verified empirically against user's by-ear comparison
 * — slot 13 `duration=0xBE` plays at ~6280 Hz, much slower than the
 * default 10026 Hz, explaining "SOUND13 sounds too brief and too high-
 * pitched" at the global default rate).
 *
 * PIT clock frequency = 1.193182 MHz; playback rate = PIT_CLOCK / duration.
 *
 * Only slots whose rates differ meaningfully from the global default are
 * overridden here. Other slots fall back to SND_SAMPLE_RATE_HZ.
 */
export const PIT_CLOCK_HZ = 1_193_182;

/** Per-slot duration values, extracted from sound-table memory in a live save. */
const SLOT_DURATIONS: Record<number, number> = {
  4: 0x7e, // door click — default-ish
  5: 0xa2, // "pow" — slower than default
  6: 0x7e, // whoosh — default-ish
  7: 0x7e, // clang — default-ish
  13: 0xbe, // bradley credit — significantly slower
};

/** Compute playback rate for a sound slot. Falls back to default if unknown. */
export function slotPlaybackRateHz(slotN: number): number {
  const d = SLOT_DURATIONS[slotN];
  if (d === undefined) return SND_SAMPLE_RATE_HZ;
  return Math.round(PIT_CLOCK_HZ / d);
}

export async function loadSnd(
  url: string,
  opts: { slotN?: number } = {},
): Promise<PlayableSnd | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const decoded = decodeSnd(bytes, { id: 'load', sourceFile: url });
    const sampleRateHz =
      opts.slotN !== undefined ? slotPlaybackRateHz(opts.slotN) : SND_SAMPLE_RATE_HZ;
    return { samples: decoded.samples, sampleRateHz };
  } catch {
    return null;
  }
}

export function playSnd(snd: PlayableSnd): void {
  const ctx = maybeInitContext();
  if (!ctx) return;
  const float = new Float32Array(snd.samples.length);
  for (let i = 0; i < snd.samples.length; i++) {
    float[i] = (snd.samples[i]! - 128) / 128;
  }
  const buffer = ctx.createBuffer(1, float.length, snd.sampleRateHz);
  buffer.copyToChannel(float, 0);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
}

export function isAudioReady(): boolean {
  if (!userHasGestured) return false;
  const ctx = maybeInitContext();
  return ctx?.state === 'running';
}
