/**
 * maze-planes-probe.ts — read the full multi-region wall planes + simulate the
 * fine-coord (global-cell) resolver for the maze emission gate.
 *
 * The maze block holds N/W wall bits indexed by cell = region*64 + cellA*8 + cellB
 * (the resolver overwrites the z-slot with the region index). We read all
 * region planes that the 6 active regions touch, then simulate, per frame/depth,
 * the center + left/right side-cell resolution and forward-edge read, and compare
 * to the live spans / slot values.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const u16 = (b: Uint8Array, o = 0): number => b[o]! | (b[o + 1]! << 8);

const O = {
  facing: 0x4f9a,
  z: 0x4f9c,
  cellA: 0x4f9e,
  cellB: 0x4fa0,
  gy: 0x4fa2,
  gx: 0x4fa4,
  cur_cell: 0x4fa6,
  maze_ptr: 0x4faa,
  span_count: 0x50ce,
  span_list: 0x50d0,
};
const MB = { north_bits: 0x60, west_bits: 0x120, gx_base: 0x1e0, gy_base: 0x1ec };

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

async function frame(c: HostClient, state: string, keys: string[]) {
  await c.unserialize(state);
  await c.step(2);
  for (const k of keys) {
    await c.key(k, 'tap');
    await c.step(40);
  }
  const base = await c.anchor();
  const rd = async (off: number, n: number) => c.read(base + off, n);
  const facing = u16(await rd(O.facing, 2));
  const cellA = u16(await rd(O.cellA, 2));
  const cellB = u16(await rd(O.cellB, 2));
  const gy = u16(await rd(O.gy, 2));
  const gx = u16(await rd(O.gx, 2));
  const ptr = u16(await rd(O.maze_ptr, 2));
  // read the whole maze block (N planes cover cell up to region*64; read generous 0x2000)
  const mb = await c.read(base + ptr, 0x2000);
  const gxBase = Array.from(mb.slice(MB.gx_base, MB.gx_base + 12));
  const gyBase = Array.from(mb.slice(MB.gy_base, MB.gy_base + 12));
  // wall read: cell index = region*64 + cellA*8 + cellB. 2 bits/cell.
  const north = (cell: number) => getBits(mb, MB.north_bits, cell, 2);
  const west = (cell: number) => getBits(mb, MB.west_bits, cell, 2);
  return { state, keys, facing, cellA, cellB, gx, gy, gxBase, gyBase, north, west, base, rd, ptr, mbLen: mb.length };
}

function makeResolver(gxBase: number[], gyBase: number[]) {
  return (gx: number, gy: number): { region: number; cA: number; cB: number } | null => {
    for (let r = 0; r < 12; r++) {
      if (gxBase[r]! <= gx && gx <= gxBase[r]! + 7 && gyBase[r]! <= gy && gy <= gyBase[r]! + 7) {
        return { region: r, cA: gy - gyBase[r]!, cB: gx - gxBase[r]! };
      }
    }
    return null;
  };
}

function step(gx: number, gy: number, facing: number, lateral: number, forward: number): [number, number] {
  if (facing === 0) return [gx + lateral, gy + forward];
  if (facing === 1) return [gx + forward, gy - lateral];
  if (facing === 2) return [gx - lateral, gy - forward];
  return [gx - forward, gy + lateral]; // facing 3
}

async function main() {
  const c = new HostClient();
  const S = (n: string) => `${process.cwd()}/tools/libretro/states/${n}.state`;
  try {
    const specs = [
      { name: 'maze-corridor', state: S('maze-corridor'), keys: [] as string[] },
      { name: 'turn-left', state: S('maze-corridor-turn-left'), keys: [] },
      { name: 'lookback', state: S('maze-corridor'), keys: ['right', 'right'] },
      { name: 'asym', state: S('maze-corridor-asym'), keys: [] },
    ];
    for (const sp of specs) {
      const f = await frame(c, sp.state, sp.keys);
      const resolve = makeResolver(f.gxBase, f.gyBase);
      // forward-edge read at a global cell, under facing: f0/f2 -> N, f1/f3 -> W,
      // cell index = region*64 + cA*8 + cB. OOB -> solid (2).
      const fwdEdge = (gx: number, gy: number): number => {
        const r = resolve(gx, gy);
        if (!r) return 2; // OOB = solid
        const cell = r.region * 64 + r.cA * 8 + r.cB;
        return f.facing === 0 || f.facing === 2 ? f.north(cell) : f.west(cell);
      };
      // live spans
      const cnt = u16(await f.rd(O.span_count, 2));
      const sb = await c.read(f.base + O.span_list, cnt * 0xb + 4);
      const wt2: number[] = [];
      for (let i = 0; i < cnt; i++) {
        if (sb[i * 0xb + 8] === 2) wt2.push(sb[i * 0xb + 10]!); // depthField of each wt=2 span
      }
      console.log(`\n=== ${sp.name} facing${f.facing} cellA${f.cellA} cellB${f.cellB} g(${f.gx},${f.gy}) ===`);
      console.log(`  LIVE wt2 span depthFields: [${wt2.sort((a, b) => a - b).join(',')}]`);
      let cgx = f.gx,
        cgy = f.gy;
      [cgx, cgy] = step(cgx, cgy, f.facing, 0, -1); // entry pullback
      for (let d = 0; d < 4; d++) {
        [cgx, cgy] = step(cgx, cgy, f.facing, 0, 1);
        const cr = resolve(cgx, cgy);
        const fe = fwdEdge(cgx, cgy);
        const [lgx, lgy] = step(cgx, cgy, f.facing, -1, 0);
        const [rgx, rgy] = step(cgx, cgy, f.facing, 1, 0);
        const ls = fwdEdge(lgx, lgy);
        const rs = fwdEdge(rgx, rgy);
        const lr = resolve(lgx, lgy);
        const rr = resolve(rgx, rgy);
        console.log(
          `  d${d}: ctr g(${cgx},${cgy}) reg${cr?.region}cell(a${cr?.cA},b${cr?.cB}) fwdEdge=${fe} | LEFT g(${lgx},${lgy}) reg${lr ? lr.region : 'OOB'} fwd=${ls} | RIGHT g(${rgx},${rgy}) reg${rr ? rr.region : 'OOB'} fwd=${rs}`,
        );
      }
    }
  } finally {
    c.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
