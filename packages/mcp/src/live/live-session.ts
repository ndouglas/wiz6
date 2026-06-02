/**
 * LiveSession — drive + inspect the RUNNING game through the libretro harness.
 *
 * This is the engine behind the MCP "live" tools (the interactive face of the
 * dosbox-pure backend) and is usable standalone. Streaming = call a method per
 * action; batching = `batch([...])`. Inspection reuses the same BssStruct
 * registry + decoder the save-state MCP uses — fed live bytes from the harness.
 */
import { HostClient } from './host-client.js';
import { decodeBssStruct, type BssStruct } from '@wiz6/data';

const GAME_STATE_DGROUP_OFFSET = 0x363a;
const PARTY_SIZE_DGROUP_OFFSET = 0x43ce;

export interface LiveState {
  dgroupBase: number;
  gameState: number;
  partySize: number;
}

export class LiveSession {
  private client: HostClient | null = null;

  constructor(
    private readonly structs: ReadonlyMap<string, BssStruct>,
    private readonly opts: { exe?: string } = {},
  ) {}

  private ensure(): HostClient {
    if (!this.client) this.client = new HostClient(this.opts);
    return this.client;
  }

  /** Boot the game (default to the title screen). */
  async launch(bootFrames = 3000): Promise<void> {
    await this.ensure().step(bootFrames);
  }

  // ── driving ────────────────────────────────────────────────────────────────
  async step(frames: number): Promise<void> { await this.ensure().step(frames); }
  async key(name: string, mode: 'down' | 'up' | 'tap' = 'tap'): Promise<void> {
    await this.ensure().key(name, mode);
  }
  /** Run a batch of raw protocol commands; returns each reply. */
  async batch(commands: string[]): Promise<string[]> { return this.ensure().batch(commands); }

  // ── inspection ───────────────────────────────────────────────────────────────
  async dgroupBase(): Promise<number> { return this.ensure().anchor(); }
  async find(patternHex: string): Promise<number> { return this.ensure().find(patternHex); }

  /** Read `len` bytes. dgroupRelative (default) anchors the address to DGROUP. */
  async read(addr: number, len: number, dgroupRelative = true): Promise<Uint8Array> {
    const c = this.ensure();
    const base = dgroupRelative ? await c.anchor() : 0;
    return c.read(base + addr, len);
  }

  /** Decode a BssStruct at a DGROUP-relative offset from live memory. */
  async readStruct(structName: string, dgroupOffset: number): Promise<unknown> {
    const struct = this.structs.get(structName);
    if (!struct) {
      throw new Error(`unknown struct: ${structName}. Known: ${[...this.structs.keys()].join(', ')}`);
    }
    const base = await this.ensure().anchor();
    const bytes = await this.ensure().read(base + dgroupOffset, struct.bytes);
    return decodeBssStruct(struct, bytes, 0, this.structs);
  }

  async state(): Promise<LiveState> {
    const c = this.ensure();
    const dgroupBase = await c.anchor();
    const gs = await c.read(dgroupBase + GAME_STATE_DGROUP_OFFSET, 2);
    const ps = await c.read(dgroupBase + PARTY_SIZE_DGROUP_OFFSET, 2);
    return { dgroupBase, gameState: gs[0]! | (gs[1]! << 8), partySize: ps[0]! | (ps[1]! << 8) };
  }

  // ── capture / state-save ─────────────────────────────────────────────────────
  async screenshot(path: string): Promise<{ w: number; h: number }> { return this.ensure().fb(path); }
  async serialize(path: string): Promise<void> { await this.ensure().serialize(path); }
  async unserialize(path: string): Promise<void> { await this.ensure().unserialize(path); }

  close(): void { this.client?.close(); this.client = null; }
}
