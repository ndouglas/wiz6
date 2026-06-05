/**
 * maze-lookback-parity.diagnostic.test.ts — full-viewport parity DIAGNOSTIC for
 * the lookback frame (facing 2). This is the intended home of the first
 * full-viewport byte-exact maze gate (T11a), but the gate is NOT yet attainable.
 * It is a `.diagnostic.test.ts` (informational, excluded from default CI) — NOT a
 * gate — because the lookback viewport cannot yet be rendered byte-exact:
 *
 *   - The wall pipeline (classify->build->flush->compositor->decode) renders the
 *     4 wt=2 side-wall spans byte-exact (≈1839 viewport px). This test guards
 *     that they remain present (regression guard on the DONE part).
 *   - The FLOOR / CEILING (dithered grey stone) + the central stained-glass
 *     WINDOW / PORTCULLIS terminal element (idx 5/10/12/13/14, ≈946 px spanning
 *     x74..246/y52..143) are UNRENDERED. They are per-view geometry/asset
 *     rasterizations in the proprietary masked-image format (still uncracked) —
 *     see docs/re/findings/maze-floor-ceiling.json.
 *
 * UPDATE (2026-06-04, maze-background-integration.json): the OR-blit floor/ceiling/
 * window decoder is now CRACKED (maze-floor-ceiling-decoder.json) and PORTED into
 * the parser (src/maze/background.ts composeBackground + render.ts
 * buildBackgroundPage / renderMazeViewport {placements} opt). So blocker (2) below
 * is resolved AS AN ALGORITHM (gated byte-exact by background.test.ts + the engine
 * 99.93% same-run pair in tools/parity/maze-floor-ceiling-parity.test.ts). What
 * remains for THIS gate is a from-asset PLACEMENT-LIST GENERATOR (per-view
 * selection of the engine cs:[0x190]/cs:[0x18e] tables) so the background page can
 * be built WITHOUT a live capture — sidestepping blocker (1) entirely.
 *
 * TWO blockers still gate a 100% pixel test from LIVE capture:
 *   1. FIXTURE/CORE MISMATCH (gating): the committed maze-corridor.state.gz will
 *      NOT unserialize on the patched trace core (DBPSerialize_CPU layout →
 *      `err unser`, re-confirmed 2026-06-04), and the nightly core that CAN load it
 *      has no trace/capture. A fresh patched-core drive reaches a DIFFERENT frame
 *      (gy=118 at-gate, not the committed gy=121) and cannot advance past the gate.
 *      So NO committed .idx.gz oracle's OR-blit background is live-capturable, and
 *      the only capturable frame (gy=118) has no committed oracle (decode of its
 *      background vs committed maze-corridor viewport = 58%). See
 *      maze-background-integration.json full-viewport-gate-blocked-frame-mismatch.
 *   2. PLACEMENT-LIST GENERATOR (the from-asset route, preferred): decode the
 *      on-disk floor (1346)/ceiling (1740)/window assets via the .pic RLE decoder
 *      into the 4-plane planar work-buffer + read/RE the per-view placement
 *      selection from cs:[0x18e]/cs:[0x190]. Then composeBackground reproduces any
 *      committed frame's background deterministically (no live capture).
 *
 * TODO(#T11a): once the from-asset placement generator (2) lands (or the core
 * serialize bridge (1) is built), build the background page for the committed
 * lookback party and promote this to a `maze-lookback-parity.test.ts` 100% gate
 * (tolerance 0) per tools/parity/CLAUDE.md. The wall path is byte-exact for
 * facing 2; the background compositor is now ported and ready to consume the
 * generated placements.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { renderMazeViewport } from '../../src/maze/render.js';
import { loadMazeAssets } from '../../src/maze/assets.js';
import { MazeBlockSchema, type MazeBlock, type MazeParty, MAZE_VIEWPORT } from '@wiz6/data';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../../..');
const framesPath = resolve(ROOT, 'tools/parity/fixtures/engine/maze-frames.json');
const FRAMES = JSON.parse(readFileSync(framesPath, 'utf8'));
const BLOCK: MazeBlock = MazeBlockSchema.parse(FRAMES.mazeBlock);
const LOOKBACK: MazeParty = FRAMES.classifyFrames.frames.find(
  (f: { name: string }) => f.name === 'maze-corridor-lookback',
).party;

// The wiz6-main AC→DAC composed palette (same chain decode-screen.ts uses). The
// committed .idx.gz fixtures + our page indices are both in EGA-16 index space;
// compare RGB through this palette (see maze-background-nature.json palette note).
// Inlined here so the parser test has no tools/parity dependency.
const EGA16: Array<[number, number, number]> = [
  [0, 0, 0], [0, 0, 170], [0, 170, 0], [0, 170, 170],
  [170, 0, 0], [170, 0, 170], [170, 85, 0], [170, 170, 170],
  [85, 85, 85], [85, 85, 255], [85, 255, 85], [85, 255, 255],
  [255, 85, 85], [255, 85, 255], [255, 255, 85], [255, 255, 255],
];

function engineLookbackViewport(): Uint8Array {
  const raw = gunzipSync(
    readFileSync(resolve(ROOT, 'tools/parity/fixtures/engine/maze-corridor-lookback.idx.gz')),
  );
  const full = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  const { x, y, w, h } = MAZE_VIEWPORT;
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let cx = 0; cx < w; cx++) out[r * w + cx] = full[(y + r) * 320 + x + cx]!;
  return out;
}

describe('maze lookback full-viewport parity (DIAGNOSTIC — not a gate)', () => {
  const assets = loadMazeAssets();
  const ours = renderMazeViewport(BLOCK, LOOKBACK, assets);
  const eng = engineLookbackViewport();
  const N = MAZE_VIEWPORT.w * MAZE_VIEWPORT.h;

  it('renders the 4 wt=2 side-wall spans (≈1839 non-zero px) — regression guard on the DONE part', () => {
    const nonZero = ours.reduce((acc, v) => acc + (v !== 0 ? 1 : 0), 0);
    // The wall pipeline emits the lookback recess's 4 side spans. Guard the count
    // stays in the established range (exact = 1839 at time of writing).
    expect(nonZero).toBeGreaterThan(1500);
    expect(nonZero).toBeLessThan(2200);
  });

  it('documents the current full-viewport match (floor/ceiling/window unrendered)', () => {
    let match = 0;
    for (let i = 0; i < N; i++) {
      const o = EGA16[ours[i]!]!;
      const e = EGA16[eng[i]!]!;
      if (o[0] === e[0] && o[1] === e[1] && o[2] === e[2]) match++;
    }
    const pct = (100 * match) / N;
    // Walls-only over a blank page ≈ 29% (walls + coincidental black background).
    // This is NOT the 100% gate — see the file header for the two blockers.
    expect(pct).toBeGreaterThan(25);
    expect(pct).toBeLessThan(100);
  });
});
