/**
 * maze-classify-probe.ts — RE probe for the maze CLASSIFY law (0x3c11/0x3828/0x3dce).
 *
 * Reads the live maze-block per-cell coordinate tables + wall grids and the
 * party/slot state, decodes the cell layout, then drives the party (arrows) to
 * hunt for an ASYMMETRIC zone-0 frame (one side open, one solid), reading
 * @0x5220 slot-walltypes at each step.
 *
 * Phases:
 *   dump <state>     dump party + maze-block tables + wall grids + slot5220 for a state
 *   explore <state>  BFS-ish walk: at each reachable cell+facing read slot5220, log asymmetric frames
 *   capture <state> <out.state>  serialize the current frame
 */
import { writeFileSync } from 'node:fs';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const u16 = (b: Uint8Array, o = 0): number => b[o]! | (b[o + 1]! << 8);
const u8 = (b: Uint8Array, o = 0): number => b[o]!;

// DGROUP offsets (base = anchor()).
const O = {
  game_state: 0x363a,
  zone: 0x363c,
  facing: 0x4f9a,
  z: 0x4f9c,
  x: 0x4f9e,
  y: 0x4fa0,
  gy: 0x4fa2,
  gx: 0x4fa4,
  cur_cell: 0x4fa6,
  maze_ptr: 0x4faa, // near ptr (offset within DS) to the maze block
  slot5220: 0x5220, // 5 words
  span_count: 0x50ce,
  span_list: 0x50d0,
};

// Maze-block sub-offsets (relative to [maze_ptr]).
const MB = {
  north_bits: 0x60, // 2 bits/cell, 64 cells -> 16 bytes
  west_bits: 0x120,
  pit_bits: 0x43a, // 1 bit/cell
  special4_bits: 0x1f8, // 4 bits/cell (door/decoration variants)
  orient2_bits: 0x378, // 2 bits/cell (decoration orientation)
  spec_bits: 0x49a, // 1 bit/cell
  gx_base: 0x1e0, // per-cell-region gx base (1 byte each, up to 12 regions)
  gy_base: 0x1ec, // per-cell-region gy base
};

/** Read N bits starting at bit `bitOff` MSB-first from a byte buffer. */
function getBits(buf: Uint8Array, base: number, cell: number, nbits: number): number {
  const bitOff = cell * nbits;
  let v = 0;
  for (let i = 0; i < nbits; i++) {
    const b = bitOff + i;
    const byte = buf[base + (b >> 3)] ?? 0;
    const bit = (byte >> (7 - (b & 7))) & 1;
    v = (v << 1) | bit;
  }
  return v;
}

async function readParty(c: HostClient, base: number) {
  const facing = u16(await c.read(base + O.facing, 2));
  const z = u16(await c.read(base + O.z, 2));
  const x = u16(await c.read(base + O.x, 2));
  const y = u16(await c.read(base + O.y, 2));
  const gy = u16(await c.read(base + O.gy, 2));
  const gx = u16(await c.read(base + O.gx, 2));
  const zone = u16(await c.read(base + O.zone, 2));
  const cell = u16(await c.read(base + O.cur_cell, 2));
  return { facing, z, x, y, gx, gy, zone, cell };
}

async function readSlots(c: HostClient, base: number): Promise<number[]> {
  const b = await c.read(base + O.slot5220, 10);
  return [u16(b, 0), u16(b, 2), u16(b, 4), u16(b, 6), u16(b, 8)];
}

/** Read the maze block as a flat buffer (enough to cover all sub-tables). */
async function readMazeBlock(c: HostClient, base: number): Promise<{ ptr: number; buf: Uint8Array }> {
  const ptr = u16(await c.read(base + O.maze_ptr, 2));
  // The maze block lives at DS:ptr -> linear base + ptr. Read 0x600 bytes (covers up to 0x5a0+).
  const buf = await c.read(base + ptr, 0x620);
  return { ptr, buf };
}

function decodeGrids(buf: Uint8Array) {
  const north: number[] = [];
  const west: number[] = [];
  const pit: number[] = [];
  for (let cell = 0; cell < 64; cell++) {
    north.push(getBits(buf, MB.north_bits, cell, 2));
    west.push(getBits(buf, MB.west_bits, cell, 2));
    pit.push(getBits(buf, MB.pit_bits, cell, 1));
  }
  return { north, west, pit };
}

function printGrid(label: string, grid: number[]) {
  console.log(`  ${label} (rows y=0..7, cols x=0..7):`);
  for (let y = 0; y < 8; y++) {
    const row: string[] = [];
    for (let x = 0; x < 8; x++) row.push(String(grid[y * 8 + x]));
    console.log(`    y${y}: ${row.join(' ')}`);
  }
}

async function phaseDump(c: HostClient, state: string) {
  await c.unserialize(state);
  await c.step(2);
  const base = await c.anchor();
  const p = await readParty(c, base);
  const slots = await readSlots(c, base);
  const { ptr, buf } = await readMazeBlock(c, base);
  const { north, west, pit } = decodeGrids(buf);
  console.log(`STATE ${state}`);
  console.log(`  party:`, p);
  console.log(`  slot5220: [${slots.join(', ')}]`);
  console.log(`  maze_ptr=${ptr.toString(16)}`);
  // per-cell-region coordinate base tables
  const gxBase = Array.from(buf.slice(MB.gx_base, MB.gx_base + 12));
  const gyBase = Array.from(buf.slice(MB.gy_base, MB.gy_base + 12));
  console.log(`  gx_base[+0x1e0] (12): [${gxBase.join(',')}]`);
  console.log(`  gy_base[+0x1ec] (12): [${gyBase.join(',')}]`);
  // span list
  const cnt = u16(await c.read(base + O.span_count, 2));
  const sb = await c.read(base + O.span_list, cnt * 0xb + 4);
  console.log(`  spans (count=${cnt}):`);
  for (let i = 0; i < cnt; i++) {
    const o = i * 0xb;
    console.log(
      `    [${i}] x0=${u16(sb, o)} x1=${u16(sb, o + 2)} clipLo=${u16(sb, o + 4)} clipHi=${u16(sb, o + 6)} wt=${u8(sb, o + 8)} seam=${u8(sb, o + 9)} df=${u8(sb, o + 10)}`,
    );
  }
  printGrid('NORTH', north);
  printGrid('WEST', west);
  // pit non-zero cells
  const pits = pit.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  console.log(`  pit cells: [${pits.join(',')}]`);
}

/** Drive one move from a fresh restore of `state`, return resulting party+slots. */
async function move(c: HostClient, state: string, keys: string[]) {
  await c.unserialize(state);
  await c.step(2);
  for (const k of keys) {
    await c.key(k, 'tap');
    await c.step(40);
  }
  const base = await c.anchor();
  return { party: await readParty(c, base), slots: await readSlots(c, base), base };
}

/** BFS over reachable cells from a state, recording each (cell,facing) slot5220. */
async function phaseExplore(c: HostClient, state: string) {
  // We explore by replaying key-sequences from the committed state (deterministic).
  // Track visited (cell,facing). Frontier = key-paths. Depth-limited.
  const seen = new Set<string>();
  const found: Array<{ path: string[]; party: any; slots: number[] }> = [];
  // seed
  const queue: string[][] = [[]];
  let iterations = 0;
  const MAX_ITER = 400;
  while (queue.length && iterations < MAX_ITER) {
    const path = queue.shift()!;
    iterations++;
    const { party, slots } = await move(c, state, path);
    const key = `${party.zone}:${party.cell}:${party.facing}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Slots layout: [front, corner-L, corner-R, left-side, right-side]
    const [front, cL, cR, lSide, rSide] = slots;
    const asym = lSide !== rSide || cL !== cR;
    if (asym) {
      found.push({ path, party, slots });
      console.log(
        `ASYM path=[${path.join(',')}] cell=${party.cell} facing=${party.facing} x=${party.x} y=${party.y} gx=${party.gx} gy=${party.gy} slots=[${slots.join(',')}]`,
      );
    }
    if (path.length >= 8) continue; // depth limit
    for (const k of ['up', 'left', 'right']) {
      queue.push([...path, k]);
    }
  }
  console.log(`\nexplored ${seen.size} unique (cell,facing) states in ${iterations} iters; ${found.length} asymmetric frames.`);
  // Print the shortest asym path for each distinct slot-signature
  const bySig = new Map<string, { path: string[]; party: any; slots: number[] }>();
  for (const f of found) {
    const sig = f.slots.join(',');
    if (!bySig.has(sig) || f.path.length < bySig.get(sig)!.path.length) bySig.set(sig, f);
  }
  console.log('\nDistinct asymmetric slot-signatures (shortest path each):');
  for (const [sig, f] of bySig) {
    console.log(`  slots=[${sig}] path=[${f.path.join(',')}] facing=${f.party.facing} cell=${f.party.cell} x=${f.party.x} y=${f.party.y}`);
  }
}

async function phaseCapture(c: HostClient, state: string, path: string, outState: string) {
  await c.unserialize(state);
  await c.step(2);
  const keys = path.split(',').filter(Boolean);
  for (const k of keys) {
    await c.key(k, 'tap');
    await c.step(40);
  }
  const base = await c.anchor();
  const p = await readParty(c, base);
  const slots = await readSlots(c, base);
  console.log('captured frame party:', p, 'slots:', slots);
  await c.serialize(outState);
  console.log(`serialized -> ${outState}`);
}

async function main() {
  const phase = process.argv[2];
  const state = process.argv[3] ?? 'tools/libretro/states/maze-corridor.state';
  const c = new HostClient();
  try {
    if (phase === 'dump') await phaseDump(c, state);
    else if (phase === 'explore') await phaseExplore(c, state);
    else if (phase === 'capture') await phaseCapture(c, state, process.argv[4]!, process.argv[5]!);
    else console.error('phases: dump | explore | capture');
  } finally {
    c.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
