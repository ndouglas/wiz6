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
    floor: 16308, // 82.73% — DEEP DOOR-RECESS pass (2026-06-09): the recessed-doorway frame
    // (the 8 fixed masked pairs 36→63…57→72 + OR 101/104, byte-identical across the f0/f3
    // captures) is now emitted (generateDeepDoorRecess). +46px over the prior 16262. The
    // door-recess masked pairs were the only piece the prior pass left as residue here;
    // adding them frames the recess but the near-arch detail (5/8/21/22/25/28/31/34, the
    // PARITY-ODD masked near-arch) + the depth-3 twins + dither are the remaining gap to the
    // 93.25% ceiling. Was 9602 (48.71%) before the parity-odd masked side walls.
    allowedSpurious: [2, 85, 89],
    residue:
      'PARITY-ODD masked side walls + the DEEP DOOR-RECESS family (8 masked pairs + 101/104). ' +
      'Deep-solid far-wall {2,85,89} fills part of the centre (overlaps the recess). Remaining ' +
      'gap = the parity-odd near-arch pieces + depth-3 twins + dither.',
  },
  {
    view: 'gx124-gy121-f3',
    party: { gx: 124, gy: 121, z: 0, facing: 3 },
    floor: 14069, // 71.37% — DEEP DOOR-RECESS pass (2026-06-09): the recessed-doorway frame
    // (the SAME 8 masked pairs + 101/104 as f0, byte-identical cross-capture) now renders
    // the pink recessed door at the corridor end. +2110px over the prior 11959 (60.67%).
    // Spurious 15 = the near stone wall at the party's own cell (engine places 14 — one-slot-off,
    // the door-recess interaction shifts the near stone index); the LEFT near-stone wall is the
    // remaining residue (the black band, separate from the door-recess family). Ceiling 87.24%.
    allowedSpurious: [15],
    residue:
      'DEEP DOOR-RECESS family (8 masked pairs + 101/104) renders the recessed door (+2110px); ' +
      'remaining = the LEFT near-stone wall (15 vs engine 14, one-slot-off) + dither.',
  },
  {
    view: 'gx126-gy121-f3',
    party: { gx: 126, gy: 121, z: 0, facing: 3 },
    floor: 19683, // 99.85% (the 99.95% ceiling) — NEAR-STONE-JOG pass (2026-06-09). Was
    // 16595 (84.19%): the LEFT stone-from-d0 jog (2-2-2-0) now draws the d0 near stone
    // wall (15) + the receding stones (16) + the jog's far flank tip (18) + banked corner
    // (85) and SUPPRESSES the d3-open side surface (occluded by the near wall) + the
    // spurious deep-solid far-wall ({3,86,90}, which lands behind the jog). +3088px. The
    // residual 29px to the 99.95% ceiling is the single-capture deep special 108 (a
    // per-view decoration draw-path edge detail) + dither — documented residue.
    allowedSpurious: [],
    residue:
      'NEAR-STONE-JOG LEFT wall (15/16 + flank tip 18 + corner 85), d3 opening occluded, ' +
      'deep-solid far-wall suppressed. Residual = the single-capture deep special 108 + dither.',
  },
  {
    view: 'gx127-gy121-f1',
    party: { gx: 127, gy: 121, z: 0, facing: 1 },
    floor: 19546, // 99.16% (THE CEILING) — NEAR-STONE-FLANK pass (2026-06-09). Was 16618
    // (84.30%): the RIGHT continuous near-stone wall (3-2-3-2, a door/stone-alternating
    // wall) now draws the full near-flank stack {20,21,22} + corner 87 (generateNearStoneFlank)
    // + the door-interleaved outer-edge vertical 118 (OR) — exactly the engine's masked set.
    // +2928px reaches the self-repro ceiling. No spurious, no missing.
    allowedSpurious: [],
    residue:
      'NEAR-STONE-FLANK RIGHT wall {20,21,22} + corner 87 + edge 118 (door-interleaved) ' +
      '= the engine masked set byte-for-byte. AT CEILING. Residual = dither only.',
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
    floor: 19603, // 99.45% (THE CEILING) — LEAF-OR pass (2026-06-09). Was 17785 (90.22%):
    // the centered far-closed LEAF (placement 1, the img0 flat doorway face) is now drawn
    // OR-DIRECT in the parity-ODD branch (LEAF_OR_SET) instead of as a masked self-mirror
    // (which landed the wrong half). +1818px reaches the self-repro ceiling. The flanking
    // corners 84/88 still mirror; near occluder columns {6,9} frame the recessed doorway.
    allowedSpurious: [],
    residue:
      'DEEP CORRIDOR ending in a closed doorway. PARITY-ODD masked side walls + near ' +
      'occluder columns {6,9} + the OR-direct far-closed LEAF 1. AT CEILING. Residual = dither.',
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
    floor: 19374, // 98.29% (exceeds the prior 97.45% ceiling estimate) — HEAD-ON-DOOR-AHEAD
    // ARCHWAY pass (2026-06-09). Was 13833 (70.18%): the look-back with the gate ONE CELL
    // AHEAD now draws the open-passage NEAR FLANKS (count-pairs 4/7/10/13 OR + panels
    // 17/18/21/22 masked) framing the corridor + the DOOR-RECESS ARCH banked to the stop
    // ({23,26,29,32}+1 = {24,27,30,33} OR) recessing the gate, in place of the spurious
    // flat far-closed gate ({1,84,88}). +5541px. Residual = the portcullis-leaf decoration.
    allowedSpurious: [],
    residue:
      'LOOK-BACK with the gate one cell ahead. HEAD-ON-DOOR-AHEAD archway: near flanks ' +
      '(4/7/10/13 + 17/18/21/22) + door-recess arch ({24,27,30,33}) + masked side walls. ' +
      'Residual = the portcullis-leaf decoration grid. NO void, NO flat-wall gate.',
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

  // CALL-LIST-SET assertions (family-completion pass 2026-06-09): lock the derived
  // family pieces so a regression in the family law (not just the pixel floor) is caught.
  // Each entry asserts the GENERATED placement set CONTAINS the family's signature
  // indices for that view (the on-screen geometry index = OR src / masked dst).
  const FAMILY_SIGNATURES: Array<{ view: string; party: MazeParty; contains: number[]; why: string }> = [
    {
      view: 'gx127-gy121-f1', party: { gx: 127, gy: 121, z: 0, facing: 1 },
      contains: [20, 21, 22, 87, 118],
      why: 'asymmetric near-stone FLANK: the RIGHT continuous near-stone wall (3-2-3-2) draws the full flank stack {20,21,22} + corner 87 + the door-interleaved edge vertical 118.',
    },
    {
      view: 'gx127-gy122-f0', party: { gx: 127, gy: 122, z: 0, facing: 0 },
      contains: [1, 6, 9, 84, 88],
      why: 'centered far-closed LEAF (1, OR-direct in parity-odd) + near occluder columns {6,9} + the mirrored corners 84/88.',
    },
    {
      view: 'gx126-gy121-f3', party: { gx: 126, gy: 121, z: 0, facing: 3 },
      contains: [15, 16, 18, 85],
      why: 'near-stone JOG: the LEFT stone-from-d0 wall {15,16} + the receding far flank tip 18 + banked corner 85.',
    },
    {
      view: 'gx127-gy122-f2', party: { gx: 127, gy: 122, z: 0, facing: 2 },
      contains: [4, 7, 10, 13, 17, 18, 21, 22, 24, 27, 30, 33],
      why: 'head-on-door-AHEAD archway: the open-passage near flanks {4,7,10,13}+{17,18,21,22} framing the corridor + the door-recess arch {24,27,30,33} recessing the gate one cell ahead.',
    },
    {
      view: 'gx124-gy121-f0', party: { gx: 124, gy: 121, z: 0, facing: 0 },
      contains: [60, 63, 66, 69, 72, 75, 78, 81, 101, 104],
      why: 'DEEP DOOR-RECESS family (parity-ODD): the recessed-doorway frame at the recess cell (orient2=2) — the 8 fixed masked dsts {60,63,66,69,72,75,78,81} + OR {101,104}. Byte-identical to the f3 capture (parity-EVEN), so the family is parity-independent.',
    },
    {
      view: 'gx124-gy121-f3', party: { gx: 124, gy: 121, z: 0, facing: 3 },
      contains: [60, 63, 66, 69, 72, 75, 78, 81, 101, 104],
      why: 'DEEP DOOR-RECESS family (parity-EVEN): the SAME recessed-doorway frame as f0 (cross-capture byte-identical), confirming the family fires identically at this orient2=2 cell for both facing 0 and facing 3.',
    },
  ];
  it.each(FAMILY_SIGNATURES)(
    'generates the derived family signature placements ($view)',
    ({ party, contains, why }) => {
      const placed = new Set<number>();
      for (const c of generateFullCallList(BLOCK, party)) placed.add(c.kind === 'OR' ? c.src : c.dst);
      const missing = contains.filter((i) => !placed.has(i));
      expect(missing, why).toEqual([]);
    },
  );

  // DEEP DOOR-RECESS FIRING GATE — lock the firing predicate against the negative
  // controls captured at the SAME recess cell (gx124 gy121, orient2=2). The family
  // fires at facing 0/3 (above) but NOT facing 1/2 (a recess seen behind / to the wrong
  // side), and never at a plain orient2=0 cell. The 8 door-recess masked dsts (60…81)
  // must be ABSENT from those views — otherwise the family is over-firing (spurious
  // recess at a non-recess view). This is the anti-overfit guard for the firing law.
  const DOOR_RECESS_DST = [60, 63, 66, 69, 72, 75, 78, 81];
  const NEGATIVE_CONTROLS: Array<{ party: MazeParty; why: string }> = [
    { party: { gx: 124, gy: 121, z: 0, facing: 1 }, why: 'recess cell facing 1 — recess to the wrong side, no fire (captured negative control)' },
    { party: { gx: 124, gy: 121, z: 0, facing: 2 }, why: 'recess cell facing 2 — recess face is the FRONT/own face, no fire (captured negative control)' },
    { party: { gx: 127, gy: 121, z: 0, facing: 0 }, why: 'entrance corridor (orient2=0) — never a door-recess view' },
    { party: { gx: 127, gy: 121, z: 0, facing: 1 }, why: 'orient2=0 corridor — never fires' },
    { party: { gx: 127, gy: 123, z: 0, facing: 1 }, why: 'front-door junction (orient2=0) — the open-archway family, not the deep door-recess' },
  ];
  it.each(NEGATIVE_CONTROLS)(
    'does NOT emit the deep door-recess family on a non-recess view (gx$party.gx-gy$party.gy-f$party.facing)',
    ({ party, why }) => {
      const placed = new Set<number>();
      for (const c of generateFullCallList(BLOCK, party)) placed.add(c.kind === 'OR' ? c.src : c.dst);
      const leaked = DOOR_RECESS_DST.filter((i) => placed.has(i));
      expect(leaked, why).toEqual([]);
    },
  );
});
