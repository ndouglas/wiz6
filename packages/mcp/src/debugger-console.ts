// Phase-3 DOSBox-X bridge proof-of-concept.
//
// Two practical findings shaped this POC:
//
// 1. On macOS, DOSBox-X's interactive debugger emits
//
//      "Debugger in Mac OS X is not available unless you start DOSBox-X
//       from a terminal or from the Terminal application"
//
//    whenever stdin is not a controlling terminal. A plain
//    child_process.spawn() with piped stdio trips this. The gate IS
//    bypassable by allocating a pty in front (verified empirically via
//    `script -q` — the gate message does not appear, dosbox-x proceeds).
//    Doing the same from Node needs `node-pty`.
//
// 2. The debugger UI is ncurses-based: a full-screen cursor-positioned
//    application, not a line-oriented "DBG> " prompt. Even with a pty in
//    front, parsing it as a request/response shell would require a real
//    terminal-screen scraper. That's a sizeable build/runtime dep (vt100
//    parser + node-pty) that doesn't pay off until we actually need
//    breakpoints — and even then a DOSBox-X patch (TCP debug port) is the
//    cleaner long-term answer.
//
// Implication for the bridge POC:
//
// 1. The stdin-driven approach the spec hopes for ("send command, read
//    response until prompt") will not work on macOS as-is. It is *possible*
//    in principle with a pty (e.g. node-pty) plus an ncurses screen scraper,
//    but that's brittle and well out of scope for the POC.
//
// 2. The spec already calls this out: "If the debugger-console approach
//    proves unworkable (e.g. headless mode broken on macOS), fall back to
//    save-state snapshot reads as the v1 backend." That fallback path is
//    already implemented in tools/parity/extract.py and is what this POC
//    proves end-to-end.
//
// What this module ships:
//
//   - DebuggerConsole: the class the spec describes (launch / sendCommand /
//     readMemory / setBreakpoint / run / kill). The launch/sendCommand path
//     surfaces a clear DebuggerUnavailableError on macOS when started without
//     a tty (the realistic case for an MCP child process); readMemory and
//     friends throw a NotImplementedError pointing at the save-state bridge.
//     This is the right v1 shape: the API surface is real, the failure mode
//     is loud and documented, and the smoke test below uses the working
//     backend to prove a useful end-to-end loop.
//
//   - SaveStateBridge: a minimal read-memory backend that wraps
//     tools/parity/extract.py. This is what the SOUND00.SND smoke test uses
//     to validate "we can pull a known struct out of an emulator memory
//     snapshot from TypeScript". It's the v1 backend the MCP server can sit
//     on top of while a richer dynamic-driving backend evolves.
//
// When the dynamic backend matures (node-pty + ncurses scraper, or a
// platform-specific binding, or `/proc/$pid/mem` on Linux, or a DOSBox-X
// patch), it slots in behind the same DebuggerConsole surface.

import { spawn, type ChildProcess, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_DOSBOX_X_PATH =
  '/opt/homebrew/Caskroom/dosbox-x-app/2026.05.02/dosbox-x-sdl2/dosbox-x.app/Contents/MacOS/dosbox-x';

export const MACOS_TTY_GATE_MESSAGE =
  'Debugger in Mac OS X is not available unless you start DOSBox-X from a terminal or from the Terminal application';

export class DebuggerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DebuggerUnavailableError';
  }
}

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotImplementedError';
  }
}

export interface DebuggerConsoleOptions {
  /** Path to dosbox-x binary. Defaults to the Homebrew cask install. */
  dosboxPath?: string;
  /** Path to the DOSBox-X config (wiz6.conf). */
  configPath: string;
  /** Optional additional CLI args appended after the standard set. */
  extraArgs?: readonly string[];
  /** Kill emulator after N seconds (passed as -time-limit). */
  timeLimitSeconds?: number;
  /** Working directory the child runs in. Defaults to process.cwd(). */
  cwd?: string;
  /**
   * When true, pass `-break-start` to dosbox-x so the interactive debugger
   * pauses at the first instruction. On macOS this requires a real TTY
   * (dosbox-x's isatty gate refuses otherwise) and will throw
   * DebuggerUnavailableError when run as a piped child process. Default
   * false: the dynamic tools (send_input/screenshot/save_state/load_state)
   * route around the debugger entirely, so the realistic default is to
   * launch dosbox-x without engaging it.
   */
  breakAtStart?: boolean;
}

/**
 * Build the dosbox-x argv vector from launch options. Exported so callers
 * (and tests) can verify the exact flags being passed without spawning a
 * child process.
 */
export function buildDosboxArgs(opts: DebuggerConsoleOptions): string[] {
  return [
    '-conf',
    opts.configPath,
    ...(opts.breakAtStart === true ? ['-break-start'] : []),
    '-nogui',
    '-nomenu',
    ...(opts.timeLimitSeconds !== undefined
      ? ['-time-limit', opts.timeLimitSeconds.toString()]
      : []),
    ...(opts.extraArgs ?? []),
  ];
}

/**
 * Format a 16-bit DOSBox-X address pair (`seg:off`) into the colon-hex form
 * the debugger expects. Exported so the serialization is unit-testable
 * without a running emulator.
 */
export function formatSegOff(seg: number, off: number): string {
  if (!Number.isInteger(seg) || seg < 0 || seg > 0xffff) {
    throw new RangeError(`segment out of range: 0x${seg.toString(16)}`);
  }
  if (!Number.isInteger(off) || off < 0 || off > 0xffff) {
    throw new RangeError(`offset out of range: 0x${off.toString(16)}`);
  }
  const segHex = seg.toString(16).padStart(4, '0');
  const offHex = off.toString(16).padStart(4, '0');
  return `${segHex}:${offHex}`;
}

/** Serialise a `BP` (execution breakpoint) command. */
export function bpCommand(seg: number, off: number): string {
  return `BP ${formatSegOff(seg, off)}`;
}

/**
 * Serialise a `MEMDUMPBIN` command. DOSBox-X writes the bytes to
 * `memdump.bin` inside its configured capture directory.
 */
export function memdumpBinCommand(seg: number, off: number, len: number): string {
  if (!Number.isInteger(len) || len < 1) {
    throw new RangeError(`memdump length must be a positive integer: ${len}`);
  }
  return `MEMDUMPBIN ${formatSegOff(seg, off)} ${len.toString(16)}`;
}

/**
 * The dynamic-driving bridge. Launches DOSBox-X as a child process, intends
 * to send commands to its debugger via stdin and parse responses from
 * stdout. On macOS the binary's isatty() check disables the debugger
 * outright when stdin isn't a controlling terminal; the launch logic
 * detects that and throws DebuggerUnavailableError so callers can fall back
 * cleanly. The class's command-serialization helpers are usable
 * independently and are validated by unit tests.
 */
export class DebuggerConsole {
  private child: ChildProcess | null = null;
  private stdoutBuffer = '';
  private readonly tempDir: string;
  private readonly opts: DebuggerConsoleOptions;
  private launchPromise: Promise<void> | null = null;
  private exitCode: number | null = null;
  private exitSignal: NodeJS.Signals | null = null;
  private ttyGateTripped = false;

  constructor(opts: DebuggerConsoleOptions) {
    this.opts = opts;
    this.tempDir = mkdtempSync(join(tmpdir(), 'wiz6-mcp-'));
  }

  /** Whether the child is still running. */
  get running(): boolean {
    return this.child !== null && this.exitCode === null && this.exitSignal === null;
  }

  /** Where MEMDUMPBIN-style temp artifacts get staged. */
  get scratchDir(): string {
    return this.tempDir;
  }

  /**
   * Spawn DOSBox-X with the debugger flag. Resolves once the process is
   * running. Throws DebuggerUnavailableError on macOS if stdout indicates
   * the debugger gate refused to engage.
   */
  async launch(): Promise<void> {
    if (this.launchPromise) {
      return this.launchPromise;
    }
    const dosboxPath = this.opts.dosboxPath ?? DEFAULT_DOSBOX_X_PATH;
    const args = buildDosboxArgs(this.opts);
    const breakAtStart = this.opts.breakAtStart === true;

    this.launchPromise = new Promise<void>((resolve, reject) => {
      const child = spawn(dosboxPath, args, {
        cwd: this.opts.cwd ?? process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.child = child;

      child.on('error', (err) => {
        reject(err);
      });
      child.on('exit', (code, signal) => {
        this.exitCode = code;
        this.exitSignal = signal;
      });

      // Only watch for the macOS isatty gate when we actually asked for the
      // debugger. Without -break-start, dosbox-x never engages the debugger
      // and the gate message never appears, so the watcher would just be
      // dead weight (and risks false positives if dosbox-x emits the
      // documented message for some other reason in the future).
      if (breakAtStart) {
        const onChunk = (chunk: Buffer): void => {
          const text = chunk.toString('utf8');
          this.stdoutBuffer += text;
          if (!this.ttyGateTripped && this.stdoutBuffer.includes(MACOS_TTY_GATE_MESSAGE)) {
            this.ttyGateTripped = true;
            reject(
              new DebuggerUnavailableError(
                'DOSBox-X refused to start its interactive debugger because stdin is not a controlling TTY. ' +
                  'This is the documented macOS isatty() gate. Use the SaveStateBridge backend ' +
                  '(tools/parity/extract.py) for memory reads, or wrap DOSBox-X in a pty (node-pty) ' +
                  'plus an ncurses screen scraper if dynamic driving is required.',
              ),
            );
          }
        };
        child.stdout?.on('data', onChunk);
        child.stderr?.on('data', onChunk);
      }

      // Give the child a short grace window to surface the gate message.
      // If the gate message hasn't appeared within ~3 s, assume the debugger
      // came up successfully (or we're not on macOS); resolve.
      setTimeout(() => {
        if (!this.ttyGateTripped) {
          resolve();
        }
      }, 3_000);
    });

    return this.launchPromise;
  }

  /**
   * Send a single line to the debugger and return whatever stdout has
   * accumulated since the last read. NOT IMPLEMENTED on macOS for the reasons
   * documented at the top of this file; included for API completeness.
   */
  async sendCommand(_cmd: string): Promise<string> {
    throw new NotImplementedError(
      'DebuggerConsole.sendCommand is not wired in v1: DOSBox-X uses an ncurses UI ' +
        'and requires a pty + screen scraper to drive non-interactively. ' +
        'Use SaveStateBridge.readMemory for inspection.',
    );
  }

  async readMemory(_seg: number, _off: number, _len: number): Promise<Uint8Array> {
    throw new NotImplementedError(
      'DebuggerConsole.readMemory is not wired in v1. ' +
        'Use the save-state backend (SaveStateBridge) against ' +
        'tools/dosbox/save/<n>.sav snapshots instead.',
    );
  }

  async setBreakpoint(_seg: number, _off: number): Promise<void> {
    throw new NotImplementedError(
      'DebuggerConsole.setBreakpoint is not wired in v1. ' +
        'The dynamic-driving backend depends on node-pty + an ncurses scraper.',
    );
  }

  async run(): Promise<void> {
    throw new NotImplementedError(
      'DebuggerConsole.run is not wired in v1. ' +
        'Without a working command channel there is nothing to resume.',
    );
  }

  /** Stop the emulator and remove scratch temp files. Idempotent. */
  async kill(): Promise<void> {
    if (this.child && this.running) {
      this.child.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const c = this.child;
        if (!c) {
          resolve();
          return;
        }
        c.once('exit', () => resolve());
        // hard-stop after 2 s in case SIGTERM is ignored
        setTimeout(() => {
          try {
            c.kill('SIGKILL');
          } catch {
            // ignore
          }
          resolve();
        }, 2_000);
      });
    }
    try {
      rmSync(this.tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

/**
 * Read raw emulated physical memory from a DOSBox-X save state. Thin wrapper
 * around tools/parity/extract.py. This is the v1 inspection backend until a
 * working dynamic-driving channel exists.
 */
export class SaveStateBridge {
  constructor(
    private readonly extractScriptPath: string,
    private readonly savePath: string,
  ) {}

  /**
   * Read `len` bytes starting at the given physical-memory offset.
   * `offset` is a raw physical address (NOT a seg:off pair) because that's
   * the address space the save state preserves.
   */
  readPhysical(offset: number, len: number): Uint8Array {
    if (!Number.isInteger(offset) || offset < 0) {
      throw new RangeError(`physical offset must be a non-negative integer: ${offset}`);
    }
    if (!Number.isInteger(len) || len < 1) {
      throw new RangeError(`length must be a positive integer: ${len}`);
    }
    const result = spawnSync(
      'python3',
      [
        this.extractScriptPath,
        'dump',
        this.savePath,
        '--offset',
        `0x${offset.toString(16)}`,
        '--length',
        len.toString(),
      ],
      { encoding: 'buffer' },
    );
    if (result.status !== 0) {
      const stderr = result.stderr?.toString('utf8') ?? '';
      throw new Error(`extract.py dump failed (exit ${result.status}): ${stderr}`);
    }
    // extract.py dump without --output writes the raw bytes to stdout.
    return new Uint8Array(result.stdout);
  }

  /**
   * Find the first occurrence of a byte pattern in physical memory. Useful
   * for locating a known struct (e.g. the SOUND00.SND template) when its
   * physical offset isn't known a priori. Returns -1 if not found.
   */
  findPattern(patternHex: string): number {
    const result = spawnSync(
      'python3',
      [this.extractScriptPath, 'find', this.savePath, '--pattern', patternHex],
      { encoding: 'utf8' },
    );
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    // extract.py returns exit 1 with `(no matches for ...)` on stderr when
    // the pattern simply isn't found — that's not an error, just a negative
    // result for the caller.
    if (result.status !== 0 && /no matches for/i.test(stderr)) {
      return -1;
    }
    if (result.status !== 0) {
      throw new Error(`extract.py find failed (exit ${result.status}): ${stderr}`);
    }
    const match = /phys=0x([0-9a-fA-F]+)/.exec(stdout);
    if (!match || match[1] === undefined) {
      return -1;
    }
    return parseInt(match[1], 16);
  }
}
