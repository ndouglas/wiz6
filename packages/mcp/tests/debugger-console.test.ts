import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  DebuggerConsole,
  DebuggerUnavailableError,
  MACOS_TTY_GATE_MESSAGE,
  SaveStateBridge,
  bpCommand,
  buildDosboxArgs,
  formatSegOff,
  memdumpBinCommand,
} from '../src/debugger-console.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const EXTRACT_SCRIPT = join(REPO_ROOT, 'tools', 'parity', 'extract.py');
// SaveStateBridge reads the `Memory` entry out of a DOSBox-X save state (a ZIP)
// and does byte-offset find/dump on it. The test only needs *a blob containing
// a known pattern at a known offset* — not a real 240 KB emulator save, and
// emphatically not a tools/dosbox/save/*.sav workspace slot (those are mutable
// scratch: gameplay and the castle build-saves runs clobber them, and slot 3 is
// reused for the N=3 castle fixture). So we synthesize a minimal save at test
// time — a ZIP whose `Memory` member is [0x40 filler][SOUND00.SND\0][filler].
// Deterministic, tiny, no DOSBox, never clobbered; lets us assert the EXACT
// offset rather than just "> 0".
const ANCHOR_OFFSET = 0x40;
const TMP_DIR = mkdtempSync(join(tmpdir(), 'mcp-savebridge-'));
const SAVE_STATE = join(TMP_DIR, 'memory-fixture.sav');
// Built via python3 (already required by extract.py and by SaveStateBridge).
// If python3 is unavailable the build fails and the bridge tests skip — the
// bridge can't run without it anyway.
const buildFixture = spawnSync(
  'python3',
  [
    '-c',
    [
      'import zipfile, sys',
      'blob = b"\\x00" * 0x40 + b"SOUND00.SND\\x00" + b"\\xff" * 0x10',
      'with zipfile.ZipFile(sys.argv[1], "w") as z:',
      '    z.writestr("Memory", blob)',
    ].join('\n'),
    SAVE_STATE,
  ],
  { encoding: 'utf8' },
);
const WIZ6_CONF = join(REPO_ROOT, 'tools', 'dosbox', 'wiz6.conf');
const DOSBOX_PATH =
  '/opt/homebrew/Caskroom/dosbox-x-app/2026.05.02/dosbox-x-sdl2/dosbox-x.app/Contents/MacOS/dosbox-x';

const haveSaveState =
  buildFixture.status === 0 && existsSync(SAVE_STATE) && existsSync(EXTRACT_SCRIPT);
const haveDosbox = existsSync(DOSBOX_PATH) && existsSync(WIZ6_CONF);

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

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

describe('buildDosboxArgs — argv builder', () => {
  it('omits -break-start by default (breakAtStart unset)', () => {
    const args = buildDosboxArgs({ configPath: '/tmp/wiz6.conf' });
    expect(args).not.toContain('-break-start');
    // The core flags must still be present.
    expect(args).toEqual(['-conf', '/tmp/wiz6.conf', '-nogui', '-nomenu']);
  });

  it('omits -break-start when breakAtStart is explicitly false', () => {
    const args = buildDosboxArgs({ configPath: '/tmp/wiz6.conf', breakAtStart: false });
    expect(args).not.toContain('-break-start');
  });

  it('includes -break-start when breakAtStart is true', () => {
    const args = buildDosboxArgs({ configPath: '/tmp/wiz6.conf', breakAtStart: true });
    expect(args).toContain('-break-start');
    // -break-start must come BEFORE -nogui to match the original argv order
    // (dosbox-x is order-sensitive for some flags, and the original POC
    // shipped with this ordering).
    const breakIdx = args.indexOf('-break-start');
    const noguiIdx = args.indexOf('-nogui');
    expect(breakIdx).toBeGreaterThan(-1);
    expect(noguiIdx).toBeGreaterThan(breakIdx);
  });

  it('appends -time-limit when timeLimitSeconds is set', () => {
    const args = buildDosboxArgs({ configPath: '/tmp/wiz6.conf', timeLimitSeconds: 30 });
    const idx = args.indexOf('-time-limit');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe('30');
  });

  it('appends extraArgs verbatim', () => {
    const args = buildDosboxArgs({
      configPath: '/tmp/wiz6.conf',
      extraArgs: ['-fastlaunch', '-fullscreen'],
    });
    expect(args).toContain('-fastlaunch');
    expect(args).toContain('-fullscreen');
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

describe('SaveStateBridge — read memory from a synthetic save state', () => {
  it.skipIf(!haveSaveState)(
    'finds the SOUND00.SND template at its known offset and reads it back',
    () => {
      const bridge = new SaveStateBridge(EXTRACT_SCRIPT, SAVE_STATE);
      // findPattern shells extract.py and parses the phys=0x.. offset. We
      // planted the template at ANCHOR_OFFSET, so the result is exact.
      const offset = bridge.findPattern('53 4f 55 4e 44 30 30 2e 53 4e 44 00');
      expect(offset).toBe(ANCHOR_OFFSET);
      // readPhysical dumps that 12-byte range back verbatim.
      const bytes = bridge.readPhysical(offset, 12);
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
