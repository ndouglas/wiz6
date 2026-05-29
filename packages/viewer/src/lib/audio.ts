import { decodeSnd, SND_SAMPLE_RATE_HZ } from '@wiz6/parser';
import { slotPlaybackRateHz as slotRateFromData } from '@wiz6/data';
import { getHouseRules } from './house-rules-store.js';

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

const MUTE_LS_KEY = 'wiz6:mute';
let muted: boolean = (() => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(MUTE_LS_KEY) === '1';
  } catch {
    return false;
  }
})();
const muteListeners = new Set<(m: boolean) => void>();

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(MUTE_LS_KEY, next ? '1' : '0');
    } catch {
      /* localStorage may be unavailable (private browsing) */
    }
  }
  for (const fn of muteListeners) fn(muted);
}

export function subscribeMuted(fn: (m: boolean) => void): () => void {
  muteListeners.add(fn);
  return () => muteListeners.delete(fn);
}

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
 * Compute the engine-correct playback rate for a sound slot. Delegates to
 * `@wiz6/data`'s SOUND_TABLE snapshot — see that file for provenance. Used
 * here to pass the correct sampleRateHz into Web Audio when loading a
 * .snd file for a known slot.
 */
export function slotPlaybackRateHz(slotN: number): number {
  return Math.round(slotRateFromData(slotN));
}

export async function loadSnd(
  url: string,
  opts: { slotN?: number; rateHzOverride?: number } = {},
): Promise<PlayableSnd | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const decoded = decodeSnd(bytes, { id: 'load', sourceFile: url });
    let sampleRateHz = SND_SAMPLE_RATE_HZ;
    if (opts.rateHzOverride !== undefined) sampleRateHz = opts.rateHzOverride;
    else if (opts.slotN !== undefined) sampleRateHz = slotPlaybackRateHz(opts.slotN);
    return { samples: decoded.samples, sampleRateHz };
  } catch {
    return null;
  }
}

export function playSnd(snd: PlayableSnd): void {
  if (muted) return;
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

// Cached SOUND00 for the invalid-action beep. Loaded lazily on first call so
// screens that don't trigger it pay no asset cost.
let cachedInvalidActionBeep: PlayableSnd | null = null;
let invalidActionBeepLoading: Promise<PlayableSnd | null> | null = null;

/**
 * Play the engine's "clack" sound (SOUND00) on a rejected character-creation
 * input. Gated by the `playInvalidActionBeep` house rule — silent no-op when
 * the rule is OFF. Also silent until the user has gestured (browser autoplay
 * policy; same as `playSnd`).
 *
 * First call kicks off a one-time lazy fetch of `/sounds/sound00.json`; the
 * actual sound plays from the second call onward (and on every call once the
 * fetch resolves). The first rejected action being silent is an acceptable
 * UX tradeoff vs. preloading on every screen.
 */
export function playInvalidActionBeep(): void {
  if (!getHouseRules().playInvalidActionBeep) return;
  if (cachedInvalidActionBeep) {
    playSnd(cachedInvalidActionBeep);
    return;
  }
  if (invalidActionBeepLoading) return; // load in flight; let it resolve
  invalidActionBeepLoading = loadSnd('/sounds/sound00.json', { slotN: 0 })
    .then((snd) => {
      cachedInvalidActionBeep = snd;
      return snd;
    })
    .catch(() => null);
}
