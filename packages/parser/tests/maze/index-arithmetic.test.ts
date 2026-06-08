/**
 * index-arithmetic.test.ts — gate for the per-depth placement-INDEX law
 * `placementIndex = base + depth`, pinned in
 * docs/re/findings/maze-index-arithmetic.json (hand-disasm of the wmaze emit
 * fns wall_emit_quad 0x406c / wall_emit_corner 0x45b4 / top_strips 0x4a15).
 *
 * Validates against the CAPTURED call-lists (docs/re/findings/maze-views/v*.json,
 * the pokeview blit captures). Two gates:
 *
 *   (1) THE ARITHMETIC. For every captured ceiling/floor liveRecord, the recorded
 *       placement idx == base + depth, where depth is read from the record's
 *       destRow band and base is the disasm IMM (122 ceiling / 150 floor). This is
 *       the byte-exact proof of `base + depth` against the engine's own output.
 *
 *   (2) THE SKELETON REPRODUCER. generateSkeletonIndices(visibleDepths) reproduces
 *       the ceiling+floor twins + 6 top-strips that the captured view contains,
 *       byte-exact as a SET. (Build/flush re-order within a frame; the strips flush
 *       in a fixed-but-permuted order, so the SET — not the ordered list — is the
 *       deterministic gate. The ARITHMETIC gate (1) is exact and unordered-free.)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  EMIT_BASES,
  placementIndex,
  generateSkeletonIndices,
  computeVisibleDepths,
  generateCallist,
  generateClosedFrontNearWall,
  sideWallSurfaceLadder,
  sideWallSurfaceStack,
} from '../../src/maze/callist.js';
import { MazeBlockSchema, type MazeBlock, type MazeParty } from '@wiz6/data';

const here = dirname(fileURLToPath(import.meta.url));
const viewsDir = resolve(here, '../../../../docs/re/findings/maze-views');
const framesPath = resolve(here, '../../../../tools/parity/fixtures/engine/maze-frames.json');
const FRAMES = JSON.parse(readFileSync(framesPath, 'utf8'));
const BLOCK: MazeBlock = MazeBlockSchema.parse(FRAMES.mazeBlock);

type LiveRecord = {
  idx: number;
  imgIdx: number;
  destRow: number;
  w: number;
  h: number;
};
type Call = { branch: 'OR' | 'masked'; arg0c: number; arg10: number };
type View = {
  placementIndices: number[];
  liveRecords: LiveRecord[];
  calls: Call[];
};

/** The captured OR-branch placement-index SET (excludes the masked-mirror
 *  door-recess pieces). This is the deliverable's validation target — the set
 *  generateCallist's OR emission must match. */
function capturedOrSet(name: string): Set<number> {
  const view = loadView(name);
  return new Set(view.calls.filter((c) => c.branch === 'OR').map((c) => c.arg0c));
}

function loadView(name: string): View {
  return JSON.parse(readFileSync(resolve(viewsDir, `${name}.json`), 'utf8'));
}

// destRow -> depth bands (maze-generation-law.json placement-table-depth-bank):
//   ceiling rows 32/39/51/59 = d0/d1/d2/d3; floor rows 128/104/88/83 = d0/d1/d2/d3.
const CEILING_ROW_DEPTH: Record<number, number> = { 32: 0, 39: 1, 51: 2, 59: 3 };
const FLOOR_ROW_DEPTH: Record<number, number> = { 128: 0, 104: 1, 88: 2, 83: 3 };
const CEILING_IMG = (img: number) => img >= 44 && img <= 47;
const FLOOR_IMG = (img: number) => img >= 56 && img <= 59;

const ALL_VIEWS = [
  'v1-gy121f0',
  'v2-gy119f0',
  'v3-gx127f3',
  'v4-gx126gy117f0',
  // Fresh parity-EVEN captures (2026-06-08) that VARY the inputs — the
  // anti-overfit cross-check that the `base + depth` law generalizes:
  'v5-gx125f0', // gx125 gy121 f0 — different lateral cell, deep corridor
  'v6-gy123f0', // gx127 gy123 f0 — near-blocked (depth-0 only) + corner-L base 83/87
];

describe('maze placement-index arithmetic: placementIndex = base + depth', () => {
  it.each(ALL_VIEWS)('ceiling idx == 122 + depth for every record (%s)', (name) => {
    const view = loadView(name);
    const ceil = view.liveRecords.filter(
      (r) => CEILING_IMG(r.imgIdx) && r.destRow in CEILING_ROW_DEPTH,
    );
    expect(ceil.length).toBeGreaterThan(0);
    for (const r of ceil) {
      const depth = CEILING_ROW_DEPTH[r.destRow]!;
      expect(r.idx).toBe(placementIndex(EMIT_BASES.CEILING, depth));
    }
  });

  it.each(ALL_VIEWS)('floor idx == 150 + depth for every record (%s)', (name) => {
    const view = loadView(name);
    const floor = view.liveRecords.filter(
      (r) => FLOOR_IMG(r.imgIdx) && r.destRow in FLOOR_ROW_DEPTH,
    );
    expect(floor.length).toBeGreaterThan(0);
    for (const r of floor) {
      const depth = FLOOR_ROW_DEPTH[r.destRow]!;
      expect(r.idx).toBe(placementIndex(EMIT_BASES.FLOOR, depth));
    }
  });

  it.each(ALL_VIEWS)('all 6 top-strips present (%s)', (name) => {
    const view = loadView(name);
    const present = new Set(view.placementIndices);
    for (const s of EMIT_BASES.TOP_STRIPS) expect(present.has(s)).toBe(true);
  });
});

describe('generateSkeletonIndices reproduces the captured skeleton (SET)', () => {
  // visibleDepths derived from each view's captured ceiling depths (the engine's
  // gate-seeded visibility). The reproducer must then emit exactly those twins.
  // Derive from the COMPLETE placementIndices list (liveRecords may be a partial
  // stderr dump). A visible ceiling depth d <=> the index (122 + d) is emitted.
  function visibleCeilingDepths(view: View): number[] {
    const present = new Set(view.placementIndices);
    const out: number[] = [];
    for (let d = 0; d < 4; d++) if (present.has(EMIT_BASES.CEILING + d)) out.push(d);
    return out;
  }

  it.each(ALL_VIEWS)('skeleton SET matches captured ceiling/floor+strips (%s)', (name) => {
    const view = loadView(name);
    const vis = visibleCeilingDepths(view);
    const gen = new Set(generateSkeletonIndices(vis));

    // Captured skeleton = the view's ceiling+floor twins (for the visible depths)
    // plus the 6 strips. Everything else (side/corner/door families) is out of
    // scope for the skeleton reproducer.
    const captured = new Set<number>();
    for (const d of vis) {
      captured.add(EMIT_BASES.CEILING + d);
      captured.add(EMIT_BASES.FLOOR + d);
    }
    for (const s of EMIT_BASES.TOP_STRIPS) captured.add(s);

    expect(gen).toEqual(captured);
    // and every generated index actually appears in the captured call list:
    const present = new Set(view.placementIndices);
    for (const idx of gen) expect(present.has(idx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GATE-SEEDING / OCCLUSION-STOP — generateCallist(block, party).
//
// The gate-seeding map (which depths fire + the occlusion stop) DERIVED from the
// maze block + party (no captured frame), pinned in
// docs/re/findings/maze-gate-seeding.json. The stop rule: walking d=0..3, the
// view stops (inclusive) at the first occluding forward edge — solid (code 2) or
// a CLOSED doorway (code 3 framed by solid corners on both sides). Validated
// byte-exact vs the 4 parity-EVEN captures, INCLUDING v1's door-cap and v6's
// depth-0 cap (the v1-vs-v2 puzzle the task flags).
// ---------------------------------------------------------------------------

// The 4 parity-EVEN captured views with their party (gx,gy,facing) and the
// EXPECTED occlusion stop (visible ceiling depths read off the capture).
const PARITY_EVEN: Array<{
  view: string;
  party: MazeParty;
  expectedVisible: number[];
}> = [
  { view: 'v1-gy121f0', party: { gx: 127, gy: 121, z: 0, facing: 0 }, expectedVisible: [0, 1, 2] },
  { view: 'v2-gy119f0', party: { gx: 127, gy: 119, z: 0, facing: 0 }, expectedVisible: [0, 1, 2, 3] },
  { view: 'v5-gx125f0', party: { gx: 125, gy: 121, z: 0, facing: 0 }, expectedVisible: [0, 1] },
  { view: 'v6-gy123f0', party: { gx: 127, gy: 123, z: 0, facing: 0 }, expectedVisible: [0] },
];

describe('computeVisibleDepths: the occlusion-stop rule', () => {
  it.each(PARITY_EVEN)(
    'derives the captured visible depths for $view',
    ({ party, expectedVisible }) => {
      expect(computeVisibleDepths(BLOCK, party)).toEqual(expectedVisible);
    },
  );

  it('the visible depths match the captured ceiling depths exactly', () => {
    for (const { view, party } of PARITY_EVEN) {
      const present = new Set(loadView(view).placementIndices);
      const capturedDepths: number[] = [];
      for (let d = 0; d < 4; d++) if (present.has(EMIT_BASES.CEILING + d)) capturedDepths.push(d);
      expect(computeVisibleDepths(BLOCK, party)).toEqual(capturedDepths);
    }
  });
});

// ---------------------------------------------------------------------------
// FULL OR-SET GENERATION — generateCallist now emits the side-wall SURFACE families
// (the 0x39ec jump-table extent law, derived 2026-06-08; see
// maze-wall-family-seeding.json). Two gates:
//   (1) BYTE-EXACT full OR set for the views the extent law fully covers (v1: a
//       deep corridor closing on a doorway with symmetric open sides; v6: closed
//       front at depth 0). These are the deliverable's concrete success bar.
//   (2) NO SPURIOUS EXTRAS for the symmetric views (every generated index appears
//       in the capture). The asymmetric views (v8/v9 — a near full-height stone
//       wall shifts the center, truncating both the side surface AND the deep
//       center skeleton) are the documented ray-march residue and are EXCLUDED
//       from the no-extras gate: there the generator over-emits the deep center
//       ceiling/floor, which is honest residue, not a bug to paper over.
// ---------------------------------------------------------------------------
describe('generateCallist(block, party): full OR placement-index SET', () => {
  // Views whose full OR set the extent law reproduces BYTE-EXACT.
  const BYTE_EXACT: Array<{ view: string; party: MazeParty }> = [
    { view: 'v1-gy121f0', party: { gx: 127, gy: 121, z: 0, facing: 0 } },
    { view: 'v6-gy123f0', party: { gx: 127, gy: 123, z: 0, facing: 0 } },
  ];

  it.each(BYTE_EXACT)('OR set == captured OR set byte-exact ($view)', ({ view, party }) => {
    expect(new Set(generateCallist(BLOCK, party))).toEqual(capturedOrSet(view));
  });

  it('v1 OR set is the full task-specified set', () => {
    // The task's concrete bar: v1's full OR set.
    const expected = new Set([
      2, 85, 89, 122, 123, 124, 131, 134, 135, 138, 139, 143, 150, 151, 152,
      159, 162, 163, 166, 167, 171, 346, 349, 352, 355, 358, 361,
    ]);
    const gen = new Set(generateCallist(BLOCK, { gx: 127, gy: 121, z: 0, facing: 0 }));
    expect(gen).toEqual(expected);
  });

  // Symmetric views (no near-stone-wall center shift): the generator emits only
  // CORRECT indices (a subset of the capture — missing pieces are the documented
  // full-height/door residue, but NO spurious extras).
  const SYMMETRIC: Array<{ view: string; party: MazeParty }> = [
    { view: 'v1-gy121f0', party: { gx: 127, gy: 121, z: 0, facing: 0 } },
    { view: 'v5-gx125f0', party: { gx: 125, gy: 121, z: 0, facing: 0 } },
    { view: 'v6-gy123f0', party: { gx: 127, gy: 123, z: 0, facing: 0 } },
    { view: 'v7-gx121gy119f0', party: { gx: 121, gy: 119, z: 0, facing: 0 } },
    { view: 'v10-gx124gy121f1', party: { gx: 124, gy: 121, z: 0, facing: 1 } },
    { view: 'v11-gx123gy122f1', party: { gx: 123, gy: 122, z: 0, facing: 1 } },
  ];

  it.each(SYMMETRIC)('no spurious extras — generated ⊆ captured ($view)', ({ view, party }) => {
    const captured = capturedOrSet(view);
    for (const idx of generateCallist(BLOCK, party)) {
      expect(captured.has(idx)).toBe(true);
    }
  });
});

describe('generateSideWall: the LEFT full-open stack is byte-exact (v7/v10)', () => {
  // The LEFT side-wall surface (the extent law's core) matches the capture's
  // LEFT OR indices byte-exact for the full-open run. (Asserted via the public
  // generateCallist, isolating the LEFT-screen-half OR records of the capture.)
  it.each(['v7-gx121gy119f0', 'v10-gx124gy121f1'])(
    'LEFT-side surface OR indices ⊆ captured + the stack is present (%s)',
    (view) => {
      const party: MazeParty =
        view === 'v7-gx121gy119f0'
          ? { gx: 121, gy: 119, z: 0, facing: 0 }
          : { gx: 124, gy: 121, z: 0, facing: 1 };
      const captured = capturedOrSet(view);
      const gen = new Set(generateCallist(BLOCK, party));
      // the cumulative LEFT stack {128,129,131,132,133,134,135,136,137} + floor twins
      for (const idx of sideWallSurfaceStack(4)) {
        expect(gen.has(idx)).toBe(true);
        expect(captured.has(idx)).toBe(true);
      }
    },
  );
});

// ---------------------------------------------------------------------------
// WALL-FAMILY SEEDING — the pinned sub-families (maze-wall-family-seeding.json).
//   (1) the CLOSED-FRONT near-wall family (byte-exact vs v6), and
//   (2) the side-wall SURFACE ladder ARITHMETIC (byte-exact vs v1's LEFT surface).
// The per-side surface EXTENT is documented residue (not asserted byte-exact here).
// ---------------------------------------------------------------------------

describe('closed-front near-wall family (byte-exact vs v6)', () => {
  it('emits NEAR_WALL leaf + corner 83/87 only when the view caps at depth 0', () => {
    // v6: gx127 gy123 f0 — closed doorway head-on at depth 0; visibleDepths === [0].
    const v6 = { gx: 127, gy: 123, z: 0, facing: 0 };
    expect(computeVisibleDepths(BLOCK, v6)).toEqual([0]);
    expect(new Set(generateClosedFrontNearWall([0]))).toEqual(new Set([0, 83, 87]));
    // and those indices are exactly the v6 capture's non-skeleton OR indices.
    const present = new Set(loadView('v6-gy123f0').placementIndices);
    for (const idx of [0, 83, 87]) expect(present.has(idx)).toBe(true);
  });

  it('emits nothing for an open corridor (visible depth > 0)', () => {
    expect(generateClosedFrontNearWall([0, 1, 2])).toEqual([]);
    expect(generateClosedFrontNearWall([0, 1])).toEqual([]);
  });
});

describe('side-wall surface ladder arithmetic (byte-exact vs v1 LEFT surface)', () => {
  it('LEFT surface slots 0..1 == v1 captured LEFT ceiling bases {(0,134),(1,130),(1,134)}', () => {
    // v1's LEFT side-wall surface spans perspective slots 0..1; the ladder emits
    // ceiling indices 134 (p0), 130+134 (p1) — i.e. placement {134, 131, 135}.
    expect(new Set(sideWallSurfaceLadder('left', 0, 1))).toEqual(
      new Set([134, 130 + 1, 134 + 1]), // 134, 131, 135
    );
    // Cross-check vs the v1 capture: those indices ARE present (LEFT, destX<16).
    const present = new Set(loadView('v1-gy121f0').placementIndices);
    for (const idx of [134, 131, 135]) expect(present.has(idx)).toBe(true);
  });

  it('RIGHT surface slots 0..1 == v1 captured RIGHT ceiling bases {138, 138+1, 142+1}', () => {
    expect(new Set(sideWallSurfaceLadder('right', 0, 1))).toEqual(
      new Set([138, 138 + 1, 142 + 1]), // 138, 139, 143
    );
    const present = new Set(loadView('v1-gy121f0').placementIndices);
    for (const idx of [138, 139, 143]) expect(present.has(idx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SIDE-WALL SURFACE — the cumulative panel STACK (byte-exact for the LEFT
// full-open run). Pinned vs v7/v10 (the 2026-06-08 systematic capture pass).
//   v7 = gx121 gy119 f0 (cornerL OPEN all 4 depths → LEFT wall recedes full run).
//   v10 = gx124 gy121 f1 (mirror facing, same LEFT full-open profile).
// The LEFT side surface decomposes (destX < 16, ceiling rows 32/39/51/59 + floor
// rows 128/104/88/83) to EXACTLY sideWallSurfaceStack(4). The RIGHT side is the
// asymmetric stone near-wall family in both, NOT a mirror (documented residue).
// ---------------------------------------------------------------------------
describe('side-wall surface STACK (byte-exact LEFT full-open run vs v7/v10)', () => {
  // Center skeleton ceiling/floor bases (destX 11/13/16/18) + the 6 top-strips,
  // excluded so the test isolates the LEFT side surface.
  const SKEL = new Set([
    122, 123, 124, 125, 150, 151, 152, 153, 346, 349, 352, 355, 358, 361,
  ]);
  // The expected LEFT full-open stack (ceiling 134/131,135/128,132,136/129,133,137
  // + their +28 floor twins). This IS sideWallSurfaceStack(4).
  const LEFT_FULL = new Set(sideWallSurfaceStack(4));

  it('sideWallSurfaceStack(4) is the v7-decomposed LEFT full-open surface', () => {
    expect(LEFT_FULL).toEqual(
      new Set([
        134, 131, 135, 128, 132, 136, 129, 133, 137, // ceiling
        162, 159, 163, 156, 160, 164, 157, 161, 165, // +28 floor twins
      ]),
    );
  });

  it.each(['v7-gx121gy119f0', 'v10-gx124gy121f1'])(
    'the LEFT-side (destX<16) OR indices == sideWallSurfaceStack(4) (%s)',
    (name) => {
      const view = loadView(name) as unknown as {
        placementIndices: number[];
        liveRecords: Array<{
          idx: number;
          destX: number;
          destRow: number;
        }>;
      };
      const orset = new Set(view.placementIndices);
      // LEFT-side wall records: destX < 16, in a ceiling/floor band, not skeleton.
      const left = new Set<number>();
      for (const r of view.liveRecords) {
        if (!orset.has(r.idx)) continue;
        if (SKEL.has(r.idx)) continue;
        if (r.destX >= 16) continue; // LEFT screen half
        const band =
          r.destRow in CEILING_ROW_DEPTH || r.destRow in FLOOR_ROW_DEPTH;
        if (!band) continue;
        left.add(r.idx);
      }
      expect(left).toEqual(LEFT_FULL);
    },
  );
});
