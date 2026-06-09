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
 *   (2) OFF-AXIS CLASSIFY: the per-depth DOOR-recess family (138–149) lives in the
 *       decompiler-resistant classify post-pass (maze-wall-family-seeding.json). The
 *       front-door junction gx127gy123f1 renders its closed-front STONE WALL but not
 *       the door ARCHWAY (masked-mirror residue). gx124gy121f0's deep recess + side
 *       walls are largely masked-mirror-drawn by the engine (the OR-direct generator
 *       fills the centre via the deep-solid far-wall family but not the masked sides).
 *
 * ── VOID FIX 2026-06-09 (maze-freeroam off-axis pass) ──
 * The "walking-around shows a black void" complaint: the generator under-emitted for
 * the off-axis EDGE/JUNCTION geometries (it truncated the view at a front=2 jog and
 * skipped the receding stone side wall + the far closed wall). Three changes to
 * callist.ts fixed the void (validated by EYEBALL — render via COMPOSED_PALETTE vs the
 * engine .png — and by the dither-tolerant blackOurs→engBlack convergence):
 *   (a) frontOccludes: a solid front with exactly ONE STONE side corner (code 2) is a
 *       corridor JOG, not a cap — the view continues to depth 3 (was truncated at d1).
 *       Leaves v1/v2/v5/v6's byte-exact occlusion unchanged (their solid stops have
 *       both corners open or are doors).
 *   (b) generateSideWall: emit the receding stone wall (base 15/19 + d) when a passage
 *       precedes the stone depth (a wall seen DOWN the corridor), not only mid-run.
 *   (c) generateFarClosedWall: a DEEP solid stop (depth ≥ 2) draws the far near-wall
 *       family {0,83,87}+stop (gx124gy121f0's centre); a shallow solid stop (v5, d1)
 *       still draws nothing (byte-exact preserved).
 * gx127gy121f1 went from a BLACK VOID (9532px / floor) to a recognizable receding
 * stone corridor (10017px); gx127gy122f3 +1101px; the others held or improved. The
 * remaining sub-100% residue is dither phase + the masked-mirror door-recess family.
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
    floor: 9602, // 48.71%
    allowedSpurious: [2, 85, 89],
    residue:
      'deep-solid far-wall family {2,85,89} now fills the centre (was a black void band); ' +
      'the deep recess + side walls are otherwise masked-mirror-drawn (decompiler-resistant) + dither',
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
    floor: 16595, // 84.19%
    allowedSpurious: [137, 165, 3, 86, 90],
    residue:
      'LEFT stone wall filled (was black void). The deep-solid far-wall family {3,86,90} ' +
      'is emitted but lands off-centre/occluded here (floor +1px) — correct-family residue, not garbage; dither',
  },
  {
    view: 'gx127-gy121-f1',
    party: { gx: 127, gy: 121, z: 0, facing: 1 },
    floor: 10017, // 50.82% — was a BLACK VOID (9532); the offset-wall occlusion +
    // right-stone wall now fill it as a recognizable corridor.
    allowedSpurious: [20],
    residue:
      'VOID FIXED 2026-06-09: offset-wall occlusion exception extends the view to depth 3 + the ' +
      'right-stone wall fills the right (eyeballed: a stone corridor receding east). +485px. ' +
      'Residue = dither phase on the receding stone surface (the structural void is gone). ' +
      'Spurious 20 = the one-slot-off d1 right-stone (engine placed 19/21/22).',
  },
  {
    view: 'gx127-gy122-f3',
    party: { gx: 127, gy: 122, z: 0, facing: 3 },
    floor: 17604, // 89.31% — was 16503; the generalized stone wall + far-wall lifted +1101px.
    allowedSpurious: [20, 138, 141, 166, 169],
    residue: 'RIGHT stone wall + deep depths now filled; +11pp over the prior floor; dither',
  },
  {
    view: 'gx127-gy123-f1',
    party: { gx: 127, gy: 123, z: 0, facing: 1 },
    floor: 7381, // 37.44%
    allowedSpurious: [0, 83, 87],
    residue:
      'front-door junction — renders the closed-front STONE WALL (no void), but the door ' +
      'ARCHWAY (door-recess family, masked-mirror) is decompiler-resistant residue. NOT a void.',
  },
  // LOOK-BACK / HEAD-ON DOOR views (2026-06-09 maze-freeroam look-back pass). Turning
  // around (facing 2) at the entrance to look BACK at the gate the party came through.
  // The door at gy121 (north=3) viewed head-on is a CLOSED gate that CAPS the view at
  // its depth (the head-on-door occlusion law in frontOccludes/computeVisibleDepths) —
  // BEFORE the fix these rendered a deep receding corridor with a BLACK VOID on the
  // right (the user's report). Now: gy121-f2 caps at depth 0 (near gate fills the
  // viewport, closed-front family {0,83,87}); gy122-f2 caps at depth 1 (gate recessed
  // into the far wall, far-closed family {1,84,88}). EYEBALL-confirmed vs the engine
  // .png: recognizable centred portcullis gate, NO black void/gap, stone frame. The
  // colourful portcullis-LEAF detail (door-recess families 17–34 / 5–34) + the engine's
  // masked-mirror near-flank + side-wall surfaces are the decompiler-resistant residue
  // that caps the pixel parity (same class as gx127gy123f1).
  {
    view: 'gx127-gy121-f2',
    party: { gx: 127, gy: 121, z: 0, facing: 2 },
    floor: 12308, // 62.44% — was a BLACK VOID + deep wrong-angle corridor. Now the
    // head-on door caps at depth 0: the closed-front gate family fills the centre.
    allowedSpurious: [0, 83, 87],
    residue:
      'LOOK-BACK at the entrance gate (door at the party own cell). Head-on-door ' +
      'occlusion caps the view at depth 0 → the closed-front near-wall family {0,83,87} ' +
      'draws the centred gate face + stone frame (the gate the engine shows near and ' +
      'large). The colourful portcullis-leaf detail (door-recess 17–34) + the engine ' +
      'near-flank masked side walls are decompiler-resistant residue. NO void.',
  },
  {
    view: 'gx127-gy122-f2',
    party: { gx: 127, gy: 122, z: 0, facing: 2 },
    floor: 9406, // 47.72% — was a BLACK VOID on the right + corridor running PAST the
    // gate. Now the head-on door caps at depth 1: far-closed gate family at the
    // corridor end, side walls recede to it.
    allowedSpurious: [1, 84, 88, 131, 134, 138, 143, 159, 162, 166, 171],
    residue:
      'LOOK-BACK one cell deeper (door one cell ahead). Head-on-door occlusion caps at ' +
      'depth 1 → far-closed gate family {1,84,88} recesses the gate into the far wall; ' +
      'the receding side-wall surface (131/134/138/143 + 28-floor twins) frames the ' +
      'corridor (one-slot-off vs the engine 132/135/136/139/140/144 — structural recede, ' +
      'not garbage). Door-leaf detail (5–34) is decompiler-resistant residue. NO void.',
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
