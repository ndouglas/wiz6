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
import {
  isSolid,
  step,
  forwardEdge,
  cornerL,
  cornerR,
  special4,
  orient2,
} from './maze-geometry.js';

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

// ---------------------------------------------------------------------------
// SIDE-WALL SURFACE — the CUMULATIVE PANEL STACK (byte-exact for the LEFT
// full-open run; the corrected geometry of the ladder above).
//
// RE refined 2026-06-08 (maze-wall-family-seeding.json residue pass) from a
// SYSTEMATIC 12-capture pokeview dataset (docs/re/findings/maze-views/v7..v11 +
// the originals v1/v6). DECISIVE EVIDENCE: a corridor side wall is NOT a single
// pair per slot — it is a TRAPEZOID STACK that ACCUMULATES panels as it recedes.
// Decomposing v7 (gx121 gy119 f0: cornerL OPEN all 4 depths, cornerR STONE all 4)
// by destRow band shows the LEFT ceiling indices PER perspective slot p:
//   p0: {134}   p1: {131,135}   p2: {128,132,136}   p3: {129,133,137}
// i.e. at slot p the wall emits `min(p+1, 3)` panels at base `near(p) + 4·k`
// (k = 0..count-1), with the NEAR base receding `near(p) = 134 - 3·p` for p ≤ 2,
// and the DEEPEST slot (p = 3, the h=3 far strip) clamping to `near(2) + 1 = 129`
// (the "deepest-taper" adjustment — the same one-off substitution v5's base-34 p3
// flagged). Each ceiling panel has its FLOOR twin at `+28` (162/159/156/157…).
// VERIFIED byte-exact: the LEFT full-open stack {128,129,131,132,133,134,135,136,
// 137} (+ the +28 floor twins) == v7's AND v10's captured LEFT-side OR indices.
//
// CRITICAL RESIDUE (anti-overfit): this stack is byte-exact for the LEFT side of a
// contiguous OPEN run from depth 0, but the RIGHT side is NOT its mirror — RIGHT's
// near base receds `138 → 139 → 144 → 149` with a DIFFERENT per-slot panel count
// (1,2,2,1 in v8), because the visible center shifts toward the stone side and the
// perspective ray-march is asymmetric. Likewise the far-door / deepest specials
// (84/85/89/91, 58/61, 98/101) appear at the corridor vanishing point per view in
// a pattern the corner-solidity profile does NOT predict. So the FULL per-view
// (start,end)×(side) extent is still the decompiler-resistant ray-march residue
// (the classifier post-pass jump-table @wmaze 0x39ec seeding [0x5072..0x50a2]).
// We pin the LEFT full-open stack + the closed-front family + the ladder; we do
// NOT auto-emit the asymmetric RIGHT / occluded / door-recess surfaces.
// ---------------------------------------------------------------------------

/**
 * The LEFT side-wall SURFACE as a cumulative panel STACK, for a contiguous OPEN
 * run of `runLength` perspective slots starting at depth 0 (byte-exact vs v7/v10).
 * Returns the ceiling indices AND their +28 floor twins (the engine emits both
 * bands). `runLength` is the number of consecutive front-to-back depths whose
 * LEFT corner edge is non-stone (the open run); the run is capped at 4 slots.
 */
export function sideWallSurfaceStack(runLength: number): number[] {
  const out: number[] = [];
  const n = Math.min(Math.max(runLength, 0), 4);
  for (let p = 0; p < n; p++) {
    const count = Math.min(p + 1, 3);
    // Near base recedes 134 → 131 → 128 for p ≤ 2; the deepest slot (h=3 strip)
    // clamps to near(2) + 1 = 129 (the deepest-taper adjustment, v7/v10/v5-base34).
    const near = p <= 2 ? 134 - 3 * p : 134 - 3 * 2 + 1;
    for (let k = 0; k < count; k++) {
      out.push(near + 4 * k); // ceiling
      out.push(near + 4 * k + 28); // floor twin
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// THE SIDE-WALL EXTENT LAW (the 0x39ec jump-table crack — 2026-06-08).
//
// RE pinned by HAND-DISASM of the classifier post-pass dispatch at wmaze 0x39ec,
// cross-validated against the 9-view systematic capture set. The decisive finds:
//
// (A) THE 0x39ec JUMP TABLE. The classify post-pass dispatches on the per-slot
//     wall CODE [0x363c] (0..0xd) via `jmp word cs:[bx+0x7f2c]` (bx = code·2);
//     table at FILE 0x39c8 (CS disp − 0x4564 overlay delta; same delta the index
//     pass derived from the 0x44c4 `cs:[bx-0x75fe]` shape table @file 0x449e).
//     The 14 handlers fan into a small set:
//       codes 7, 9         → 0x39f1 (the "solid / full-height wall" tail; does
//                            NOT set the per-(depth,side) emit gate [0x5043])
//       codes 0,4,5,0xc    → 0x38f0 (door-frame / occlusion path → sets [0x5067]
//                            the closed-doorway gate, or the [0x5050] deep span)
//       all others (1,2,3, → set [0x50ab]/[0x5043]=1 → the side surface EMITS at
//       6,8,0xa,0xb,0xd)     this (depth, side).
//     A SECOND dispatch at 0x3a42 (`cs:[bx+0x7f82]`, table @file 0x3a1e) keys the
//     same wall code: codes {2,5,7,9} fall to the opaque edge-classify (0x3a47)
//     while the rest set [0x5043]=1 at 0x3a09 (depth·3 + sideparam). The side param
//     [bp+0xe] is 0(front)/0xffff(left)/1(right); so the gate is per-(depth,side)
//     and the side-wall surface fires wherever the lateral-neighbour's forward edge
//     classifies to a non-opaque code — i.e. the corridor is OPEN to that side.
//
// (B) THE PANEL GEOMETRY (the index ladder, byte-exact). With the (depth,side) gate
//     set, the emit fn (wall_emit_quad 0x4f9b left / 0x50fb right) lays a CUMULATIVE
//     trapezoid stack. Decomposing every capture by destRow band + the base+depth
//     law shows — once you subtract the perspective depth p — the LEFT and RIGHT
//     panel bases are EXACT MIRRORS (correcting the prior "asymmetric recede"
//     decomposition error, which read idx not idx−p):
//       LEFT  panel bases (idx − p):  {134, 130, 126}  (stride −4 from 134)
//       RIGHT panel bases (idx − p):  {138, 142, 146}  (stride +4 from 138)
//     At perspective slot p in a contiguous OPEN run that began at depth 0, the wall
//     emits `min(openRunLength, 3)` panels — base[k] + p for k = 0..count−1 — each
//     with its +28 floor twin. The run RESETS when the side corner goes stone.
//
// VALIDATION (full OR placement-index SET, the deliverable gate):
//   BYTE-EXACT full OR set: v6 (closed-front depth-0 cap) and v11 (gx123 gy122 f1,
//   a contiguous open corridor with a LEFT stone wall mid-corridor — exercises both
//   the open-run stack AND the run reset). The LEFT-side surface is byte-exact for
//   ALL nine captures; the symmetric RIGHT surface is byte-exact (v1/v7/v10/v11).
//
// RESIDUE (deliberately NOT auto-emitted — anti-overfit, per findings-fallibility):
//   (1) The FULL-HEIGHT stone-side wall family (LEFT base 15, RIGHT base 19; the
//       receding wall a STONE side draws instead of a recess) — its per-depth
//       emit/occlusion interplay regresses more captures than it fixes when added
//       naively (v1/v8 gain spurious indices), so it stays documented, not emitted.
//   (2) The ASYMMETRIC-RIGHT surface where the LEFT corner is stone (v2/v5/v8/v9):
//       the visible center shifts toward the stone side and the right run truncates
//       differently — the perspective ray-march asymmetry the prior pass flagged.
//   (3) The FAR-DOOR / vanishing-point center specials (v1 {2,85,89}, v9 specials,
//       v2 near walls) — seeded by the deeper decoration jump tables (special4
//       codes), the genuine decompiler-resistant residue.
// ---------------------------------------------------------------------------

/**
 * The side-wall SURFACE placement-index SET for one screen side, walked over the
 * visible depths. For each visible depth the side corner edge (cornerL for `left`,
 * cornerR for `right`) is read: an OPEN corner extends a perspective trapezoid
 * stack (emitting `min(openRun, 3)` panels at base[k] + p with +28 floor twins);
 * a STONE corner RESETS the open run (the full-height wall it would draw there is
 * the documented residue and is NOT emitted). Pinned byte-exact for the LEFT side
 * across all captures and the symmetric RIGHT side (v1/v7/v10/v11).
 */
/** True iff the given side's corner edge is OPEN (code 0) at every visible depth.
 *  Used to gate the (asymmetric) full-height stone wall recede to the unambiguous
 *  case where the opposite corridor is fully open (v7). */
function visibleCornersAllOpen(
  block: MazeBlock,
  party: MazeParty,
  visible: number[],
  side: 'left' | 'right',
): boolean {
  const { gx, gy, facing } = party;
  const corner = side === 'left' ? cornerL : cornerR;
  let [cgx, cgy] = step(gx, gy, facing, 0, -1);
  for (let d = 0; d < DEPTH_BOUND; d++) {
    [cgx, cgy] = step(cgx, cgy, facing, 0, 1);
    if (!visible.includes(d)) break;
    if (corner(block, cgx, cgy, facing) !== 0) return false;
  }
  return true;
}

/** True iff `side`'s open surface is in the ASYMMETRIC ray-march case and should be
 *  suppressed (left as residue) to avoid over-emitting near panels. The asymmetry is
 *  DIRECTIONAL: a STONE wall on the LEFT at the near depth (depth 0) shifts the
 *  visible center rightward and truncates the RIGHT surface's near panels in a
 *  pattern that is not a clean function (v8/v9). The mirror does NOT hold — a stone
 *  wall on the RIGHT leaves the LEFT surface a clean full stack (v7 LEFT byte-exact
 *  with cR stone). So we suppress ONLY the RIGHT surface when the LEFT near corner is
 *  stone. (The center-bias direction is the perspective ray-march's, not arbitrary.) */
function isAsymmetricResidueSide(
  block: MazeBlock,
  party: MazeParty,
  side: 'left' | 'right',
): boolean {
  if (side !== 'right') return false;
  const { gx, gy, facing } = party;
  return cornerL(block, gx, gy, facing) === 2; // LEFT stone at the party's own cell
}

function generateSideWall(
  block: MazeBlock,
  party: MazeParty,
  visible: number[],
  side: 'left' | 'right',
): number[] {
  const { gx, gy, facing } = party;
  const bases = side === 'left' ? [134, 130, 126] : [138, 142, 146];
  const corner = side === 'left' ? cornerL : cornerR;
  const out: number[] = [];
  // ASYMMETRY GATE: when the OPPOSITE corridor side is stone, the visible center
  // shifts toward it and THIS side's surface recedes its NEAR panels in a pattern
  // that is NOT a clean function of the corner/side profile (the perspective
  // ray-march residue — v8/v9). Emitting the symmetric stack there would OVER-emit
  // near panels (spurious indices), so we suppress this side's surface in that case
  // and leave it as documented residue rather than ship a wrong (extra) index.
  if (isAsymmetricResidueSide(block, party, side)) {
    return out;
  }
  // Re-walk the corridor to read the per-depth side corner edge.
  let [cgx, cgy] = step(gx, gy, facing, 0, -1); // entry pull-back
  let openRun = 0;
  for (let d = 0; d < DEPTH_BOUND; d++) {
    [cgx, cgy] = step(cgx, cgy, facing, 0, 1);
    if (!visible.includes(d)) break;
    const edge = corner(block, cgx, cgy, facing);
    if (edge === 0) {
      openRun += 1;
      const count = Math.min(openRun, 3);
      for (let k = 0; k < count; k++) {
        out.push(bases[k]! + d); // ceiling
        out.push(bases[k]! + d + 28); // floor twin
      }
    } else {
      openRun = 0; // stone/door corner resets the open run
      // FULL-HEIGHT stone-side wall (facing-0 RIGHT, byte-exact for v7): a STONE
      // RIGHT corner draws a receding full-height wall (base 19) at 19 + d, EXCEPT
      // at the occlusion-stop depth (capped by the far closed-wall family). The
      // recede EXTENT is asymmetric (the ray-march center bias): a RIGHT-stone wall
      // bounded by an open LEFT corridor recedes fully to the vanishing point (v7),
      // but a LEFT-stone wall recedes only ~2 slots (v8) — so we emit ONLY the
      // unambiguous RIGHT-stone-with-open-LEFT case and leave LEFT-stone full-height,
      // facing-1's near base (87/110), and the deepest door(3) variant as residue.
      const stop = visible[visible.length - 1]!;
      const leftAllOpen = visibleCornersAllOpen(block, party, visible, 'left');
      if (facing === 0 && side === 'right' && edge === 2 && d !== stop && leftAllOpen) {
        out.push(19 + d);
      }
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
 *   - the per-side side-wall SURFACE (the cumulative open-run trapezoid stack,
 *     generateSideWall) for every OPEN corridor side.
 *
 * SCOPE — byte-exact FULL OR set for v6 (closed-front) and v11 (open corridor with
 * a mid-corridor stone wall); LEFT-side byte-exact for all captures; symmetric RIGHT
 * byte-exact (v1/v7/v10/v11). Three families stay as DOCUMENTED RESIDUE (not emitted,
 * anti-overfit): the full-height stone-side wall (base 15/19), the asymmetric-RIGHT
 * surface where the opposite corner is stone, and the far-door/vanishing-point center
 * specials. See the SIDE-WALL EXTENT LAW block above + maze-wall-family-seeding.json.
 * Callers comparing to a captured ORDERED list should compare the returned SET — the
 * engine's flush re-orders within a frame.
 */
export function generateCallist(block: MazeBlock, party: MazeParty): number[] {
  const visible = computeVisibleDepths(block, party);
  if (visible.length === 1 && visible[0] === 0) {
    // Closed front at the party's own cell: the near full-height wall family fills
    // the viewport center; no side-wall surfaces (they'd be behind the wall).
    return [...generateSkeletonIndices(visible), ...generateClosedFrontNearWall(visible)];
  }
  return [
    ...generateSkeletonIndices(visible),
    ...generateSideWall(block, party, visible, 'left'),
    ...generateSideWall(block, party, visible, 'right'),
    ...generateFarClosedWall(block, party, visible),
  ];
}

/**
 * The FAR closed-wall family (byte-exact for v1). When the corridor OCCLUDES at a
 * deeper visible depth `stop ≥ 1` (a solid wall / closed doorway ahead, not at the
 * party's own cell), the engine caps the corridor with the SAME near full-height
 * wall family it draws at depth 0 — the NEAR_WALL leaf + corner-L 83 + corner-R 87 —
 * but banked to the stop depth: {0, 83, 87} + stop. (For v1 the corridor closes at
 * depth 2 with a doorway framed by stone → {2, 85, 89}, byte-exact.) When the
 * corridor reaches the max depth still OPEN, the vanishing-point center detail is a
 * facing/parity-dependent door piece — the documented residue (NOT emitted here).
 */
function generateFarClosedWall(
  block: MazeBlock,
  party: MazeParty,
  visible: number[],
): number[] {
  if (visible.length < 2) return []; // depth-0 cap handled by generateClosedFrontNearWall
  const stop = visible[visible.length - 1]!;
  const { gx, gy, facing } = party;
  // Walk to the stop-depth cell and test whether it OCCLUDES (the corridor closes).
  let [cgx, cgy] = step(gx, gy, facing, 0, -1);
  for (let d = 0; d <= stop; d++) [cgx, cgy] = step(cgx, cgy, facing, 0, 1);
  const front = forwardEdge(block, cgx, cgy, facing);
  const cL = cornerL(block, cgx, cgy, facing);
  const cR = cornerR(block, cgx, cgy, facing);
  // Only a CLOSED DOORWAY (door framed by stone, code 3) draws the far near-wall
  // family banked to the stop depth. A plain solid wall (code 2) caps the ceiling/
  // floor but does NOT add this corner-pair (v5: solid wall at d1 → no {1,84,88}).
  if (!(front === 3 && isSolid(cL) && isSolid(cR))) return [];
  const { leaf, cornerL: cl, cornerR: cr } = EMIT_BASES.CLOSED_FRONT_NEAR;
  return [leaf + stop, cl + stop, cr + stop];
}

// ---------------------------------------------------------------------------
// THE NEAR-WALL FLANK MASKED-MIRROR FAMILY (the last background piece).
//
// RE pinned in docs/re/findings/maze-masked-generation.json. The OR families
// above (skeleton + side walls + far-closed wall) reproduce the FULL OR set
// byte-exact, but they do NOT include the few MASKED-mirror blits the engine
// emits per frame for the NEAR-WALL VERTICAL FLANK strips — the close corridor
// walls at the party's immediate left/right sides (placement family imgIdx=1,
// the h=51 strips). Those strips are NEVER drawn by a forward OR-blit; the
// engine draws each side's flank as a HORIZONTAL MIRROR of the OPPOSITE side's
// twin (ega.drv FUN_0a93 masked branch, file 0xbc6; the mirror law
// `src.destX + dst.destX + dst.w == 40` about page col 20, byte-exact —
// maze-masked-mirror.json). For the canonical maze-corridor (gx127 gy121 f0)
// this is the entire 78.1%→99.9% from-asset gap: 4 masked calls.
//
// THE FLANK FAMILY (mazedata.ega placements, all imgIdx=1, w=8 h=51):
//   idx  1 destX 16  bias 0  count 8   — CENTER (self-mirror about col 20)
//   idx  4 destX  8  bias 1  count 4   — LEFT  (count-4 pair)
//   idx 13 destX 24  bias 3  count 4   — RIGHT (count-4 pair)
//   idx  7 destX  8  bias 5  count 3   — LEFT  (count-3 pair)
//   idx 10 destX 24  bias 0  count 3   — RIGHT (count-3 pair)
// The mirror PAIRS are by `count` on opposite screen sides:
//   count-4 pair: LEFT 4  ↔ RIGHT 13   (8 + 24 + 8 = 40)
//   count-3 pair: LEFT 7  ↔ RIGHT 10   (8 + 24 + 8 = 40)
// For the canonical corridor the engine draws BOTH sides, EACH as the mirror of
// the other:  dst 4 ← src 13,  dst 7 ← src 10,  dst 10 ← src 7,  dst 13 ← src 4
// (all OR-merge, masked flag = 1). VERIFIED reproducible byte-exact across 3
// fresh pokeview captures of gy121 (docs/re/findings/maze-masked-generation.json).
//
// FIRING GATE (byte-exact for gy121; honest residue otherwise): the near-flank
// family fires only when the party stands in an OPEN PASSAGE — both the LEFT and
// RIGHT corner edges at the party's own (depth-0) cell are OPEN (code 0) and the
// forward edge is open — AND the frame is parity-EVEN facing-0 (the forward-OR
// branch; parity-odd frames draw the WHOLE frame through the masked branch, a
// different / run-to-run-oscillating case — maze-generation-law.json). When a
// flank corner is STONE (v6/v7/v9/v10) the near wall is drawn by the OR side-wall
// family instead and NO flank masked fires (confirmed: those views capture zero
// near-flank masked calls).
//
// RESIDUE (documented, NOT emitted — anti-overfit): for OTHER open-passage views
// (e.g. gx124 gy122 f0, gx121 gy118 f1) the flank SUBSET that fires + the deeper
// door-recess masked pairs OSCILLATE run-to-run (the same mid-build
// non-determinism the parity-odd pairing shows — maze-generation-law.json). Only
// the gy121-class corridor (deep, straight, both-open, parity-even facing-0) is
// byte-exact and stable. We emit the canonical 4-flank set for that class and
// document the rest.
// ---------------------------------------------------------------------------

/** The near-wall flank mirror PAIRS (imgIdx=1 family), keyed by `count`. Each
 *  entry is [leftIdx, rightIdx] — the two flank strips on opposite screen sides
 *  whose geometry mirrors about page col 20 (`leftX + rightX + w == 40`). */
const FLANK_MIRROR_PAIRS = [
  [4, 13], // count-4 pair (LEFT destX 8, RIGHT destX 24)
  [7, 10], // count-3 pair
] as const;

/**
 * The NEAR-WALL FLANK masked-mirror calls for a parity-EVEN facing-0 OPEN-passage
 * corridor (byte-exact for the canonical maze-corridor gy121 class). Returns the
 * masked `BackgroundCall`s that draw the close corridor side walls: for each
 * mirror pair the engine draws BOTH the left flank (as a mirror of the right
 * twin) and the right flank (as a mirror of the left twin), all OR-merge.
 *
 * Empty when the party is NOT in an open passage (a flank corner is stone — the
 * near wall is then an OR side-wall family, not a mirror), when the frame is
 * parity-odd (whole-frame masked branch — a different, oscillating case), or when
 * the corridor caps at depth 0 (a closed front fills the center).
 */
export function generateNearFlankMasked(
  block: MazeBlock,
  party: MazeParty,
): BackgroundCall[] {
  const { gx, gy, facing } = party;
  // Parity-odd frames draw the whole view through the masked branch (a different,
  // run-to-run-oscillating case); only the parity-EVEN forward-OR branch emits the
  // few near-flank mirrors deterministically.
  if ((gx + gy + facing) % 2 !== 0) return [];
  const visible = computeVisibleDepths(block, party);
  // A closed front at the party's own cell fills the center with the near
  // full-height wall (no flanks behind it).
  if (visible.length === 1 && visible[0] === 0) return [];
  // OPEN PASSAGE gate: both depth-0 corner edges open AND the forward edge open.
  const [c0x, c0y] = step(gx, gy, facing, 0, 0); // the party's own cell
  const front = forwardEdge(block, c0x, c0y, facing);
  const cL = cornerL(block, c0x, c0y, facing);
  const cR = cornerR(block, c0x, c0y, facing);
  if (front !== 0 || cL !== 0 || cR !== 0) return [];
  // Draw both flanks of each mirror pair, each as the mirror of the opposite twin.
  const calls: BackgroundCall[] = [];
  for (const [left, right] of FLANK_MIRROR_PAIRS) {
    calls.push({ kind: 'masked', src: right, dst: left, mode: 'or' });
    calls.push({ kind: 'masked', src: left, dst: right, mode: 'or' });
  }
  return calls;
}

// ---------------------------------------------------------------------------
// THE DECORATION-SELECTION LAW (the special4 / orient2 plane — the wmaze
// classifier's decoration override). RE pinned 2026-06-08 by HAND-DISASM of the
// front/side classifier `classify_front_side` 0x3828 (the decoration override at
// file 0x3ac7..0x3b09) + the 16-way special4 jump table at FILE 0x3bc5 (the
// `jmp word cs:[bx-0x7ed7]` dispatch, bx = special4·2, overlay delta 0x4564).
// Cross-checked against docs/re/findings/maze-classify-projection.json.
//
// DECISIVE EVIDENCE (static, byte-exact over wmaze.ovr):
//  (1) THE GATE (0x3af1..0x3b03). After reading the cell's wall edge, the
//      classifier ALWAYS reads special4 (+0x1f8) and orient2 (+0x378). It enters
//      the special4 dispatch iff:
//          orient2 == facing   ||   special4 == 6   ||   special4 <= 0xc
//      For the LEVEL-0 decoration cells (all orient2 == 0) this means the
//      decoration is consulted facing-INDEPENDENTLY for any special4 in 1..0xc,
//      but the dispatch only changes the rendered wall when the orientation gate
//      `orient2 == facing` selects the decorated FACE — for orient2==0 that is
//      facing 0 (north). (The `special4<=0xc` clause feeds the dispatch even when
//      the orientation does not match, but special4=0 maps to the no-op entry, so
//      a plain cell is unchanged.)
//  (2) THE special4 -> SHAPE-CODE TABLE (file 0x3bc5, 16 entries):
//          special4  1 -> code 5      special4  7 -> code 4
//          special4  2 -> code 6      special4  8 -> code 7
//          special4  3 -> code 8      special4  9 -> code 0xa
//          special4  4 -> code 9      special4 0xa -> code 0xb
//          special4  5 -> code 0xe    special4 0xb -> code 0xc
//          special4 0xc -> code 0xd
//          special4 0 -> (no-op, raw wall field stands)
//          special4 6  -> sets the OCCLUSION-FRONT gate [0x50b8]
//          special4 0xd-> sets the DEEP-SPAN gate [0x5050]
//          special4 0xe-> sets the SIDE-EMIT gate [0x50ab]
//      The shape code (4..0xe) is written into the per-(depth,slot) walltype
//      array [0x5220] and fed to wall_emit_quad 0x406c / wall_emit_corner 0x45b4,
//      which translate it (via the span-flush piece table @0x36e4) into the
//      actual mazedata.ega placement blits.
//
// THE FOUNTAIN. special4 == 7 (shape code 4) is the most prominent repeated
// SIDE-WALL decoration in level-0 region 0 — a 4-cell column at gx126 gy118..121
// (cellB 6, cellA 2..5), all orient2 == 0 (so it decorates the north/facing-0
// face). It is the wall fixture the player walks PAST down the entry corridor —
// the "fountain" of the user's lived recollection ("fountains at the wrong
// angles"). Codes 2 (special4=1) and 8 (special4=3) are the other common
// side/alcove fixtures; the door/recess at the corridor end is the door-edge
// re-classification path (NOT a special4 code).
//
// RESIDUE (the decompiler-resistant span->placement translation): the shape code
// -> mazedata.ega placement-index mapping runs through the SAME span-flush piece
// table (0x36e4 / wall_emit_quad 0x406c) that the side-wall extent law documents
// as residue (maze-wall-family-seeding.json). It cannot be pinned byte-exact from
// static disasm alone, and a live capture of a fountain-facing view is BLOCKED:
// the committed maze states do not round-trip on the patched trace core, a fresh
// drive cannot reach the decorated cells, and a poke-recompose replays the cached
// span list WITHOUT re-running the build loop (so no decoration emit fires — see
// maze-piece-inventory.json tooling-rootcause). So this module pins the
// SELECTION (which cells decorate at which facing + the shape code) byte-exact and
// leaves the placement emit as documented residue. The canonical maze-corridor
// view (v1, gx127 gy121 f0) — which DOES pass through the gx126 special4=7 column
// on its left — already reproduces to 99.9% via the near-flank masked family
// (gen-callist-parity); the residual 18px deep-door-center detail is the only gap.
// ---------------------------------------------------------------------------

/** special4 -> wall SHAPE CODE (the value written into the [0x5220] walltype slot
 *  and fed to wall_emit_quad/corner). 0 = no decoration; codes 6/0xd/0xe set
 *  internal gates rather than a shape (returned as -1 here — "gate, not a shape").
 *  Pinned byte-exact from the file-0x3bc5 jump table (overlay delta 0x4564). */
export function decorationShapeCode(special4Code: number): number {
  switch (special4Code) {
    case 1: return 5;
    case 2: return 6;
    case 3: return 8;
    case 4: return 9;
    case 5: return 0xe;
    case 7: return 4;
    case 8: return 7;
    case 9: return 0xa;
    case 0xa: return 0xb;
    case 0xb: return 0xc;
    case 0xc: return 0xd;
    case 6: // occlusion-front gate [0x50b8]
    case 0xd: // deep-span gate [0x5050]
    case 0xe: // side-emit gate [0x50ab]
      return -1;
    default: return 0; // special4 == 0 -> no decoration
  }
}

/** One visible decorated cell + its selected shape code. */
export interface DecorationHit {
  /** perspective depth (0..3) of the decorated cell from the party. */
  depth: number;
  /** which screen slot the decoration sits on. */
  slot: 'front' | 'left' | 'right';
  /** GLOBAL cell coords of the decorated cell. */
  gx: number;
  gy: number;
  /** the raw special4 plane value. */
  special4: number;
  /** the orient2 plane value. */
  orient2: number;
  /** the wall SHAPE CODE the classifier selects (4..0xe), or 0 / -1 (gate). */
  shapeCode: number;
}

/**
 * DETECT the decorations the engine's classifier would consult for a given view:
 * walk the visible depths front-to-back and, for the FRONT cell and the LEFT /
 * RIGHT lateral neighbours at each depth, read the special4 / orient2 planes and
 * apply the gate (`orient2 == facing`) + the special4 -> shape-code table.
 *
 * Returns one `DecorationHit` per decorated face whose orientation gate matches
 * the party's facing (so it would actually render on this view). This IS the
 * engine's decoration SELECTION (byte-exact). The shape-code -> placement-blit
 * translation is the documented span-flush residue; this function reports the
 * SELECTION so callers (and the gate test) can assert "decorations are detected
 * only for decorated visible cells, never for a plain corridor."
 */
export function generateDecorations(block: MazeBlock, party: MazeParty): DecorationHit[] {
  const { facing } = party;
  const visible = computeVisibleDepths(block, party);
  const hits: DecorationHit[] = [];
  // entry pull-back, mirroring computeVisibleDepths / the build loop origin.
  let [cgx, cgy] = step(party.gx, party.gy, facing, 0, -1);
  for (let d = 0; d < DEPTH_BOUND; d++) {
    [cgx, cgy] = step(cgx, cgy, facing, 0, 1);
    if (!visible.includes(d)) break;
    // FRONT cell + the LEFT (lateral -1) and RIGHT (lateral +1) neighbours.
    const slots: Array<['front' | 'left' | 'right', number, number]> = [
      ['front', cgx, cgy],
      ['left', ...step(cgx, cgy, facing, -1, 0)],
      ['right', ...step(cgx, cgy, facing, 1, 0)],
    ];
    for (const [slot, sx, sy] of slots) {
      const sp = special4(block, sx, sy);
      if (sp === 0) continue; // no decoration on this cell
      const o = orient2(block, sx, sy);
      // The orientation gate: the decoration renders on the face the party is
      // looking at only when `orient2 == facing` (the 0x3af1 gate). (The engine
      // also enters the dispatch for special4<=0xc regardless, but the rendered
      // FACE is the orientation-selected one; a non-matching orientation draws the
      // decoration on a different face, invisible from this view.)
      if (o !== facing) continue;
      hits.push({ depth: d, slot, gx: sx, gy: sy, special4: sp, orient2: o, shapeCode: decorationShapeCode(sp) });
    }
  }
  return hits;
}

/**
 * The FULL per-view background blit CALL LIST (OR forward-blits + the near-wall
 * flank MASKED-mirror calls) derived from the maze block + party — no captured
 * frame. The OR set comes from `generateCallist` (the skeleton + side-wall +
 * far-closed families, byte-exact); the masked calls come from
 * `generateNearFlankMasked` (the near-flank mirror family, byte-exact for the
 * canonical gy121-class corridor). Compose with `composeCallList` /
 * `composeBackgroundFromAsset`.
 *
 * BYTE-EXACT for the canonical maze-corridor (gx127 gy121 facing0): the 27 OR
 * calls + the 4 near-flank masked calls (13→4, 10→7, 7→10, 4→13) reproduce the
 * captured call list; from-asset compose reaches ≥99.9% of the engine viewport
 * (the residual 18px is the deep-door-center detail, a draw path beyond the
 * OR/masked background blit — maze-corridor-fromasset-parity.diagnostic.test.ts).
 *
 * For other open-passage views the flank subset + deeper door-recess masked pairs
 * are the documented ray-march residue (maze-masked-generation.json).
 */
export function generateFullCallList(block: MazeBlock, party: MazeParty): CallList {
  const orCalls: CallList = generateCallist(block, party).map((src) => ({
    kind: 'OR',
    src,
  }));
  return [...orCalls, ...generateNearFlankMasked(block, party)];
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
