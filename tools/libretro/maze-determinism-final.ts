/**
 * maze-determinism-final.ts — FULLY emulate the side + corner classifiers per the asm,
 * reading the live multi-region planes, and reproduce the per-depth slot5220 array +
 * the wt2 emission for all 4 frames. The corrected forward-edge selector:
 *   front/side classifier (0x3828) edge read after lateral step (facing dispatch 0x3ab3):
 *     f0 -> N(cell)                f1 -> W(cell)
 *     f2 -> 0x36dd: N(cell.gy-1) [resolve fail -> 2]   f3 -> 0x3742: W(cell.gx-1) [fail -> 2]
 *   side lateral step (view_step 0x37a7, lateral param left=-1/right=+1, forward=0):
 *     f0: gx+=lat,gy   f1: gx,gy-=lat   f2: gx-=lat,gy   f3: gx,gy+=lat
 *     => screen-left(lat=-1)/right(lat=+1) neighbor.
 *   side classifier OOB-after-lateral-step -> SOLID(2) (the lateral wall gate).
 * corner classifier (0x3c11/0x3dce) perp dispatch reads (center cell, no lateral step):
 *   cornerL: f0 W(gx-1)[fail->2]  f1 N(cell)  f2 W(cell)  f3 N(gy-1)[fail->2]
 *   cornerR: f0 W(cell)  f1 N(gy-1)[fail->2]  f2 W(gx-1)[fail->2]  f3 N(cell)
 * Slot codes feed: side-quad emit (slot 0x5226/0x5228, gated 0x5072/0x5092) and
 * corner emit (slot 0x5222/0x5224, gated front gate 0x508a). Both append wt=2 via
 * the corner-type-9 / side-quad path.
 */
import { writeFileSync } from 'node:fs';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
const u16 = (b: Uint8Array, o = 0): number => b[o]! | (b[o + 1]! << 8);
const O = { facing: 0x4f9a, gy: 0x4fa2, gx: 0x4fa4, maze_ptr: 0x4faa, span_count: 0x50ce, span_list: 0x50d0,
  front_gate: 0x508a, leftA: 0x5072, rightA: 0x5092 };
const MB = { north: 0x60, west: 0x120, special4: 0x1f8, orient2: 0x378, gx_base: 0x1e0, gy_base: 0x1ec };

function getBits(buf: Uint8Array, base: number, cell: number, nbits: number): number {
  const bitOff = cell * nbits; let v = 0;
  for (let i = 0; i < nbits; i++) { const b = bitOff + i; v = (v << 1) | (((buf[base + (b >> 3)] ?? 0) >> (7 - (b & 7))) & 1); }
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
  const gx0 = u16(await rd(O.gx, 2));
  const gy0 = u16(await rd(O.gy, 2));
  const ptr = u16(await rd(O.maze_ptr, 2));
  const mb = await c.read(base + ptr, 0x2000);
  const frontGate = Array.from(await rd(O.front_gate, 4));
  const gxBase = Array.from(mb.slice(MB.gx_base, MB.gx_base + 12));
  const gyBase = Array.from(mb.slice(MB.gy_base, MB.gy_base + 12));
  const resolve = (x: number, y: number) => {
    for (let r = 0; r < 12; r++) if (gxBase[r]! <= x && x <= gxBase[r]! + 7 && gyBase[r]! <= y && y <= gyBase[r]! + 7)
      return r * 64 + (y - gyBase[r]!) * 8 + (x - gxBase[r]!);
    return null;
  };
  const N = (x: number, y: number) => { const i = resolve(x, y); return i === null ? 2 : getBits(mb, MB.north, i, 2); };
  const W = (x: number, y: number) => { const i = resolve(x, y); return i === null ? 2 : getBits(mb, MB.west, i, 2); };
  // forward-edge of a cell by facing (front/side classifier dispatch)
  const fwdEdgeOf = (x: number, y: number) => {
    if (facing === 0) return N(x, y);
    if (facing === 1) return W(x, y);
    if (facing === 2) return resolve(x, y - 1) === null ? 2 : N(x, y - 1); // 0x36dd
    return resolve(x - 1, y) === null ? 2 : W(x - 1, y);                   // 0x3742
  };
  // side classifier: lateral step (OOB->solid 2) then forward edge of the neighbor
  const sideClassify = (cx: number, cy: number, lat: number) => {
    const [nx, ny] = step(cx, cy, facing, lat, 0);
    if (resolve(nx, ny) === null) return 2; // lateral wall gate
    return fwdEdgeOf(nx, ny);
  };
  // corner classifier perp edge (raw, plain walls; decoration remap omitted — none fire here)
  const cornerL = (x: number, y: number) =>
    facing === 0 ? (resolve(x - 1, y) === null ? 2 : W(x - 1, y))
      : facing === 1 ? N(x, y) : facing === 2 ? W(x, y)
        : (resolve(x, y - 1) === null ? 2 : N(x, y - 1));
  const cornerR = (x: number, y: number) =>
    facing === 0 ? W(x, y) : facing === 1 ? (resolve(x, y - 1) === null ? 2 : N(x, y - 1))
      : facing === 2 ? (resolve(x - 1, y) === null ? 2 : W(x - 1, y)) : N(x, y);
  const frontClassify = (x: number, y: number) => fwdEdgeOf(x, y);

  const cnt = u16(await rd(O.span_count, 2));
  const sb = await c.read(base + O.span_list, cnt * 0xb + 4);
  const wt2: number[] = [];
  for (let i = 0; i < cnt; i++) if (sb[i * 0xb + 8] === 2) wt2.push(sb[i * 0xb + 10]!);
  wt2.sort((a, b) => a - b);

  const depths: any[] = [];
  let cgx = gx0, cgy = gy0;
  [cgx, cgy] = step(cgx, cgy, facing, 0, -1);
  for (let d = 0; d < 4; d++) {
    [cgx, cgy] = step(cgx, cgy, facing, 0, 1);
    const slot = [
      frontClassify(cgx, cgy),
      cornerL(cgx, cgy),
      cornerR(cgx, cgy),
      sideClassify(cgx, cgy, -1), // left
      sideClassify(cgx, cgy, 1),  // right
    ];
    const fg = frontGate[d];
    // wt2 emitted at this depth iff (front gate==1 and a corner slot is solid) OR a side slot is solid
    const cornerEmit = fg === 1 && (slot[1]! >= 2 || slot[2]! >= 2);
    const sideEmit = slot[3]! >= 2 || slot[4]! >= 2;
    depths.push({ d, gx: cgx, gy: cgy, slot, frontGate: fg, predictWt2: cornerEmit || sideEmit });
  }
  return { name, facing, frontGate, wt2_span_depthFields: wt2, depths };
}

async function main() {
  const c = new HostClient();
  const S = (n: string) => `${process.cwd()}/tools/libretro/states/${n}.state`;
  try {
    const out: any = {
      corridor: await run(c, 'maze-corridor', S('maze-corridor'), []),
      'turn-left': await run(c, 'turn-left', S('maze-corridor-turn-left'), []),
      lookback: await run(c, 'lookback', S('maze-corridor'), ['right', 'right']),
      asym: await run(c, 'asym', S('maze-corridor-asym'), []),
    };
    writeFileSync('/tmp/maze-determinism-final.json', JSON.stringify(out, null, 2));
    let allOk = true;
    for (const [k, f] of Object.entries(out) as any) {
      const predicted = f.depths.filter((d: any) => d.predictWt2).map((d: any) => d.d);
      const actual = f.wt2_span_depthFields;
      const ok = JSON.stringify(predicted) === JSON.stringify(actual);
      allOk = allOk && ok;
      console.log(`\n=== ${k} (facing ${f.facing}) frontGate=${JSON.stringify(f.frontGate)} ===`);
      for (const d of f.depths) console.log(`  d${d.d} (gx${d.gx},gy${d.gy}) slot=[F${d.slot[0]} cL${d.slot[1]} cR${d.slot[2]} L${d.slot[3]} R${d.slot[4]}] fg=${d.frontGate} predict=${d.predictWt2 ? 1 : 0}`);
      console.log(`  PREDICTED wt2 depths=${JSON.stringify(predicted)}  ACTUAL=${JSON.stringify(actual)}  ${ok ? 'MATCH' : 'MISMATCH'}`);
    }
    console.log(`\n${allOk ? 'ALL FRAMES MATCH — emission is GEOMETRIC' : 'MISMATCH REMAINS'}`);
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
