/**
 * render.ts — public entry point: assemble the five maze-renderer stages into
 * the single `renderMazeViewport` call.
 *
 * Pipeline:
 *   1. classifyVisibleWalls  (classify.ts) — cell-walls + party -> per-depth sides
 *   2. deriveCorridorSpans   (build.ts)    — sides + seam tables -> span list
 *   3. generateCallList      (flush.ts)    — spans -> compositor call-list
 *   4. renderFrameFromGeometry (compositor.ts) — calls -> 4-plane EGA page
 *   5. decodePageIndex       (page.ts)     — 4-plane page -> 320×200 index buffer
 *   6. crop                              — extract the 176×112 viewport rect
 *
 * All stages are pure. No I/O here — asset loading is the caller's responsibility
 * (see assets.ts / loadMazeAssets).
 *
 * Background page: the compositor paints wall pieces on top of the page buffer.
 * We start with a blank page (all zeros = palette index 0). Wall stone pixels are
 * non-zero palette indices, so the test assertion `some(v=>v!==0)` holds as long
 * as any wall piece is rendered. The viewer (Task 12) and parity gate (Task 11)
 * can pass an optional pre-filled background page if they need floor/ceiling/sky.
 */

import { SEAM_X0_WT2, SEAM_X1_WT2, MAZE_VIEWPORT, PLANE_STRIDE } from '@wiz6/data';
import type {
  MazeBlock,
  MazeParty,
  MazeRenderAssets,
  BackgroundPlacement,
} from '@wiz6/data';
import { classifyVisibleWalls } from './classify.js';
import { deriveCorridorSpans } from './build.js';
import { generateCallList } from './flush.js';
import { renderFrameFromGeometry } from './compositor.js';
import { composeBackground } from './background.js';
import { decodePageIndex } from './page.js';

/**
 * Build the maze BACKGROUND page (floor/ceiling/side-panels/portcullis-window)
 * by OR-blitting the per-view placement records into a fresh, pre-zeroed 4-plane
 * EGA page (background.ts composeBackground). The returned page is the base the
 * wall compositor REPLACEs on top — pass it as `renderMazeViewport`'s `page` arg.
 *
 * @param placements  The resolved OR-blit placement records for this view (the
 *                    per-view selection of the engine's cs:[0x190]/cs:[0x18e]
 *                    tables). An empty list yields an all-zero (black) page.
 * @returns           A 4 * PLANE_STRIDE byte page, OR-composited from `placements`.
 */
export function buildBackgroundPage(placements: BackgroundPlacement[]): Uint8Array {
  const page = new Uint8Array(4 * PLANE_STRIDE);
  composeBackground(page, placements);
  return page;
}

/**
 * Render the maze first-person corridor view into a 176×112 palette-index buffer.
 *
 * @param block      Full per-zone maze block (multi-region wall + decoration planes)
 * @param party      Party GLOBAL cell coords + facing (gx, gy, z, facing 0-3)
 * @param assets     Atlas + piece descriptors from loadMazeAssets()
 * @param opts       Optional background source. Provide EITHER:
 *                   - `page`: a pre-filled 4-plane EGA page (4 * PLANE_STRIDE
 *                     bytes) — used directly as the base (walls REPLACE on top); or
 *                   - `placements`: the per-view OR-blit placement records, from
 *                     which the background page is built (buildBackgroundPage).
 *                   If neither is given, the base is a blank (all-zero) page. A raw
 *                   `Uint8Array` is accepted as shorthand for `{ page }`.
 * @returns          Uint8Array of length 176*112, row-major palette indices 0..15,
 *                   cropped to MAZE_VIEWPORT (x=72, y=32, w=176, h=112).
 */
export interface RenderBackgroundOpts {
  /** A pre-filled 4-plane EGA page (4 * PLANE_STRIDE bytes). */
  page?: Uint8Array;
  /** Per-view OR-blit placement records (built into the background page). */
  placements?: BackgroundPlacement[];
}

export function renderMazeViewport(
  block: MazeBlock,
  party: MazeParty,
  assets: MazeRenderAssets,
  opts?: Uint8Array | RenderBackgroundOpts,
): Uint8Array {
  const o: RenderBackgroundOpts =
    opts instanceof Uint8Array ? { page: opts } : (opts ?? {});
  const page =
    o.page ?? (o.placements ? buildBackgroundPage(o.placements) : undefined);
  // Stage 1: classify — per-depth solid-side flags
  const sides = classifyVisibleWalls(block, party);

  // Stage 2: build — span list from solid sides + seam tables
  const spans = deriveCorridorSpans(sides, SEAM_X0_WT2, SEAM_X1_WT2);

  // Stage 3: flush — compositor call-list from spans
  const calls = generateCallList(spans);

  // Stage 4: compositor — render wall pieces into a 4-plane EGA page
  const workPage = page ?? new Uint8Array(4 * PLANE_STRIDE);
  renderFrameFromGeometry(workPage, assets.atlas, assets.pieceDescriptors, calls);

  // Stage 5: decode — 4-plane page -> 320×200 flat palette-index buffer
  const full = decodePageIndex(workPage, 320, 200);

  // Stage 6: crop — extract the viewport rect (x=72, y=32, w=176, h=112)
  const { x: vx, y: vy, w: vw, h: vh } = MAZE_VIEWPORT;
  const out = new Uint8Array(vw * vh);
  for (let row = 0; row < vh; row++) {
    const srcRow = vy + row;
    for (let col = 0; col < vw; col++) {
      out[row * vw + col] = full[srcRow * 320 + vx + col]!;
    }
  }
  return out;
}
