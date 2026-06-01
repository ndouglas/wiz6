/**
 * waitForStableFrame — poll a capture fn until N consecutive frames are
 * byte-identical (transition settled). Best-effort by default: on timeout it
 * RETURNS the last frame rather than throwing, because many engine screens have
 * persistent animation (a blinking name-input cursor, the castle fountain) that
 * never produces N identical frames — but the transition itself has completed
 * well before the timeout, so proceeding is correct. Pass onTimeout:'throw' when
 * you genuinely require a frozen frame.
 *
 * The stability logic is decoupled from DOSBox so it's unit-testable; callers
 * pass a capturer wrapping captureScreenshot(client, capturesDir).
 */
export interface StableFrameOptions {
  /** Consecutive identical captures required (default 3). */
  stableCount?: number;
  /** Delay between captures, ms (default 120). */
  intervalMs?: number;
  /** Give up after this long, ms (default 8000). */
  timeoutMs?: number;
  /** On timeout: 'return' the last frame (best-effort, default) or 'throw'. */
  onTimeout?: 'return' | 'throw';
}

export async function waitForStableFrame(
  capture: () => Promise<Buffer>,
  opts: StableFrameOptions = {},
): Promise<Buffer> {
  const stableCount = opts.stableCount ?? 3;
  const intervalMs = opts.intervalMs ?? 120;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const onTimeout = opts.onTimeout ?? 'return';
  const deadline = Date.now() + timeoutMs;

  let last = await capture();
  let run = 1;
  while (run < stableCount) {
    if (Date.now() > deadline) {
      if (onTimeout === 'throw') {
        throw new Error(`waitForStableFrame: frame did not stabilize within ${timeoutMs}ms`);
      }
      return last; // best-effort: transition is done; residual change is animation
    }
    if (intervalMs > 0) await new Promise((r) => setTimeout(r, intervalMs));
    const next = await capture();
    run = next.equals(last) ? run + 1 : 1;
    last = next;
  }
  return last;
}
