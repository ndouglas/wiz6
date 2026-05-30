import { describe, it, expect, vi } from 'vitest';
import { withFocusedDosbox, DOSBOX_APP_NAME } from '../../src/dosbox/window.js';
import type { HelperClient, HelperResponse } from '../../src/dosbox/helper-client.js';

describe('withFocusedDosbox', () => {
  it('finds + focuses the DOSBox-X window, runs the body, and leaves it frontmost (no restore)', async () => {
    const calls: unknown[] = [];
    const responses: HelperResponse[] = [
      { ok: true, windowId: 7 }, // findWindow
      { ok: true },              // focusWindow
    ];
    const fake: Partial<HelperClient> = {
      send: vi.fn(async (req) => {
        calls.push(req);
        return responses.shift()!;
      }),
    };
    let bodyRan = false;
    await withFocusedDosbox(fake as HelperClient, async () => {
      bodyRan = true;
    });
    expect(bodyRan).toBe(true);
    expect(calls[0]).toEqual({ op: 'findWindow', appName: DOSBOX_APP_NAME });
    expect(calls[1]).toEqual({ op: 'focusWindow', windowId: 7 });
    // Deliberately NO getFrontmost and NO restoreFrontmost — DOSBox is left
    // frontmost so synthetic keys keep landing (and no focus flicker).
    expect(calls).toHaveLength(2);
    expect(calls.some((c) => (c as { op: string }).op === 'restoreFrontmost')).toBe(false);
  });

  it('propagates body errors without restoring focus', async () => {
    const calls: unknown[] = [];
    const responses: HelperResponse[] = [
      { ok: true, windowId: 7 },
      { ok: true },
    ];
    const fake: Partial<HelperClient> = {
      send: vi.fn(async (req) => {
        calls.push(req);
        return responses.shift() ?? { ok: true };
      }),
    };
    await expect(
      withFocusedDosbox(fake as HelperClient, async () => { throw new Error('boom'); })
    ).rejects.toThrow('boom');
    expect(calls.some((c) => (c as { op: string }).op === 'restoreFrontmost')).toBe(false);
  });

  it('throws actionable error when DOSBox window not found', async () => {
    const fake: Partial<HelperClient> = {
      send: vi.fn(async (req) => {
        if ((req as { op: string }).op === 'getFrontmost') return { ok: true, bundleId: 'com.apple.Terminal' };
        if ((req as { op: string }).op === 'findWindow') return { ok: false, error: 'no window matched' };
        return { ok: true };
      }),
    };
    await expect(withFocusedDosbox(fake as HelperClient, async () => {})).rejects.toThrow(/DOSBox-X not running/);
  });
});
