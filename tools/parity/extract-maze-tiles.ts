/**
 * Extract semantic texture pieces from the zone-0 corridor engine fixture.
 *
 * Reads `fixtures/engine/maze-corridor.idx.gz` (gunzip → Uint8Array of 320×200
 * palette indices) and cuts five named rects out of it, writing each as its
 * palette indices + rect to `packages/viewer/src/data/maze-corridor-tiles.json`
 * for the corridor composer (Task 4) to place.
 *
 * The horizontal bounds of the side walls + gate come from the @wiz6/data
 * geometry constants (CONVERGE_LEFT/RIGHT, MAZE_VIEWPORT). The VERTICAL bounds
 * and the ceiling/floor split were MEASURED from the fixture via
 * tools/parity/_inspect-maze.ts (a temporary inspector; see comments per rect).
 *
 * Measurement method: gunzip the idx, then for the viewport region (x72..247,
 * y32..143) compute the per-row black-pixel fraction. The viewport content
 * spans y32..143 (y30/31 = top chrome border, y144 = bottom chrome border —
 * both solid black). The structure top→bottom:
 *   - y32..44   flat gray BRICK CEILING   (black fraction ~0%, pure 8/9 dither)
 *   - y45..102  converging side WALLS + far DOOR (periodic full-width brick
 *               mortar courses at y51/60/69/77/86/94; portcullis bars at
 *               y59/64/69/73/77/82/87 spanning exactly x144..175)
 *   - y103      last bright mortar line (the floor's leading edge, 68% black)
 *   - y104..143 cobblestone FLOOR          (sparse irregular black dither)
 *
 * Run: pnpm tsx tools/parity/extract-maze-tiles.ts → "wrote ...: 5 tiles".
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPOSED_PALETTE } from './decode-screen.js';
import {
  MAZE_VIEWPORT,
  CONVERGE_LEFT,
  CONVERGE_RIGHT,
} from '../../packages/data/src/maze/corridor-geometry.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(HERE, 'fixtures/engine/maze-corridor.idx.gz');
const OUT = resolve(HERE, '../../packages/viewer/src/data/maze-corridor-tiles.json');
const W = 320;

// Viewport inner bounds, from MAZE_VIEWPORT = {x:72,y:32,w:176,h:112}.
const VP_LEFT = MAZE_VIEWPORT.x; // 72
const VP_RIGHT = MAZE_VIEWPORT.x + MAZE_VIEWPORT.w; // 248 (exclusive)

// Measured vertical landmarks (see header for the method; all from _inspect-maze.ts).
const CEIL_Y0 = 32; // viewport top (MAZE_VIEWPORT.y) — brick ceiling begins
const CEIL_Y1 = 44; // last pure-gray ceiling row before the first wall mortar line (y45)
const WALL_Y0 = 45; // first row where wall/door black mortar appears
const WALL_Y1 = 102; // last wall/door row before the floor's leading mortar line (y103)
const FLOOR_Y0 = 103; // floor leading edge (bright mortar line, 68% black)
const FLOOR_Y1 = 143; // viewport bottom (MAZE_VIEWPORT.y + h - 1); y144 = chrome border

// Rects measured from the fixture. {x,y,w,h} in 320×200 coords.
const RECTS = {
  // ceiling: flat brick band across the full viewport inner width, rows 32..44
  // (pure-gray, ~0% black — measured from full-width per-row black fraction).
  ceiling: { x: VP_LEFT, y: CEIL_Y0, w: VP_RIGHT - VP_LEFT, h: CEIL_Y1 - CEIL_Y0 + 1 },
  // floor: cobblestone across the full viewport inner width, rows 103..143
  // (leading mortar edge at y103, then sparse cobble dither — measured).
  floor: { x: VP_LEFT, y: FLOOR_Y0, w: VP_RIGHT - VP_LEFT, h: FLOOR_Y1 - FLOOR_Y0 + 1 },
  // gate: far green portcullis at the far opening. Horizontal extent =
  // CONVERGE_LEFT[3]..CONVERGE_RIGHT[3] (144..176), centered on CORRIDOR_CENTER_X=160;
  // confirmed by the full-width black portcullis bars sitting exactly at x144..175.
  // Vertical span = the door region y45..102 (measured: black appears y45, last
  // door row y102 before floor mortar y103).
  gate: {
    x: CONVERGE_LEFT[3],
    y: WALL_Y0,
    w: CONVERGE_RIGHT[3] - CONVERGE_LEFT[3],
    h: WALL_Y1 - WALL_Y0 + 1,
  },
  // wallLeft0: nearest-depth LEFT converging wall, from the viewport left edge
  // (MAZE_VIEWPORT.x=72) to the near convergence column CONVERGE_LEFT[1]=104.
  // Vertical span = the wall region y45..102 (between ceiling and floor — measured).
  wallLeft0: {
    x: VP_LEFT,
    y: WALL_Y0,
    w: CONVERGE_LEFT[1] - VP_LEFT,
    h: WALL_Y1 - WALL_Y0 + 1,
  },
  // wallRight0: nearest-depth RIGHT converging wall, from CONVERGE_RIGHT[1]=216
  // to the viewport right edge (MAZE_VIEWPORT.x + w = 248, exclusive).
  wallRight0: {
    x: CONVERGE_RIGHT[1],
    y: WALL_Y0,
    w: VP_RIGHT - CONVERGE_RIGHT[1],
    h: WALL_Y1 - WALL_Y0 + 1,
  },
} as const;

function cut(indices: Uint8Array, r: { x: number; y: number; w: number; h: number }): number[] {
  const out: number[] = [];
  for (let yy = 0; yy < r.h; yy++)
    for (let xx = 0; xx < r.w; xx++) out.push(indices[(r.y + yy) * W + (r.x + xx)]!);
  return out;
}

const indices = new Uint8Array(gunzipSync(readFileSync(FIX)));
const tiles: Record<string, { rect: (typeof RECTS)[keyof typeof RECTS]; indices: number[] }> = {};
for (const [name, r] of Object.entries(RECTS)) tiles[name] = { rect: r, indices: cut(indices, r) };
writeFileSync(OUT, JSON.stringify({ palette: COMPOSED_PALETTE, tiles }, null, 0));
console.log(`wrote ${OUT}: ${Object.keys(tiles).length} tiles`);
