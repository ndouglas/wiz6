// Shared server-wide context: lazily-built SymbolIndex, struct registry,
// process-tracking for dosbox_launch lifecycle, and SaveStateBridge factory.
//
// One McpContext per server instance. Tool handlers receive it via closure
// (the registerTool callbacks read it directly).

import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  ALL_STRUCTS,
  buildStructRegistry,
  type BssStruct,
  type SymbolIndex,
} from '@wiz6/data';
import { loadSymbolIndex } from './symbols-loader.js';
import { DebuggerConsole, SaveStateBridge } from './debugger-console.js';
import { HelperClient } from './dosbox/helper-client.js';

export interface McpContextOptions {
  /** Repo-root path used to locate `tools/parity/extract.py` + `tools/dosbox/save/`. */
  cwd?: string;
  /** Optional explicit findings dir override. */
  findingsDir?: string;
}

/**
 * One DebuggerConsole entry per spawned dosbox-x. PID is the user-facing
 * handle; the underlying child process surface is in `console_`.
 */
export interface LaunchedSession {
  pid: number;
  console_: DebuggerConsole;
  exitCode: number | null;
  exitSignal: NodeJS.Signals | null;
  startedAt: number;
}

export class McpContext {
  readonly repoRoot: string;
  readonly extractScriptPath: string;
  readonly savesDir: string;
  readonly configPath: string;

  private symbolIndex_: SymbolIndex | null = null;
  private readonly structRegistry_: ReadonlyMap<string, BssStruct>;
  private readonly findingsDir?: string | undefined;
  private readonly sessions_ = new Map<number, LaunchedSession>();

  constructor(opts: McpContextOptions = {}) {
    this.repoRoot = resolve(opts.cwd ?? process.cwd());
    this.extractScriptPath = join(this.repoRoot, 'tools', 'parity', 'extract.py');
    this.savesDir = join(this.repoRoot, 'tools', 'dosbox', 'save');
    this.configPath = join(this.repoRoot, 'tools', 'dosbox', 'wiz6.conf');
    if (opts.findingsDir !== undefined) {
      this.findingsDir = opts.findingsDir;
    }
    this.structRegistry_ = buildStructRegistry(ALL_STRUCTS);
  }

  /** Lazily load the symbol index. */
  get symbols(): SymbolIndex {
    if (!this.symbolIndex_) {
      this.symbolIndex_ = this.findingsDir
        ? loadSymbolIndex({ findingsDir: this.findingsDir })
        : loadSymbolIndex({ cwd: this.repoRoot });
    }
    return this.symbolIndex_;
  }

  get structs(): ReadonlyMap<string, BssStruct> {
    return this.structRegistry_;
  }

  /**
   * Resolve a user-supplied save identifier to an absolute path.
   *
   * Accepts:
   *  - absolute paths (returned as-is if they exist)
   *  - bare filenames (`1.sav`) → joined to `tools/dosbox/save/`
   *  - bare slot numbers (`1`) → `tools/dosbox/save/1.sav`
   */
  resolveSavePath(save: string): string {
    if (save.startsWith('/') || /^[a-zA-Z]:/.test(save)) {
      return save;
    }
    // Numeric slot — e.g. "1"
    if (/^\d+$/.test(save)) {
      return join(this.savesDir, `${save}.sav`);
    }
    // Bare filename — e.g. "1.sav"
    return join(this.savesDir, save);
  }

  /** Build a SaveStateBridge for the given save identifier. Throws on missing file. */
  bridgeFor(save: string): { bridge: SaveStateBridge; absPath: string } {
    const absPath = this.resolveSavePath(save);
    if (!existsSync(absPath)) {
      throw new Error(`save state not found: ${absPath}`);
    }
    if (!existsSync(this.extractScriptPath)) {
      throw new Error(`tools/parity/extract.py not found at ${this.extractScriptPath}`);
    }
    return { bridge: new SaveStateBridge(this.extractScriptPath, absPath), absPath };
  }

  /** Stat-info for a save file. */
  saveStat(absPath: string): { sizeBytes: number; mtime: string } {
    const s = statSync(absPath);
    return { sizeBytes: s.size, mtime: s.mtime.toISOString() };
  }

  /** Register a launched DOSBox-X session. */
  trackSession(session: LaunchedSession): void {
    this.sessions_.set(session.pid, session);
  }

  getSession(pid: number): LaunchedSession | undefined {
    return this.sessions_.get(pid);
  }

  removeSession(pid: number): void {
    this.sessions_.delete(pid);
  }

  /** All currently-tracked sessions (including exited ones until removed). */
  listSessions(): readonly LaunchedSession[] {
    return Array.from(this.sessions_.values());
  }
}

// Lazy HelperClient singleton — created on first dynamic-tool call, persists
// across tool invocations for the lifetime of the MCP server. If no agent ever
// calls send_input/screenshot/save_state/load_state, the Swift helper child
// process never spawns.
let _helperClient: HelperClient | null = null;
export function getHelperClient(): HelperClient {
  if (_helperClient === null) _helperClient = new HelperClient();
  return _helperClient;
}

/**
 * Tear down the lazy HelperClient if it was spawned. Idempotent — safe to
 * call from a process-shutdown handler even if no tool ever invoked the
 * helper. The CLI wires this into its SIGINT/SIGTERM path so the Swift
 * child doesn't outlive the MCP server.
 */
export async function shutdownHelper(): Promise<void> {
  if (_helperClient === null) return;
  const c = _helperClient;
  _helperClient = null;
  await c.shutdown();
}

/** Test-only: reset the singleton without shutting down (use sparingly). */
export function _resetHelperClientForTests(): void {
  _helperClient = null;
}
