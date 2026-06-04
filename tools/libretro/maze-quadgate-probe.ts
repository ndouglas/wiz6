/**
 * maze-quadgate-probe.ts — read the SETTLED quad-emit gate arrays per frame.
 * Per the gating findings the plain wt=2 side walls flow through wall_emit_quad
 * type-0/2 (0x44c9), gated by 0x50aa (byte, stride 3 = depth*3+side) AND 0x504e
 * (word, stride 6 = (depth*3+side)*2). Default 0 = emit; set 1 = skip. Also the
 * front gate 0x508a, side gates 0x5072/0x5092, decor flags 0x5043/0x5050, the
 * slot array 0x5220, and the live wt2 span depthFields.
 *
 * These are RESIDUAL (render-timing-sensitive per the prior caveat) but reading
 * all of them per frame may reveal a per-depth correlate that survives settle.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
const u16 = (b: Uint8Array, o = 0): number => b[o]! | (b[o + 1]! << 8);
const O = { facing: 0x4f9a, gy: 0x4fa2, gx: 0x4fa4, span_count: 0x50ce, span_list: 0x50d0 };

async function run(c: HostClient, name: string, state: string, keys: string[]) {
  await c.unserialize(state);
  await c.step(2);
  for (const k of keys) { await c.key(k, 'tap'); await c.step(40); }
  const base = await c.anchor();
  const rd = async (off: number, n: number) => c.read(base + off, n);
  const facing = u16(await rd(O.facing, 2));
  const gx = u16(await rd(O.gx, 2));
  const gy = u16(await rd(O.gy, 2));
  const g50aa = Array.from(await rd(0x50aa, 0xc)); // 12 bytes, depth*3+side
  const w504e = await rd(0x504e, 0x18); // 24 bytes = 12 words
  const g504e: number[] = [];
  for (let i = 0; i < 12; i++) g504e.push(u16(w504e, i * 2));
  const g50b6 = Array.from(await rd(0x50b6, 0x18));
  const front = Array.from(await rd(0x508a, 4));
  const leftA = Array.from(await rd(0x5072, 4));
  const rightA = Array.from(await rd(0x5092, 4));
  const decor5043 = Array.from(await rd(0x5043, 0xc));
  const cnt = u16(await rd(O.span_count, 2));
  const sb = await c.read(base + O.span_list, cnt * 0xb + 4);
  const wt2: number[] = [];
  for (let i = 0; i < cnt; i++) if (sb[i * 0xb + 8] === 2) wt2.push(sb[i * 0xb + 10]!);
  wt2.sort((a, b) => a - b);
  console.log(`\n=== ${name} f${facing} g(${gx},${gy}) wt2=[${wt2.join(',')}] ===`);
  const triplet = (arr: number[]) => {
    // stride 3 = depth*3+side; side 0=front,1=left,2=right per depth
    const rows = [];
    for (let d = 0; d < 4; d++) rows.push(`d${d}[${arr[d * 3]},${arr[d * 3 + 1]},${arr[d * 3 + 2]}]`);
    return rows.join(' ');
  };
  console.log(`  quad50aa (d[f,l,r]): ${triplet(g50aa)}`);
  console.log(`  quad504e (d[f,l,r]): ${triplet(g504e)}`);
  console.log(`  g50b6    (d[f,l,r]): ${triplet(g50b6)}`);
  console.log(`  decor5043(d[f,l,r]): ${triplet(decor5043)}`);
  console.log(`  front508a=[${front}] leftA5072=[${leftA}] rightA5092=[${rightA}]`);
}

async function main() {
  const c = new HostClient();
  const S = (n: string) => `${process.cwd()}/tools/libretro/states/${n}.state`;
  try {
    await run(c, 'corridor', S('maze-corridor'), []);
    await run(c, 'turn-left', S('maze-corridor-turn-left'), []);
    await run(c, 'lookback', S('maze-corridor'), ['right', 'right']);
    await run(c, 'asym', S('maze-corridor-asym'), []);
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
