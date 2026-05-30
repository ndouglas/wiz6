/**
 * HelperClient — spawns the wiz6-input-helper Swift binary as a child process
 * and speaks line-delimited JSON over its stdio. The helper is long-lived for
 * the lifetime of the MCP server; a single instance handles many requests
 * sequentially.
 *
 * Spec: docs/superpowers/specs/2026-05-30-dosbox-mcp-dynamic-driving-design.md
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_HELPER_PATH = resolve(__dirname, '..', '..', 'bin', 'wiz6-input-helper');

export type HelperRequest =
  | { op: 'ping' }
  | { op: 'keyDown'; keyCode: number; flags: number }
  | { op: 'keyUp'; keyCode: number; flags: number }
  | { op: 'findWindow'; appName: string }
  | { op: 'focusWindow'; windowId: number }
  | { op: 'getFrontmost' }
  | { op: 'restoreFrontmost'; bundleId: string };

export interface HelperResponse {
  ok: boolean;
  error?: string;
  windowId?: number;
  bundleId?: string;
}

type SpawnFn = () => ChildProcess;

const DEFAULT_SPAWN: SpawnFn = () => spawn(DEFAULT_HELPER_PATH, [], { stdio: 'pipe' });

export class HelperClient {
  private child: ChildProcess | null = null;
  private buf = '';
  private pending: Array<(resp: HelperResponse) => void> = [];
  private spawnFn: SpawnFn;

  constructor(spawnFn: SpawnFn = DEFAULT_SPAWN) {
    this.spawnFn = spawnFn;
  }

  private ensureStarted(): void {
    if (this.child !== null) return;
    const child = this.spawnFn();
    this.child = child;
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => this.onData(chunk));
    child.on('error', (err) => {
      // Spawn-time error (e.g. ENOENT). Flush every pending caller — the
      // child won't deliver a response and the 'exit' handler may not fire
      // if the process never came up.
      this.flushPending(`helper spawn error: ${err.message}`);
    });
    child.on('exit', (code, signal) => {
      // The Swift helper terminated. Any pending request will never get a
      // response. Reject them all with an actionable error and clear our
      // child reference so the next `send` re-spawns.
      if (this.child === child) {
        this.flushPending(
          `helper exited (code=${code}, signal=${signal ?? 'null'}) before responding`,
        );
        this.child = null;
        this.buf = '';
      }
    });
  }

  /** Reject all pending request callbacks with the given error and clear the queue. */
  private flushPending(errMsg: string): void {
    const pending = this.pending.splice(0);
    for (const resolve of pending) {
      resolve({ ok: false, error: errMsg });
    }
  }

  private onData(chunk: string): void {
    this.buf += chunk;
    let idx;
    while ((idx = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx + 1);
      const resolver = this.pending.shift();
      if (!resolver) continue;
      try {
        resolver(JSON.parse(line) as HelperResponse);
      } catch (e) {
        resolver({ ok: false, error: `helper response parse error: ${(e as Error).message}` });
      }
    }
  }

  async send(req: HelperRequest): Promise<HelperResponse> {
    this.ensureStarted();
    return new Promise<HelperResponse>((resolve) => {
      this.pending.push(resolve);
      this.child!.stdin!.write(JSON.stringify(req) + '\n');
    });
  }

  async shutdown(): Promise<void> {
    if (this.child === null) return;
    const child = this.child;
    // Clear `this.child` BEFORE killing so the 'exit' handler doesn't
    // double-flush — by the time exit fires, `this.child !== child` and the
    // handler bails out.
    this.child = null;
    this.flushPending('helper shutdown');
    this.buf = '';
    child.stdin?.end();
    child.kill('SIGTERM');
  }
}
