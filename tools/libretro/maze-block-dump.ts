/**
 * maze-block-dump.ts — dump the FULL per-zone maze block (all region planes:
 * N/W/special4/orient2/pit + region tables) ONCE, plus per-frame corrected
 * classifier slots for every captured frame (4 committed + 8 navigated).
 *
 * Output: /tmp/maze-block.json — the static per-zone planes (committable) and a
 * per-frame {party, correctedSlots, wt2_live}. Drives the offline orient2-aware
 * classifier so we never depend on mid-build live span reads.
 *
 * The per-zone planes are STATIC (identical across all frames); they live in
 * maze_block (near ptr 0x4faa). The corrected classifier reads (front/cornerL/R/
 * leftSide/rightSide) follow docs/re/findings/maze-classify-determinism.json:
 *   forward edge: f0 N(cell), f1 W(cell), f2 N(cell.gy-1)[OOB->2], f3 W(cell.gx-1)[OOB->2]
 *   cornerL perp: f0 W(gx-1), f1 N(cell), f2 W(cell), f3 N(gy-1)
 *   cornerR perp: f0 W(cell), f1 N(gy-1), f2 W(gx-1), f3 N(cell)
 *   side: lateral view_step (OOB-after-step -> SOLID 2) then forward-edge of neighbour.
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

type Block = {
  gxBase: number[];
  gyBase: number[];
  read: (off: number, n: number) => number;
};

async function frame(c: HostClient, name: string, state: string, keys: string[]) {
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

  const resolve = (qx: number, qy: number) => {
    for (let r = 0; r < 12; r++)
      if (gxBase[r]! <= qx && qx <= gxBase[r]! + 7 && gyBase[r]! <= qy && qy <= gyBase[r]! + 7)
        return { region: r, cA: qy - gyBase[r]!, cB: qx - gxBase[r]! };
    return null;
  };
  const idx = (r: { region: number; cA: number; cB: number }) => r.region * 64 + r.cA * 8 + r.cB;
  const N = (qx: number, qy: number) => {
    const r = resolve(qx, qy);
    return r ? getBits(mb, MB.north, idx(r), 2) : 2;
  };
  const W = (qx: number, qy: number) => {
    const r = resolve(qx, qy);
    return r ? getBits(mb, MB.west, idx(r), 2) : 2;
  };
  // forward edge of the cell at (qx,qy) under facing, per the corrected selectors.
  const fwd = (qx: number, qy: number) => {
    switch (facing) {
      case 0:
        return N(qx, qy);
      case 1:
        return W(qx, qy);
      case 2:
        return N(qx, qy - 1); // helper 0x36dd (OOB -> solid via N())
      default:
        return W(qx - 1, qy); // helper 0x3742
    }
  };
  const cornerL = (qx: number, qy: number) => {
    switch (facing) {
      case 0:
        return W(qx - 1, qy);
      case 1:
        return N(qx, qy);
      case 2:
        return W(qx, qy);
      default:
        return N(qx, qy - 1);
    }
  };
  const cornerR = (qx: number, qy: number) => {
    switch (facing) {
      case 0:
        return W(qx, qy);
      case 1:
        return N(qx, qy - 1);
      case 2:
        return W(qx - 1, qy);
      default:
        return N(qx, qy);
    }
  };
  // side: lateral view_step (OOB-after-step -> SOLID 2) then forward-edge of neighbour.
  const side = (qx: number, qy: number, lat: -1 | 1) => {
    const [sx, sy] = step(qx, qy, facing, lat, 0);
    if (!resolve(sx, sy)) return 2;
    return fwd(sx, sy);
  };
  const o2 = (qx: number, qy: number) => {
    const r = resolve(qx, qy);
    return r ? getBits(mb, MB.orient2, idx(r), 2) : 0;
  };
  const s4 = (qx: number, qy: number) => {
    const r = resolve(qx, qy);
    return r ? getBits(mb, MB.special4, idx(r), 4) : 0;
  };
  const pit = (qx: number, qy: number) => {
    const r = resolve(qx, qy);
    return r ? getBits(mb, MB.pit, idx(r), 1) : 0;
  };

  const depths: any[] = [];
  let cgx = gx;
  let cgy = gy;
  [cgx, cgy] = step(cgx, cgy, facing, 0, -1);
  for (let d = 0; d < 4; d++) {
    [cgx, cgy] = step(cgx, cgy, facing, 0, 1);
    depths.push({
      d,
      gx: cgx,
      gy: cgy,
      front: fwd(cgx, cgy),
      cornerL: cornerL(cgx, cgy),
      cornerR: cornerR(cgx, cgy),
      leftSide: side(cgx, cgy, -1),
      rightSide: side(cgx, cgy, 1),
      orient2: o2(cgx, cgy),
      special4: s4(cgx, cgy),
      pit: pit(cgx, cgy),
      spanParity: (gx + gy + facing + d) % 2,
    });
  }

  const cnt = u16(await rd(O.span_count, 2));
  const sb = await c.read(base + O.span_list, cnt * 0xb + 4);
  const wt2: number[] = [];
  for (let i = 0; i < cnt; i++) if (sb[i * 0xb + 8] === 2) wt2.push(sb[i * 0xb + 10]!);
  wt2.sort((a, b) => a - b);

  return { name, party: { facing, gx, gy, parity: (gx + gy + facing) % 2 }, depths, wt2_live: wt2 };
}

async function dumpPlanes(c: HostClient) {
  await c.unserialize(`${process.cwd()}/tools/libretro/states/maze-corridor.state`);
  await c.step(2);
  const base = await c.anchor();
  const ptr = u16(await c.read(base + 0x4faa, 2));
  const mb = await c.read(base + ptr, 0x2000);
  const gxBase = Array.from(mb.slice(MB.gx_base, MB.gx_base + 12));
  const gyBase = Array.from(mb.slice(MB.gy_base, MB.gy_base + 12));
  // Dump all 12 region planes (64 cells each). Most are zone-empty but cheap.
  const planes: any = { gxBase, gyBase, regions: [] };
  for (let r = 0; r < 12; r++) {
    const cells: any[] = [];
    for (let i = 0; i < 64; i++) {
      const cell = r * 64 + i;
      cells.push({
        north: getBits(mb, MB.north, cell, 2),
        west: getBits(mb, MB.west, cell, 2),
        special4: getBits(mb, MB.special4, cell, 4),
        orient2: getBits(mb, MB.orient2, cell, 2),
        pit: getBits(mb, MB.pit, cell, 1),
      });
    }
    planes.regions.push(cells);
  }
  return planes;
}

async function main() {
  const c = new HostClient();
  const S = (n: string) => `${process.cwd()}/tools/libretro/states/${n}.state`;
  try {
    const planes = await dumpPlanes(c);
    const frames = [
      await frame(c, 'maze-corridor', S('maze-corridor'), []),
      await frame(c, 'maze-corridor-turn-left', S('maze-corridor-turn-left'), []),
      await frame(c, 'maze-corridor-lookback', S('maze-corridor'), ['right', 'right']),
      await frame(c, 'maze-corridor-asym', S('maze-corridor-asym'), []),
      await frame(c, 'up', S('maze-corridor'), ['up']),
      await frame(c, 'up-up', S('maze-corridor'), ['up', 'up']),
      await frame(c, 'up-RR', S('maze-corridor'), ['up', 'right', 'right']),
      await frame(c, 'up-up-RR', S('maze-corridor'), ['up', 'up', 'right', 'right']),
      await frame(c, 'R-up', S('maze-corridor'), ['right', 'up']),
      await frame(c, 'R-up-up', S('maze-corridor'), ['right', 'up', 'up']),
      await frame(c, 'L-up', S('maze-corridor'), ['left', 'up']),
      await frame(c, 'L-up-up', S('maze-corridor'), ['left', 'up', 'up']),
    ];
    const out = { planes, frames };
    writeFileSync('/tmp/maze-block.json', JSON.stringify(out, null, 2));
    console.log('wrote /tmp/maze-block.json');
    for (const f of frames) console.log(f.name, 'facing', f.party.facing, 'gx', f.party.gx, 'gy', f.party.gy, 'wt2_live', JSON.stringify(f.wt2_live));
  } finally {
    c.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
