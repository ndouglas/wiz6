/**
 * Pure state machine for the Wizardry VI startup / title / credits sequence.
 *
 * Mirrors winit.ovr state 1 (`winit_state1_title_and_credits` @ file 0x9f3),
 * documented in docs/re/startup-sequence.md.
 *
 * Frame model: the engine's scroll advances `scroll_pos += 2` per frame
 * until it exceeds 251. We mirror that exactly — `scrollPos` increments by
 * `SCROLL_STEP_PER_FRAME` each call to `stepIntro(state, frames=1)`. The
 * wall-clock duration of "one frame" is a UI concern (RAF loop in the viewer
 * picks a target FPS); the state machine itself is frame-counter-driven.
 *
 * The pre-scroll title display + the post-scroll wait are stored as frame
 * budgets (`titleHoldFramesRemaining`, etc.) rather than continuous time so
 * the same step() function drives every phase. Skip semantics (ENTER during
 * a pause, any key/mouse during the scroll) mirror the engine.
 */

import {
  CREDITS_SCROLL_ENTRIES,
  SCROLL_STEP_PER_FRAME,
  SCROLL_TERMINAL_POS,
  TITLE_HOLD_FRAMES_LONG,
  TITLE_HOLD_FRAMES_SHORT,
  POST_SCROLL_HOLD_FRAMES,
  type CreditScrollEntry,
} from './intro-constants.js';

export type IntroPhase =
  | 'splash-pause-short' // brief pause after title PIC loads
  | 'splash-display' // static text tokens shown (e.g., Sir-Tech splash)
  | 'splash-pause-long' // longer pause before scroll starts
  | 'scroll' // credits panels slide up
  | 'post-scroll' // final pause / "press any key" wait
  | 'done'; // hand off to next state

export interface IntroInputs {
  /** True on frames where ENTER was pressed (during pauses) or any key/mouse moved (during scroll). */
  skipPressed?: boolean;
}

export interface IntroState {
  phase: IntroPhase;
  /** Total frames elapsed since the sequence started — useful for the renderer + parity diagnostics. */
  frame: number;
  /** Scroll position in engine units. Increments by SCROLL_STEP_PER_FRAME (=2) per frame during the scroll phase. */
  scrollPos: number;
  /** Remaining frames in the current pause phase (counted down by step). */
  holdFramesRemaining: number;
  /** Latched once an input was observed mid-pause: skips later pauses + scroll. Mirrors the engine's `skip` flag. */
  skipLatch: boolean;
}

export function initialIntroState(): IntroState {
  return {
    phase: 'splash-pause-short',
    frame: 0,
    scrollPos: 0,
    holdFramesRemaining: TITLE_HOLD_FRAMES_SHORT,
    skipLatch: false,
  };
}

/**
 * Advance the state by `frames` frames. Default 1 frame per call (designed
 * to be driven by requestAnimationFrame at the viewer's target FPS).
 */
export function stepIntro(
  state: IntroState,
  frames: number = 1,
  inputs: IntroInputs = {},
): IntroState {
  if (frames <= 0 || state.phase === 'done') return state;

  let next: IntroState = { ...state, frame: state.frame + frames };
  const skip = inputs.skipPressed === true;

  // Latch skip across phases: once observed during a pause, fast-forward.
  if (skip && (next.phase === 'splash-pause-short' || next.phase === 'splash-pause-long')) {
    next.skipLatch = true;
    next.holdFramesRemaining = 0;
  }

  switch (next.phase) {
    case 'splash-pause-short':
      next.holdFramesRemaining = Math.max(0, next.holdFramesRemaining - frames);
      if (next.holdFramesRemaining === 0) {
        // After short pause, draw the static splash text + start the long pause.
        next.phase = 'splash-display';
        next.holdFramesRemaining = next.skipLatch ? 0 : TITLE_HOLD_FRAMES_LONG;
      }
      break;

    case 'splash-display':
      // splash-display is the same phase as splash-pause-long conceptually,
      // but we keep them separate so the renderer can react to entry once.
      next.phase = 'splash-pause-long';
      break;

    case 'splash-pause-long':
      next.holdFramesRemaining = Math.max(0, next.holdFramesRemaining - frames);
      if (next.holdFramesRemaining === 0) {
        next.phase = 'scroll';
        // If skip latched mid-pauses, the engine starts the scroll with
        // continue_flag=0 — i.e. the scroll loop body runs 0 times and we
        // fall straight through to post-scroll.
        next.scrollPos = next.skipLatch ? SCROLL_TERMINAL_POS + 1 : 0;
      }
      break;

    case 'scroll': {
      if (skip) {
        // Mouse / any key during scroll terminates it immediately.
        next.scrollPos = SCROLL_TERMINAL_POS + 1;
      } else {
        next.scrollPos += SCROLL_STEP_PER_FRAME * frames;
      }
      if (next.scrollPos > SCROLL_TERMINAL_POS) {
        next.phase = 'post-scroll';
        next.holdFramesRemaining = POST_SCROLL_HOLD_FRAMES;
      }
      break;
    }

    case 'post-scroll':
      if (skip) {
        next.holdFramesRemaining = 0;
      } else {
        next.holdFramesRemaining = Math.max(0, next.holdFramesRemaining - frames);
      }
      if (next.holdFramesRemaining === 0) {
        next.phase = 'done';
      }
      break;

    case 'done':
      break;
  }

  return next;
}

/**
 * Information the renderer needs to draw one frame of the scroll phase.
 * For each entry that's currently visible, returns its descriptor index + screen
 * position. Mirrors the engine's per-frame loop body in winit.ovr at 0xc86..0xd6d.
 */
export interface VisibleEntry {
  /** Index into CREDITS_SCROLL_ENTRIES. */
  entryIndex: number;
  /** credits.pic descriptor to render. */
  descriptorIndex: number;
  /** Column position (engine units; renderer scales as needed). */
  col: number;
  /** Y position this frame (engine units; renderer scales as needed). */
  y: number;
}

/**
 * Compute the list of visible scroll entries at the current frame.
 *
 * Per-frame formula from RE (winit.ovr 0xc86..0xcfb). The agent's pseudocode
 * had `???` on the per-entry visibility comparator — taken literally
 * (`if (y > cap) continue`) it hides every entry on frame 0, which contradicts
 * the engine's intent of rendering entries from their appear-tick forward.
 *
 * Interpretation used here: entries become visible once `scroll_pos >= appear`,
 * slide up from `fieldB` toward `cap` (Y decreases), entries 3..7 clamp at
 * `cap` (resting on screen), unclamped entries (i = 0, 1, 2, 8) keep sliding
 * past `cap` and disappear once they've gone off the top of the screen (y < 0).
 *
 * Returned in render order (i=8 down to i=0), so earlier returned items are
 * drawn first (engine draws back-to-front).
 *
 * TODO: re-verify the off-screen condition once we have a DOSBox trace of an
 * unskipped scroll. Until then, `y < 0` is a reasonable approximation that
 * matches the observable engine behavior described by the user.
 */
export function visibleScrollEntries(scrollPos: number): VisibleEntry[] {
  const out: VisibleEntry[] = [];
  for (let i = CREDITS_SCROLL_ENTRIES.length - 1; i >= 0; i--) {
    const e: CreditScrollEntry = CREDITS_SCROLL_ENTRIES[i]!;
    if (e.appear > scrollPos) continue;
    const delta = scrollPos - e.appear;
    let y = e.fieldB - delta;
    const isClamped = i >= 3 && i !== 8;
    if (isClamped && y < e.cap) y = e.cap;
    if (y < 0) continue;
    out.push({ entryIndex: i, descriptorIndex: e.token, col: e.col, y });
  }
  return out;
}

export { CREDITS_SCROLL_ENTRIES, SCROLL_STEP_PER_FRAME, SCROLL_TERMINAL_POS } from './intro-constants.js';
