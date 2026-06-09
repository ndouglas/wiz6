/**
 * maze-corridor-generated-parity.test.ts — GATE (`.test.ts`, default CI) for the
 * VIEWER FREE-ROAM render path: the maze background page is GENERATED from
 * mazedata.ega (not the engine's own captured page) and pushed through the full
 * renderMazeViewport pipeline, then compared to the committed engine oracle.
 *
 * This is the parity gate for Stage 4 (wiring generateFullCallList into MazeView's
 * free-roam viewport). It mirrors the END-TO-END path the browser now runs:
 *
 *   assets.mazedata  →  expandMazeData(...)            (the work buffer)
 *   block, party     →  generateFullCallList(...)       (OR + masked calls)
 *                    →  composeCallList(wb, calls)       (4-plane EGA page)
 *                    →  renderMazeViewport(block, party, assets, { page })
 *                    →  crop to MAZE_VIEWPORT, compare vs maze-corridor.idx.gz
 *
 * Crucially the page is SOURCED FROM mazedata.ega via the SAME asset loader the
 * viewer uses (loadMazeAssets().mazedata) — NOT from the engine's committed
 * background page (that route is the separate 100% gate
 * maze-corridor-viewport-parity.test.ts, which must stay green). This gate proves
 * the GENERATED render reproduces the corridor through the wired path.
 *
 * 100% (19712/19712, tol 0). The deep-door-center detail (#077) is now GENERATED:
 * deriveDoorCenterpieceSpans emits the wt=1 far-door span at the vanishing point
 * (CRACKED 2026-06-09 — docs/re/findings/maze-deepdoor-drawpath.json; the door
 * piece animates seamIdx 5↔6, oracle = seam 5). The prior 18px residual is closed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { renderMazeViewport } from '../../src/maze/render.js';
import { loadMazeAssets } from '../../src/maze/assets.js';
import {
  generateFullCallList,
  composeCallList,
} from '../../src/maze/callist.js';
import { expandMazeData } from '../../src/maze/maze-data.js';
import {
  MazeBlockSchema,
  type MazeBlock,
  type MazeParty,
  MAZE_VIEWPORT,
} from '@wiz6/data';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../../..');
const FIX = resolve(ROOT, 'tools/parity/fixtures/engine');

const FRAMES = JSON.parse(readFileSync(resolve(FIX, 'maze-frames.json'), 'utf8'));
const BLOCK: MazeBlock = MazeBlockSchema.parse(FRAMES.mazeBlock);
// The canonical free-roam corridor view (gx127 gy121 facing0 — the gy121 frame the
// entry sequence ends on, now rendered via generation, not the oracle).
const CORRIDOR: MazeParty = { gx: 127, gy: 121, z: 0, facing: 0 };

/** The committed engine framebuffer oracle, cropped to the maze viewport rect. */
function engineViewport(): Uint8Array {
  const raw = gunzipSync(readFileSync(resolve(FIX, 'maze-corridor.idx.gz')));
  const full = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  const { x, y, w, h } = MAZE_VIEWPORT;
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) out[r * w + c] = full[(y + r) * 320 + x + c]!;
  return out;
}

describe('maze-corridor GENERATED free-roam parity (GATE — wired viewer path)', () => {
  it('assets.mazedata is present (threaded through the asset pipeline)', () => {
    const assets = loadMazeAssets();
    expect(assets.mazedata.length).toBeGreaterThan(0);
    // mazedata.ega is 102303 bytes.
    expect(assets.mazedata.length).toBe(102303);
  });

  it('the WIRED free-roam render is byte-exact (100%) vs the gy121 engine oracle', () => {
    const assets = loadMazeAssets();
    // EXACTLY the viewer free-roam path: expand mazedata → generate calls → compose
    // page → renderMazeViewport with that page.
    const wb = expandMazeData(assets.mazedata);
    const calls = generateFullCallList(BLOCK, CORRIDOR);
    const page = composeCallList(wb, calls);
    const ours = renderMazeViewport(BLOCK, CORRIDOR, assets, { page });

    const eng = engineViewport();
    const N = MAZE_VIEWPORT.w * MAZE_VIEWPORT.h;
    expect(ours.length).toBe(N);
    let match = 0;
    for (let i = 0; i < N; i++) if (ours[i] === eng[i]) match++;
    const pct = (100 * match) / N;
    if (pct < 100) console.error(`generated viewport ${match}/${N} = ${pct.toFixed(4)}%`);
    // Byte-exact: the far-door centerpiece (#077) is now generated, closing the
    // prior 18px deep-door residual.
    expect(match).toBe(19712);
  });

  it('the door animates: phase 1 renders the alternate seam frame (the flicker)', () => {
    const assets = loadMazeAssets();
    const wb = expandMazeData(assets.mazedata);
    const page0 = composeCallList(wb, generateFullCallList(BLOCK, CORRIDOR));
    const phase0 = renderMazeViewport(BLOCK, CORRIDOR, assets, { page: page0, phase: 0 });
    const page1 = composeCallList(wb, generateFullCallList(BLOCK, CORRIDOR));
    const phase1 = renderMazeViewport(BLOCK, CORRIDOR, assets, { page: page1, phase: 1 });
    // The two phases differ ONLY at the animating deep-door centerpiece (a tiny
    // door-stile flicker) — a small, nonzero, LOCALIZED set of pixels.
    let diff = 0;
    for (let i = 0; i < phase0.length; i++) if (phase0[i] !== phase1[i]) diff++;
    expect(diff).toBeGreaterThan(0); // it animates
    expect(diff).toBeLessThan(8); // ...but only the door stile (the deep-door 1px region)
    // Phase 0 stays the byte-exact oracle frame (asserted above); phase 1 is the
    // valid alternate engine frame (seam 6 vs seam 5).
  });
});
