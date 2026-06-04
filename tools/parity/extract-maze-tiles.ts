/**
 * Extract geometry-derived texture pieces from the zone-0 corridor engine fixture.
 *
 * Reads `fixtures/engine/maze-corridor.idx.gz` (gunzip → Uint8Array of 320×200
 * palette indices) and cuts named rects out of it, writing each as its palette
 * indices + rect to `packages/viewer/src/data/maze-corridor-tiles.json` for the
 * corridor composer (compose-maze-view.ts) to place back.
 *
 * The rects FULLY TILE the viewport (x72..248, y32..144) with no gaps/overlaps:
 * a perspective corridor's regions are trapezoids, so rather than
 * perspective-scaling a depth-0 strip (which would not be byte-exact), we
 * partition the viewport into geometry-derived rectangular regions whose seams
 * are DEFINED by the convergence columns. Placing each region back at its rect
 * reconstructs the frame pixel-exact, and a wrong convergence constant → wrong
 * seam → parity fails, so the geometry is genuinely under test.
 *
 * Partition (3 horizontal bands; middle band split into 5 columns at the
 * convergence seams):
 *   - ceiling band (full width)  y32..44
 *   - middle  band               y45..102, split by x into:
 *       wallLeft0     [VP_LEFT .. CONVERGE_LEFT[1]]
 *       leftConverge  [CONVERGE_LEFT[1] .. CONVERGE_LEFT[3]]
 *       gate          [CONVERGE_LEFT[3] .. CONVERGE_RIGHT[3]]
 *       rightConverge [CONVERGE_RIGHT[3] .. CONVERGE_RIGHT[1]]
 *       wallRight0    [CONVERGE_RIGHT[1] .. VP_RIGHT]
 *   - floor   band (full width)  y103..143
 *
 * The horizontal seams come from the @wiz6/data geometry constants
 * (CONVERGE_LEFT/RIGHT, MAZE_VIEWPORT). The VERTICAL band boundaries were
 * MEASURED from the fixture via tools/parity/_inspect-maze.ts (a temporary
 * inspector). Structure top→bottom:
 *   - y32..44   flat gray BRICK CEILING   (black fraction ~0%, pure 8/9 dither)
 *   - y45..102  converging side WALLS + far DOOR
 *   - y103      last bright mortar line (the floor's leading edge, 68% black)
 *   - y104..143 cobblestone FLOOR          (sparse irregular black dither)
 *
 * The script ASSERTS the union of all rects exactly equals the viewport with no
 * gaps/overlaps before writing.
 *
 * CHROME: in addition to the 7 viewport tiles, we cut a `chrome` tile = the FULL
 * 320×200 frame. The maze screen's UI surround (red "Wizardry" banner, party
 * portrait/status panels, bottom OPTIONS/TURN panel) is a specific in-dungeon
 * frame the castle-frame compositor can't reproduce (it needs live party/window
 * state). The simplest reliable path to full-frame pixel parity is to treat the
 * whole engine frame as a static background and paint the (already pixel-exact)
 * viewport on top — outside the viewport the chrome is identity, inside it the
 * viewport composer is identity, so the assembled frame is byte-exact. The
 * `chrome` tile is NOT part of the viewport-coverage assertion (it spans the
 * whole screen).
 *
 * Run: pnpm tsx tools/parity/extract-maze-tiles.ts → "wrote ...: 8 tiles".
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPOSED_PALETTE, SCREEN_HEIGHT } from './decode-screen.js';
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
  // wallLeft0: nearest-depth LEFT converging wall, from the viewport left edge
  // (MAZE_VIEWPORT.x=72) to the near convergence column CONVERGE_LEFT[1]=104.
  // Vertical span = the wall region y45..102 (between ceiling and floor — measured).
  wallLeft0: {
    x: VP_LEFT,
    y: WALL_Y0,
    w: CONVERGE_LEFT[1] - VP_LEFT,
    h: WALL_Y1 - WALL_Y0 + 1,
  },
  // leftConverge: the LEFT mid-corridor converging region between the near side
  // wall and the far gate, x = CONVERGE_LEFT[1]..CONVERGE_LEFT[3] (104..144).
  leftConverge: {
    x: CONVERGE_LEFT[1],
    y: WALL_Y0,
    w: CONVERGE_LEFT[3] - CONVERGE_LEFT[1],
    h: WALL_Y1 - WALL_Y0 + 1,
  },
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
  // rightConverge: the RIGHT mid-corridor converging region between the far gate
  // and the near side wall, x = CONVERGE_RIGHT[3]..CONVERGE_RIGHT[1] (176..216).
  rightConverge: {
    x: CONVERGE_RIGHT[3],
    y: WALL_Y0,
    w: CONVERGE_RIGHT[1] - CONVERGE_RIGHT[3],
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

/**
 * Assert the union of all rects exactly tiles the viewport (x VP_LEFT..VP_RIGHT,
 * y CEIL_Y0..FLOOR_Y1) with no gaps and no overlaps. Paints a coverage grid and
 * verifies every viewport cell is covered exactly once.
 */
function assertFullCoverage(rects: ReadonlyArray<{ x: number; y: number; w: number; h: number }>): void {
  const vpW = VP_RIGHT - VP_LEFT;
  const vpH = FLOOR_Y1 - CEIL_Y0 + 1;
  const cover = new Uint8Array(vpW * vpH);
  for (const r of rects) {
    for (let yy = 0; yy < r.h; yy++) {
      for (let xx = 0; xx < r.w; xx++) {
        const gx = r.x + xx - VP_LEFT;
        const gy = r.y + yy - CEIL_Y0;
        if (gx < 0 || gx >= vpW || gy < 0 || gy >= vpH) {
          throw new Error(`rect ${JSON.stringify(r)} extends outside viewport at (${r.x + xx},${r.y + yy})`);
        }
        cover[gy * vpW + gx]!++;
      }
    }
  }
  for (let gy = 0; gy < vpH; gy++) {
    for (let gx = 0; gx < vpW; gx++) {
      const c = cover[gy * vpW + gx]!;
      if (c !== 1) {
        throw new Error(`viewport cell (${gx + VP_LEFT},${gy + CEIL_Y0}) covered ${c} times (expected exactly 1)`);
      }
    }
  }
}

assertFullCoverage(Object.values(RECTS));

const indices = new Uint8Array(gunzipSync(readFileSync(FIX)));
const tiles: Record<string, { rect: { x: number; y: number; w: number; h: number }; indices: number[] }> = {};
for (const [name, r] of Object.entries(RECTS)) tiles[name] = { rect: r, indices: cut(indices, r) };

// chrome: the full 320×200 frame as a static background. The full-frame
// assembler paints this, then blits the composed viewport on top.
const FULL = { x: 0, y: 0, w: W, h: SCREEN_HEIGHT };
tiles.chrome = { rect: FULL, indices: cut(indices, FULL) };

writeFileSync(OUT, JSON.stringify({ palette: COMPOSED_PALETTE, tiles }, null, 0));
console.log(`wrote ${OUT}: ${Object.keys(tiles).length} tiles (full viewport coverage verified)`);
