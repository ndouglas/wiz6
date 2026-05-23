/**
 * Pure state machine for the Wizardry VI startup / title / credits sequence.
 *
 * Structure follows the user's lived recollection of the original on a
 * 486DX/33: black pause → Sir-Tech splash (dragon above wordmark) → black
 * → Bradley splash ("a Fantasy Role-Playing Simulation by / D.M. Bradley")
 * → black → title page with scrolling credits → done.
 *
 * The scroll-phase math mirrors winit.ovr (entries[], scroll_pos += 2/frame
 * up to 251). See intro-constants.ts for the engine-derived constants.
 * Pause durations are hand-tuned to feel right; the engine's busy-wait
 * calibration constants are not recoverable statically and DOSBox-X
 * playback drifts under cycles=fixed.
 *
 * Skip semantics: any input during a pause or splash latches a skip flag
 * that fast-forwards through remaining pre-scroll content; any input during
 * the scroll terminates it immediately.
 */

import {
  CREDITS_SCROLL_ENTRIES,
  PHASE_FRAMES_BRADLEY_SPLASH,
  PHASE_FRAMES_PAUSE_BETWEEN_SPLASHES,
  PHASE_FRAMES_PAUSE_PRE_SCROLL,
  PHASE_FRAMES_PAUSE_PRE_SIRTECH,
  PHASE_FRAMES_POST_SCROLL,
  PHASE_FRAMES_SIRTECH_SPLASH,
  PHASE_FRAMES_TITLE_HOLD,
  SCROLL_STEP_PER_FRAME,
  SCROLL_TERMINAL_POS,
  type CreditScrollEntry,
} from './intro-constants.js';

export type IntroPhase =
  | 'pause-pre-sirtech' // black, before anything appears
  | 'sirtech-splash' // dragon + Sir-Tech wordmark on black
  | 'pause-between' // black between the two splashes
  | 'bradley-splash' // "Fantasy R-P Sim by" + Bradley signature on black
  | 'pause-pre-scroll' // black before titlepag loads
  | 'title-hold' // titlepag + Wizardry wordmark visible; no scroll yet
  | 'scroll' // titlepag background + credits sliding up
  | 'post-scroll' // final frame held briefly
  | 'done'; // navigate to /castle

const PHASE_ORDER: readonly IntroPhase[] = [
  'pause-pre-sirtech',
  'sirtech-splash',
  'pause-between',
  'bradley-splash',
  'pause-pre-scroll',
  'title-hold',
  'scroll',
  'post-scroll',
  'done',
];

const PHASE_DURATION_FRAMES: Record<Exclude<IntroPhase, 'scroll' | 'done'>, number> = {
  'pause-pre-sirtech': PHASE_FRAMES_PAUSE_PRE_SIRTECH,
  'sirtech-splash': PHASE_FRAMES_SIRTECH_SPLASH,
  'pause-between': PHASE_FRAMES_PAUSE_BETWEEN_SPLASHES,
  'bradley-splash': PHASE_FRAMES_BRADLEY_SPLASH,
  'pause-pre-scroll': PHASE_FRAMES_PAUSE_PRE_SCROLL,
  'title-hold': PHASE_FRAMES_TITLE_HOLD,
  'post-scroll': PHASE_FRAMES_POST_SCROLL,
};

export interface IntroInputs {
  /** True on frames where the user pressed a key or clicked. */
  skipPressed?: boolean;
}

export interface IntroState {
  phase: IntroPhase;
  /** Total frames elapsed since sequence start. */
  frame: number;
  /** Scroll position in engine units; only meaningful during 'scroll'. */
  scrollPos: number;
  /** Frames remaining in the current fixed-duration phase (counted down by step). Ignored for 'scroll' / 'done'. */
  holdFramesRemaining: number;
  /** Once latched, fast-forwards through remaining pre-scroll phases. */
  skipLatch: boolean;
}

function nextPhase(phase: IntroPhase): IntroPhase {
  const idx = PHASE_ORDER.indexOf(phase);
  return PHASE_ORDER[idx + 1] ?? 'done';
}

function durationOf(phase: IntroPhase): number {
  if (phase === 'scroll' || phase === 'done') return 0;
  return PHASE_DURATION_FRAMES[phase];
}

export function initialIntroState(): IntroState {
  return {
    phase: 'pause-pre-sirtech',
    frame: 0,
    scrollPos: 0,
    holdFramesRemaining: PHASE_FRAMES_PAUSE_PRE_SIRTECH,
    skipLatch: false,
  };
}

/**
 * Advance the state by `frames` frames (default 1, designed for one RAF tick).
 * Skip-on-input rules:
 *   - During pre-scroll phases: latches skipLatch, drops current hold to 0.
 *   - During scroll: terminates immediately (scrollPos jumps past terminal).
 *   - During post-scroll: drops hold to 0.
 *   - After 'done': no-op.
 */
export function stepIntro(
  state: IntroState,
  frames: number = 1,
  inputs: IntroInputs = {},
): IntroState {
  if (frames <= 0 || state.phase === 'done') return state;

  const next: IntroState = { ...state, frame: state.frame + frames };
  const skip = inputs.skipPressed === true;

  if (skip) {
    if (next.phase === 'scroll') {
      next.scrollPos = SCROLL_TERMINAL_POS + 1;
    } else if (next.phase === 'post-scroll') {
      next.holdFramesRemaining = 0;
    } else {
      // Pre-scroll phase — fast-forward through what's left.
      next.skipLatch = true;
      next.holdFramesRemaining = 0;
    }
  }

  if (next.phase === 'scroll') {
    next.scrollPos += SCROLL_STEP_PER_FRAME * frames;
    if (next.scrollPos > SCROLL_TERMINAL_POS) {
      next.phase = 'post-scroll';
      next.holdFramesRemaining = durationOf('post-scroll');
    }
    return next;
  }

  // Fixed-duration phase: count down hold, advance when zero.
  next.holdFramesRemaining = Math.max(0, next.holdFramesRemaining - frames);
  if (next.holdFramesRemaining === 0) {
    const np = nextPhase(next.phase);
    next.phase = np;
    if (np === 'scroll') {
      // If skip latched during pre-scroll, fast-forward past the scroll too.
      next.scrollPos = next.skipLatch ? SCROLL_TERMINAL_POS + 1 : 0;
    } else if (np !== 'done') {
      // If skip latched, drop each subsequent hold to 0 so we cascade quickly.
      next.holdFramesRemaining = next.skipLatch ? 0 : durationOf(np);
    }
  }
  return next;
}

/** Information the renderer needs per visible entry during the scroll phase. */
export interface VisibleEntry {
  entryIndex: number;
  descriptorIndex: number;
  col: number;
  y: number;
}

/**
 * Compute the list of visible scroll entries at the current scroll position.
 * Returned in back-to-front order (i=8 first), matching the engine's draw order.
 *
 * Empirical interpretation of the engine's scroll loop (winit.ovr 0xc86..0xd6d),
 * verified against the user's lived recollection of the original game:
 *
 *   - Engine tokens are 1-indexed into credits.pic descriptors. So token N
 *     means descriptor (N-1). (Entry 0's token=7 → desc 6 = Wizardry logo top;
 *     entry 1's token=8 → desc 7 = Wizardry logo bottom; entries 3..8 map to
 *     descriptors 0..5 — the six credit panels and copyright notice.)
 *
 *   - Hidden if entry.appear > scroll_pos.
 *
 *   - y = entry.fieldB - (scroll_pos - entry.appear).
 *
 *   - Entries 0/1/2 CLAMP at cap (Wizardry logo top, Wizardry logo bottom,
 *     and a header decoration — all persistent at the top of the credit window).
 *
 *   - Entries 3..8 are UNCLAMPED: they slide from fieldB through cap and exit
 *     off the top of the credit window. Culled when y < 0.
 *
 * This differs from the RE agent's literal pseudocode (clamp on i>=3 && i!=8,
 * cull on y > cap), which the agent flagged as uncertain — the comparator at
 * winit.ovr 0xCFB was marked `???`. The rules above are what actually produces
 * the user-described visual: Wiz logo persists at top, credit panels scroll
 * up underneath. To be re-verified with a DOSBox trace.
 */
export function visibleScrollEntries(scrollPos: number): VisibleEntry[] {
  const out: VisibleEntry[] = [];
  for (let i = CREDITS_SCROLL_ENTRIES.length - 1; i >= 0; i--) {
    const e: CreditScrollEntry = CREDITS_SCROLL_ENTRIES[i]!;
    if (e.appear > scrollPos) continue;
    const delta = scrollPos - e.appear;
    let y = e.fieldB - delta;
    // Clamped entries (Wizardry logo top/bottom, header decoration, and the
    // final copyright finale) rest at cap and stay there.
    const isClamped = i < 3 || i === 8;
    if (isClamped) {
      if (y < e.cap) y = e.cap;
    } else {
      // Unclamped entries (credit panels) hide once they've slid past cap —
      // they disappear behind the logo area rather than peek out above it.
      if (y < e.cap) continue;
    }
    out.push({ entryIndex: i, descriptorIndex: e.token - 1, col: e.col, y });
  }
  return out;
}

export {
  CREDITS_SCROLL_ENTRIES,
  SCROLL_STEP_PER_FRAME,
  SCROLL_TERMINAL_POS,
} from './intro-constants.js';
