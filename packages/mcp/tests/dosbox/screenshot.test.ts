import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findNewestPngSince, captureScreenshot } from '../../src/dosbox/screenshot.js';
import type { HelperClient, HelperResponse } from '../../src/dosbox/helper-client.js';

describe('findNewestPngSince', () => {
  it('returns the newest .png with mtime > since', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-screenshot-test-'));
    try {
      const older = join(dir, 'a.png');
      const newer = join(dir, 'b.png');
      writeFileSync(older, 'old');
      writeFileSync(newer, 'new');
      const now = Date.now() / 1000;
      utimesSync(older, now - 100, now - 100);
      utimesSync(newer, now, now);
      const sinceMs = (now - 50) * 1000;
      expect(findNewestPngSince(dir, sinceMs)).toBe(newer);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns null when no .png is newer than `since`', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-screenshot-test-'));
    try {
      const f = join(dir, 'a.png');
      writeFileSync(f, 'x');
      utimesSync(f, 0, 0);
      expect(findNewestPngSince(dir, Date.now())).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('captureScreenshot', () => {
  it('focuses DOSBox, sends F12+P, returns the newest PNG bytes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-screenshot-test-'));
    try {
      const fake: Partial<HelperClient> = {
        send: vi.fn(async (req): Promise<HelperResponse> => {
          if ((req as { op: string }).op === 'getFrontmost') return { ok: true, bundleId: 'com.apple.Terminal' };
          if ((req as { op: string }).op === 'findWindow') return { ok: true, windowId: 1 };
          // Simulate DOSBox writing a PNG when the host-key chord lands the
          // P keyDown (keyCode 0x23). The first keyDown is F12 (host), the
          // second is the target P — match on the latter.
          if ((req as { op: string; keyCode?: number }).op === 'keyDown' && (req as { keyCode?: number }).keyCode === 0x23) {
            const png = join(dir, 'snap.png');
            writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
          }
          return { ok: true };
        }),
      };
      const bytes = await captureScreenshot(fake as HelperClient, dir, { pollIntervalMs: 5, timeoutMs: 1000 });
      expect(bytes).toBeInstanceOf(Buffer);
      expect(bytes.slice(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('times out with actionable error when no PNG appears', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-screenshot-test-'));
    try {
      const fake: Partial<HelperClient> = {
        send: vi.fn(async (req): Promise<HelperResponse> => {
          if ((req as { op: string }).op === 'getFrontmost') return { ok: true, bundleId: 'com.apple.Terminal' };
          if ((req as { op: string }).op === 'findWindow') return { ok: true, windowId: 1 };
          return { ok: true };
        }),
      };
      await expect(
        captureScreenshot(fake as HelperClient, dir, { pollIntervalMs: 5, timeoutMs: 50 })
      ).rejects.toThrow(/DOSBox-X did not write a screenshot/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
