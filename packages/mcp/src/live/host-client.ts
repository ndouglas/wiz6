// Async TypeScript client for the libretro control harness (tools/libretro/host.c).
//
// Spawns the persistent host process and exposes its stdio line protocol as a
// typed async API. This is the shared bridge the MCP, gen-fixture, and
// build-saves all use to drive/inspect the engine — replacing the DOSBox-X
// save-state + GUI-automation paths.
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, openSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
// The host binary + dosbox-pure core live in tools/libretro/ (built by build.sh).
// HERE is packages/mcp/src/live → repo/tools/libretro.
const HOST_DIR = resolve(HERE, '..', '..', '..', '..', 'tools', 'libretro');
const LOG_DIR = '/tmp/wiz6-libretro';

export class HostClient {
  private child: ChildProcess;
  private rl: Interface;
  private queue: Array<(line: string) => void> = [];

  /** Spawn the harness. `exe` overrides the game entry (default original/wroot.exe). */
  constructor(opts: { exe?: string } = {}) {
    mkdirSync(LOG_DIR, { recursive: true });
    const logFd = openSync(`${LOG_DIR}/host-client.log`, 'a');
    this.child = spawn('./host', opts.exe ? [opts.exe] : [], {
      cwd: HOST_DIR,
      stdio: ['pipe', 'pipe', logFd],
    });
    this.rl = createInterface({ input: this.child.stdout! });
    this.rl.on('line', (line) => this.queue.shift()?.(line.trim()));
  }

  private cmd(c: string): Promise<string> {
    return new Promise((res) => {
      this.queue.push(res);
      this.child.stdin!.write(c + '\n');
    });
  }

  /** Run a batch of raw protocol commands, returning each reply in order.
   *  (Streaming = call the typed methods one at a time; batching = this.) */
  async batch(cmds: string[]): Promise<string[]> {
    return Promise.all(cmds.map((c) => this.cmd(c)));
  }

  /** Advance N emulated frames. */
  async step(n = 1): Promise<void> {
    const r = await this.cmd(`step ${n}`);
    if (r !== 'ok') throw new Error(`step: ${r}`);
  }

  /** Press a key (arrows/enter/esc/space/a-z). mode: down | up | tap (press+release). */
  async key(name: string, mode: 'down' | 'up' | 'tap' = 'tap'): Promise<void> {
    const r = await this.cmd(`key ${name} ${mode}`);
    if (r !== 'ok') throw new Error(`key ${name}: ${r}`);
  }

  /** Resolve the wroot DGROUP base via the DISK.HDR anchor. */
  async anchor(): Promise<number> {
    const r = await this.cmd('anchor');
    const m = /^ok base=([0-9a-f]+)$/.exec(r);
    if (!m) throw new Error(`anchor: ${r}`);
    return parseInt(m[1]!, 16);
  }

  /** Find a byte pattern (hex, spaces optional) in guest memory; -1 if absent. */
  async find(patternHex: string): Promise<number> {
    const r = await this.cmd(`find ${patternHex}`);
    if (/^err nomatch/.test(r)) return -1;
    const m = /^ok phys=([0-9a-f]+)$/.exec(r);
    if (!m) throw new Error(`find: ${r}`);
    return parseInt(m[1]!, 16);
  }

  /** Read `len` bytes at a guest-physical address. */
  async read(addr: number, len: number): Promise<Uint8Array> {
    const r = await this.cmd(`read ${addr.toString(16)} ${len}`);
    const m = /^ok ([0-9a-f]*)$/.exec(r);
    if (!m) throw new Error(`read 0x${addr.toString(16)}: ${r}`);
    const hex = m[1]!;
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }

  /** Write the latest 320x200 frame as raw RGBA to `path`. */
  async fb(path: string): Promise<{ w: number; h: number }> {
    const r = await this.cmd(`fb ${path}`);
    const m = /^ok (\d+) (\d+)$/.exec(r);
    if (!m) throw new Error(`fb: ${r}`);
    return { w: +m[1]!, h: +m[2]! };
  }

  async serialize(path: string): Promise<void> {
    const r = await this.cmd(`serialize ${path}`);
    if (!/^ok/.test(r)) throw new Error(`serialize: ${r}`);
  }
  async unserialize(path: string): Promise<void> {
    const r = await this.cmd(`unserialize ${path}`);
    if (r !== 'ok') throw new Error(`unserialize: ${r}`);
  }

  close(): void {
    // `quit` gets no reply (the harness breaks its loop) — don't await it.
    try { this.child.stdin!.write('quit\n'); } catch { /* ignore */ }
    this.rl.close();
    this.child.kill();
  }
}
