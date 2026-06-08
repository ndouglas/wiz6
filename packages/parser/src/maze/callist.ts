/**
 * callist.ts — maze BACKGROUND blit call list + the from-asset compose.
 *
 * The maze background page is composited by ega.drv FUN_0a93 (the OR-blit /
 * masked-mirror compositor) from an ordered list of CALLS, each placing one
 * sub-image of `mazedata.ega` into the off-screen page. Each call is either:
 *   - `OR`     — a forward OR-blit of placement `src`'s own image (FUN_0a93 0xaa9)
 *   - `masked` — a horizontal-mirror blit of placement `src`'s image into
 *                placement `dst`'s geometry, OR-merged or REPLACE-carved per
 *                `mode` (FUN_0a93 0xbc6). See background.ts / maze-data.ts.
 *
 * The per-view SELECTION of which calls to emit is produced by the wmaze view
 * loop (view_render_corridor_frame 0x4ad7 + depth loop 0x4c60), interleaved with
 * the wall-span emit. RE status: the call list is currently CAPTURED per frame
 * (live, at ega.drv FUN_0a93, reproducible byte-identical) rather than GENERATED
 * from (zone,facing,geometry). The generation law (the depth→placement-bank
 * arithmetic over the 366 static placement records) is partially reversed but not
 * yet byte-exact — the slot helpers (0x3828/0x3c11/0x3dce/0x4892) defeat the
 * decompiler. See docs/re/findings/maze-callist-generation.json.
 *
 * The committed gy=121 list (maze-corridor.idx.gz oracle frame) composes to
 * 99.909% of the oracle viewport (19694/19712); the 18px residual is the
 * deep-door-center detail, which is NOT representable by adding any static
 * mazedata.ega placement (exhaustively verified) — it comes from a draw path
 * beyond the OR/masked background blit. Tracked in TODO.
 */

import { PLANE_STRIDE } from '@wiz6/data';
import type { MazeBlock, MazeParty } from '@wiz6/data';
import {
  composeBackground,
  applyMaskedMirror,
} from './background.js';
import {
  expandMazeData,
  orPlacementFor,
  maskedMirrorFor,
  type MazeWorkBuffer,
} from './maze-data.js';
import { isSolid, step, forwardEdge, cornerL, cornerR } from './maze-geometry.js';

// ---------------------------------------------------------------------------
// PLACEMENT-INDEX ARITHMETIC (the per-depth `base + depth` law)
//
// RE pinned in docs/re/findings/maze-index-arithmetic.json (hand-disasm of the
// wmaze emit fns wall_emit_quad 0x406c / wall_emit_corner 0x45b4 / top_strips
// 0x4a15, validated byte-exact vs the captured liveRecords). The law:
//
//   placementIndex = base + depth
//
// where `base` is a COMPILE-TIME IMMEDIATE pushed at the emit call site (NOT
// computed from geometry — it's the static placement-table slot ID for a given
// piece-family + screen-side) and `depth` is the build depth counter (0..3).
// Frame parity [0x521a]=(gx+gy+facing)%2 picks which of a left/right base pair
// becomes the forward-OR arg0c vs the masked-mirror dst — see the findings.
//
// The depth-banked twins fall straight out of this: ceiling base 122, floor
// base 150 (=122+28), both `+ depth`. The 6 top-strips (346/349/352/355/358/361)
// are emitted in EVERY frame with no depth dependence.
//
// This module reproduces the DETERMINISTIC SKELETON (ceiling/floor twins for the
// visible depths + the 6 strips) byte-exact. The side/corner/door family bases
// are exported (EMIT_BASES) and documented in the findings; emitting them needs
// the per-depth gate-seeding map (medium confidence), tracked as remaining work.
// ---------------------------------------------------------------------------

/** Per-family placement-table BASE indices (the `base` in `base + depth`).
 *  Read from the emit call-site argument blocks (maze-index-arithmetic.json
 *  call_sites); each is a compile-time IMM the engine adds `depth` to. */
export const EMIT_BASES = {
  /** wall_emit_quad front [bp+0xe]/[bp+0x10] (0x4d90) — top ceiling twin. */
  CEILING: 122,
  /** wall_emit_quad front [bp+0x42]/[bp+0x44] (0x44ff floor emit) — bottom twin. */
  FLOOR: 150,
  /** wall_emit_quad front [bp+0x12] (0x40be) — the close occluding wall (img0). */
  NEAR_WALL: 0,
  /** wall_emit_quad front [bp+0x16] (0x4101 door/recess) — far-door base. */
  FAR_DOOR: 91,
  /** wall_emit_corner corner-L near full-height wall pair (0x4e24 [bp+0xc]/[bp+0xe]). */
  CORNER_L_NEAR: [15, 19] as const,
  /** wall_emit_corner corner-R near full-height wall pair (0x4e80, mirror-swapped). */
  CORNER_R_NEAR: [19, 15] as const,
  /** top_strip_emit (0x4a15) — 6 chrome strips, stride 3, no depth dependence. */
  TOP_STRIPS: [346, 349, 352, 355, 358, 361] as const,
  /** The CLOSED-FRONT near full-height wall family (a solid stone / closed-doorway
   *  wall met at the party's OWN cell, perspective depth 0). The flat face is the
   *  NEAR_WALL leaf (base 0, the img0 full-height piece); the two flanking
   *  full-height corner walls are corner-L base 83 / corner-R base 87 (the
   *  wall_emit_corner near-wall pair [bp+0x10]/[bp+0x12], confirmed byte-exact vs
   *  v6 in maze-index-arithmetic.json). These render at p0 only (a wall at the
   *  party's forward edge fills the whole viewport center). */
  CLOSED_FRONT_NEAR: { leaf: 0, cornerL: 83, cornerR: 87 } as const,
} as const;

/**
 * The placement INDEX for a depth-banked family piece at a given build depth.
 * This IS the engine's arithmetic (wmaze emit fns): `base + depth`.
 */
export function placementIndex(base: number, depth: number): number {
  return base + depth;
}

/**
 * Generate the deterministic SKELETON placement-index SET for the visible
 * depths of a parity-EVEN open-front corridor view: the ceiling twin (122+d)
 * and floor twin (150+d) for each visible depth, plus the 6 constant top-strips.
 *
 * `visibleDepths` is the set of depths (0..3) whose ceiling/floor the engine
 * emits — determined by the per-depth visibility/occlusion gate ([0x5042], wmaze
 * 0x407d), which the classifier seeds. For a fully-open corridor that's [0,1,2,3];
 * a solid front at depth d caps it to [0..d] (e.g. v4 = [0]).
 *
 * Returns the indices in build order: ceiling-then-floor per depth (back-to-front
 * matches the engine's per-depth emit), then the 6 strips. NOTE: the engine's
 * flush re-orders within the frame; callers comparing to a captured ORDERED list
 * should compare SETS for the strips (which flush in a fixed-but-different order).
 */
export function generateSkeletonIndices(visibleDepths: number[]): number[] {
  const out: number[] = [];
  for (const d of visibleDepths) {
    out.push(placementIndex(EMIT_BASES.CEILING, d));
    out.push(placementIndex(EMIT_BASES.FLOOR, d));
  }
  out.push(...EMIT_BASES.TOP_STRIPS);
  return out;
}

// ---------------------------------------------------------------------------
// GATE-SEEDING / OCCLUSION-STOP (the per-depth visibility law).
//
// RE pinned in docs/re/findings/maze-gate-seeding.json. The BUILD depth loop
// (wmaze 0x4c60) walks d = 0..3 front-to-back. The per-depth VISIBILITY gate
// [0x5042] (wmaze 0x407d gates the ceiling/floor emit) is cleared (visible)
// only up to — and INCLUDING — the first depth whose forward edge OCCLUDES the
// view. The occlusion seeder (wmaze 0x4892, occ_seed_front) fires when the
// front edge is solid (code 2) or a doorway FRAMED by solid corners on both
// sides (a closed doorway, code 3 with cornerL & cornerR solid); from that
// depth on the deeper front/corner gates are cleared and the depth bound
// [0x521e] is pulled in.
//
// OCCLUSION-STOP RULE (validated byte-exact vs the 4 parity-EVEN captures
// v1/v2/v5/v6 — see maze-gate-seeding.json): walking d = 0..3, the view stops
// (inclusive) at the first depth `d` where
//
//     front == 2                              (a solid wall ends the corridor)
//   OR (front == 3 && cornerL solid && cornerR solid)
//                                             (a closed doorway — door framed by
//                                              solid walls on BOTH sides)
//
// `visibleDepths = [0 .. stop]`. If no depth occludes, all four are visible.
//
// This pins the v1-vs-v2 puzzle exactly: v1's door at depth 2 has BOTH corners
// solid (a closed doorway → occludes; visible = [0,1,2]); v2's door at depth 1
// has cornerR OPEN (a side passage, not a wall → does NOT occlude; visible =
// [0,1,2,3]). v5 stops at the solid wall (depth 1); v6 stops at the closed
// doorway at depth 0. A plain door with at least one open corner reads as a
// see-through opening and the walk continues past it.
//
// CONFIDENCE: high for the ceiling/floor twins + this stop rule (byte-exact on
// all 4 parity-EVEN captures, and consistent with the occ_seed_front asm at
// 0x4892: front==2 || the door-frame gate [0x5067]). The per-depth SIDE / CORNER
// / DOOR-RECESS family emission (bases 130/134/138/142 + twins, the near-wall
// img0/img3 family, the far-door 85/89) is NOT generated here — it needs the
// medium-confidence per-slot gate-seeding post-pass (wmaze 0x3931/0x3946/0x3951)
// that the decompiler resists. Documented as the remaining residue.
// ---------------------------------------------------------------------------

/** Max depths the BUILD loop walks (wmaze DGROUP 0x521e = 4). */
const DEPTH_BOUND = 4;

/**
 * Whether the forward edge at a build depth OCCLUDES the view (caps the walk).
 * A solid wall (code 2) always occludes; a door (code 3) occludes only when it
 * is a CLOSED doorway — framed by solid walls on both the left and right corner
 * edges. A door with an open corner is a see-through side opening. (wmaze
 * occ_seed_front 0x4892: front==2 || the door-frame corner gate [0x5067].)
 */
function frontOccludes(front: number, cL: number, cR: number): boolean {
  if (front === 2) return true;
  if (front === 3 && isSolid(cL) && isSolid(cR)) return true;
  return false;
}

/**
 * The per-depth VISIBILITY set (the gate-seeding occlusion stop). Walks the
 * BUILD depth loop d = 0..3 from the party cell forward (with the one-cell
 * entry pull-back that establishes the d=0 origin) and returns the depths whose
 * ceiling/floor the engine emits — `[0 .. stop]`, where `stop` is the first
 * occluding forward edge (inclusive), or all four if the corridor never closes.
 *
 * This IS the input `visibleDepths` to generateSkeletonIndices / generateCallist
 * derived from the maze block + party rather than read off a captured frame.
 */
export function computeVisibleDepths(block: MazeBlock, party: MazeParty): number[] {
  const { gx, gy, facing } = party;
  if (facing < 0 || facing > 3) throw new Error(`invalid facing ${facing}`);
  let [cgx, cgy] = step(gx, gy, facing, 0, -1); // entry pull-back (forward=-1)
  const visible: number[] = [];
  for (let d = 0; d < DEPTH_BOUND; d++) {
    [cgx, cgy] = step(cgx, cgy, facing, 0, 1); // advance forward 1
    visible.push(d);
    const front = forwardEdge(block, cgx, cgy, facing);
    const cL = cornerL(block, cgx, cgy, facing);
    const cR = cornerR(block, cgx, cgy, facing);
    if (frontOccludes(front, cL, cR)) break; // inclusive stop
  }
  return visible;
}

// ---------------------------------------------------------------------------
// WALL-FAMILY SEEDING (the per-depth SIDE / CORNER / NEAR-WALL OR-blit families).
//
// RE pinned in docs/re/findings/maze-wall-family-seeding.json. Decomposing the 4
// parity-EVEN captures (v1/v2/v5/v6) by destRow band (the PERSPECTIVE depth p) +
// the `base + p` law (maze-index-arithmetic.json) reveals the wall families. Two
// pieces are PINNED byte-exact; the side-wall SURFACE EXTENT is documented residue.
//
// 1) THE CLOSED-FRONT NEAR-WALL FAMILY (pinned). When the corridor is capped by a
//    SOLID/closed-doorway forward edge AT THE PARTY'S OWN CELL (occlusion stop at
//    depth 0 — computeVisibleDepths === [0]), the engine fills the viewport center
//    with the near full-height wall: the NEAR_WALL leaf (placement 0, the img0
//    full-height face) flanked by corner-L 83 + corner-R 87 (the wall_emit_corner
//    near-wall pair, confirmed byte-exact vs v6). Rendered at perspective depth 0.
//    This is byte-exact for v6 (the only captured depth-0 cap).
//
// 2) THE SIDE-WALL SURFACE LADDER (base arithmetic PINNED; extent = RESIDUE). A
//    corridor side wall is drawn as a perspective-tapering surface. A surface that
//    spans perspective slots [s .. e] emits, at slot p in that run, the ceiling
//    PAIR (and the implied floor twins +28): LEFT  { 134 - 4·(p-s), 134 - 4·(p-s-1) }
//    (drop the 2nd term at the near slot p=s); RIGHT { 138, 142 } at the body slot,
//    { 138 } at the near slot — the mirror. (+ ceiling→floor twin +28; the engine
//    emits both bands.) VERIFIED: v1 LEFT ladder s=0..e=1 == {(0,134),(1,130),(1,134)}
//    byte-exact; v5/v2 follow the same ladder anchored at their surface start. The
//    REMAINING residue is the per-side SURFACE START/END (which perspective slots a
//    given corridor side wall spans) — it is NOT a clean per-depth function of the
//    side-solidity profile; it is the engine's perspective ray-march extent, the
//    decompiler-resistant classifier post-pass (wmaze 0x3931/0x3946/0x3951 seeding
//    the [0x5072..0x50a2] gates). Pinning it byte-exact needs a depth-keyed LIVE
//    BUILD trace (trace-maze.ts `depthemit`), which is currently BLOCKED for poked
//    geometry: the poke-then-recompose path replays the OR-blit from the cached span
//    list WITHOUT re-running the BUILD loop (0 span/slot writes observed), so the
//    build depth [0x5040] is not live during a poked recompose. A navigation-reach
//    harness (walk the party to each geometry) is the unblock. See the findings doc.
// ---------------------------------------------------------------------------

/**
 * The CLOSED-FRONT near full-height wall family (byte-exact). Returns the OR
 * placement indices for a corridor whose forward edge OCCLUDES at the party's own
 * cell (visibleDepths === [0]): the NEAR_WALL leaf + the corner-L/corner-R flanks,
 * all at perspective depth 0. Empty when the corridor is open at depth 0.
 *
 * (Pinned vs v6 — gx127 gy123 f0, a closed doorway head-on at depth 0.)
 */
export function generateClosedFrontNearWall(visibleDepths: number[]): number[] {
  if (visibleDepths.length !== 1 || visibleDepths[0] !== 0) return [];
  const { leaf, cornerL: cl, cornerR: cr } = EMIT_BASES.CLOSED_FRONT_NEAR;
  return [leaf, cl, cr];
}

/**
 * The per-slot LEFT/RIGHT side-wall SURFACE ladder (base arithmetic, pinned). For a
 * surface spanning perspective slots [start .. end] on `side`, returns the ceiling
 * placement indices (idx = base + p) it emits. NOTE: this is the ARITHMETIC only —
 * the caller must supply [start, end] (the surface extent), which is the documented
 * residue (not yet derivable byte-exact from the maze block; see the findings doc).
 */
export function sideWallSurfaceLadder(
  side: 'left' | 'right',
  start: number,
  end: number,
): number[] {
  const out: number[] = [];
  for (let p = start; p <= end; p++) {
    const dp = p - start;
    if (side === 'left') {
      out.push((134 - 4 * dp) + p); // near edge: base 134-4·Δp, at perspective p
      if (dp >= 1) out.push((134 - 4 * (dp - 1)) + p); // far edge of the trapezoid
    } else {
      out.push(138 + p);
      if (dp >= 1) out.push(142 + p);
    }
  }
  return out;
}

/**
 * Generate the placement-index SET the engine emits for a parity-EVEN corridor view,
 * from the maze block + party (NO captured frame):
 *
 *   - the per-depth ceiling twin (122 + d) and floor twin (150 + d) for every
 *     VISIBLE depth (the occlusion stop, computeVisibleDepths),
 *   - the 6 constant top-strip chrome pieces, and
 *   - the CLOSED-FRONT near-wall family (byte-exact) when the corridor caps at
 *     depth 0.
 *
 * This is the gate-seeding (which depths fire + the occlusion stop) combined with
 * the index law (base + depth). It reproduces the captured ceiling/floor + strip +
 * closed-front SET byte-exact for v6 (depth-0 cap) and the ceiling/floor + strip
 * skeleton for v1/v2/v5.
 *
 * SCOPE — the side-wall SURFACE families (the tapering ladder, bases 130/134/138/142
 * + deeper) are NOT emitted: their base ARITHMETIC is pinned (sideWallSurfaceLadder)
 * but their per-side SURFACE EXTENT is the documented residue (see
 * maze-wall-family-seeding.json). Callers comparing to a captured ORDERED list
 * should compare the returned SET — the engine's flush re-orders within a frame.
 */
export function generateCallist(block: MazeBlock, party: MazeParty): number[] {
  const visible = computeVisibleDepths(block, party);
  return [
    ...generateSkeletonIndices(visible),
    ...generateClosedFrontNearWall(visible),
  ];
}

export type { MazeBlock, MazeParty };

/** One background blit call. */
export type BackgroundCall =
  | { kind: 'OR'; src: number }
  | { kind: 'masked'; src: number; dst: number; mode: 'or' | 'replace' };

/** A per-view background blit call list (engine emit order). */
export type CallList = BackgroundCall[];

/**
 * Compose a from-asset background page from a call list + the expanded
 * `mazedata.ega` work buffer. The page is OR/masked-composited in call order
 * (background.ts faithful to ega.drv FUN_0a93). Returns a fresh 4-plane EGA page.
 */
export function composeCallList(wb: MazeWorkBuffer, calls: CallList): Uint8Array {
  const page = new Uint8Array(4 * PLANE_STRIDE);
  for (const c of calls) {
    if (c.kind === 'OR') {
      composeBackground(page, [orPlacementFor(wb, c.src)]);
    } else {
      applyMaskedMirror(page, maskedMirrorFor(wb, c.src, c.dst, c.mode));
    }
  }
  return page;
}

/** Convenience: expand `mazedata.ega` then compose the call list into a page. */
export function composeBackgroundFromAsset(
  mazedataEga: Uint8Array,
  calls: CallList,
): Uint8Array {
  return composeCallList(expandMazeData(mazedataEga), calls);
}
