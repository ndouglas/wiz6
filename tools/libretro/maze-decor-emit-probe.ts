/**
 * maze-decor-emit-probe.ts — for each reliable maze frame, read the orient2 (+0x378,2b)
 * and special4 (+0x1f8,4b) decoration planes for the per-depth center + flanking cells,
 * alongside the corrected wall slots + recorded wt2 spans. Tests whether the orientation
 * gate ((orient2+1)%4 == facing) is the emit discriminator the corrected wall reads miss.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
const u16 = (b: Uint8Array, o = 0): number => b[o]! | (b[o + 1]! << 8);
const O = { facing: 0x4f9a, gy: 0x4fa2, gx: 0x4fa4, maze_ptr: 0x4faa, span_count: 0x50ce, span_list: 0x50d0 };
const MB = { north: 0x60, west: 0x120, special4: 0x1f8, orient2: 0x378, gx_base: 0x1e0, gy_base: 0x1ec };
function getBits(buf: Uint8Array, base: number, cell: number, nbits: number): number {
  const bitOff = cell * nbits; let v = 0;
  for (let i = 0; i < nbits; i++) { const b = bitOff + i; v = (v << 1) | (((buf[base + (b >> 3)] ?? 0) >> (7 - (b & 7))) & 1); }
  return v;
}
function step(gx: number, gy: number, facing: number, lat: number, fwd: number): [number, number] {
  if (facing === 0) return [gx + lat, gy + fwd];
  if (facing === 1) return [gx + fwd, gy - lat];
  if (facing === 2) return [gx - lat, gy - fwd];
  return [gx - fwd, gy + lat];
}
async function snap(c: HostClient) {
  const base = await c.anchor();
  const rd = async (off: number, n: number) => c.read(base + off, n);
  const facing = u16(await rd(O.facing, 2));
  const gx0 = u16(await rd(O.gx, 2)), gy0 = u16(await rd(O.gy, 2));
  const ptr = u16(await rd(O.maze_ptr, 2));
  const mb = await c.read(base + ptr, 0x2000);
  const gxB = Array.from(mb.slice(MB.gx_base, MB.gx_base + 12));
  const gyB = Array.from(mb.slice(MB.gy_base, MB.gy_base + 12));
  const resolve = (x: number, y: number) => {
    for (let r = 0; r < 12; r++) if (gxB[r]! <= x && x <= gxB[r]! + 7 && gyB[r]! <= y && y <= gyB[r]! + 7)
      return r * 64 + (y - gyB[r]!) * 8 + (x - gxB[r]!);
    return null;
  };
  const N = (x: number, y: number) => { const i = resolve(x, y); return i === null ? 2 : getBits(mb, MB.north, i, 2); };
  const W = (x: number, y: number) => { const i = resolve(x, y); return i === null ? 2 : getBits(mb, MB.west, i, 2); };
  const orient = (x: number, y: number) => { const i = resolve(x, y); return i === null ? -1 : getBits(mb, MB.orient2, i, 2); };
  const spec = (x: number, y: number) => { const i = resolve(x, y); return i === null ? -1 : getBits(mb, MB.special4, i, 4); };
  const fwdEdgeOf = (x: number, y: number) => {
    if (facing === 0) return N(x, y);
    if (facing === 1) return W(x, y);
    if (facing === 2) return resolve(x, y - 1) === null ? 2 : N(x, y - 1);
    return resolve(x - 1, y) === null ? 2 : W(x - 1, y);
  };
  const sideC = (cx: number, cy: number, lat: number) => {
    const [nx, ny] = step(cx, cy, facing, lat, 0);
    if (resolve(nx, ny) === null) return 2; return fwdEdgeOf(nx, ny);
  };
  const cornerL = (x: number, y: number) =>
    facing === 0 ? (resolve(x - 1, y) === null ? 2 : W(x - 1, y)) : facing === 1 ? N(x, y)
      : facing === 2 ? W(x, y) : (resolve(x, y - 1) === null ? 2 : N(x, y - 1));
  const cornerR = (x: number, y: number) =>
    facing === 0 ? W(x, y) : facing === 1 ? (resolve(x, y - 1) === null ? 2 : N(x, y - 1))
      : facing === 2 ? (resolve(x - 1, y) === null ? 2 : W(x - 1, y)) : N(x, y);
  const cnt = u16(await rd(O.span_count, 2));
  const sb = cnt > 0 ? await c.read(base + O.span_list, cnt * 0xb) : new Uint8Array(0);
  const wt2: number[] = [];
  for (let i = 0; i < cnt; i++) if (sb[i * 0xb + 8] === 2) wt2.push(sb[i * 0xb + 10]!);
  wt2.sort((a, b) => a - b);
  let cgx = gx0, cgy = gy0;
  [cgx, cgy] = step(cgx, cgy, facing, 0, -1);
  const depths: any[] = [];
  for (let d = 0; d < 4; d++) {
    [cgx, cgy] = step(cgx, cgy, facing, 0, 1);
    depths.push({ d, front: fwdEdgeOf(cgx, cgy), cL: cornerL(cgx, cgy), cR: cornerR(cgx, cgy),
      L: sideC(cgx, cgy, -1), R: sideC(cgx, cgy, 1),
      o: orient(cgx, cgy), sp: spec(cgx, cgy), ogate: ((orient(cgx, cgy) + 1) % 4) === facing ? 1 : 0 });
  }
  return { facing, gx: gx0, gy: gy0, wt2, depths };
}
async function main() {
  const c = new HostClient();
  const S = (n: string) => `${process.cwd()}/tools/libretro/states/${n}.state`;
  const seqs: [string, string[]][] = [
    ['corridor f0', []], ['turn-left f3', ['left']], ['lookback f2', ['right', 'right']],
    ['asym f1', ['right']], ['up f0', ['up']], ['up-up f0', ['up', 'up']],
    ['up-RR f2', ['up', 'right', 'right']], ['up-up-RR f2', ['up', 'up', 'right', 'right']],
    ['R-up f1', ['right', 'up']], ['R-up-up f1', ['right', 'up', 'up']],
    ['L-up f3', ['left', 'up']], ['L-up-up f3', ['left', 'up', 'up']],
  ];
  try {
    for (const [label, keys] of seqs) {
      await c.unserialize(S('maze-corridor'));
      await c.step(2);
      for (const k of keys) { await c.key(k, 'tap'); await c.step(120); }
      const s = await snap(c);
      console.log(`\n${label} g(${s.gx},${s.gy}) WT2=${JSON.stringify(s.wt2)}`);
      for (const x of s.depths)
        console.log(`  d${x.d}: F=${x.front} cL=${x.cL} cR=${x.cR} L=${x.L} R=${x.R}  orient=${x.o} spec=${x.sp} ogate=${x.ogate}`);
    }
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
