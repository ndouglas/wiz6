/**
 * maze-wall-spans-validate.ts — validate the C2 captured wall spans against the
 * C1 engine framebuffer fixtures, WALL REGION only.
 *
 * Renders each case's captured span list (maze-wall-spans.json) through the
 * pipeline (generateCallList → renderFrameFromGeometry → decodePageIndex) and
 * compares the WALL-PAINTED pixels against the committed C1 .idx.gz fixture.
 *
 * WALL MASK derivation (no background port needed): the compositor REPLACEs only
 * the pixels a wall piece covers (transparent texels are skipped). Render the same
 * spans onto TWO different background pages (all-index-0 and all-index-15); any
 * pixel that is IDENTICAL in both renders was overwritten by a wall (the
 * background can't show through) → that is the wall region. Compare those pixels
 * to the fixture. Tolerance 0.
 *
 * Usage: pnpm tsx tools/parity/maze-wall-spans-validate.ts
 */

import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAZE_VIEWPORT, PLANE_STRIDE } from '../../packages/data/src/index.js';
import { generateCallList } from '../../packages/parser/src/maze/flush.js';
import { renderFrameFromGeometry, type MazeSpan } from '../../packages/parser/src/maze/compositor.js';
import { decodePageIndex } from '../../packages/parser/src/maze/page.js';
import { loadMazeAssets } from '../../packages/parser/src/maze/assets.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const FIX = resolve(ROOT, 'tools', 'parity', 'fixtures', 'engine');

interface CaseRec {
  id: string;
  kind: string;
  depthBound: number;
  spans: MazeSpan[];
}

function fixtureViewport(name: string): Uint8Array {
  const raw = gunzipSync(readFileSync(join(FIX, `${name}.idx.gz`)));
  const full = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  const { x, y, w, h } = MAZE_VIEWPORT;
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) out[r * w + c] = full[(y + r) * 320 + x + c]!;
  return out;
}

/** Render spans onto a uniformly-filled page, crop to the viewport. */
function renderViewport(
  spans: MazeSpan[],
  size: number,
  assets: ReturnType<typeof loadMazeAssets>,
  fill: number,
): Uint8Array {
  const page = new Uint8Array(4 * PLANE_STRIDE);
  // fill the page so every plane bit = the requested 4-bit index uniformly
  if (fill !== 0) {
    for (let p = 0; p < 4; p++) {
      const bit = (fill >> p) & 1;
      if (bit) page.fill(0xff, p * PLANE_STRIDE, (p + 1) * PLANE_STRIDE);
    }
  }
  const calls = generateCallList(spans, size);
  renderFrameFromGeometry(page, assets.atlas, assets.pieceDescriptors, calls);
  const full = decodePageIndex(page, 320, 200);
  const { x, y, w, h } = MAZE_VIEWPORT;
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) out[r * w + c] = full[(y + r) * 320 + x + c]!;
  return out;
}

function main() {
  const data = JSON.parse(readFileSync(join(FIX, 'maze-wall-spans.json'), 'utf8'));
  const cases: CaseRec[] = data.cases;
  const assets = loadMazeAssets();
  const { w, h } = MAZE_VIEWPORT;
  const N = w * h;

  let totalExact = 0;
  let casesWithWalls = 0;
  let casesExact = 0;
  for (const cs of cases) {
    const drawn = cs.spans.filter((s) => s.walltype !== 0xff);
    const size = cs.depthBound || 4;
    const onBlack = renderViewport(cs.spans, size, assets, 0);
    const onWhite = renderViewport(cs.spans, size, assets, 15);
    const fix = fixtureViewport(`maze-view-${cs.id}`);

    // Wall mask = pixels OUR span render OVERWRITES (identical in both background
    // variants → the background cannot show through there). We gate ONLY those
    // pixels: does what our wall pipeline paints match the engine fixture exactly?
    // (Fixture pixels OUTSIDE our wall set are background / front-wall-face = C3,
    // out of C2 scope.)
    let wallPx = 0;
    let match = 0;
    const diffs: string[] = [];
    for (let i = 0; i < N; i++) {
      if (onBlack[i] === onWhite[i]) {
        wallPx++;
        if (onBlack[i] === fix[i]) match++;
        else if (diffs.length < 6) {
          const x = MAZE_VIEWPORT.x + (i % w);
          const y = MAZE_VIEWPORT.y + Math.floor(i / w);
          diffs.push(`(${x},${y}) got=${onBlack[i]} want=${fix[i]}`);
        }
      }
    }
    const pct = wallPx ? (100 * match) / wallPx : 100;
    const exact = wallPx === 0 || match === wallPx;
    if (drawn.length > 0) casesWithWalls++;
    if (exact) casesExact++;
    if (wallPx > 0) totalExact += exact ? 1 : 0;
    const tag = exact ? 'OK ' : 'BAD';
    console.log(
      `${tag} ${cs.id} [${cs.kind}] drawn=${drawn.length} wallPx=${wallPx} match=${match} (${pct.toFixed(2)}%)` +
      (exact ? '' : `  ${diffs.join('  ')}`),
    );
  }
  console.log(`\n${casesExact}/${cases.length} cases wall-region byte-exact; ${casesWithWalls} cases draw walls.`);
}

main();
