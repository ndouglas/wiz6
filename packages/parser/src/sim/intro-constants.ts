/**
 * Constants for the intro / title / credits sequence. Two layers:
 *
 * 1. The credit-scroll table (CREDITS_SCROLL_ENTRIES) — byte-exact from the
 *    engine, sourced from the winit.ovr RE pass (commit eb2d1cc, see
 *    docs/re/startup-sequence.md and docs/re/findings/startup-sequence.json).
 *    Same fields, same initial values as the engine's stack array.
 *
 * 2. Phase durations (PHASE_FRAMES_*) — hand-tuned to match the user's lived
 *    experience of the original game on a 486DX/33. The engine's busy-wait
 *    primitive at wroot 0x2858 uses CPU-speed-calibrated constants we can't
 *    pin down statically, and DOSBox-X playback at varying cycles=fixed
 *    settings does not faithfully reproduce the original pacing. So we
 *    target the lived feel: ~half-second black pauses, ~2-3 second splash
 *    holds, ~2 second post-scroll. Tunable from this file.
 *
 * Engine state 1 (winit_state1_title_and_credits @ winit 0x9f3) draws ONE
 * static splash between pauses; the user's recollection has TWO distinct
 * splashes (Sir-Tech, then Bradley). The discrepancy is likely accounted for
 * by additional logic in state 0's 11-way disk-header dispatch (file offset
 * 0x5EC) which we haven't mapped yet. The user's memory is the spec.
 */

/**
 * One scroll-table entry. The "token" field is the descriptor index into
 * credits.pic — see docs/re/startup-sequence.md "credit scroll" section.
 */
export interface CreditScrollEntry {
  /** Descriptor index into credits.pic. */
  token: number;
  /** Column (x) position in engine pixels. */
  col: number;
  /** Scroll position at which this entry first becomes visible. */
  appear: number;
  /** Initial Y position when entry first appears. */
  fieldB: number;
  /** Target / minimum Y position where entry comes to rest. */
  cap: number;
}

/**
 * The 9-entry table from winit.ovr at function entry of `winit_state1_title_and_credits`.
 *
 *   i | token | col  | appear | fieldB | cap
 *   --+-------+------+--------+--------+-----
 *   0 |  7    | 0x4c |   0    |  0x43  |  3
 *   1 |  8    | 0x4c |   0    |  0x63  | 0x23
 *   2 | 0xc   | 0x08 |   0    |  0x0d  | 0x0d
 *   3 |  1    | 0x14 |   4    |  0x90  | 0x0d
 *   4 |  2    | 0x14 |  36    |  0x90  | 0x0d
 *   5 |  3    | 0x14 |  60    |  0x90  | 0x0d
 *   6 |  4    | 0x14 |  88    |  0x90  | 0x0d
 *   7 |  5    | 0x14 | 120    |  0x90  | 0x0d
 *   8 |  6    | 0x0e | 152    |  0x50  | 0x50
 */
export const CREDITS_SCROLL_ENTRIES: readonly CreditScrollEntry[] = [
  { token: 7, col: 0x4c, appear: 0, fieldB: 0x43, cap: 3 },
  { token: 8, col: 0x4c, appear: 0, fieldB: 0x63, cap: 0x23 },
  { token: 0xc, col: 0x08, appear: 0, fieldB: 0x0d, cap: 0x0d },
  { token: 1, col: 0x14, appear: 4, fieldB: 0x90, cap: 0x0d },
  { token: 2, col: 0x14, appear: 36, fieldB: 0x90, cap: 0x0d },
  { token: 3, col: 0x14, appear: 60, fieldB: 0x90, cap: 0x0d },
  { token: 4, col: 0x14, appear: 88, fieldB: 0x90, cap: 0x0d },
  { token: 5, col: 0x14, appear: 120, fieldB: 0x90, cap: 0x0d },
  // Entry 8: the copyright finale. Engine table has fieldB=cap=0x50=80 which,
  // combined with the i==8 clamp, would render the copyright instantly at y=80
  // (no slide-in). User's lived recollection: the copyright slides in from
  // below like the other credit panels and locks at y=80 as the others
  // continue past. Override fieldB to 0x90=144 (matching entries 3..7) to
  // get the slide-in behavior; keep cap=0x50 as the rest position.
  { token: 6, col: 0x0e, appear: 152, fieldB: 0x90, cap: 0x50 },
];

/** scroll_pos increments by this per frame. Engine constant. */
export const SCROLL_STEP_PER_FRAME = 2;

/**
 * Scroll loop terminates when scroll_pos > this value.
 * From RE: 0x78 + 0x90 - 0x0d = 0xFB = 251 (entry[7] appear + fieldB - cap).
 * 251 / 2 = ~126 frames maximum.
 */
export const SCROLL_TERMINAL_POS = 0xfb;

/**
 * Phase durations in frames at 60 FPS. Tunable from here.
 *
 * Total pre-scroll content: ~5.5 sec (matches "feels intentional but
 * doesn't bore" target). Scroll itself is engine-driven (126 frames =
 * ~2.1 sec). Post-scroll adds a beat before navigating away.
 */
export const PHASE_FRAMES_PAUSE_PRE_SIRTECH = 30; // 0.5s
export const PHASE_FRAMES_SIRTECH_SPLASH = 120; // 2.0s
export const PHASE_FRAMES_PAUSE_BETWEEN_SPLASHES = 30; // 0.5s
export const PHASE_FRAMES_BRADLEY_SPLASH = 120; // 2.0s
export const PHASE_FRAMES_PAUSE_PRE_SCROLL = 30; // 0.5s
export const PHASE_FRAMES_POST_SCROLL = 90; // 1.5s

/**
 * RAF-ticks per scroll sim step. Engine ran scroll at ~60 Hz with scrollPos
 * += 2/frame (126 frames = ~2 seconds). At modern RAF that's too fast for
 * the credits to be readable. Stretch by stepping the sim once per N RAFs
 * during the scroll phase only — splashes and pauses still tick 1:1.
 *
 * 3 → ~6.3 seconds of scroll, enough to read each credit panel.
 */
export const SCROLL_RAF_STEP_RATIO = 3;
