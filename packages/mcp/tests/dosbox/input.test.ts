import { describe, it, expect, vi } from 'vitest';
import { resolveKey, parseMacro, sendKey, sendMacro } from '../../src/dosbox/input.js';
import type { HelperClient, HelperResponse } from '../../src/dosbox/helper-client.js';

describe('resolveKey', () => {
  it('maps "Enter" to keyCode 36 with no flags', () => {
    expect(resolveKey('Enter')).toEqual({ keyCode: 0x24, flags: 0, hostHeld: false });
  });

  it('maps "ArrowDown" to keyCode 125', () => {
    expect(resolveKey('ArrowDown')).toEqual({ keyCode: 0x7d, flags: 0, hostHeld: false });
  });

  it('maps lowercase "a" to keyCode 0 no shift', () => {
    expect(resolveKey('a')).toEqual({ keyCode: 0x00, flags: 0, hostHeld: false });
  });

  it('maps uppercase "A" to keyCode 0 with shift', () => {
    expect(resolveKey('A')).toEqual({ keyCode: 0x00, flags: 0x00020000, hostHeld: false });
  });

  it('parses "Ctrl+F5" with control modifier', () => {
    expect(resolveKey('Ctrl+F5')).toEqual({ keyCode: 0x60, flags: 0x00040000, hostHeld: false });
  });

  it('parses "Alt+F5" with option modifier', () => {
    expect(resolveKey('Alt+F5')).toEqual({ keyCode: 0x60, flags: 0x00080000, hostHeld: false });
  });

  it('flags hostHeld for "F12+S" (DOSBox-X host-key chord on macOS)', () => {
    expect(resolveKey('F12+S')).toEqual({ keyCode: 0x01, flags: 0x00020000, hostHeld: true });
  });

  it('flags hostHeld for the explicit "Host+L" alias', () => {
    expect(resolveKey('Host+L')).toEqual({ keyCode: 0x25, flags: 0x00020000, hostHeld: true });
  });

  it('treats "F12+." as host-key chord with comma/period target', () => {
    expect(resolveKey('F12+.')).toEqual({ keyCode: 0x2f, flags: 0, hostHeld: true });
    expect(resolveKey('F12+,')).toEqual({ keyCode: 0x2b, flags: 0, hostHeld: true });
  });

  it('throws on unknown key name', () => {
    expect(() => resolveKey('Zog')).toThrow(/unknown key/);
  });
});

describe('parseMacro', () => {
  it('splits a space-separated macro into key names', () => {
    expect(parseMacro('down down enter')).toEqual(['ArrowDown', 'ArrowDown', 'Enter']);
  });

  it('preserves modifier-key compounds intact', () => {
    expect(parseMacro('Ctrl+F5 enter')).toEqual(['Ctrl+F5', 'Enter']);
  });

  it('expands a quoted "type" macro into per-character keys', () => {
    expect(parseMacro('"abc"')).toEqual(['a', 'b', 'c']);
  });
});

describe('sendKey', () => {
  it('sends keyDown then keyUp via the helper', async () => {
    const calls: unknown[] = [];
    const fake: Partial<HelperClient> = {
      send: vi.fn(async (req): Promise<HelperResponse> => {
        calls.push(req);
        return { ok: true };
      }),
    };
    await sendKey(fake as HelperClient, 'Enter', { holdMs: 0 });
    expect(calls).toEqual([
      { op: 'keyDown', keyCode: 0x24, flags: 0 },
      { op: 'keyUp', keyCode: 0x24, flags: 0 },
    ]);
  });

  it('waits between keyDown and keyUp by default (hold delay)', async () => {
    const timestamps: number[] = [];
    const fake: Partial<HelperClient> = {
      send: vi.fn(async (req): Promise<HelperResponse> => {
        if ((req as { op: string }).op === 'keyDown' || (req as { op: string }).op === 'keyUp') {
          timestamps.push(Date.now());
        }
        return { ok: true };
      }),
    };
    await sendKey(fake as HelperClient, 'Enter');
    // Two events recorded; gap between them should be >= ~25ms (default hold).
    expect(timestamps).toHaveLength(2);
    expect(timestamps[1]! - timestamps[0]!).toBeGreaterThanOrEqual(20);
  });

  it('host-key chord wraps the target press with host keyDown/keyUp', async () => {
    const calls: unknown[] = [];
    const fake: Partial<HelperClient> = {
      send: vi.fn(async (req): Promise<HelperResponse> => {
        calls.push(req);
        return { ok: true };
      }),
    };
    await sendKey(fake as HelperClient, 'F12+S', { holdMs: 0 });
    // Sequence: host down, target down, target up, host up.
    expect(calls).toEqual([
      { op: 'keyDown', keyCode: 0x6f, flags: 0 },
      { op: 'keyDown', keyCode: 0x01, flags: 0x00020000 },
      { op: 'keyUp', keyCode: 0x01, flags: 0x00020000 },
      { op: 'keyUp', keyCode: 0x6f, flags: 0 },
    ]);
  });

  it('host-key chord releases the host key even if the target press fails', async () => {
    const calls: unknown[] = [];
    let pressCount = 0;
    const fake: Partial<HelperClient> = {
      send: vi.fn(async (req): Promise<HelperResponse> => {
        calls.push(req);
        const op = (req as { op: string }).op;
        if (op === 'keyDown') {
          pressCount += 1;
          // Fail on the SECOND keyDown (the target, after host already pressed).
          if (pressCount === 2) return { ok: false, error: 'simulated' };
        }
        return { ok: true };
      }),
    };
    await expect(sendKey(fake as HelperClient, 'F12+S', { holdMs: 0 })).rejects.toThrow();
    // Host keyDown then target keyDown (failed) then host keyUp must still fire.
    const ops = calls.map((c) => (c as { op: string; keyCode: number }));
    expect(ops[0]).toEqual({ op: 'keyDown', keyCode: 0x6f, flags: 0 });
    // Last call must be the host keyUp release.
    expect(ops[ops.length - 1]).toEqual({ op: 'keyUp', keyCode: 0x6f, flags: 0 });
  });
});

describe('sendMacro', () => {
  it('iterates keys with bounded inter-key delay', async () => {
    const calls: unknown[] = [];
    const fake: Partial<HelperClient> = {
      send: vi.fn(async (req): Promise<HelperResponse> => {
        calls.push(req);
        return { ok: true };
      }),
    };
    await sendMacro(fake as HelperClient, 'down enter', { interKeyDelayMs: 0, holdMs: 0 });
    expect(calls).toEqual([
      { op: 'keyDown', keyCode: 0x7d, flags: 0 },
      { op: 'keyUp', keyCode: 0x7d, flags: 0 },
      { op: 'keyDown', keyCode: 0x24, flags: 0 },
      { op: 'keyUp', keyCode: 0x24, flags: 0 },
    ]);
  });
});
