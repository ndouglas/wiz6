/**
 * maze-sidewall-probe.ts — Prong A: test the side-wall EMIT predicate offline
 * against the READ multi-region geometry for all 4 frames.
 *
 * Per the gating findings the plain stone wt=2 side walls flow through
 * wall_emit_quad (0x406c) type-0/2 path @0x44c9 (NOT corner-type-9). The side
 * quad's solidity is the SIDE slot (classify_front_side 0x3828 param 0xffff/1):
 * a LATERAL view_step to the neighbour cell, then read THAT cell's FORWARD wall.
 *
 * But a side WALL (the thing you see flanking the corridor) is really the
 * PERPENDICULAR wall separating the center cell from its lateral neighbour.
 * This probe reads, per depth, every candidate geometric quantity so we can
 * find the predicate that reproduces lookback=[0,1,2,3] and the other 3 = [].
 *
 * Quantities read per depth d (center = party + d*forward, global gx/gy):
 *   - fwdEdge(center)       : forward wall of center (N for f0/f2, W for f1/f3)
 *   - perpWall(center, side): the wall on the center cell's left/right SIDE
 *                             (perpendicular to forward) — the literal side wall.
 *   - latFwd(side)          : forward wall of the lateral-neighbour cell (the
 *                             0x3828 side-slot read).
 *   - region of center/left/right (OOB => solid).
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

type Frame = {
  name: string;
  facing: number;
  gx: number;
  gy: number;
  resolve: (gx: number, gy: number) => { region: number; cA: number; cB: number } | null;
  N: (gx: number, gy: number) => number; // own N wall (perpendicular to cellA axis)
  W: (gx: number, gy: number) => number; // own W wall (perpendicular to cellB axis)
  liveWt2: number[];
};

async function readFrame(c: HostClient, name: string, state: string, keys: string[]): Promise<Frame> {
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
  const idx = (r: { region: number; cA: number; cB: number }) => r.region * 64 + r.cA * 8 + r.cB;
  const N = (gx: number, gy: number) => {
    const r = resolve(gx, gy);
    return r ? getBits(mb, MB.north, idx(r), 2) : 2;
  };
  const W = (gx: number, gy: number) => {
    const r = resolve(gx, gy);
    return r ? getBits(mb, MB.west, idx(r), 2) : 2;
  };
  const cnt = u16(await rd(O.span_count, 2));
  const sb = await c.read(base + O.span_list, cnt * 0xb + 4);
  const liveWt2: number[] = [];
  for (let i = 0; i < cnt; i++) if (sb[i * 0xb + 8] === 2) liveWt2.push(sb[i * 0xb + 10]!);
  liveWt2.sort((a, b) => a - b);
  return { name, facing, gx, gy, resolve, N, W, liveWt2 };
}

/**
 * The perpendicular side wall of a cell at (gx,gy) for a given facing + screen-side.
 * Forward axis: f0=+gy, f1=+gx, f2=-gy, f3=-gx. The side walls are perpendicular.
 * For an N/W grid where N[cell] = wall on the -gy edge of the cell (north),
 * W[cell] = wall on the -gx edge (west). The wall on the +gy edge = N of (gy+1);
 * the +gx edge = W of (gx+1).
 *
 * screen-LEFT / screen-RIGHT walls relative to facing:
 *   f0 (look +gy): left = -gx edge = W(cell); right = +gx edge = W(gx+1).
 *   f1 (look +gx): left = +gy edge = N(gy+1); right = -gy edge = N(cell).
 *   f2 (look -gy): left = +gx edge = W(gx+1); right = -gx edge = W(cell).
 *   f3 (look -gx): left = -gy edge = N(cell); right = +gy edge = N(gy+1).
 */
function perpWall(f: Frame, gx: number, gy: number, side: 'L' | 'R'): number {
  const { N, W } = f;
  switch (f.facing) {
    case 0:
      return side === 'L' ? W(gx, gy) : W(gx + 1, gy);
    case 1:
      return side === 'L' ? N(gx, gy + 1) : N(gx, gy);
    case 2:
      return side === 'L' ? W(gx + 1, gy) : W(gx, gy);
    default:
      return side === 'L' ? N(gx, gy) : N(gx, gy + 1);
  }
}

function main_run(frames: Frame[]) {
  for (const f of frames) {
    console.log(`\n=== ${f.name} facing${f.facing} g(${f.gx},${f.gy}) parity=${(f.gx + f.gy + f.facing) % 2} ===`);
    console.log(`  LIVE wt2 depthFields: [${f.liveWt2.join(',')}]`);
    let cgx = f.gx,
      cgy = f.gy;
    [cgx, cgy] = step(cgx, cgy, f.facing, 0, -1); // entry pullback
    for (let d = 0; d < 4; d++) {
      [cgx, cgy] = step(cgx, cgy, f.facing, 0, 1);
      const cr = f.resolve(cgx, cgy);
      const fwd = f.facing === 0 || f.facing === 2 ? f.N(cgx, cgy) : f.W(cgx, cgy);
      const pL = perpWall(f, cgx, cgy, 'L');
      const pR = perpWall(f, cgx, cgy, 'R');
      // lateral neighbour forward walls (the 0x3828 side-slot read)
      const [lgx, lgy] = step(cgx, cgy, f.facing, -1, 0);
      const [rgx, rgy] = step(cgx, cgy, f.facing, 1, 0);
      const latL = f.facing === 0 || f.facing === 2 ? f.N(lgx, lgy) : f.W(lgx, lgy);
      const latR = f.facing === 0 || f.facing === 2 ? f.N(rgx, rgy) : f.W(rgx, rgy);
      const parity = (f.gx + f.gy + f.facing + d) % 2;
      console.log(
        `  d${d} ctr g(${cgx},${cgy}) reg${cr?.region ?? 'OOB'}: fwd=${fwd} | perpL=${pL} perpR=${pR} | latFwdL=${latL} latFwdR=${latR} | spanParity=${parity}`,
      );
    }
  }
}

async function main() {
  const c = new HostClient();
  const S = (n: string) => `${process.cwd()}/tools/libretro/states/${n}.state`;
  try {
    const frames = [
      await readFrame(c, 'maze-corridor', S('maze-corridor'), []),
      await readFrame(c, 'turn-left', S('maze-corridor-turn-left'), []),
      await readFrame(c, 'lookback', S('maze-corridor'), ['right', 'right']),
      await readFrame(c, 'asym', S('maze-corridor-asym'), []),
    ];
    main_run(frames);
  } finally {
    c.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
