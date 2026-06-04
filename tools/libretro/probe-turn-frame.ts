/**
 * probe-turn-frame.ts — confirm a TURN rebuilds the span list + redraws the
 * viewport, and capture before/after framebuffers + span lists. Also dump the
 * forward-step (y2->y3) frame. Serializes a turned-left frame as a candidate
 * fixture if it differs.
 */
import { resolve } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const STATE = resolve(process.argv[2] ?? 'tools/libretro/states/maze-corridor.state');
const F = { facing: 0x4f9a, x: 0x4f9e, z_or_y: 0x4fa0, gy: 0x4fa2, gx: 0x4fa4, span_count: 0x50ce, span_list: 0x50d0, parity: 0x521a } as const;
const VP = { x0: 72, x1: 248, y0: 32, y1: 144 }; const W = 320;

async function u16(c: HostClient, base: number, off: number) { const b = await c.read(base + off, 2); return b[0]! | (b[1]! << 8); }
const s16v = (v: number) => (v & 0x8000 ? v - 0x10000 : v);

async function spans(c: HostClient, base: number) {
  const cnt = await u16(c, base, F.span_count);
  const sb = await c.read(base + F.span_list, cnt * 0xb + 4);
  const out: string[] = [];
  for (let i = 0; i < cnt; i++) {
    const o = i * 0xb;
    const x0 = s16v(sb[o]! | (sb[o + 1]! << 8)), x1 = s16v(sb[o + 2]! | (sb[o + 3]! << 8));
    out.push(`x0=${x0} x1=${x1} wt=${sb[o + 8]} seam=${sb[o + 9]} df=${sb[o + 0xa]}`);
  }
  return { cnt, out };
}
function vpDiff(a: Uint8Array, b: Uint8Array) {
  let n = 0;
  for (let y = VP.y0; y < VP.y1; y++) for (let x = VP.x0; x < VP.x1; x++) { const p = (y * W + x) * 4; if (a[p] !== b[p] || a[p + 1] !== b[p + 1] || a[p + 2] !== b[p + 2]) n++; }
  return n;
}
async function restore(c: HostClient) { await c.unserialize(STATE); await c.step(2); return c.anchor(); }

async function main() {
  const c = new HostClient();
  try {
    await c.step(3000);
    const base = await restore(c);
    await c.fb('/tmp/turn-base.fb');
    const fb0 = new Uint8Array(readFileSync('/tmp/turn-base.fb'));
    const sp0 = await spans(c, base);
    console.log(`CLEAN facing=${await u16(c, base, F.facing)} parity=${await u16(c, base, F.parity)} spans=${sp0.cnt}`);
    sp0.out.forEach((s) => console.log(`    ${s}`));

    for (const k of ['left', 'right'] as const) {
      const b = await restore(c);
      await c.key(k, 'tap'); await c.step(60);
      await c.fb(`/tmp/turn-${k}.fb`);
      const fb1 = new Uint8Array(readFileSync(`/tmp/turn-${k}.fb`));
      const sp1 = await spans(c, b);
      console.log(`\nTURN ${k}: facing=${await u16(c, b, F.facing)} parity=${await u16(c, b, F.parity)} spans=${sp1.cnt}  viewport pixel diff vs clean=${vpDiff(fb0, fb1)}`);
      sp1.out.forEach((s) => console.log(`    ${s}`));
    }

    // Forward step (y2->y3) frame, plus serialize a turned-left fixture candidate.
    let b = await restore(c);
    await c.key('up', 'tap'); await c.step(60);
    await c.fb('/tmp/turn-fwd.fb');
    const sf = await spans(c, b);
    console.log(`\nFWD (up): facing=${await u16(c, b, F.facing)} x=${await u16(c, b, F.x)} gy=${await u16(c, b, F.gy)} spans=${sf.cnt}`);
    sf.out.forEach((s) => console.log(`    ${s}`));

    // Serialize a TURN-LEFT frame as a new fixture for renderer validation.
    b = await restore(c);
    await c.key('left', 'tap'); await c.step(60);
    const out = resolve('tools/libretro/states/maze-corridor-turn-left.state');
    await c.serialize(out);
    await c.fb('/tmp/maze-corridor-turn-left.fb');
    console.log(`\nserialized turn-left fixture -> ${out} (facing=${await u16(c, b, F.facing)})`);
  } finally {
    c.close();
  }
}
main();
