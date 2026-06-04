/**
 * Pure full-frame (320×200) assembler for the zone-0 first-person corridor
 * screen. No DOM, no canvas.
 *
 * CHROME APPROACH — static full-frame background:
 * The maze screen is the 3D dungeon VIEWPORT (MAZE_VIEWPORT rect) surrounded by
 * UI chrome — the red "Wizardry" banner across the top, the party portrait/status
 * panels down the left, and the bottom OPTIONS/TURN panel. That chrome is a
 * specific in-dungeon frame: the castle-frame compositor (castle-frame.ts /
 * party-panel-render.ts) draws the MASTER OPTIONS screen and needs live party +
 * window state it can't reconstruct for a dungeon frame, so it can't reproduce
 * this chrome byte-for-byte.
 *
 * Instead, extract-maze-tiles.ts cuts the WHOLE 320×200 engine frame as a static
 * `chrome` tile (committed in maze-corridor-tiles.json). We paint that chrome
 * full-frame, then blit the already-pixel-exact composed viewport
 * (composeMazeViewport) on top at MAZE_VIEWPORT.{x,y}. Outside the viewport the
 * chrome is identity with the engine frame; inside it the viewport composer is
 * identity; so the assembled frame is byte-exact vs the engine fixture (the
 * gate: tools/parity/maze-corridor-parity.test.ts, 100% at tolerance 0).
 *
 * This is the accepted foundation-milestone approach: it locks full-frame parity
 * now; a later task can replace the static chrome with the live party-panel
 * renderer once dungeon-frame chrome state is modelled.
 */

import { MAZE_VIEWPORT } from '@wiz6/data';
import { composeMazeViewport, type MazeTiles } from './compose-maze-view.js';
import mazeCorridorTiles from '../../data/maze-corridor-tiles.json' with { type: 'json' };

const SCREEN_W = 320;
const SCREEN_H = 200;

const TILES = mazeCorridorTiles as unknown as MazeTiles;

/**
 * Compose the full 320×200 maze corridor frame to RGBA. Returns a fresh
 * (SCREEN_W * SCREEN_H * 4)-byte buffer: the static chrome with the composed
 * dungeon viewport blitted in at MAZE_VIEWPORT.
 */
export function composeMazeFrame(): Uint8Array {
  const buf = new Uint8Array(SCREEN_W * SCREEN_H * 4);

  // 1. Paint the static chrome (full-frame background).
  const chrome = TILES.tiles.chrome;
  if (!chrome) {
    throw new Error('compose-maze-frame: maze-corridor-tiles.json is missing the `chrome` tile');
  }
  const { rect, indices } = chrome;
  for (let yy = 0; yy < rect.h; yy++) {
    for (let xx = 0; xx < rect.w; xx++) {
      const color = TILES.palette[indices[yy * rect.w + xx]!];
      if (!color) continue;
      const o = ((rect.y + yy) * SCREEN_W + (rect.x + xx)) * 4;
      buf[o] = color[0]!;
      buf[o + 1] = color[1]!;
      buf[o + 2] = color[2]!;
      buf[o + 3] = 0xff;
    }
  }

  // 2. Blit the composed dungeon viewport on top, at MAZE_VIEWPORT.{x,y}.
  const vp = composeMazeViewport(TILES);
  const { x: vpX, y: vpY, w: vpW, h: vpH } = MAZE_VIEWPORT;
  for (let yy = 0; yy < vpH; yy++) {
    for (let xx = 0; xx < vpW; xx++) {
      const src = (yy * vpW + xx) * 4;
      const dst = ((vpY + yy) * SCREEN_W + (vpX + xx)) * 4;
      buf[dst] = vp[src]!;
      buf[dst + 1] = vp[src + 1]!;
      buf[dst + 2] = vp[src + 2]!;
      buf[dst + 3] = vp[src + 3]!;
    }
  }

  return buf;
}
