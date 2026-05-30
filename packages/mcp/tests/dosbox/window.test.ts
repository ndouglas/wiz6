import { describe, it, expect, vi } from 'vitest';
import { withFocusedDosbox, DOSBOX_APP_NAME } from '../../src/dosbox/window.js';
import type { HelperClient, HelperResponse } from '../../src/dosbox/helper-client.js';

describe('withFocusedDosbox', () => {
  it('finds + focuses the DOSBox-X window, runs the body, then restores prior focus', async () => {
    const calls: unknown[] = [];
    const responses: HelperResponse[] = [
      { ok: true, bundleId: 'com.apple.Terminal' },
      { ok: true, windowId: 7 },
      { ok: true },
      { ok: true },
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
    expect(calls[0]).toEqual({ op: 'getFrontmost' });
    expect(calls[1]).toEqual({ op: 'findWindow', appName: DOSBOX_APP_NAME });
    expect(calls[2]).toEqual({ op: 'focusWindow', windowId: 7 });
    expect(calls[3]).toEqual({ op: 'restoreFrontmost', bundleId: 'com.apple.Terminal' });
  });

  it('restores prior focus even if body throws', async () => {
    const calls: unknown[] = [];
    const responses: HelperResponse[] = [
      { ok: true, bundleId: 'com.apple.Terminal' },
      { ok: true, windowId: 7 },
      { ok: true },
      { ok: true },
    ];
    const fake: Partial<HelperClient> = {
      send: vi.fn(async (req) => {
        calls.push(req);
        return responses.shift()!;
      }),
    };
    await expect(
      withFocusedDosbox(fake as HelperClient, async () => { throw new Error('boom'); })
    ).rejects.toThrow('boom');
    expect(calls[calls.length - 1]).toEqual({
      op: 'restoreFrontmost',
      bundleId: 'com.apple.Terminal',
    });
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
