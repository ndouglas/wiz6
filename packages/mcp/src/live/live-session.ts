/**
 * LiveSession — drive + inspect the RUNNING game through the libretro harness.
 *
 * This is the engine behind the MCP "live" tools (the interactive face of the
 * dosbox-pure backend) and is usable standalone. Streaming = call a method per
 * action; batching = `batch([...])`. Inspection reuses the same BssStruct
 * registry + decoder the save-state MCP uses — fed live bytes from the harness.
 */
import { HostClient, type TraceRecord } from './host-client.js';
import { decodeBssStruct, type BssStruct } from '@wiz6/data';

export type { TraceRecord } from './host-client.js';

const GAME_STATE_DGROUP_OFFSET = 0x363a;
const PARTY_SIZE_DGROUP_OFFSET = 0x43ce;
// In-creation draft character (Stage 4a; docs/re/findings/creation-draft-struct.json).
// The staging buffer wpcmk writes during creation, decoded by the character_record
// struct as-is. bonusPool is the one out-of-record field (separate u16).
const DRAFT_BASE_DGROUP = 0x5470;
const BONUS_POOL_DGROUP = 0x56ac;
// Remaining SKILL-train budget ("SKILL POINTS"), a u8 (the rolled skill pool
// rng(9)+10 decremented by training). Verified vs the on-screen value (probe
// 2026-06-02). The adjacent high byte is unrelated, so read one byte.
const SKILL_POOL_DGROUP = 0x5618;

export interface LiveState {
  dgroupBase: number;
  gameState: number;
  partySize: number;
}

export class LiveSession {
  private client: HostClient | null = null;

  constructor(
    private readonly structs: ReadonlyMap<string, BssStruct>,
    private readonly opts: { source?: string } = {},
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

  /** Write bytes. dgroupRelative (default) anchors the address to DGROUP. Returns bytes written.
   *  e.g. the creation bonus-bypass: `write(0x56ce, [1])` forces the next bonus roll to 21
   *  (the *0x56ce debug flag; see docs/re/wpcmk-character-creation.md). */
  async write(addr: number, bytes: ArrayLike<number>, dgroupRelative = true): Promise<number> {
    const c = this.ensure();
    const base = dgroupRelative ? await c.anchor() : 0;
    return c.write(base + addr, bytes);
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

  /** Decode the in-creation DRAFT character from live memory: the `character_record`
   *  struct at DGROUP 0x5470, plus the out-of-record `bonusPool` (u16 at 0x56ac).
   *  Use at a creation waypoint to dump the engine's actual rolled draft for a
   *  fixture sidecar. See docs/re/findings/creation-draft-struct.json. */
  async dumpDraft(): Promise<{ draft: Record<string, unknown>; bonusPool: number; skillPool: number }> {
    const draft = (await this.readStruct('character_record', DRAFT_BASE_DGROUP)) as Record<string, unknown>;
    const bonus = await this.read(BONUS_POOL_DGROUP, 2);
    const skill = await this.read(SKILL_POOL_DGROUP, 1);
    return { draft, bonusPool: bonus[0]! | (bonus[1]! << 8), skillPool: skill[0]! };
  }

  async state(): Promise<LiveState> {
    const c = this.ensure();
    const dgroupBase = await c.anchor();
    const gs = await c.read(dgroupBase + GAME_STATE_DGROUP_OFFSET, 2);
    const ps = await c.read(dgroupBase + PARTY_SIZE_DGROUP_OFFSET, 2);
    return { dgroupBase, gameState: gs[0]! | (gs[1]! << 8), partySize: ps[0]! | (ps[1]! << 8) };
  }

  // ── instruction tracing (patched core only) ───────────────────────────────────
  /** Snapshot the live CPU registers. */
  async regs(): Promise<TraceRecord> { return this.ensure().regs(); }

  /** Arm the non-pausing logging breakpoint at a linear CS:IP (real-mode
   *  (cs<<4)+ip). Executing that instruction appends a register snapshot to the
   *  core's ring buffer; drain it with `traceDrain()`. 0 disables. */
  async traceSet(lin: number): Promise<void> { await this.ensure().traceSet(lin); }
  async traceOff(): Promise<void> { await this.ensure().traceOff(); }
  /** Drain (and clear) the trace ring buffer, oldest record first. */
  async traceDrain(): Promise<TraceRecord[]> { return this.ensure().traceDrain(); }

  // ── capture / state-save ─────────────────────────────────────────────────────
  /** Capture the framebuffer. The pinned image boots in INPUT: KEYBOARD mode
   *  (scenario.hdr[0x19c]=0), so Wiz6 draws no mouse cursor — captures are
   *  naturally cursor-free; no park/erase needed. */
  async screenshot(path: string): Promise<{ w: number; h: number }> {
    return this.ensure().fb(path);
  }
  async serialize(path: string): Promise<void> { await this.ensure().serialize(path); }
  async unserialize(path: string): Promise<void> { await this.ensure().unserialize(path); }

  close(): void { this.client?.close(); this.client = null; }
}
