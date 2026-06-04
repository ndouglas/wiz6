/**
 * maze-navigate-probe.ts — drive the party around the corridor stub + adjacent
 * cells to find positions with front[0]!=0 (which emit wt=2) and varied flank
 * patterns, to disambiguate the emit law. Reports per-position corrected slots +
 * recorded spans for any reachable (facing, position).
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
const u16 = (b: Uint8Array, o = 0): number => b[o]! | (b[o + 1]! << 8);
const O = { facing: 0x4f9a, gy: 0x4fa2, gx: 0x4fa4, maze_ptr: 0x4faa, span_count: 0x50ce, span_list: 0x50d0 };
const MB = { north: 0x60, west: 0x120, gx_base: 0x1e0, gy_base: 0x1ec };

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

async function snap(c: HostClient) {
  const base = await c.anchor();
  const rd = async (off: number, n: number) => c.read(base + off, n);
  const facing = u16(await rd(O.facing, 2));
  const gx0 = u16(await rd(O.gx, 2));
  const gy0 = u16(await rd(O.gy, 2));
  const ptr = u16(await rd(O.maze_ptr, 2));
  const mb = await c.read(base + ptr, 0x2000);
  const gxBase = Array.from(mb.slice(MB.gx_base, MB.gx_base + 12));
  const gyBase = Array.from(mb.slice(MB.gy_base, MB.gy_base + 12));
  const resolve = (x: number, y: number) => {
    for (let r = 0; r < 12; r++) if (gxBase[r]! <= x && x <= gxBase[r]! + 7 && gyBase[r]! <= y && y <= gyBase[r]! + 7)
      return r * 64 + (y - gyBase[r]!) * 8 + (x - gxBase[r]!);
    return null;
  };
  const N = (x: number, y: number) => { const i = resolve(x, y); return i === null ? 2 : getBits(mb, MB.north, i, 2); };
  const W = (x: number, y: number) => { const i = resolve(x, y); return i === null ? 2 : getBits(mb, MB.west, i, 2); };
  const fwdEdgeOf = (x: number, y: number) => {
    if (facing === 0) return N(x, y);
    if (facing === 1) return W(x, y);
    if (facing === 2) return resolve(x, y - 1) === null ? 2 : N(x, y - 1);
    return resolve(x - 1, y) === null ? 2 : W(x - 1, y);
  };
  const sideClassify = (cx: number, cy: number, lat: number) => {
    const [nx, ny] = step(cx, cy, facing, lat, 0);
    if (resolve(nx, ny) === null) return 2;
    return fwdEdgeOf(nx, ny);
  };
  const cornerL = (x: number, y: number) =>
    facing === 0 ? (resolve(x - 1, y) === null ? 2 : W(x - 1, y))
      : facing === 1 ? N(x, y) : facing === 2 ? W(x, y)
        : (resolve(x, y - 1) === null ? 2 : N(x, y - 1));
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
    depths.push({ d, gx: cgx, gy: cgy,
      front: fwdEdgeOf(cgx, cgy), cornerL: cornerL(cgx, cgy), cornerR: cornerR(cgx, cgy),
      leftSide: sideClassify(cgx, cgy, -1), rightSide: sideClassify(cgx, cgy, 1) });
  }
  return { facing, gx: gx0, gy: gy0, wt2, depths };
}

async function main() {
  const c = new HostClient();
  const S = (n: string) => `${process.cwd()}/tools/libretro/states/${n}.state`;
  try {
    // explore: from maze-corridor, drive a sequence of moves and snapshot each settle
    const seqs: { label: string; keys: string[] }[] = [
      { label: 'base f0', keys: [] },
      { label: 'R (f1)', keys: ['right'] },
      { label: 'RR (f2 lookback)', keys: ['right', 'right'] },
      { label: 'L (f3)', keys: ['left'] },
      { label: 'up (f0 step)', keys: ['up'] },
      { label: 'up up (f0 2step)', keys: ['up', 'up'] },
      { label: 'up RR (cap then look back)', keys: ['up', 'right', 'right'] },
      { label: 'up up RR', keys: ['up', 'up', 'right', 'right'] },
      { label: 'RR up (lookback step)', keys: ['right', 'right', 'up'] },
      { label: 'RR up up', keys: ['right', 'right', 'up', 'up'] },
      { label: 'R up (f1 step)', keys: ['right', 'up'] },
      { label: 'R up up', keys: ['right', 'up', 'up'] },
      { label: 'L up', keys: ['left', 'up'] },
      { label: 'L up up', keys: ['left', 'up', 'up'] },
    ];
    for (const { label, keys } of seqs) {
      await c.unserialize(S('maze-corridor'));
      await c.step(2);
      for (const k of keys) { await c.key(k, 'tap'); await c.step(40); }
      const s = await snap(c);
      const fr = s.depths.map((x: any) => x.front);
      const fl = s.depths.map((x: any) => `${x.cornerL}/${x.cornerR}/${x.leftSide}/${x.rightSide}`);
      console.log(`${label.padEnd(24)} f${s.facing} g(${s.gx},${s.gy}) front=${JSON.stringify(fr)} cL/cR/L/R=${JSON.stringify(fl)} WT2=${JSON.stringify(s.wt2)}`);
    }
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
