import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DebuggerConsole,
  DebuggerUnavailableError,
  MACOS_TTY_GATE_MESSAGE,
  SaveStateBridge,
  bpCommand,
  formatSegOff,
  memdumpBinCommand,
} from '../src/debugger-console.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const EXTRACT_SCRIPT = join(REPO_ROOT, 'tools', 'parity', 'extract.py');
// 3.sav is from mid-intro (~9 s into the autodrive run); wroot.exe is loaded
// and the SOUND00.SND filename-table anchor is present. 1.sav by contrast is
// from very early boot (before wroot started) — used in server.test.ts for
// the DGROUP-rejection path.
const SAVE_STATE = join(REPO_ROOT, 'tools', 'dosbox', 'save', '3.sav');
const WIZ6_CONF = join(REPO_ROOT, 'tools', 'dosbox', 'wiz6.conf');
const DOSBOX_PATH =
  '/opt/homebrew/Caskroom/dosbox-x-app/2026.05.02/dosbox-x-sdl2/dosbox-x.app/Contents/MacOS/dosbox-x';

const haveSaveState = existsSync(SAVE_STATE) && existsSync(EXTRACT_SCRIPT);
const haveDosbox = existsSync(DOSBOX_PATH) && existsSync(WIZ6_CONF);

// The 12-byte ASCII template the engine uses to build per-slot SOUND filenames.
// "SOUND00.SND" + NUL = 53 4f 55 4e 44 30 30 2e 53 4e 44 00.
const SOUND00_TEMPLATE = new Uint8Array([
  0x53, 0x4f, 0x55, 0x4e, 0x44, 0x30, 0x30, 0x2e, 0x53, 0x4e, 0x44, 0x00,
]);

describe('command serialization', () => {
  it('formatSegOff zero-pads to four hex digits each', () => {
    expect(formatSegOff(0x0, 0x0)).toBe('0000:0000');
    expect(formatSegOff(0x1d03, 0x6)).toBe('1d03:0006');
    expect(formatSegOff(0xffff, 0xffff)).toBe('ffff:ffff');
  });

  it('formatSegOff rejects out-of-range values', () => {
    expect(() => formatSegOff(-1, 0)).toThrow(RangeError);
    expect(() => formatSegOff(0x10000, 0)).toThrow(RangeError);
    expect(() => formatSegOff(0, -1)).toThrow(RangeError);
    expect(() => formatSegOff(0, 0x10000)).toThrow(RangeError);
    expect(() => formatSegOff(1.5, 0)).toThrow(RangeError);
  });

  it('bpCommand emits BP <seg>:<off>', () => {
    expect(bpCommand(0x132d, 0x100)).toBe('BP 132d:0100');
  });

  it('memdumpBinCommand emits MEMDUMPBIN <seg>:<off> <len_hex>', () => {
    expect(memdumpBinCommand(0x1d03, 0x6, 12)).toBe('MEMDUMPBIN 1d03:0006 c');
    expect(memdumpBinCommand(0, 0, 256)).toBe('MEMDUMPBIN 0000:0000 100');
  });

  it('memdumpBinCommand rejects non-positive lengths', () => {
    expect(() => memdumpBinCommand(0, 0, 0)).toThrow(RangeError);
    expect(() => memdumpBinCommand(0, 0, -1)).toThrow(RangeError);
    expect(() => memdumpBinCommand(0, 0, 1.5)).toThrow(RangeError);
  });
});

describe('DebuggerConsole API surface', () => {
  it('exposes the documented macOS gate message verbatim', () => {
    // This is the exact string the dosbox-x binary emits when isatty()
    // returns false. We assert against it so a future DOSBox-X release that
    // reworks the message will fail loudly here and prompt us to revisit
    // the bridge strategy.
    expect(MACOS_TTY_GATE_MESSAGE).toMatch(/Mac OS X/);
    expect(MACOS_TTY_GATE_MESSAGE).toMatch(/terminal/);
  });

  it('sendCommand / readMemory / setBreakpoint / run all reject with a clear message in v1', async () => {
    const console_ = new DebuggerConsole({ configPath: WIZ6_CONF });
    try {
      await expect(console_.sendCommand('R')).rejects.toThrow(/not wired/);
      await expect(console_.readMemory(0, 0, 1)).rejects.toThrow(/save-state/i);
      await expect(console_.setBreakpoint(0, 0)).rejects.toThrow(/not wired/);
      await expect(console_.run()).rejects.toThrow(/not wired/);
    } finally {
      await console_.kill();
    }
  });
});

describe('SaveStateBridge — read memory from a DOSBox-X save state', () => {
  it.skipIf(!haveSaveState)(
    'reads the SOUND00.SND filename template back from a boot-time save state',
    () => {
      const bridge = new SaveStateBridge(EXTRACT_SCRIPT, SAVE_STATE);
      // 1. Locate the template by byte-pattern search. This is the same
      //    technique tools/parity uses to bind seg:off pairs to runtime
      //    structures without needing DOS-loader knowledge.
      const offset = bridge.findPattern('53 4f 55 4e 44 30 30 2e 53 4e 44 00');
      expect(offset).toBeGreaterThan(0);
      // 2. Read 12 bytes there and verify they match the expected template.
      const bytes = bridge.readPhysical(offset, 12);
      expect(bytes.length).toBe(12);
      expect(Array.from(bytes)).toEqual(Array.from(SOUND00_TEMPLATE));
    },
  );

  it.skipIf(!haveSaveState)('reports -1 for a pattern that does not exist', () => {
    const bridge = new SaveStateBridge(EXTRACT_SCRIPT, SAVE_STATE);
    expect(bridge.findPattern('de ad be ef ca fe ba be de ad be ef ca fe ba be')).toBe(-1);
  });
});

// Slow integration test: launches the real DOSBox-X to demonstrate that on
// macOS the debugger gate trips and surfaces as DebuggerUnavailableError.
// Skipped by default — set WIZ6_MCP_RUN_LAUNCH=1 to opt in.
describe.skipIf(!haveDosbox || !process.env['WIZ6_MCP_RUN_LAUNCH'])(
  'DebuggerConsole.launch — slow integration',
  () => {
    it('throws DebuggerUnavailableError when stdin is not a tty (macOS)', async () => {
      const console_ = new DebuggerConsole({
        configPath: WIZ6_CONF,
        timeLimitSeconds: 6,
        dosboxPath: DOSBOX_PATH,
      });
      try {
        await expect(console_.launch()).rejects.toBeInstanceOf(DebuggerUnavailableError);
      } finally {
        await console_.kill();
      }
    }, 20_000);
  },
);
