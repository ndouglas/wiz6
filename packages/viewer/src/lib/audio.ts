import { decodeSnd, sndSampleRateHz } from '@wiz6/parser';

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

/**
 * Install a one-shot listener that marks the audio system as unlocked on
 * the next user gesture anywhere on the page. Call once at module init.
 */
export function installAudioUnlockListener(): () => void {
  if (typeof window === 'undefined') return () => {};
  const onGesture = () => {
    userHasGestured = true;
    // Touch the context so future playback works without latency.
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

/** Marker for a decoded SND ready for Web Audio playback. */
export interface PlayableSnd {
  samples: number[];
  sampleRateHz: number;
}

/**
 * Fetch a `.snd` file from the viewer's public dir, decode it, and return
 * a playable representation. Returns null on fetch/decode failure rather
 * than throwing — callers should treat missing audio as silent.
 */
export async function loadSnd(url: string): Promise<PlayableSnd | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const decoded = decodeSnd(bytes, { id: 'load', sourceFile: url });
    return {
      samples: decoded.samples,
      sampleRateHz: sndSampleRateHz(decoded.rateDivisor),
    };
  } catch {
    return null;
  }
}

/**
 * Play a decoded sound. Silent no-op if the user hasn't gestured yet or
 * if Web Audio isn't available.
 */
export function playSnd(snd: PlayableSnd): void {
  const ctx = maybeInitContext();
  if (!ctx) return;
  const float = new Float32Array(snd.samples.length);
  for (let i = 0; i < snd.samples.length; i++) {
    // 8-bit unsigned PCM (silence = 128) → -1..1 float.
    float[i] = (snd.samples[i]! - 128) / 128;
  }
  const buffer = ctx.createBuffer(1, float.length, snd.sampleRateHz);
  buffer.copyToChannel(float, 0);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
}

/** True iff the user has gestured + an AudioContext is available + running. */
export function isAudioReady(): boolean {
  if (!userHasGestured) return false;
  const ctx = maybeInitContext();
  return ctx?.state === 'running';
}
