import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { saveStateToSlot, loadStateFromSlot } from '../../src/dosbox/state.js';
import type { HelperClient, HelperResponse } from '../../src/dosbox/helper-client.js';

describe('saveStateToSlot', () => {
  it('focuses, cycles slot, sends save chord, verifies mtime advanced', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-state-test-'));
    try {
      const savePath = join(dir, '5.sav');
      writeFileSync(savePath, 'old');
      utimesSync(savePath, 0, 0);
      const fake: Partial<HelperClient> = {
        send: vi.fn(async (req): Promise<HelperResponse> => {
          if ((req as { op: string }).op === 'getFrontmost') return { ok: true, bundleId: 'com.apple.Terminal' };
          if ((req as { op: string }).op === 'findWindow') return { ok: true, windowId: 1 };
          if ((req as { op: string; keyCode?: number }).op === 'keyDown' && (req as { keyCode?: number }).keyCode === 0x60) {
            const now = Date.now() / 1000;
            utimesSync(savePath, now, now);
          }
          return { ok: true };
        }),
      };
      await saveStateToSlot(fake as HelperClient, 5, dir, { pollIntervalMs: 5, timeoutMs: 1000 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws on slot out of range', async () => {
    const fake: Partial<HelperClient> = { send: vi.fn(async () => ({ ok: true })) };
    await expect(saveStateToSlot(fake as HelperClient, 99, '/tmp')).rejects.toThrow(/slot/);
  });

  it('throws with actionable error when mtime does not advance', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-state-test-'));
    try {
      const savePath = join(dir, '5.sav');
      writeFileSync(savePath, 'x');
      utimesSync(savePath, 0, 0);
      const fake: Partial<HelperClient> = {
        send: vi.fn(async (req): Promise<HelperResponse> => {
          if ((req as { op: string }).op === 'getFrontmost') return { ok: true, bundleId: 'com.apple.Terminal' };
          if ((req as { op: string }).op === 'findWindow') return { ok: true, windowId: 1 };
          return { ok: true };
        }),
      };
      await expect(
        saveStateToSlot(fake as HelperClient, 5, dir, { pollIntervalMs: 5, timeoutMs: 50 })
      ).rejects.toThrow(/did not save state/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('loadStateFromSlot', () => {
  it('focuses, cycles slot, sends load chord', async () => {
    const calls: unknown[] = [];
    const fake: Partial<HelperClient> = {
      send: vi.fn(async (req): Promise<HelperResponse> => {
        calls.push(req);
        if ((req as { op: string }).op === 'getFrontmost') return { ok: true, bundleId: 'com.apple.Terminal' };
        if ((req as { op: string }).op === 'findWindow') return { ok: true, windowId: 1 };
        return { ok: true };
      }),
    };
    await loadStateFromSlot(fake as HelperClient, 3);
    expect(calls.some((c) => (c as { op: string }).op === 'keyDown')).toBe(true);
  });
});
