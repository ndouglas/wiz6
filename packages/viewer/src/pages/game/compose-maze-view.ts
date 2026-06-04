/**
 * Pure compositor for the zone-0 first-person corridor VIEWPORT (the 176×112
 * dungeon-view rect inside the maze screen). No DOM, no canvas.
 *
 * The viewport is reconstructed from geometry-derived texture tiles extracted by
 * tools/parity/extract-maze-tiles.ts (committed as
 * packages/viewer/src/data/maze-corridor-tiles.json). Those tiles fully partition
 * the viewport — three horizontal bands (ceiling / middle / floor), with the
 * middle band split into five columns at the convergence seams — so blitting
 * each tile back at its rect reconstructs the engine frame pixel-exact.
 *
 * Each tile carries its absolute 320×200 screen rect; we blit at the
 * viewport-relative offset (rect.x - MAZE_VIEWPORT.x, rect.y - MAZE_VIEWPORT.y).
 * The output is the MAZE_VIEWPORT.w × MAZE_VIEWPORT.h RGBA buffer; the full-frame
 * assembler (Task 5) places this inside the screen chrome.
 */

import { MAZE_VIEWPORT } from '@wiz6/data';

/** A single extracted texture region: its absolute 320×200 screen rect plus the
 *  palette indices of its pixels (row-major, length rect.w*rect.h). */
export interface MazeTile {
  rect: { x: number; y: number; w: number; h: number };
  indices: number[];
}

/** Shape of maze-corridor-tiles.json. `palette` is the 16-entry composed EGA
 *  palette (index → [r,g,b]); `tiles` maps a region name to its rect+indices. */
export interface MazeTiles {
  palette: [number, number, number][];
  tiles: Record<string, MazeTile>;
}

/**
 * Compose the corridor viewport to RGBA. Returns a fresh
 * (MAZE_VIEWPORT.w * MAZE_VIEWPORT.h * 4)-byte buffer.
 *
 * @param data Parsed maze-corridor-tiles.json (palette + fully-tiling regions).
 */
export function composeMazeViewport(data: MazeTiles): Uint8Array {
  const { w, h, x: vpX, y: vpY } = MAZE_VIEWPORT;
  const buf = new Uint8Array(w * h * 4);

  for (const tile of Object.values(data.tiles)) {
    const { rect, indices } = tile;
    const offX = rect.x - vpX;
    const offY = rect.y - vpY;
    for (let yy = 0; yy < rect.h; yy++) {
      const dy = offY + yy;
      if (dy < 0 || dy >= h) continue;
      for (let xx = 0; xx < rect.w; xx++) {
        const dx = offX + xx;
        if (dx < 0 || dx >= w) continue;
        const color = data.palette[indices[yy * rect.w + xx]!];
        if (!color) continue;
        const o = (dy * w + dx) * 4;
        buf[o] = color[0]!;
        buf[o + 1] = color[1]!;
        buf[o + 2] = color[2]!;
        buf[o + 3] = 0xff;
      }
    }
  }

  return buf;
}
