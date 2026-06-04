/**
 * maze-gate-probe.ts — read the fine-coord region tables + per-depth gate arrays
 * for the maze emission-gate RE (docs/re/findings/maze-classify-gating.json).
 *
 * For each of the 4 frames (maze-corridor, turn-left, lookback, asym), unserialize
 * (lookback is driven: right,right from corridor), settle, and read:
 *   - party fine coords (gx/gy), facing, cellA/cellB, cur_cell region
 *   - the 12-entry region tables gx_base(+0x1e0) / gy_base(+0x1ec)
 *   - the per-depth gate arrays: front 0x508a[0..3], leftA 0x5072, leftB 0x507a,
 *     centerFC 0x5082, rightA 0x5092, rightB 0x509a, rightFC 0x50a2,
 *     gate5043[0..11], gate5050[0..23 words]
 *   - slot5220 (residual last depth), span list, parity 0x521a, depth_bound 0x521e
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const u16 = (b: Uint8Array, o = 0): number => b[o]! | (b[o + 1]! << 8);
const u8 = (b: Uint8Array, o = 0): number => b[o]!;

const O = {
  game_state: 0x363a,
  zone: 0x363c,
  facing: 0x4f9a,
  z: 0x4f9c,
  x: 0x4f9e, // cellA
  y: 0x4fa0, // cellB
  gy: 0x4fa2,
  gx: 0x4fa4,
  cur_cell: 0x4fa6,
  maze_ptr: 0x4faa,
  gate5043: 0x5043, // 12 bytes
  gate5050: 0x5050, // 24 words
  leftA: 0x5072,
  leftB: 0x507a,
  centerFC: 0x5082,
  front: 0x508a,
  rightA: 0x5092,
  rightB: 0x509a,
  rightFC: 0x50a2,
  gate50ab: 0x50ab,
  gate50b8: 0x50b8,
  span_count: 0x50ce,
  span_list: 0x50d0,
  parity: 0x521a,
  parity_span: 0x521c,
  depth_bound: 0x521e,
  slot5220: 0x5220,
};

const MB = { gx_base: 0x1e0, gy_base: 0x1ec, north_bits: 0x60, west_bits: 0x120 };

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

async function readByteArr(c: HostClient, base: number, off: number, n: number): Promise<number[]> {
  const b = await c.read(base + off, n);
  return Array.from(b.slice(0, n));
}

async function dumpFrame(c: HostClient, label: string, state: string, keys: string[]) {
  await c.unserialize(state);
  await c.step(2);
  for (const k of keys) {
    await c.key(k, 'tap');
    await c.step(40);
  }
  const base = await c.anchor();
  const rd = async (off: number, n: number) => c.read(base + off, n);

  const facing = u16(await rd(O.facing, 2));
  const z = u16(await rd(O.z, 2));
  const cellA = u16(await rd(O.x, 2));
  const cellB = u16(await rd(O.y, 2));
  const gy = u16(await rd(O.gy, 2));
  const gx = u16(await rd(O.gx, 2));
  const curCell = u16(await rd(O.cur_cell, 2));
  const ptr = u16(await rd(O.maze_ptr, 2));
  const mb = await c.read(base + ptr, 0x300);
  const gxBase = Array.from(mb.slice(MB.gx_base, MB.gx_base + 12));
  const gyBase = Array.from(mb.slice(MB.gy_base, MB.gy_base + 12));

  const front = await readByteArr(c, base, O.front, 4);
  const leftA = await readByteArr(c, base, O.leftA, 4);
  const leftB = await readByteArr(c, base, O.leftB, 4);
  const centerFC = await readByteArr(c, base, O.centerFC, 4);
  const rightA = await readByteArr(c, base, O.rightA, 4);
  const rightB = await readByteArr(c, base, O.rightB, 4);
  const rightFC = await readByteArr(c, base, O.rightFC, 4);
  const g5043 = await readByteArr(c, base, O.gate5043, 12);
  const parity = u16(await rd(O.parity, 2));
  const depthBound = u16(await rd(O.depth_bound, 2));
  const slotBuf = await c.read(base + O.slot5220, 10);
  const slot5220 = [0, 2, 4, 6, 8].map((o) => u16(slotBuf, o));

  const cnt = u16(await rd(O.span_count, 2));
  const sb = await c.read(base + O.span_list, cnt * 0xb + 4);
  const spans: any[] = [];
  for (let i = 0; i < cnt; i++) {
    const o = i * 0xb;
    spans.push({
      x0: u16(sb, o),
      x1: u16(sb, o + 2),
      clipLo: u16(sb, o + 4),
      clipHi: u16(sb, o + 6),
      wt: u8(sb, o + 8),
      seam: u8(sb, o + 9),
      df: u8(sb, o + 10),
    });
  }

  const out = {
    label,
    party: { facing, z, cellA, cellB, gx, gy, curCell, parity, depthBound },
    region_tables: { gxBase, gyBase },
    gates: { front, leftA, leftB, centerFC, rightA, rightB, rightFC, gate5043: g5043 },
    slot5220,
    spanCount: cnt,
    spans,
  };
  console.log(JSON.stringify(out, null, 2));
  return out;
}

async function main() {
  const c = new HostClient();
  const S = (n: string) => `${process.cwd()}/tools/libretro/states/${n}.state`;
  try {
    const frames = [
      { label: 'maze-corridor', state: S('maze-corridor'), keys: [] as string[] },
      { label: 'turn-left', state: S('maze-corridor-turn-left'), keys: [] },
      { label: 'lookback', state: S('maze-corridor'), keys: ['right', 'right'] },
      { label: 'asym', state: S('maze-corridor-asym'), keys: [] },
    ];
    const results: any[] = [];
    for (const f of frames) results.push(await dumpFrame(c, f.label, f.state, f.keys));
    console.log('\n===SUMMARY===');
    for (const r of results) {
      console.log(
        `${r.label.padEnd(14)} facing=${r.party.facing} cellA=${r.party.cellA} cellB=${r.party.cellB} gx=${r.party.gx} gy=${r.party.gy} curCell=${r.party.curCell} parity=${r.party.parity} | front=[${r.gates.front}] leftA=[${r.gates.leftA}] rightA=[${r.gates.rightA}] | slots=[${r.slot5220}] wt2spans=${r.spans.filter((s: any) => s.wt === 2).length}`,
      );
    }
    console.log('\nregion tables (constant across frames? gxBase/gyBase):');
    for (const r of results) {
      console.log(`  ${r.label.padEnd(14)} gxBase=[${r.region_tables.gxBase}] gyBase=[${r.region_tables.gyBase}]`);
    }
  } finally {
    c.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
