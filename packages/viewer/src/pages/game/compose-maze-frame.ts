/**
 * Pure full-frame (320×200) assembler for the zone-0 first-person corridor
 * screen. No DOM, no canvas.
 *
 * CHROME APPROACH — static background chrome + LIVE party panels:
 * The maze screen is the 3D dungeon VIEWPORT (MAZE_VIEWPORT rect) surrounded by
 * UI chrome — the red "Wizardry" banner across the top, the party portrait/status
 * panels down the LEFT and RIGHT, and the bottom OPTIONS/TURN panel.
 *
 * extract-maze-tiles.ts cut the WHOLE 320×200 engine frame as a static `chrome`
 * tile (committed in maze-corridor-tiles.json). That capture is from an RE drive
 * with a FIXED party (THESUS/LYSANDR/TEMPEST), so its two side party-panel
 * columns are baked with the WRONG characters. We paint the chrome full-frame as
 * the background, then OVERWRITE the two party-panel columns with the LIVE party
 * (RE-confirmed: the dungeon party panel is pixel-identical to the MASTER OPTIONS
 * panel, so we reuse the same byte-exact `composePartyPanels` the castle uses).
 * Finally we blit the composed dungeon viewport on top at MAZE_VIEWPORT.{x,y}.
 *
 * Layering, in order:
 *   1. static chrome (banner, borders, bottom strip)
 *   2. LIVE party panels over the side columns (covers the baked portraits)
 *   3. dungeon viewport blit
 *
 * When no party / fonts are supplied (the parity fixture path) the panels are
 * skipped and the baked chrome shows through — preserving the existing
 * full-frame parity gate (tools/parity/maze-corridor-parity.test.ts).
 */

import {
  MAZE_VIEWPORT,
  type ActivePartyMember,
  type PortraitSet,
} from '@wiz6/data';
import { composeMazeViewport, type MazeTiles } from './compose-maze-view.js';
import { composePartyPanels, type PanelFontSet } from './party-panel-compose.js';
import mazeCorridorTiles from '../../data/maze-corridor-tiles.json' with { type: 'json' };

const SCREEN_W = 320;
const SCREEN_H = 200;

const TILES = mazeCorridorTiles as unknown as MazeTiles;

/** Optional live-party panel inputs for composeMazeFrame. When `members` is
 *  empty or `fonts.font3` is null, the baked chrome panels show through (the
 *  parity-fixture path). */
export interface MazePartyPanels {
  members: ReadonlyArray<ActivePartyMember>;
  fonts: PanelFontSet;
  portraitSets: ReadonlyArray<PortraitSet> | null;
}

/**
 * Compose the full 320×200 maze corridor frame to RGBA. Returns a fresh
 * (SCREEN_W * SCREEN_H * 4)-byte buffer: the static chrome, the LIVE party
 * panels (if supplied) over the side columns, and the composed dungeon viewport
 * blitted in at MAZE_VIEWPORT.
 *
 * @param panels Live party-panel inputs, or undefined to keep the baked chrome
 *               panels (parity-fixture path).
 */
export function composeMazeFrame(panels?: MazePartyPanels): Uint8Array {
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

  // 2. LIVE party panels — overwrite the two side columns (baked with the RE
  //    drive's fixed party) with the player's actual party. Same byte-exact
  //    compositor the castle MASTER OPTIONS screen uses (RE: dungeon panel is
  //    pixel-identical). Skipped when no party/fonts are supplied (the parity
  //    fixture path keeps the baked chrome panels). composePartyPanels clears
  //    each panel window to solid gray before drawing, so empty slots and the
  //    baked stale portraits are both overwritten.
  if (panels) {
    const rgba = new Uint8ClampedArray(buf.buffer);
    composePartyPanels(rgba, panels.members, panels.fonts, panels.portraitSets);
  }

  // 3. Blit the composed dungeon viewport on top, at MAZE_VIEWPORT.{x,y}.
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
