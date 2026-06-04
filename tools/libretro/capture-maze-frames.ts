/**
 * capture-maze-frames.ts — Capture additional maze corridor engine fixtures
 * for multi-frame parity validation (Task 10 of the maze-renderer-port plan).
 *
 * Loads the committed maze-corridor serialize-state, drives to multiple facings,
 * captures each frame as a 320×200 EGA-index fixture (idx.gz), and records the
 * per-frame geometry (party, slot5220, spans) + the shared cell wall data to
 * tools/parity/fixtures/engine/maze-frames.json.
 *
 * Frames captured:
 *   - maze-corridor        (original y3 facing-0 frame — from committed state.gz)
 *   - maze-corridor-turn-left   (facing 3, after one 'left' turn from y3)
 *   - maze-corridor-lookback    (facing 2, after 180° turn from y3: right×2)
 *
 * Outputs (committed):
 *   tools/parity/fixtures/engine/maze-corridor-turn-left.idx.gz
 *   tools/parity/fixtures/engine/maze-corridor-lookback.idx.gz
 *   tools/parity/fixtures/engine/maze-frames.json
 *
 * Provenance: all frames start from test-fixtures/states/maze-corridor.state.gz
 * (the committed frozen serial-state for the zone-0 corridor-at-gate frame,
 * facing 0, cell x=5 gx=127 gy=121). The original maze-corridor.idx.gz was
 * minted from the same state by build-state.ts (unserialize → step 5 → fb).
 *
 * Usage: pnpm tsx tools/libretro/capture-maze-frames.ts
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { COMPOSED_PALETTE, SCREEN_WIDTH, SCREEN_HEIGHT } from '../parity/decode-screen.js';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const FIXTURES = resolve(HERE, '..', 'parity', 'fixtures', 'engine');
const COMMITTED_STATES = resolve(REPO_ROOT, 'test-fixtures', 'states');
const TMP = '/tmp/wiz6-capture-maze-frames';

mkdirSync(TMP, { recursive: true });
mkdirSync(FIXTURES, { recursive: true });

// ── Helpers ──────────────────────────────────────────────────────────────────

const rgbToIdx = new Map<number, number>();
COMPOSED_PALETTE.forEach(([r, g, b], i) => rgbToIdx.set((r << 16) | (g << 8) | b, i));

function rgbaToIndices(rgba: Uint8Array): Uint8Array {
  const idx = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT);
  for (let p = 0; p < idx.length; p++) {
    const i = rgbToIdx.get((rgba[p * 4]! << 16) | (rgba[p * 4 + 1]! << 8) | rgba[p * 4 + 2]!);
    if (i === undefined) {
      const r = rgba[p * 4]!, g = rgba[p * 4 + 1]!, b = rgba[p * 4 + 2]!;
      throw new Error(`pixel ${p}: non-WIZ6_MAIN colour rgb(${r},${g},${b}) — divergence?`);
    }
    idx[p] = i;
  }
  return idx;
}

function u16(b: Uint8Array, o: number): number { return b[o]! | (b[o + 1]! << 8); }
function s16(b: Uint8Array, o: number): number { const v = u16(b, o); return v & 0x8000 ? v - 0x10000 : v; }

/** Decompress the committed state.gz to a temp file, return the tmp path. */
function decompressState(name: string): string {
  const gz = join(COMMITTED_STATES, `${name}.state.gz`);
  if (!existsSync(gz)) throw new Error(`missing committed state: ${gz}`);
  const raw = gunzipSync(readFileSync(gz));
  const out = join(TMP, `${name}.state`);
  writeFileSync(out, raw);
  return out;
}

// ── DGROUP field offsets (all relative to anchor() = DGROUP base) ─────────────
const O = {
  game_state:   0x363a,
  facing:       0x4f9a,
  z:            0x4f9c,
  x:            0x4f9e,
  y:            0x4fa0,
  gx:           0x4fa4,
  gy:           0x4fa2,
  maze_ptr:     0x4faa,   // maze block near-ptr (zone-level wall grid base)
  span_count:   0x50ce,
  span_list:    0x50d0,   // 0xb bytes/span, max 0x1e
  slot5220:     0x5220,   // 5 words (last-depth slot wall-types: front/cL/cR/left/right)
  parity:       0x521a,
};

// Wall grid offsets from maze_ptr (per maze-span-build.json):
//   N-walls: maze_ptr + 0x60   (MSB-first 2 bits/cell: cell = z*64+y*8+x)
//   W-walls: maze_ptr + 0x120
const WALL_NORTH_OFF = 0x60;
const WALL_WEST_OFF  = 0x120;

// Cells used by the y3 corridor view: zone 0, z=0. The stub runs from x=5 to x=7.
// The view walks up to 3 cells forward from the party + side cells.
// For facing 0 (north/+y): cells at y=0..3, x=5..7 (surrounding the stub).
// We record a wider set: all (x, y) in x∈{4,5,6,7,8}, y∈{0,1,2,3}, z=0.
// Cell index = z*64 + y*8 + x  (z=0 → y*8 + x).
const GEOMETRY_CELLS: Array<[number, number, number]> = [];
for (let y = 0; y <= 4; y++) {
  for (let x = 4; x <= 8; x++) {
    GEOMETRY_CELLS.push([0, x, y]);
  }
}

/** Read 2-bit N-wall or W-wall field for a cell from the live grid.
 *  The engine uses MSB-first 2 bits/cell packed into bytes.
 *  cell_idx = z*64 + y*8 + x; bit offset = cell_idx*2 from grid start. */
function readWallBit(gridBytes: Uint8Array, cellIdx: number): number {
  const bitOff = cellIdx * 2;  // 2 bits/cell
  const byteOff = bitOff >> 3; // byte index
  const shift   = 6 - (bitOff & 6); // MSB-first: bits 7..6 → cell 0, 5..4 → cell 1, etc.
  return (gridBytes[byteOff]! >> shift) & 0x3;
}

/** Read the span list (count × 0xb bytes) from live DGROUP. */
async function readSpans(c: HostClient, base: number): Promise<Array<{
  x0: number; x1: number; clipLo: number; clipHi: number;
  walltype: number; seamIdx: number; depthField: number;
}>> {
  const cnt = u16(await c.read(base + O.span_count, 2), 0);
  if (cnt === 0) return [];
  const sb = await c.read(base + O.span_list, cnt * 0xb);
  const spans = [];
  for (let i = 0; i < cnt; i++) {
    const o = i * 0xb;
    spans.push({
      x0:         s16(sb, o),
      x1:         s16(sb, o + 2),
      clipLo:     u16(sb, o + 4),
      clipHi:     u16(sb, o + 6),
      walltype:   sb[o + 8]!,
      seamIdx:    sb[o + 9]!,
      depthField: sb[o + 0xa]!,
    });
  }
  return spans;
}

/** Read party fields and slot5220 from live DGROUP. */
async function readParty(c: HostClient, base: number) {
  const [gsB, facingB, zB, xB, yB, gxB, gyB, ptrB, parityB, slotsB] = await Promise.all([
    c.read(base + O.game_state,  2),
    c.read(base + O.facing,      2),
    c.read(base + O.z,           2),
    c.read(base + O.x,           2),
    c.read(base + O.y,           2),
    c.read(base + O.gx,         2),
    c.read(base + O.gy,         2),
    c.read(base + O.maze_ptr,   2),
    c.read(base + O.parity,     2),
    c.read(base + O.slot5220,   10),
  ]);
  return {
    game_state: u16(gsB, 0),
    facing:     u16(facingB, 0),
    z:          u16(zB, 0),
    x:          u16(xB, 0),
    y:          u16(yB, 0),
    gx:         u16(gxB, 0),
    gy:         u16(gyB, 0),
    maze_ptr:   u16(ptrB, 0),
    parity:     u16(parityB, 0),
    slot5220:   [0,2,4,6,8].map((off) => u16(slotsB, off)),
  };
}

/** Read the N/W wall grids for a set of cells from live memory.
 *  maze_ptr is the near-ptr into the zone wall data. */
async function readCellGeometry(c: HostClient, base: number, mazePtr: number): Promise<Record<string, { north: number; west: number }>> {
  // The wall grid lives at the physical address (DGROUP_base + maze_ptr) + offset.
  // DGROUP base is anchor() which returns a LINEAR address (= seg<<4 + offset).
  // For read(), we pass a linear (physical) address.
  // maze_ptr is a NEAR pointer in DGROUP — it's an offset within the current DS segment.
  // The linear address of the north grid = base + maze_ptr + WALL_NORTH_OFF
  // where base = anchor() = DGROUP_linear_base.
  //
  // Actually: anchor() returns the DGROUP base as a linear address (confirmed by
  // the harness: all prior reads use base + offset as a linear address). So:
  //   north grid base (linear) = base + mazePtr + WALL_NORTH_OFF
  //   west  grid base (linear) = base + mazePtr + WALL_WEST_OFF
  //
  // The packed grid is 2 bits/cell; we need cells up to index = z*64+y*8+x ≤
  // 0*64+4*8+8 = 40 → need at least 40*2/8 = 10 bytes.
  const GRID_BYTES = 64; // 64 bytes covers cells 0..255 (more than enough)
  const northGrid = await c.read(base + mazePtr + WALL_NORTH_OFF, GRID_BYTES);
  const westGrid  = await c.read(base + mazePtr + WALL_WEST_OFF,  GRID_BYTES);

  const cells: Record<string, { north: number; west: number }> = {};
  for (const [z, x, y] of GEOMETRY_CELLS) {
    const cellIdx = z * 64 + y * 8 + x;
    const key = `z${z}_y${y}_x${x}`;
    cells[key] = {
      north: readWallBit(northGrid, cellIdx),
      west:  readWallBit(westGrid,  cellIdx),
    };
  }
  return cells;
}

// ── Main capture ─────────────────────────────────────────────────────────────

interface FrameData {
  name: string;
  fixture: string;
  party: {
    game_state: number; facing: number; z: number; x: number; y: number;
    gx: number; gy: number; parity: number;
  };
  slot5220: number[];
  spans: Array<{
    x0: number; x1: number; clipLo: number; clipHi: number;
    walltype: number; seamIdx: number; depthField: number;
  }>;
}

async function main() {
  console.log('=== capture-maze-frames.ts ===');
  console.log('Loading committed maze-corridor.state.gz...');

  const statePath = decompressState('maze-corridor');
  console.log(`  state decompressed to ${statePath}`);

  const c = new HostClient();
  try {
    // Boot the core so unserialize has a running game.
    await c.step(3000);

    const frames: FrameData[] = [];
    let sharedGeometry: Record<string, { north: number; west: number }> | null = null;

    // ── Helper: restore to the corridor state and read frame data ─────────────
    const captureFrame = async (
      name: string,
      fixture: string,
      setup: () => Promise<void>,
    ): Promise<void> => {
      console.log(`\nCapturing ${name}...`);

      // Restore the corridor state.
      await c.unserialize(statePath);
      await c.step(2);  // settle (same as build-state.ts pattern)
      const base = await c.anchor();

      // Drive to the target frame.
      await setup();

      // Allow the frame to settle after input.
      await c.step(40);

      // Read party state.
      const party = await readParty(c, base);
      console.log(`  facing=${party.facing} x=${party.x} y=${party.y} z=${party.z} gx=${party.gx} gy=${party.gy} parity=${party.parity}`);
      console.log(`  game_state=${party.game_state} maze_ptr=0x${party.maze_ptr.toString(16)}`);
      console.log(`  slot5220=[${party.slot5220.join(', ')}]`);

      // Read span list.
      const spans = await readSpans(c, base);
      console.log(`  spans (count=${spans.length}):`);
      for (const s of spans) {
        console.log(`    x0=${s.x0} x1=${s.x1} clip=${s.clipLo}/${s.clipHi} wt=${s.walltype} seam=${s.seamIdx} depth=${s.depthField}`);
      }

      // Read geometry once (shared across frames — same zone/corridor).
      if (sharedGeometry === null) {
        console.log('  reading cell geometry...');
        sharedGeometry = await readCellGeometry(c, base, party.maze_ptr);
        console.log(`  recorded ${Object.keys(sharedGeometry).length} cells`);
      }

      // Capture framebuffer.
      const fbPath = join(TMP, `${fixture}.rgba`);
      await c.fb(fbPath);
      const rgba = new Uint8Array(readFileSync(fbPath));
      console.log(`  framebuffer: ${rgba.length} bytes (expect ${SCREEN_WIDTH * SCREEN_HEIGHT * 4})`);

      // Convert RGBA → EGA indices.
      const idx = rgbaToIndices(rgba);

      // Sanity check: count distinct indices.
      const distinct = new Set(idx).size;
      console.log(`  EGA indices: ${idx.length} pixels, ${distinct} distinct palette entries`);
      if (distinct < 3) {
        throw new Error(`only ${distinct} distinct palette entries — likely a blank/wrong frame`);
      }

      // Write fixture.
      const idxGzPath = join(FIXTURES, `${fixture}.idx.gz`);
      const pngPath   = join(FIXTURES, `${fixture}.png`);
      writeFileSync(idxGzPath, gzipSync(idx));
      writeFileSync(pngPath, encodePngRgba(SCREEN_WIDTH, SCREEN_HEIGHT, rgba));
      console.log(`  wrote ${idxGzPath}`);
      console.log(`  wrote ${pngPath}`);

      // Also write a debug copy to /tmp.
      writeFileSync(join(TMP, `${fixture}.png`), encodePngRgba(SCREEN_WIDTH, SCREEN_HEIGHT, rgba));

      frames.push({
        name,
        fixture,
        party: {
          game_state: party.game_state,
          facing:     party.facing,
          z:          party.z,
          x:          party.x,
          y:          party.y,
          gx:         party.gx,
          gy:         party.gy,
          parity:     party.parity,
        },
        slot5220: party.slot5220,
        spans,
      });
    };

    // ── Frame 1: original corridor (y3, facing 0) ─────────────────────────────
    // Build-state.ts: unserialize → step 5 → fb. We replicate that here to record
    // the same party state (but we DON'T overwrite the existing fixture).
    console.log('\n--- Frame 1: maze-corridor (original, facing 0) ---');
    await c.unserialize(statePath);
    await c.step(5);  // build-state.ts uses step 5 for maze-corridor
    const base0 = await c.anchor();
    const party0 = await readParty(c, base0);
    console.log(`  facing=${party0.facing} x=${party0.x} y=${party0.y} z=${party0.z} gx=${party0.gx} gy=${party0.gy} parity=${party0.parity}`);
    console.log(`  maze_ptr=0x${party0.maze_ptr.toString(16)}`);
    const spans0 = await readSpans(c, base0);
    console.log(`  spans (count=${spans0.length}):`);
    for (const s of spans0) {
      console.log(`    x0=${s.x0} x1=${s.x1} clip=${s.clipLo}/${s.clipHi} wt=${s.walltype} seam=${s.seamIdx} depth=${s.depthField}`);
    }
    // Record geometry from this frame's maze_ptr.
    sharedGeometry = await readCellGeometry(c, base0, party0.maze_ptr);
    console.log(`  recorded ${Object.keys(sharedGeometry).length} cells for shared geometry`);
    // Don't overwrite the existing fixture — just record the data.
    frames.push({
      name: 'maze-corridor',
      fixture: 'maze-corridor',
      party: {
        game_state: party0.game_state,
        facing: party0.facing,
        z: party0.z, x: party0.x, y: party0.y,
        gx: party0.gx, gy: party0.gy,
        parity: party0.parity,
      },
      slot5220: party0.slot5220,
      spans: spans0,
    });

    // ── Frame 2: turn-left (facing 3) ─────────────────────────────────────────
    await captureFrame(
      'maze-corridor-turn-left',
      'maze-corridor-turn-left',
      async () => {
        await c.key('left', 'tap');
      },
    );

    // ── Frame 3: lookback (facing 2, 180° turn: right×2) ─────────────────────
    await captureFrame(
      'maze-corridor-lookback',
      'maze-corridor-lookback',
      async () => {
        await c.key('right', 'tap'); await c.step(40);
        await c.key('right', 'tap');
      },
    );

    // ── Write maze-frames.json ─────────────────────────────────────────────────
    const output = {
      provenance: {
        source_state: 'test-fixtures/states/maze-corridor.state.gz',
        description: 'Per-frame party/slots/spans + shared cell geometry for zone-0 stub corridor. All frames start from the committed corridor state (facing 0, cell x=5 gx=127 gy=121). Turn-left = one left key; lookback = two right keys (180° turn).',
        captured: new Date().toISOString(),
        cell_layout: 'z=0, x∈{4..8}, y∈{0..4}. Cell index = z*64 + y*8 + x. N-wall at maze_ptr+0x60, W-wall at maze_ptr+0x120, 2 bits/cell MSB-first.',
      },
      frames,
      geometry: {
        cells: sharedGeometry,
      },
    };

    const jsonPath = join(FIXTURES, 'maze-frames.json');
    writeFileSync(jsonPath, JSON.stringify(output, null, 2) + '\n');
    console.log(`\nwrote ${jsonPath}`);

    // ── Asymmetry check ────────────────────────────────────────────────────────
    console.log('\n=== Asymmetry check ===');
    console.log('The reachable geometry is a 3-cell dead-end stub (x=5..7, walls on both ends');
    console.log('and all sides). All reachable facing-0/2/3 frames are SYMMETRIC corridors');
    console.log('(one solid wall on each side at each depth). No T-junctions or side passages');
    console.log('are reachable from this stub without loading a different zone.');
    console.log('=> All captured frames are symmetric. Asymmetric-projection validation');
    console.log('   is blocked on richer geometry (different zone/position).');

    // Check the frames for left/right asymmetry by examining spans.
    for (const fr of frames) {
      const nonEdge = fr.spans.filter((s) => s.walltype !== 0xff);
      const leftSpans  = nonEdge.filter((s) => s.x0 < 160);
      const rightSpans = nonEdge.filter((s) => s.x0 >= 160);
      const isAsym = leftSpans.length !== rightSpans.length;
      console.log(`  ${fr.name}: ${nonEdge.length} wall spans (${leftSpans.length} left, ${rightSpans.length} right) ${isAsym ? '*** ASYMMETRIC ***' : '(symmetric)'}`);
    }

    console.log('\n=== Done ===');
    console.log(`Captured ${frames.length} frames (${frames.length - 1} new fixtures).`);
    console.log('Fixtures written to tools/parity/fixtures/engine/.');
    console.log('Debug PNGs in /tmp/wiz6-capture-maze-frames/.');

  } finally {
    c.close();
  }
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
