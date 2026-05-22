/**
 * Constants for the intro / title / credits sequence. Sourced from the
 * winit.ovr RE pass (commit eb2d1cc, see docs/re/startup-sequence.md and
 * docs/re/findings/startup-sequence.json).
 *
 * The credit-scroll entry table at SCROLL entries[] is byte-exact: same
 * fields, same initial values as the engine's stack-allocated array. The
 * timing constants (TITLE_HOLD_FRAMES_*, POST_SCROLL_HOLD_FRAMES) are
 * hand-tuned to feel right per-Nate's recollection — the engine's
 * busy-wait primitive uses CPU-speed-calibrated constants we can't pin
 * down statically. See "wall-clock pacing" below for the rationale.
 */

/**
 * One scroll-table entry. The "token" field is the descriptor index into
 * credits.pic — see docs/re/startup-sequence.md "credit scroll" section.
 * "col" and "y" units are engine pixels (a 320×200-ish frame).
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
 * Mirrors the on-stack array layout (entry[0..8]); see RE doc for raw bytes.
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
  { token: 6, col: 0x0e, appear: 152, fieldB: 0x50, cap: 0x50 },
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
 * Wall-clock pacing — hand-tuned, not engine-derived.
 *
 * The engine's busy-wait primitive at wroot 0x2858 takes calibration
 * constants from C-runtime startup we don't have statically. The "delay
 * unit" count is known precisely (title_wait_short = 20 units = 2 * 10,
 * title_wait_long = 720 units = 0x48 * 10) but the wall-clock per-unit
 * duration is calibrated to the original 486-DX/33 CPU and bears no
 * relationship to a modern browser frame.
 *
 * Per the user's recollection: title-page hold should be "real pause,
 * like a second or two" — long enough to feel intentional, short enough
 * to not bore. At 60 FPS, the values below give:
 *
 *   - short pause: 60 frames  = 1.0 sec   (between title PIC load + splash text draw)
 *   - long pause:  300 frames = 5.0 sec   (after splash, before scroll starts)
 *   - post-scroll: 120 frames = 2.0 sec   (after scroll finishes, before menu)
 *
 * The scroll itself is engine-driven: 126 frames at the viewer's target
 * FPS. At 60 FPS that's ~2.1 sec, which is fast — but the engine math is
 * exact, so we don't second-guess it; if the viewer wants a slower feel
 * it can step the sim at < 1 frame per RAF tick.
 */
export const TITLE_HOLD_FRAMES_SHORT = 60;
export const TITLE_HOLD_FRAMES_LONG = 300;
export const POST_SCROLL_HOLD_FRAMES = 120;
