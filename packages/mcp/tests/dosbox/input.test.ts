import { describe, it, expect, vi } from 'vitest';
import { resolveKey, parseMacro, sendKey, sendMacro } from '../../src/dosbox/input.js';
import type { HelperClient, HelperResponse } from '../../src/dosbox/helper-client.js';

describe('resolveKey', () => {
  it('maps "Enter" to keyCode 36 with no flags', () => {
    expect(resolveKey('Enter')).toEqual({ keyCode: 0x24, flags: 0 });
  });

  it('maps "ArrowDown" to keyCode 125', () => {
    expect(resolveKey('ArrowDown')).toEqual({ keyCode: 0x7d, flags: 0 });
  });

  it('maps lowercase "a" to keyCode 0 no shift', () => {
    expect(resolveKey('a')).toEqual({ keyCode: 0x00, flags: 0 });
  });

  it('maps uppercase "A" to keyCode 0 with shift', () => {
    expect(resolveKey('A')).toEqual({ keyCode: 0x00, flags: 0x00020000 });
  });

  it('parses "Ctrl+F5" with control modifier', () => {
    expect(resolveKey('Ctrl+F5')).toEqual({ keyCode: 0x60, flags: 0x00040000 });
  });

  it('parses "Alt+F5" with option modifier', () => {
    expect(resolveKey('Alt+F5')).toEqual({ keyCode: 0x60, flags: 0x00080000 });
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
    await sendKey(fake as HelperClient, 'Enter');
    expect(calls).toEqual([
      { op: 'keyDown', keyCode: 0x24, flags: 0 },
      { op: 'keyUp', keyCode: 0x24, flags: 0 },
    ]);
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
    await sendMacro(fake as HelperClient, 'down enter', { interKeyDelayMs: 0 });
    expect(calls).toEqual([
      { op: 'keyDown', keyCode: 0x7d, flags: 0 },
      { op: 'keyUp', keyCode: 0x7d, flags: 0 },
      { op: 'keyDown', keyCode: 0x24, flags: 0 },
      { op: 'keyUp', keyCode: 0x24, flags: 0 },
    ]);
  });
});
