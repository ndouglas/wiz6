import { describe, it, expect } from 'vitest';
import { waitForStableFrame } from '../../src/dosbox/stable-frame.js';

const buf = (s: string) => Buffer.from(s);

describe('waitForStableFrame', () => {
  it('returns once N consecutive captures are byte-identical', async () => {
    const frames = [buf('a'), buf('b'), buf('c'), buf('c'), buf('c')];
    let i = 0;
    const capture = async () => frames[Math.min(i++, frames.length - 1)]!;
    const out = await waitForStableFrame(capture, { stableCount: 3, intervalMs: 0, timeoutMs: 1000 });
    expect(out.equals(buf('c'))).toBe(true);
  });

  it('best-effort by default: returns the last frame on timeout (animated screens never freeze)', async () => {
    let i = 0;
    const capture = async () => buf(`f${i++}`); // always different (e.g. a blinking cursor)
    const out = await waitForStableFrame(capture, { stableCount: 3, intervalMs: 0, timeoutMs: 30 });
    expect(out.toString()).toMatch(/^f\d+$/); // returned the most recent frame, did not throw
  });

  it('onTimeout:throw still throws when a frozen frame is required', async () => {
    let i = 0;
    const capture = async () => buf(String(i++)); // always different
    await expect(
      waitForStableFrame(capture, { stableCount: 3, intervalMs: 0, timeoutMs: 50, onTimeout: 'throw' }),
    ).rejects.toThrow(/stabilize/i);
  });
});
