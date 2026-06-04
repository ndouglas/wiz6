/**
 * maze-multiregion-dump.ts — emit per-frame MULTI-REGION resolved geometry as JSON
 * for injection into maze-frames.json. For each frame, per depth d (0..3), records
 * the center/left/right resolved cells (region,cA,cB) and their N/W/special4/orient2/pit
 * fields, plus the perpendicular side walls (the literal corridor flanking walls),
 * plus the live wt2 span depthFields. This is the offline input the port needs to
 * drive all 4 frames (no live capture) — it's the engine's actual multi-plane read.
 */
import { writeFileSync } from 'node:fs';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
const u16 = (b: Uint8Array, o = 0): number => b[o]! | (b[o + 1]! << 8);
const O = { facing: 0x4f9a, gy: 0x4fa2, gx: 0x4fa4, maze_ptr: 0x4faa, span_count: 0x50ce, span_list: 0x50d0 };
const MB = { north: 0x60, west: 0x120, pit: 0x43a, special4: 0x1f8, orient2: 0x378, gx_base: 0x1e0, gy_base: 0x1ec };

function getBits(buf: Uint8Array, base: number, cell: number, nbits: number): number {
  const bitOff = cell * nbits;
  let v = 0;
  for (let i = 0; i < nbits; i++) {
    const b = bitOff + i;
    const byte = buf[base + (b >> 3)] ?? 0;
    v = (v << 1) | ((byte >> (7 - (b & 7))) & 1);
  }
  return v;
}
function step(gx: number, gy: number, facing: number, lateral: number, forward: number): [number, number] {
  if (facing === 0) return [gx + lateral, gy + forward];
  if (facing === 1) return [gx + forward, gy - lateral];
  if (facing === 2) return [gx - lateral, gy - forward];
  return [gx - forward, gy + lateral];
}

async function run(c: HostClient, name: string, state: string, keys: string[]) {
  await c.unserialize(state);
  await c.step(2);
  for (const k of keys) { await c.key(k, 'tap'); await c.step(40); }
  const base = await c.anchor();
  const rd = async (off: number, n: number) => c.read(base + off, n);
  const facing = u16(await rd(O.facing, 2));
  const gx = u16(await rd(O.gx, 2));
  const gy = u16(await rd(O.gy, 2));
  const ptr = u16(await rd(O.maze_ptr, 2));
  const mb = await c.read(base + ptr, 0x2000);
  const gxBase = Array.from(mb.slice(MB.gx_base, MB.gx_base + 12));
  const gyBase = Array.from(mb.slice(MB.gy_base, MB.gy_base + 12));
  const resolve = (gx: number, gy: number) => {
    for (let r = 0; r < 12; r++)
      if (gxBase[r]! <= gx && gx <= gxBase[r]! + 7 && gyBase[r]! <= gy && gy <= gyBase[r]! + 7)
        return { region: r, cA: gy - gyBase[r]!, cB: gx - gxBase[r]! };
    return null;
  };
  const idx = (r: { region: number; cA: number; cB: number }) => r.region * 64 + r.cA * 8 + r.cB;
  const cellRec = (gx: number, gy: number) => {
    const r = resolve(gx, gy);
    if (!r) return { gx, gy, region: null, oob: true };
    const i = idx(r);
    return {
      gx, gy, region: r.region, cA: r.cA, cB: r.cB,
      N: getBits(mb, MB.north, i, 2), W: getBits(mb, MB.west, i, 2),
      special4: getBits(mb, MB.special4, i, 4), orient2: getBits(mb, MB.orient2, i, 2),
      pit: getBits(mb, MB.pit, i, 1),
    };
  };
  const N = (gx: number, gy: number) => { const r = resolve(gx, gy); return r ? getBits(mb, MB.north, idx(r), 2) : 2; };
  const W = (gx: number, gy: number) => { const r = resolve(gx, gy); return r ? getBits(mb, MB.west, idx(r), 2) : 2; };
  const perp = (gx: number, gy: number, side: 'L' | 'R') => {
    switch (facing) {
      case 0: return side === 'L' ? W(gx, gy) : W(gx + 1, gy);
      case 1: return side === 'L' ? N(gx, gy + 1) : N(gx, gy);
      case 2: return side === 'L' ? W(gx + 1, gy) : W(gx, gy);
      default: return side === 'L' ? N(gx, gy) : N(gx, gy + 1);
    }
  };
  const cnt = u16(await rd(O.span_count, 2));
  const sb = await c.read(base + O.span_list, cnt * 0xb + 4);
  const wt2: number[] = [];
  for (let i = 0; i < cnt; i++) if (sb[i * 0xb + 8] === 2) wt2.push(sb[i * 0xb + 10]!);
  wt2.sort((a, b) => a - b);

  const depths: any[] = [];
  let cgx = gx, cgy = gy;
  [cgx, cgy] = step(cgx, cgy, facing, 0, -1);
  for (let d = 0; d < 4; d++) {
    [cgx, cgy] = step(cgx, cgy, facing, 0, 1);
    const [lgx, lgy] = step(cgx, cgy, facing, -1, 0);
    const [rgx, rgy] = step(cgx, cgy, facing, 1, 0);
    depths.push({
      d,
      center: cellRec(cgx, cgy),
      left: cellRec(lgx, lgy),
      right: cellRec(rgx, rgy),
      fwdEdge: facing === 0 || facing === 2 ? N(cgx, cgy) : W(cgx, cgy),
      perpWallL: perp(cgx, cgy, 'L'),
      perpWallR: perp(cgx, cgy, 'R'),
      spanParity: (gx + gy + facing + d) % 2,
    });
  }
  return { name, facing, gx, gy, parity: (gx + gy + facing) % 2, wt2_span_depthFields: wt2, depths };
}

async function main() {
  const c = new HostClient();
  const S = (n: string) => `${process.cwd()}/tools/libretro/states/${n}.state`;
  try {
    const out = {
      corridor: await run(c, 'maze-corridor', S('maze-corridor'), []),
      'turn-left': await run(c, 'turn-left', S('maze-corridor-turn-left'), []),
      lookback: await run(c, 'lookback', S('maze-corridor'), ['right', 'right']),
      asym: await run(c, 'asym', S('maze-corridor-asym'), []),
    };
    writeFileSync('/tmp/maze-multiregion.json', JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
