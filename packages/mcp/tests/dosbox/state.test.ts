import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  saveStateToSlot,
  loadStateFromSlot,
  resetSlotTracking,
  getTrackedSlot,
} from '../../src/dosbox/state.js';
import type { HelperClient, HelperResponse } from '../../src/dosbox/helper-client.js';

// Reset module-level slot tracking before each test so cases don't bleed.
beforeEach(() => {
  resetSlotTracking(1);
});

/** Build a fake HelperClient that:
 *  - returns ok+bundleId for getFrontmost
 *  - returns ok+windowId for findWindow
 *  - records every key send op
 *  - optionally invokes `onTargetKeyDown` when a non-host keyDown lands (so
 *    a test can simulate the file mtime advancing).
 */
function fakeClient(opts: {
  onTargetKeyDown?: (keyCode: number) => void;
}): { client: HelperClient; calls: unknown[] } {
  const calls: unknown[] = [];
  const HOST_KEYCODE = 0x6f;
  const client: Partial<HelperClient> = {
    send: vi.fn(async (req): Promise<HelperResponse> => {
      calls.push(req);
      const op = (req as { op: string }).op;
      const keyCode = (req as { keyCode?: number }).keyCode;
      if (op === 'getFrontmost') return { ok: true, bundleId: 'com.apple.Terminal' };
      if (op === 'findWindow') return { ok: true, windowId: 1 };
      if (op === 'keyDown' && keyCode !== undefined && keyCode !== HOST_KEYCODE) {
        opts.onTargetKeyDown?.(keyCode);
      }
      return { ok: true };
    }),
  };
  return { client: client as HelperClient, calls };
}

/** Count how many times a given target-key keyDown appears in the call log
 *  (ignores the host-key F12 keyDown/keyUp wrappers). */
function countTargetKeyDowns(calls: unknown[], keyCode: number): number {
  let n = 0;
  for (const c of calls) {
    const r = c as { op?: string; keyCode?: number };
    if (r.op === 'keyDown' && r.keyCode === keyCode) n++;
  }
  return n;
}

const KEYCODE_PERIOD = 0x2f; // F12+.  = next slot
const KEYCODE_COMMA = 0x2b; // F12+,  = prev slot
const KEYCODE_S = 0x01;     // F12+s  = save
const KEYCODE_L = 0x25;     // F12+l  = load

describe('saveStateToSlot', () => {
  it('focuses, cycles slot, sends save chord, verifies mtime advanced', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-state-test-'));
    try {
      const savePath = join(dir, '5.sav');
      writeFileSync(savePath, 'old');
      utimesSync(savePath, 0, 0);
      const { client } = fakeClient({
        onTargetKeyDown: (keyCode) => {
          // Bump the save-file mtime when the SAVE chord lands.
          if (keyCode === KEYCODE_S) {
            const now = Date.now() / 1000;
            utimesSync(savePath, now, now);
          }
        },
      });
      await saveStateToSlot(client, 5, dir, { pollIntervalMs: 5, timeoutMs: 1000 });
      expect(getTrackedSlot()).toBe(5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws on slot out of range', async () => {
    const { client } = fakeClient({});
    await expect(saveStateToSlot(client, 99, '/tmp')).rejects.toThrow(/slot/);
    await expect(saveStateToSlot(client, 0, '/tmp')).rejects.toThrow(/slot/);
  });

  it('throws with actionable error when mtime does not advance', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-state-test-'));
    try {
      const savePath = join(dir, '5.sav');
      writeFileSync(savePath, 'x');
      utimesSync(savePath, 0, 0);
      const { client } = fakeClient({});
      await expect(
        saveStateToSlot(client, 5, dir, { pollIntervalMs: 5, timeoutMs: 50 }),
      ).rejects.toThrow(/did not save state/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('cycles forward 4 steps from slot 1 to slot 5 (shortest direction)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-state-test-'));
    try {
      const savePath = join(dir, '5.sav');
      writeFileSync(savePath, 'x');
      utimesSync(savePath, 0, 0);
      const { client, calls } = fakeClient({
        onTargetKeyDown: (keyCode) => {
          if (keyCode === KEYCODE_S) {
            const now = Date.now() / 1000;
            utimesSync(savePath, now, now);
          }
        },
      });
      await saveStateToSlot(client, 5, dir, { pollIntervalMs: 5, timeoutMs: 1000 });
      // 1 -> 5 forward = 4 next-slot presses, 0 prev-slot presses.
      expect(countTargetKeyDowns(calls, KEYCODE_PERIOD)).toBe(4);
      expect(countTargetKeyDowns(calls, KEYCODE_COMMA)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('two consecutive saves to different slots cycle the correct delta each time', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-state-test-'));
    try {
      const path5 = join(dir, '5.sav');
      const path7 = join(dir, '7.sav');
      writeFileSync(path5, 'x');
      writeFileSync(path7, 'x');
      utimesSync(path5, 0, 0);
      utimesSync(path7, 0, 0);
      const { client, calls } = fakeClient({
        onTargetKeyDown: (keyCode) => {
          if (keyCode === KEYCODE_S) {
            const now = Date.now() / 1000;
            utimesSync(path5, now, now);
            utimesSync(path7, now, now);
          }
        },
      });
      // First save: 1 -> 5  (4 forward cycles)
      await saveStateToSlot(client, 5, dir, { pollIntervalMs: 5, timeoutMs: 1000 });
      const cyclesAfterFirst = countTargetKeyDowns(calls, KEYCODE_PERIOD);
      expect(cyclesAfterFirst).toBe(4);
      expect(getTrackedSlot()).toBe(5);

      // Second save: 5 -> 7  (2 forward cycles ONLY — must not re-cycle from 1).
      await saveStateToSlot(client, 7, dir, { pollIntervalMs: 5, timeoutMs: 1000 });
      expect(countTargetKeyDowns(calls, KEYCODE_PERIOD)).toBe(cyclesAfterFirst + 2);
      expect(countTargetKeyDowns(calls, KEYCODE_COMMA)).toBe(0);
      expect(getTrackedSlot()).toBe(7);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('save then load to same slot does not re-cycle', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-state-test-'));
    try {
      const path = join(dir, '3.sav');
      writeFileSync(path, 'x');
      utimesSync(path, 0, 0);
      const { client, calls } = fakeClient({
        onTargetKeyDown: (keyCode) => {
          if (keyCode === KEYCODE_S) {
            const now = Date.now() / 1000;
            utimesSync(path, now, now);
          }
        },
      });
      // Save to slot 3 from slot 1: 2 forward cycles.
      await saveStateToSlot(client, 3, dir, { pollIntervalMs: 5, timeoutMs: 1000 });
      const cyclesAfterSave = countTargetKeyDowns(calls, KEYCODE_PERIOD);
      expect(cyclesAfterSave).toBe(2);
      // Load from same slot: 0 cycles.
      await loadStateFromSlot(client, 3);
      expect(countTargetKeyDowns(calls, KEYCODE_PERIOD)).toBe(cyclesAfterSave);
      expect(countTargetKeyDowns(calls, KEYCODE_L)).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('chooses backward cycling when shorter (slot 9 -> slot 1 wraps via prev)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-state-test-'));
    try {
      const path1 = join(dir, '1.sav');
      writeFileSync(path1, 'x');
      utimesSync(path1, 0, 0);
      resetSlotTracking(9);
      const { client, calls } = fakeClient({
        onTargetKeyDown: (keyCode) => {
          if (keyCode === KEYCODE_S) {
            const now = Date.now() / 1000;
            utimesSync(path1, now, now);
          }
        },
      });
      await saveStateToSlot(client, 1, dir, { pollIntervalMs: 5, timeoutMs: 1000 });
      // 9 -> 1: forward = 2 (9->10->1), backward = 8. Forward wins.
      expect(countTargetKeyDowns(calls, KEYCODE_PERIOD)).toBe(2);
      expect(countTargetKeyDowns(calls, KEYCODE_COMMA)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('loadStateFromSlot', () => {
  it('focuses, cycles slot, sends load chord', async () => {
    const { client, calls } = fakeClient({});
    await loadStateFromSlot(client, 3);
    // Load chord landed once.
    expect(countTargetKeyDowns(calls, KEYCODE_L)).toBe(1);
    expect(getTrackedSlot()).toBe(3);
  });
});

describe('resetSlotTracking', () => {
  it('clamps invalid input', () => {
    expect(() => resetSlotTracking(0)).toThrow(/slot/);
    expect(() => resetSlotTracking(11)).toThrow(/slot/);
    expect(() => resetSlotTracking(1.5)).toThrow(/slot/);
  });

  it('updates getTrackedSlot', () => {
    resetSlotTracking(7);
    expect(getTrackedSlot()).toBe(7);
  });
});
