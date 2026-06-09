/**
 * maze-freeroam-parity.test.ts — GATE (`.test.ts`, default CI) for the OFF-AXIS /
 * TURNED free-roam views (the "walking around shows garbage / black voids" fix).
 *
 * The entrance corridor (gx127 gy121 f0) is byte-exact via the from-asset path
 * (maze-corridor-generated-parity.test.ts, ≥99.9%). This file gates the 6 captured
 * OFF-AXIS engine ground-truth views — the ones the generator previously rendered as
 * black voids (missing side-wall families) or garbage (spurious OR). Each is rendered
 * through the EXACT viewer wired path:
 *
 *   mazedata.ega → expandMazeData → generateFullCallList(block, party)
 *                → composeCallList(wb, calls) → renderMazeViewport(block, party, { page })
 *                → crop to MAZE_VIEWPORT, compare vs maze-freeroam-<view>.idx.gz
 *
 * ── WHY NOT ≥99% (honest residue, not aspiration) ──
 * Byte-exact generation of these views is NOT attainable and the captures themselves
 * do not reproduce their fixtures via the from-asset compose (composing the engine's
 * OWN captured call-list reaches only 29–84% — the captures are off-axis full-recompose
 * frames whose masked-mirror pairings + dithered stone-texture surfaces are NOT a clean
 * function of the static placement records). Two residue classes cap parity:
 *   (1) DITHER-PHASE: the receding stone-wall / cobble-floor surfaces are dithered
 *       2-index patterns; our static-placement compose lands a different dither phase
 *       than the engine's runtime surface, so even a structurally-correct corridor
 *       mismatches ~10–50% of pixels (same class as the entrance's 18px deep-door gap,
 *       just larger surface area). NOT fixable by adding placements.
 *   (2) OFF-AXIS CLASSIFY: the per-depth DOOR-recess family (138–149) and the
 *       front-occlusion depth bound for turned views live in the decompiler-resistant
 *       classify post-pass (maze-wall-family-seeding.json). gx127gy123f1 (a front-door
 *       junction) and gx127gy121f1 (a corridor whose front-occlusion stop cuts the view
 *       at depth 1 while the open side recedes further) stay at the OR floor.
 *
 * ── WHAT THIS GATE LOCKS ──
 *   (a) PER-VIEW pixel floor — the achieved match count through the wired path. This
 *       is a REGRESSION FLOOR (the generalized side-wall + stone-wall families lifted
 *       these from 37–72% to the floors below); it must not drop. Each is documented
 *       with its residue class.
 *   (b) NO SPURIOUS GARBAGE — the generated OR/masked placements are a near-subset of
 *       the engine's PLACED set (OR src + masked dst). The few permitted residue
 *       indices (one-slot-off side-wall pieces + the closed-front wall on the door
 *       view) are enumerated; nothing else may leak (that would be wrong-angle walls).
 *
 * The achieved floors + the general law are documented in
 * docs/re/findings/maze-masked-generation.json + maze-generation-law.json.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { renderMazeViewport } from '../../src/maze/render.js';
import { loadMazeAssets } from '../../src/maze/assets.js';
import { generateFullCallList, composeCallList } from '../../src/maze/callist.js';
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

const N = MAZE_VIEWPORT.w * MAZE_VIEWPORT.h; // 19712

interface ViewCase {
  view: string; // maze-freeroam-<view>
  party: MazeParty;
  /** Regression FLOOR: minimum wired-path match count (the achieved value at the time
   *  the generalization landed). The residue above each floor is documented per-view. */
  floor: number;
  /** Permitted residue OR/masked-dst indices NOT in the engine PLACED set (one-slot-off
   *  side-wall pieces / the closed-front wall on the door view). Anything beyond this set
   *  is a regression (wrong-angle / garbage walls). */
  allowedSpurious: number[];
  residue: string;
}

const CASES: ViewCase[] = [
  {
    view: 'gx124-gy121-f0',
    party: { gx: 124, gy: 121, z: 0, facing: 0 },
    floor: 9594, // 48.67%
    allowedSpurious: [],
    residue: 'in-place-turn capture (mid-build masked_flags); door-recess + dither residue',
  },
  {
    view: 'gx124-gy121-f3',
    party: { gx: 124, gy: 121, z: 0, facing: 3 },
    floor: 11200, // 56.82%
    allowedSpurious: [135, 163],
    residue: 'door-recess family + dither; symmetric side-wall fill lifted +9pp',
  },
  {
    view: 'gx126-gy121-f3',
    party: { gx: 126, gy: 121, z: 0, facing: 3 },
    floor: 16594, // 84.18%
    allowedSpurious: [137, 165],
    residue: 'LEFT stone wall now filled (was black void); +21pp; dither residue',
  },
  {
    view: 'gx127-gy121-f1',
    party: { gx: 127, gy: 121, z: 0, facing: 1 },
    floor: 9532, // 48.36%
    allowedSpurious: [],
    residue: 'front-occlusion stop cuts view at depth 1 (off-axis classify residue) + dither',
  },
  {
    view: 'gx127-gy122-f3',
    party: { gx: 127, gy: 122, z: 0, facing: 3 },
    floor: 16503, // 83.72%
    allowedSpurious: [138, 166, 141, 169],
    residue: 'RIGHT stone wall now filled; near-flank masked correctly suppressed; +11pp',
  },
  {
    view: 'gx127-gy123-f1',
    party: { gx: 127, gy: 123, z: 0, facing: 1 },
    floor: 7381, // 37.44%
    allowedSpurious: [0, 83, 87],
    residue: 'front-door junction — door-recess family is decompiler-resistant residue',
  },
];

function engineViewport(view: string): Uint8Array {
  const raw = gunzipSync(readFileSync(resolve(FIX, `maze-freeroam-${view}.idx.gz`)));
  const full = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  const { x, y, w, h } = MAZE_VIEWPORT;
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) out[r * w + c] = full[(y + r) * 320 + x + c]!;
  return out;
}

/** The engine's PLACED placement-index set (OR src + masked dst) from the committed
 *  capture — the geometry actually drawn on screen, regardless of OR-vs-masked branch. */
function enginePlaced(view: string): Set<number> {
  const j = JSON.parse(
    readFileSync(resolve(ROOT, `docs/re/findings/maze-views/freeroam-${view}-callist.json`), 'utf8'),
  );
  const placed = new Set<number>();
  for (const c of j.calls as Array<{ branch: string; arg0c: number; arg10: number }>) {
    if (c.branch === 'OR') placed.add(c.arg0c);
    else placed.add(c.arg10);
  }
  return placed;
}

describe('maze-freeroam off-axis parity (GATE — wired viewer path, documented residue)', () => {
  const assets = loadMazeAssets();
  const wb = expandMazeData(assets.mazedata);

  it.each(CASES)(
    'renders $view through the wired path at/above its documented floor',
    ({ view, party, floor, residue }) => {
      const calls = generateFullCallList(BLOCK, party);
      const page = composeCallList(wb, calls);
      const ours = renderMazeViewport(BLOCK, party, assets, { page });
      expect(ours.length).toBe(N);
      const eng = engineViewport(view);
      let match = 0;
      for (let i = 0; i < N; i++) if (ours[i] === eng[i]) match++;
      // REGRESSION FLOOR. The generalized side-wall + full-height stone-wall families
      // lifted these from 37–72% to the floors below. Residue per view: ${residue}.
      // Don't drop below the floor; do RAISE it (with the new value) when the residue
      // shrinks (e.g. the door-recess family or the dither path is cracked).
      expect(match, `${view}: ${residue}`).toBeGreaterThanOrEqual(floor);
    },
  );

  it.each(CASES)(
    'emits NO spurious garbage placements beyond documented residue ($view)',
    ({ view, party, allowedSpurious }) => {
      const placed = enginePlaced(view);
      const calls = generateFullCallList(BLOCK, party);
      const spurious = new Set<number>();
      for (const c of calls) {
        const idx = c.kind === 'OR' ? c.src : c.dst; // the on-screen geometry index
        if (!placed.has(idx)) spurious.add(idx);
      }
      // Every generated placement must be in the engine's PLACED set EXCEPT the
      // enumerated residue (one-slot-off side-wall pieces / the closed-front wall on the
      // door view). Anything else = wrong-angle / garbage walls (the original bug).
      const unexpected = [...spurious].filter((x) => !allowedSpurious.includes(x)).sort((a, b) => a - b);
      expect(unexpected).toEqual([]);
    },
  );
});
