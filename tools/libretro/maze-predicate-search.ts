/**
 * maze-predicate-search.ts — Prong A: brute-force candidate side-wall emit
 * predicates against the READ multi-region geometry of all 4 frames.
 *
 * Reuses readFrame/perpWall/step logic. For each frame+depth it computes a
 * feature vector, then tests a battery of boolean predicates and reports which
 * ones reproduce the LIVE wt2 depthField set for ALL 4 frames simultaneously.
 *
 * Truth: lookback emits d0,1,2,3; corridor/turn-left/asym emit nothing.
 */
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

type DepthFeat = {
  d: number;
  reg: number | null;
  fwd: number;
  perpL: number;
  perpR: number;
  latL: number;
  latR: number;
  pit: number;
  parity: number;
};
type FrameFeat = { name: string; facing: number; live: number[]; depths: DepthFeat[] };

async function readFrame(c: HostClient, name: string, state: string, keys: string[]): Promise<FrameFeat> {
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
  const PIT = (gx: number, gy: number) => {
    const r = resolve(gx, gy);
    return r ? getBits(mb, MB.pit, idx(r), 1) : 0;
  };
  const perpWall = (gx: number, gy: number, side: 'L' | 'R'): number => {
    switch (facing) {
      case 0:
        return side === 'L' ? W(gx, gy) : W(gx + 1, gy);
      case 1:
        return side === 'L' ? N(gx, gy + 1) : N(gx, gy);
      case 2:
        return side === 'L' ? W(gx + 1, gy) : W(gx, gy);
      default:
        return side === 'L' ? N(gx, gy) : N(gx, gy + 1);
    }
  };
  const cnt = u16(await rd(O.span_count, 2));
  const sb = await c.read(base + O.span_list, cnt * 0xb + 4);
  const live: number[] = [];
  for (let i = 0; i < cnt; i++) if (sb[i * 0xb + 8] === 2) live.push(sb[i * 0xb + 10]!);
  live.sort((a, b) => a - b);

  const depths: DepthFeat[] = [];
  let cgx = gx,
    cgy = gy;
  [cgx, cgy] = step(cgx, cgy, facing, 0, -1);
  for (let d = 0; d < 4; d++) {
    [cgx, cgy] = step(cgx, cgy, facing, 0, 1);
    const r = resolve(cgx, cgy);
    const fwd = facing === 0 || facing === 2 ? N(cgx, cgy) : W(cgx, cgy);
    const pL = perpWall(cgx, cgy, 'L');
    const pR = perpWall(cgx, cgy, 'R');
    const [lgx, lgy] = step(cgx, cgy, facing, -1, 0);
    const [rgx, rgy] = step(cgx, cgy, facing, 1, 0);
    const latL = facing === 0 || facing === 2 ? N(lgx, lgy) : W(lgx, lgy);
    const latR = facing === 0 || facing === 2 ? N(rgx, rgy) : W(rgx, rgy);
    depths.push({ d, reg: r ? r.region : null, fwd, perpL: pL, perpR: pR, latL, latR, pit: PIT(cgx, cgy), parity: (gx + gy + facing + d) % 2 });
  }
  return { name, facing, live, depths };
}

const sol = (v: number) => v >= 1; // any non-zero wall = blocking

type Pred = { name: string; fn: (f: FrameFeat, df: DepthFeat) => boolean };
const PREDS: Pred[] = [
  { name: 'perpL||perpR solid', fn: (_f, d) => sol(d.perpL) || sol(d.perpR) },
  { name: 'perpL&&perpR solid', fn: (_f, d) => sol(d.perpL) && sol(d.perpR) },
  { name: 'perpL solid', fn: (_f, d) => sol(d.perpL) },
  { name: 'perpR solid', fn: (_f, d) => sol(d.perpR) },
  { name: 'latL||latR solid', fn: (_f, d) => sol(d.latL) || sol(d.latR) },
  { name: 'parity-selected perp solid', fn: (_f, d) => (d.parity === 0 ? sol(d.perpR) : sol(d.perpL)) },
  { name: 'parity-selected perp solid (swap)', fn: (_f, d) => (d.parity === 0 ? sol(d.perpL) : sol(d.perpR)) },
  // "in a 1-wide corridor": exactly one perp side solid (XOR)
  { name: 'perpL xor perpR', fn: (_f, d) => sol(d.perpL) !== sol(d.perpR) },
  // bounded ahead view: previous-depth forward open AND a perp side solid somewhere down the run
  { name: 'fwd open && (perpL||perpR)', fn: (_f, d) => !sol(d.fwd) && (sol(d.perpL) || sol(d.perpR)) },
  // The whole-run quantities (lookback: perpL solid d0-2; corridor: mixed):
  { name: 'perpL solid for d0', fn: (f, d) => sol(f.depths[0]!.perpL) },
];

function main_run(frames: FrameFeat[]) {
  for (const p of PREDS) {
    let ok = true;
    const detail: string[] = [];
    for (const f of frames) {
      const got: number[] = [];
      for (const d of f.depths) if (p.fn(f, d)) got.push(d.d);
      const match = JSON.stringify(got) === JSON.stringify(f.live);
      if (!match) ok = false;
      detail.push(`${f.name}:got[${got.join(',')}]vs live[${f.live.join(',')}]${match ? '' : ' X'}`);
    }
    console.log(`${ok ? 'PASS' : 'fail'}  ${p.name}`);
    if (!ok) for (const dl of detail) console.log('       ' + dl);
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
    // dump features
    for (const f of frames) {
      console.log(`\n# ${f.name} f${f.facing} live[${f.live.join(',')}]`);
      for (const d of f.depths)
        console.log(`  d${d.d} reg${d.reg} fwd${d.fwd} pL${d.perpL} pR${d.perpR} latL${d.latL} latR${d.latR} pit${d.pit} par${d.parity}`);
    }
    console.log('\n--- predicate search ---');
    main_run(frames);
  } finally {
    c.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
