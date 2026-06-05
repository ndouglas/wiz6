/**
 * maze-slot-trace.ts — fine-grained single-frame trace of slot5220 + depthCounter
 * across a forced rebuild, to reconstruct the per-depth (depthCounter 0..3) slot
 * classification sequence. Captures every frame for ~30 frames after a turn.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
const u16 = (b: Uint8Array, o = 0): number => b[o]! | (b[o + 1]! << 8);
const s16 = (v: number) => (v > 0x7fff ? v - 0x10000 : v);
const O = { facing: 0x4f9a, slot: 0x5220, span_count: 0x50ce, depth_counter: 0x5040 };

async function run(c: HostClient, name: string, state: string, keys: string[]) {
  await c.unserialize(state);
  await c.step(2);
  for (const k of keys) { await c.key(k, 'tap'); await c.step(40); }
  const base = await c.anchor();
  console.log(`\n=== ${name} facing=${u16(await c.read(base + O.facing, 2))} ===`);
  // turn away and back to force two fresh builds; sample every frame
  for (const turn of ['left', 'right']) {
    await c.key(turn, 'tap');
    let prev = '';
    for (let f = 0; f < 30; f++) {
      await c.step(1);
      const b = await c.anchor();
      const dc = s16(u16(await c.read(b + O.depth_counter, 2)));
      const slot = await c.read(b + O.slot, 10);
      const cnt = u16(await c.read(b + O.span_count, 2));
      const s5 = [0, 1, 2, 3, 4].map((i) => u16(slot, i * 2));
      const line = `dc=${dc} slot=${JSON.stringify(s5)} cnt=${cnt}`;
      if (line !== prev) { console.log(`  [${turn}+${f}] ${line}`); prev = line; }
    }
  }
}

async function main() {
  const c = new HostClient();
  const S = (n: string) => `${process.cwd()}/tools/libretro/states/${n}.state`;
  try {
    await run(c, 'lookback', S('maze-corridor'), ['right', 'right']);
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
