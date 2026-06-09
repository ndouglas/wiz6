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
    floor: 16262, // 82.50% — PARITY-ODD WHOLE-FRAME MASKED pass (2026-06-09). Was 9602
    // (48.71%): the side walls are now drawn through the masked-mirror branch
    // (generateParityOddMasked) instead of OR-direct, matching the engine's parity-odd
    // emission. +6660px. The remaining residue is the DEEP-DOOR-RECESS masked family
    // (36–81: src=same-side deeper slot, a REVERSED pairing vs the side-wall law) +
    // dither — the genuine decompiler-resistant ray-march residue.
    allowedSpurious: [2, 85, 89],
    residue:
      'PARITY-ODD masked side walls (+6660px). Deep-solid far-wall family {2,85,89} ' +
      'fills the centre; the deep door-recess masked family (36–81, reversed pairing) ' +
      'is decompiler-resistant residue + dither.',
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
    allowedSpurious: [137, 165, 3, 86, 90, 17],
    residue:
      'LEFT stone wall filled (was black void). The deep-solid far-wall family {3,86,90} ' +
      'is emitted but lands off-centre/occluded here (floor +1px) — correct-family residue, not garbage; dither. ' +
      '17 = a near-flank side-wall piece: the FRAME-SYNCED re-capture (2026-06-09) is a pure-OR settled compose ' +
      'that placed this side wall via OR indices {15,85,108} instead of the prior masked twins {17,83,114}, so ' +
      'the generator-emitted 17 is no longer in the engine PLACED set — same one-slot-off side-wall residue class.',
  },
  {
    view: 'gx127-gy121-f1',
    party: { gx: 127, gy: 121, z: 0, facing: 1 },
    floor: 16618, // 84.30% — PARITY-ODD WHOLE-FRAME MASKED pass (2026-06-09). Was
    // 10017 (50.82%): the side walls are now masked-mirror (generateParityOddMasked),
    // matching the engine's parity-odd emission. +6601px (a recognizable receding
    // stone corridor, no void). The residual ~15% to the 99.16% ceiling is the near
    // RIGHT-stone flank pieces (21/87 — the asymmetric near-stone wall) + the OR
    // special 118 + dither; the generated DST set is otherwise the engine's masked set.
    allowedSpurious: [20],
    residue:
      'PARITY-ODD masked side walls (+6601px, void gone). The remaining gap to the ' +
      '99.16% ceiling = the asymmetric near RIGHT-stone flank (21/87) + the OR special ' +
      '118 + dither. Spurious 20 = the one-slot-off d1 right-stone (engine placed 19/21/22).',
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
    floor: 7880, // 39.98% — PARITY-ODD WHOLE-FRAME MASKED pass (2026-06-09): the side
    // walls are now masked-mirror (+1309px). The front-door junction's door ARCHWAY is
    // the engine masked-mirror door-recess family (128/148/156/176 + 19/15 + 29/32/23/26)
    // whose pairing is the decompiler-resistant residue (the 83.94% ceiling).
    // (was 6571 / 33.34% — lowered from 7381 by the SPURIOUS-SIDE-ARCH fix 2026-06-09:
    // the closed-front family no longer OR-emits 0/83/87 for a facing-0/1 closed front
    // (the engine draws the near wall via the masked-mirror branch, NOT OR side arches —
    // real-move ground truth). The prior {0,83,87} fill inflated the match by ~810px of
    // VISUALLY-WRONG side arches; removing them is correct (the user reported them).
    allowedSpurious: [],
    residue:
      'front-door junction — the near closed wall + door archway are the engine masked-mirror ' +
      'family (decompiler-resistant residue), NOT OR side arches. NO void, NO spurious arches.',
  },
  // FORWARD-WALK closed-front views (2026-06-09 SPURIOUS-SIDE-ARCH pass). Walking
  // straight INTO the dungeon to the dead-end gy123 (front=3 door framed by STONE
  // corners, viewed facing 0 = the door's BACK face) and one cell back (gy122, the
  // deep corridor). REAL-MOVE engine captures (trace-maze.ts freeroam 127 12{3,2} 0;
  // settled +60 frames; framebuffers EYEBALLED — plain stone side walls, NO archway/
  // column shapes at the corners). These replace the STALE poked v6 capture, which
  // reported OR {0,83,87} (full-height side arches) the engine never draws — it draws
  // the near closed wall via the masked-mirror branch (corners 84/88, leaf 6/9). The
  // fix (generateClosedFrontNearWall = head-on-door-only) removes the spurious arches.
  {
    view: 'gx127-gy123-f0',
    party: { gx: 127, gy: 123, z: 0, facing: 0 },
    floor: 19348, // 98.15% — the forward-walk dead-end now renders as a STONE WALL.
    // NEAR-WALL FIX 2026-06-09 (masked-mirror pass): the stone-framed-doorway dead-end
    // (front=3 framed by stone) OR-emits the closed-front family {0,83,87} = the flat
    // brick face + stone frame. This reconstructs the SAME wall the engine draws via its
    // masked twins (6/9, 84/88) at 98.15% (eyeball: clean stone wall). The PRIOR pass
    // removed {0,83,87} here, leaving a BLACK VOID (6518px / 33%) — that over-correction
    // is reverted for the stone-framed dead-end (open corridors still never fire).
    allowedSpurious: [0, 83, 87],
    residue:
      'FORWARD-WALK DEAD-END (the user-reported view). OR {0,83,87} draws the flat stone ' +
      'wall (98.15%, eyeball-confirmed); the engine emits the masked twins (6/9, 84/88) ' +
      'but those do NOT reproduce through our compositor (broken corridor, 33.5%). The ' +
      'only residue is the central statue decoration (door-recess family). NO void, NO arches.',
  },
  {
    view: 'gx127-gy122-f0',
    party: { gx: 127, gy: 122, z: 0, facing: 0 },
    floor: 17785, // 90.22% — PARITY-ODD WHOLE-FRAME MASKED pass (2026-06-09). Was 10096
    // (51.22%): the side walls are now masked-mirror (generateParityOddMasked), AND the
    // near full-height OCCLUDER COLUMNS {6,9} are emitted for the stone-framed closed
    // doorway one cell ahead (generateNearOccluderColumns) — the engine frames the
    // recessed doorway with these columns (mirror twin 6↔9). +7689px. Residue = the
    // door-recess leaf detail + dither (the 99.45% ceiling).
    allowedSpurious: [1, 84, 88],
    residue:
      'DEEP CORRIDOR ending in a closed doorway. PARITY-ODD masked side walls + near ' +
      'occluder columns {6,9} (+7689px). Far-closed family {1,84,88}; the door-recess ' +
      'leaf + dither are the residue to the 99.45% ceiling. NO void, NO arches.',
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
    floor: 17585, // 89.21% (THE CEILING) — ARCHWAY-FRAME pass (2026-06-09). Was 12308
    // (62.44%): the flat-wall {0,83,87} approximation (the gate "superimposed on a wall,
    // no arch") is REPLACED by the ornate ARCHWAY FRAME OR set (generateFullCallList's
    // isHeadOnDoorArchway branch: near columns 6/9 + flank strips 16–22 + door-recess
    // arch 23–34 + perspective twins + depth-0 side walls). +5277px — reaches the
    // self-repro CEILING of this view's frame-synced capture. The residual ~11% is the
    // colourful portcullis-LEAF grid (a decoration draw path beyond the OR/masked
    // background compose — same class as the entrance's 18px deep-door residue).
    allowedSpurious: [],
    residue:
      'LOOK-BACK at the entrance gate (the user-reported "no arch" view). The ornate ' +
      'ARCHWAY FRAME (stone columns + door-recess arch) now frames the gate — reaches ' +
      'the 89.21% ceiling. Residue = the portcullis-leaf decoration grid. NO void, ' +
      'NO flat-wall superimposition.',
  },
  {
    view: 'gx127-gy122-f2',
    party: { gx: 127, gy: 122, z: 0, facing: 2 },
    floor: 13833, // 70.18% — PARITY-ODD WHOLE-FRAME MASKED pass (2026-06-09). Was 9406
    // (47.72%): the head-on door caps at depth 1 and the side walls recede to it via the
    // masked-mirror branch (generateParityOddMasked). +4427px. The far gate at the
    // corridor end is the door-recess masked family (the 97.45% ceiling residue).
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
