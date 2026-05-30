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
    this.child = this.spawnFn();
    this.child.stdout?.setEncoding('utf8');
    this.child.stdout?.on('data', (chunk: string) => this.onData(chunk));
    this.child.on('error', (err) => {
      const resolver = this.pending.shift();
      if (resolver) resolver({ ok: false, error: `helper spawn error: ${err.message}` });
    });
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
    this.child.stdin?.end();
    this.child.kill('SIGTERM');
    this.child = null;
    this.pending = [];
    this.buf = '';
  }
}
