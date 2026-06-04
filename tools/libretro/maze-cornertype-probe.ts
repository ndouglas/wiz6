/**
 * maze-cornertype-probe.ts — reproduce the per-depth corner-type (the value that
 * drives the wt=2 side-wall span emission) from the maze block decoration planes.
 *
 * Corner classifier 0x3c11 (corner-L) / 0x3dce (corner-R), cell-read branch:
 *   1. resolve center cursor (global gx,gy) -> region + (cellA,cellB)
 *   2. read the perpendicular edge `di` (facing-dispatched: a 2-bit wall field)
 *   3. read special4 (+0x1f8, 4-bit) and orient2 (+0x378, 2-bit) of the cell
 *   4. if ((orient2+1) % 4) == facing -> corner-type = JUMPTABLE[special4]
 *      else -> corner-type = di (raw edge field, 0 or 2)
 *   JUMPTABLE: special4==4 -> 9 (the SOLID wt=2 wall). others -> 4..0xd / raw.
 * The corner emitter (0x45b4) appends a wt=2 span iff corner-type >= 7 (the
 * type-9 path). type 0/2 -> edge marker (no wt=2 span).
 *
 * We read all planes (region*64+cellA*8+cellB indexing) and reproduce the
 * per-depth corner-L / corner-R types, comparing to the live wt=2 span depthFields.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const u16 = (b: Uint8Array, o = 0): number => b[o]! | (b[o + 1]! << 8);

const O = {
  facing: 0x4f9a,
  cellA: 0x4f9e,
  cellB: 0x4fa0,
  gy: 0x4fa2,
  gx: 0x4fa4,
  maze_ptr: 0x4faa,
  span_count: 0x50ce,
  span_list: 0x50d0,
};
const MB = {
  north: 0x60, // 2 bits
  west: 0x120, // 2 bits
  pit: 0x43a, // 1 bit
  special4: 0x1f8, // 4 bits
  orient2: 0x378, // 2 bits
  gx_base: 0x1e0,
  gy_base: 0x1ec,
};

// corner-L jump table (special4 0..0xc -> corner-type when orient matches facing)
// from wmaze.ovr @file 0x3da2: [0]raw [1]5 [2]6 [3]8 [4]9 [5]raw [6]raw [7]4 [8]7 [9]a [10]b [11]c [12]d
const CORNER_JT_L: Record<number, number | 'raw'> = {
  0: 'raw',
  1: 5,
  2: 6,
  3: 8,
  4: 9,
  5: 'raw',
  6: 'raw',
  7: 4,
  8: 7,
  9: 0xa,
  10: 0xb,
  11: 0xc,
  12: 0xd,
};

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
  for (const k of keys) {
    await c.key(k, 'tap');
    await c.step(40);
  }
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
    for (let r = 0; r < 12; r++) {
      if (gxBase[r]! <= gx && gx <= gxBase[r]! + 7 && gyBase[r]! <= gy && gy <= gyBase[r]! + 7)
        return { region: r, cA: gy - gyBase[r]!, cB: gx - gxBase[r]! };
    }
    return null;
  };
  const cellIdx = (r: { region: number; cA: number; cB: number }) => r.region * 64 + r.cA * 8 + r.cB;

  // corner-L (0x3c11) edge selector per facing (the perpendicular wall it reads as `di`):
  //   f0 -> 0x3742 (W of gx-1 neighbour) ; f1 -> N(+0x60) ; f2 -> W(+0x120) ; f3 -> 0x36dd (N of gy-1)
  // corner-R (0x3dce):
  //   f0 -> W(+0x120) ; f1 -> 0x36dd (N of gy-1) ; f2 -> 0x3742 (W of gx-1) ; f3 -> N(+0x60)
  const N = (r: any) => getBits(mb, MB.north, cellIdx(r), 2);
  const W = (r: any) => getBits(mb, MB.west, cellIdx(r), 2);
  const Nm1gy = (g: { gx: number; gy: number }) => {
    const r = resolve(g.gx, g.gy - 1);
    return r ? N(r) : 2;
  };
  const Wm1gx = (g: { gx: number; gy: number }) => {
    const r = resolve(g.gx - 1, g.gy);
    return r ? W(r) : 2;
  };

  const cornerType = (gx: number, gy: number, which: 'L' | 'R'): { di: number; orient: number; special: number; type: number | 'oob' } => {
    const r = resolve(gx, gy);
    if (!r) return { di: 2, orient: -1, special: -1, type: 'oob' };
    const idx = cellIdx(r);
    const special = getBits(mb, MB.special4, idx, 4);
    const orient = getBits(mb, MB.orient2, idx, 2);
    let di = 0;
    if (which === 'L') {
      di = facing === 0 ? Wm1gx({ gx, gy }) : facing === 1 ? N(r) : facing === 2 ? W(r) : Nm1gy({ gx, gy });
    } else {
      di = facing === 0 ? W(r) : facing === 1 ? Nm1gy({ gx, gy }) : facing === 2 ? Wm1gx({ gx, gy }) : N(r);
    }
    // orientation gate
    const matched = (orient + 1) % 4 === facing;
    let type: number;
    if (matched) {
      const jt = CORNER_JT_L[special];
      type = jt === 'raw' || jt === undefined ? di : jt;
    } else {
      type = di;
    }
    return { di, orient, special, type };
  };

  // live wt2 spans
  const cnt = u16(await rd(O.span_count, 2));
  const sb = await c.read(base + O.span_list, cnt * 0xb + 4);
  const liveWt2: number[] = [];
  for (let i = 0; i < cnt; i++) if (sb[i * 0xb + 8] === 2) liveWt2.push(sb[i * 0xb + 10]!);

  console.log(`\n=== ${name} facing${facing} g(${gx},${gy}) ===`);
  console.log(`  LIVE wt2 span depthFields: [${liveWt2.sort((a, b) => a - b).join(',')}]`);
  let cgx = gx,
    cgy = gy;
  [cgx, cgy] = step(cgx, cgy, facing, 0, -1);
  for (let d = 0; d < 4; d++) {
    [cgx, cgy] = step(cgx, cgy, facing, 0, 1);
    const L = cornerType(cgx, cgy, 'L');
    const R = cornerType(cgx, cgy, 'R');
    const emitL = typeof L.type === 'number' && L.type >= 7;
    const emitR = typeof R.type === 'number' && R.type >= 7;
    console.log(
      `  d${d} ctr g(${cgx},${cgy}): cornerL{di${L.di} orient${L.orient} sp${L.special} -> type${L.type}${emitL ? ' EMIT' : ''}} cornerR{di${R.di} orient${R.orient} sp${R.special} -> type${R.type}${emitR ? ' EMIT' : ''}}`,
    );
  }
}

async function main() {
  const c = new HostClient();
  const S = (n: string) => `${process.cwd()}/tools/libretro/states/${n}.state`;
  try {
    await run(c, 'maze-corridor', S('maze-corridor'), []);
    await run(c, 'turn-left', S('maze-corridor-turn-left'), []);
    await run(c, 'lookback', S('maze-corridor'), ['right', 'right']);
    await run(c, 'asym', S('maze-corridor-asym'), []);
  } finally {
    c.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
