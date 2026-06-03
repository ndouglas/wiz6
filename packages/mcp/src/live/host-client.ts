// Async TypeScript client for the libretro control harness (tools/libretro/host.c).
//
// Spawns the persistent host process and exposes its stdio line protocol as a
// typed async API. This is the shared bridge the MCP, gen-fixture, and
// build-saves all use to drive/inspect the engine — replacing the DOSBox-X
// save-state + GUI-automation paths.
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, openSync, cpSync, mkdtempSync, rmSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
// The host binary + dosbox-pure core live in tools/libretro/ (built by build.sh).
// HERE is packages/mcp/src/live → repo/tools/libretro.
const HOST_DIR = resolve(HERE, '..', '..', '..', '..', 'tools', 'libretro');
const REPO_ROOT = resolve(HOST_DIR, '..', '..');
// The COMMITTED, version-controlled game image. Every harness session boots from
// an ephemeral COPY of this — never the mutable ./original workspace, and never
// mutating the committed source (the game writes saves into its mount dir).
const PINNED_SOURCE = resolve(REPO_ROOT, 'test-fixtures', 'original');
const LOG_DIR = '/tmp/wiz6-libretro';

/** A CPU register snapshot — either the live state (`regs()`) or one logged
 *  instruction-trace record (`traceDrain()`). Segment regs are 16-bit values;
 *  `stack` is the top 8 words at ss:sp (each a 16-bit word, oldest = top). */
export interface TraceRecord {
  cs: number; eip: number;
  eax: number; ebx: number; ecx: number; edx: number;
  esi: number; edi: number; ebp: number; esp: number;
  ds: number; es: number; ss: number;
  stack: number[];
}

function parseTraceFields(s: string): TraceRecord {
  const f: Record<string, string> = {};
  for (const m of s.matchAll(/(\w+)=([0-9a-f,]+)/g)) f[m[1]!] = m[2]!;
  const hex = (k: string) => parseInt(f[k] ?? '0', 16);
  return {
    cs: hex('cs'), eip: hex('eip'),
    eax: hex('eax'), ebx: hex('ebx'), ecx: hex('ecx'), edx: hex('edx'),
    esi: hex('esi'), edi: hex('edi'), ebp: hex('ebp'), esp: hex('esp'),
    ds: hex('ds'), es: hex('es'), ss: hex('ss'),
    stack: (f['stack'] ?? '').split(',').filter(Boolean).map((w) => parseInt(w, 16)),
  };
}

export class HostClient {
  private child: ChildProcess;
  private rl: Interface;
  private queue: Array<(line: string) => void> = [];
  private readonly gameDir: string;

  /** Spawn the harness. `source` overrides the committed game-image dir (default
   *  test-fixtures/original/); it is copied to an ephemeral working dir per session.
   *  `exeName` overrides the booted program (default wroot.exe — e.g. winstall.exe). */
  constructor(opts: { source?: string; exeName?: string } = {}) {
    mkdirSync(LOG_DIR, { recursive: true });
    // Fresh, throwaway copy of the pinned image → reproducible + non-mutating.
    this.gameDir = mkdtempSync(join(LOG_DIR, 'game-'));
    cpSync(opts.source ?? PINNED_SOURCE, this.gameDir, { recursive: true });
    const logFd = openSync(`${LOG_DIR}/host-client.log`, 'a');
    this.child = spawn('./host', [join(this.gameDir, opts.exeName ?? 'wroot.exe')], {
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

  /** Issue a command whose reply spans multiple lines: zero or more body lines
   *  followed by a terminating `ok ...` / `err ...` line. Returns the body lines
   *  plus the terminator. Used by `tracelog` (N `rec ...` lines, then `ok <n>`). */
  private cmdLines(c: string): Promise<{ body: string[]; done: string }> {
    return new Promise((res) => {
      const body: string[] = [];
      const collector = (line: string) => {
        if (/^(ok|err)\b/.test(line)) { res({ body, done: line }); }
        else { body.push(line); this.queue.unshift(collector); }
      };
      this.queue.push(collector);
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

  /** Relative mouse move (clamped to screen). Big deltas park the cursor in a
   *  corner so its (framebuffer-composited) sprite leaves the visible content. */
  async mouse(dx: number, dy: number): Promise<void> {
    const r = await this.cmd(`mouse ${dx} ${dy}`);
    if (r !== 'ok') throw new Error(`mouse: ${r}`);
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

  /** Write bytes at a guest-physical address (into the libretro RAM map). Returns bytes written. */
  async write(addr: number, bytes: ArrayLike<number>): Promise<number> {
    const hex = Array.from(bytes, (b) => (b & 0xff).toString(16).padStart(2, '0')).join('');
    const r = await this.cmd(`write ${addr.toString(16)} ${hex}`);
    const m = /^ok (\d+)$/.exec(r);
    if (!m) throw new Error(`write 0x${addr.toString(16)}: ${r}`);
    return +m[1]!;
  }

  /** Write the latest 320x200 frame as raw RGBA to `path`. */
  async fb(path: string): Promise<{ w: number; h: number }> {
    const r = await this.cmd(`fb ${path}`);
    const m = /^ok (\d+) (\d+)$/.exec(r);
    if (!m) throw new Error(`fb: ${r}`);
    return { w: +m[1]!, h: +m[2]! };
  }

  /** Snapshot the live CPU registers (patched core only). */
  async regs(): Promise<TraceRecord> {
    const r = await this.cmd('regs');
    if (!/^ok /.test(r)) throw new Error(`regs: ${r}`);
    return parseTraceFields(r.slice(3));
  }

  /** Set the instruction-trace logging breakpoint to a linear CS:IP address
   *  (real-mode: (cs<<4)+ip). 0 disables. Patched core only. */
  async traceSet(lin: number): Promise<void> {
    const r = await this.cmd(`trace ${(lin >>> 0).toString(16)}`);
    if (!/^ok /.test(r)) throw new Error(`trace: ${r}`);
  }

  /** Disable tracing and clear the ring buffer. */
  async traceOff(): Promise<void> {
    const r = await this.cmd('traceoff');
    if (r !== 'ok') throw new Error(`traceoff: ${r}`);
  }

  /** Drain the trace ring buffer (oldest-first), clearing it. Each record is a
   *  register snapshot taken just before the target instruction executed. */
  async traceDrain(): Promise<TraceRecord[]> {
    const { body, done } = await this.cmdLines('tracelog');
    if (!/^ok /.test(done)) throw new Error(`tracelog: ${done}`);
    return body.filter((l) => l.startsWith('rec ')).map((l) => parseTraceFields(l.slice(4)));
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
    try { rmSync(this.gameDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
