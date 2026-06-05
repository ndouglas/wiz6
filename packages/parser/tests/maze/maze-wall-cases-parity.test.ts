/**
 * maze-wall-cases-parity.test.ts — Task C2 WALL-REGION pixel-parity gate (gate-tier
 * `.test.ts`, runs in the default @wiz6/parser suite).
 *
 * Gates the non-corridor WALL view-cases the reachable level-0 starting area
 * exercises (C1 enumeration). For each gated case we render the engine-captured
 * wall span list (committed tools/parity/fixtures/engine/maze-wall-spans.json)
 * through the parser wall pipeline (generateCallList → renderFrameFromGeometry →
 * decodePageIndex) and assert the WALL-PAINTED pixels match the C1 framebuffer
 * fixture (maze-view-<case>.idx.gz) BYTE-EXACT (tolerance 0).
 *
 * ── WALL REGION (not full frame) ──
 * The C1 fixtures are FULL frames (walls + floor/ceiling background). The
 * background (C3) is not ported yet, so we gate ONLY the pixels the wall pipeline
 * draws. WALL MASK: render the same spans onto TWO uniformly-filled background
 * pages (all-index-0 and all-index-15); a pixel that is IDENTICAL in both renders
 * was overwritten by a wall (the background cannot show through there). Those
 * pixels are the wall region; compare them to the fixture. Empty cases (no wall
 * spans) draw zero wall pixels and trivially pass (their viewport is pure
 * background = C3).
 *
 * ── WHY CAPTURED SPANS (not generated) ──
 * The wall-emit PREDICATE is NOT derivable from offline geometry — proven by the
 * f0/f2 mirror-symmetry counterexample (docs/re/findings/maze-classify-gating.json
 * Prong A disproven) — and the live per-emit arg trace is BLOCKED by the relocated-
 * renderer instrumentation wall (Prong B). So C2 CAPTURES the engine's own settled
 * span list (DGROUP 0x50d0) per view-case and renders it through the byte-exact
 * flush→compositor→page pipeline. This is the finite-capture sidestep the C2 plan
 * authorizes for decompiler-blocked wall cases. Recapture/verify with:
 *   pnpm tsx tools/libretro/capture-maze-wall-spans.ts          (rewrite)
 *   pnpm tsx tools/libretro/capture-maze-wall-spans.ts --check  (diff vs committed)
 *
 * ── GATED vs KNOWN-GAP ──
 * GATED (byte-exact): the empty cases + the tile-2 cases whose full span list was
 * captured (corridor solids + door recesses). KNOWN-GAP (documented, NOT gated):
 * cases whose drawn spans use tile-0/tile-1 pieces (front-walls / far-shapes). The
 * compositor renders any piece, but tile selects a DIFFERENT descriptor table +
 * source atlas (FUN_1c94 [bp+0xc] → cs:[0x17a+2*tile]+cs:[0x169]) — only the tile-2
 * atlas is committed (maze-assets.json). Capturing the tile-0/1 atlases needs a
 * LOAD-TIME pixel-source capture on the patched core (the settled-state atlas is
 * stale per maze-texture-decode.json) which cannot unserialize the committed
 * states (maze-background-fromasset.json). See docs/re/findings/maze-wall-cases-c2.json.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAZE_VIEWPORT, PLANE_STRIDE } from '@wiz6/data';
import { generateCallList } from '../../src/maze/flush.js';
import { renderFrameFromGeometry, type MazeSpan } from '../../src/maze/compositor.js';
import { decodePageIndex } from '../../src/maze/page.js';
import { loadMazeAssets } from '../../src/maze/assets.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../../..');
const FIX = resolve(ROOT, 'tools/parity/fixtures/engine');

interface CaseRec {
  id: string;
  kind: string;
  depthBound: number;
  spans: MazeSpan[];
}

const SPANS_DATA = JSON.parse(
  readFileSync(join(FIX, 'maze-wall-spans.json'), 'utf8'),
) as { cases: CaseRec[] };

/**
 * The view-cases gated byte-exact this pass: every case whose drawn wall spans use
 * ONLY tile-2 pieces (the committed atlas) AND whose full span list was captured,
 * plus the empty cases (no drawn spans → zero wall pixels). The remaining cases are
 * KNOWN GAPS (tile-0/1 atlas, or clip-dependent partial captures) — see the module
 * docstring + docs/re/findings/maze-wall-cases-c2.json.
 */
const GATED_EXACT = new Set([
  // tile-2 substantive (corridor solids + door recesses) — full capture, 100%
  'case-04',
  'case-15',
  'case-26',
  'case-27',
  'case-28',
  // empty (no wall spans — pure background, C3)
  'case-01',
  'case-02',
  'case-05',
  'case-06',
  'case-10',
  'case-14',
  'case-20',
  'case-22',
  'case-24',
  'case-30',
]);

const assets = loadMazeAssets();
const { x: VX, y: VY, w: VW, h: VH } = MAZE_VIEWPORT;
const N = VW * VH;

function fixtureViewport(name: string): Uint8Array {
  const raw = gunzipSync(readFileSync(join(FIX, `${name}.idx.gz`)));
  const full = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  const out = new Uint8Array(N);
  for (let r = 0; r < VH; r++)
    for (let c = 0; c < VW; c++) out[r * VW + c] = full[(VY + r) * 320 + VX + c]!;
  return out;
}

/** Render the spans onto a uniformly-filled page; return the viewport crop. */
function renderViewport(spans: MazeSpan[], size: number, fill: number): Uint8Array {
  const page = new Uint8Array(4 * PLANE_STRIDE);
  if (fill !== 0) {
    for (let p = 0; p < 4; p++) {
      if ((fill >> p) & 1) page.fill(0xff, p * PLANE_STRIDE, (p + 1) * PLANE_STRIDE);
    }
  }
  renderFrameFromGeometry(page, assets.atlas, assets.pieceDescriptors, generateCallList(spans, size));
  const full = decodePageIndex(page, 320, 200);
  const out = new Uint8Array(N);
  for (let r = 0; r < VH; r++)
    for (let c = 0; c < VW; c++) out[r * VW + c] = full[(VY + r) * 320 + VX + c]!;
  return out;
}

describe('maze WALL-region pixel-parity (C2 gate, tolerance 0)', () => {
  for (const cs of SPANS_DATA.cases) {
    if (!GATED_EXACT.has(cs.id)) continue;
    it(`${cs.id} [${cs.kind}] wall region byte-exact vs C1 fixture`, () => {
      const size = cs.depthBound || 4;
      const onBlack = renderViewport(cs.spans, size, 0);
      const onWhite = renderViewport(cs.spans, size, 15);
      const fix = fixtureViewport(`maze-view-${cs.id}`);

      let wallPx = 0;
      let match = 0;
      const diffs: string[] = [];
      for (let i = 0; i < N; i++) {
        if (onBlack[i] === onWhite[i]) {
          wallPx++;
          if (onBlack[i] === fix[i]) match++;
          else if (diffs.length < 10) {
            const x = VX + (i % VW);
            const y = VY + Math.floor(i / VW);
            diffs.push(`(${x},${y}) got=${onBlack[i]} want=${fix[i]}`);
          }
        }
      }
      expect(
        match,
        `${cs.id}: ${match}/${wallPx} wall px match — ${diffs.join('  ')}`,
      ).toBe(wallPx);
    });
  }

  it('gates the expected set (5 tile-2 substantive + 10 empty = 15 cases)', () => {
    const gatedPresent = SPANS_DATA.cases.filter((c) => GATED_EXACT.has(c.id)).length;
    expect(gatedPresent).toBe(15);
  });
});
