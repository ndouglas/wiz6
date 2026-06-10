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
import { deriveCorridorSpans, deriveDoorCenterpieceSpans } from './build.js';
import { generateCallList } from './flush.js';
import { renderFrameFromAssets, type MazeSpan } from './compositor.js';
import { composeBackground } from './background.js';
import { decodePageIndex } from './page.js';
import { viewConfigKeyFor } from './view-config.js';

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
/**
 * Captured per-view wall spans (Task C2), keyed by view-config string. The live
 * renderer prefers these (byte-exact for the 15 gated cases) over the generated
 * corridor path. Shaped exactly like the committed
 * tools/parity/fixtures/engine/maze-wall-spans.json (loaded as-is): one record
 * per view-case with `configKey`, `depthBound`, and the engine's settled `spans`.
 */
export interface CapturedSpanCase {
  id: string;
  configKey: string;
  depthBound: number;
  spans: MazeSpan[];
}
export interface CapturedSpansTable {
  cases: CapturedSpanCase[];
}

export interface RenderBackgroundOpts {
  /** A pre-filled 4-plane EGA page (4 * PLANE_STRIDE bytes). */
  page?: Uint8Array;
  /** Per-view OR-blit placement records (built into the background page). */
  placements?: BackgroundPlacement[];
  /**
   * Captured per-view wall spans (Task C2), keyed by view-config. When present
   * AND the current (block, party) view-config matches a captured case, the
   * renderer draws THOSE spans (byte-exact for the 15 gated cases) instead of the
   * generated corridor path. A missing/partial case falls back gracefully to the
   * generation path — never throws.
   */
  capturedSpans?: CapturedSpansTable;
  /** Door-piece ANIMATION frame: 0 = each span's seamIdx (the parity-fixture
   *  phase), 1 = seamAlt where present. The viewer toggles this on a clock so the
   *  door/recess pieces flicker like the engine; defaults to 0. */
  phase?: 0 | 1;
  /** CAPTURE-REPLAY (faithful level-0): config-keyed full engine viewport
   *  (MAZE_VIEWPORT.w*h EGA-index). When this view-config matches a captured entry,
   *  the renderer returns it VERBATIM — byte-exact engine ground truth — bypassing
   *  the generation path. The pragmatic faithful path while the general generation
   *  law (#077) is uncracked; covers all engine-reachable level-0 configs (#086). */
  capturedViewports?: Map<string, Uint8Array>;
}

/** Look up the captured case for a (block, party) view-config, or undefined.
 *  Pure + total — never throws on a missing/malformed table. */
function lookupCapturedCase(
  table: CapturedSpansTable | undefined,
  block: MazeBlock,
  party: MazeParty,
): CapturedSpanCase | undefined {
  if (!table?.cases?.length) return undefined;
  let key: string;
  try {
    key = viewConfigKeyFor(block, party);
  } catch {
    return undefined;
  }
  return table.cases.find((c) => c.configKey === key);
}

export function renderMazeViewport(
  block: MazeBlock,
  party: MazeParty,
  assets: MazeRenderAssets,
  opts?: Uint8Array | RenderBackgroundOpts,
): Uint8Array {
  const o: RenderBackgroundOpts =
    opts instanceof Uint8Array ? { page: opts } : (opts ?? {});

  // CAPTURE-REPLAY: if this view-config has a committed engine viewport, return it
  // verbatim (byte-exact ground truth). Graceful: a missing key / bad table falls
  // through to the generation path; never throws.
  if (o.capturedViewports?.size) {
    // POSITION-KEYED capture-replay: look up the engine viewport by exact (gx,gy,facing).
    // (Was viewConfigKeyFor — wall geometry only — which aliased differing decorations.)
    const vp = o.capturedViewports.get(`${party.gx},${party.gy},${party.facing}`);
    if (vp) return vp;
  }

  const page =
    o.page ?? (o.placements ? buildBackgroundPage(o.placements) : undefined);

  // WALL PATH. Prefer the Task-C2 CAPTURED spans (byte-exact for the 15 gated
  // view-cases) when this view-config matches a captured case; else fall back to
  // the generated corridor path (byte-exact for the straight corridor only).
  // Graceful: a missing/partial captured case never throws.
  const phase = o.phase ?? 0;
  const captured = lookupCapturedCase(o.capturedSpans, block, party);
  let calls;
  if (captured) {
    calls = generateCallList(captured.spans, captured.depthBound || 4, phase);
  } else {
    // Stage 1: classify — per-depth solid-side flags
    const sides = classifyVisibleWalls(block, party);
    // Stage 2: build — span list from solid sides + seam tables, PLUS the
    // far-door centerpiece (the #077 deep-door, a wt=1 vanishing-point piece the
    // wt=2 side-wall path never emits — see deriveDoorCenterpieceSpans).
    const spans = deriveCorridorSpans(sides, SEAM_X0_WT2, SEAM_X1_WT2);
    spans.push(...deriveDoorCenterpieceSpans(block, party));
    // Stage 3: flush — compositor call-list from spans
    calls = generateCallList(spans, 4, phase);
  }

  // Stage 4: compositor — render wall pieces into a 4-plane EGA page
  const workPage = page ?? new Uint8Array(4 * PLANE_STRIDE);
  renderFrameFromAssets(workPage, assets, calls);

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
