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
 * A solid wall (code 2) always occludes; a door (code 3) occludes either when it
 * is a CLOSED doorway — framed by solid walls on both the left and right corner
 * edges — OR when it is viewed HEAD-ON (`headon`, facing 2 or 3). A door with an
 * open corner viewed from the side (facing 0/1) is a see-through opening. (wmaze
 * occ_seed_front 0x4892: front==2 || the door-frame corner gate [0x5067].)
 *
 * THE LOOK-BACK / HEAD-ON DOOR LAW (maze-freeroam look-back pass 2026-06-09). A
 * door's `front==3` code is read as its FRONT face only for the head-on facings
 * (2/3 — the gy-1/gx-1 helper selectors; classify.ts law (4)). When the party
 * looks AT a door head-on, it is a CLOSED gate that fills the viewport (a recessed
 * portcullis), capping the view at the door's depth — exactly like a solid wall
 * or a corner-framed closed doorway. EYEBALL-confirmed vs the engine for the
 * entrance look-back: gx127 gy121 f2 (door at the party's own cell → near gate,
 * visibleDepths [0]) and gx127 gy122 f2 (door one cell ahead → gate at the
 * corridor end, visibleDepths [0,1]). Facings 0/1 read a door's BACK face and do
 * NOT occlude on a plain `front==3` (the corner-framed gate is handled below). NO
 * existing capture has a head-on door (all v1/v2/v5/v6 + the 6 freeroam views are
 * facing 0/1/3 with `front==3` only at non-head-on facings), so this rule fires
 * ONLY for the look-back views and regresses nothing.
 */
function frontOccludes(front: number, cL: number, cR: number, headon: boolean): boolean {
  if (front === 3 && headon) return true; // head-on door = closed gate, caps the view
  if (front === 2) {
    // OFFSET-WALL EXCEPTION (maze-freeroam pass 2026-06-09). A solid forward edge
    // with EXACTLY ONE stone side corner (the other open) is a corridor JOG, not a
    // cap — the view continues past it (the offset wall reads as the receding side
    // wall, the opening leads the eye deeper). This is the off-axis turned-corridor
    // geometry the entrance-relative parity-EVEN captures never exercised: a wall
    // ahead-and-to-one-side while the other side opens.
    //
    // Validated against ALL FOUR byte-exact occlusion captures (v1/v2/v5/v6 — see
    // index-arithmetic.test.ts), which it leaves unchanged: v5's d1 solid front has
    // BOTH corners OPEN (a true corridor cap → still occludes); v6 caps at d0
    // (handled before reaching here); v1/v2 cap on doors. It extends the off-axis
    // freeroam views (gx127gy121f1, gx124gy121f0, gx127gy123f1) from a depth-1/0
    // truncated VOID to the full depth-3 corridor the engine renders.
    // The jog side must be STONE specifically (code 2), not a door (1/3): a door
    // ahead-and-to-one-side is a closed/openable doorway that frames the corridor,
    // not a receding wall to see past. (Restricting to code 2 keeps fr-f0's d2
    // door-corner cap at depth 2 — its OLD, correct stop — while still opening the
    // genuine stone-jog views fr-f1/the f3 turns.)
    const oneStoneOneOpen = (cL === 2 && cR === 0) || (cL === 0 && cR === 2);
    return !oneStoneOneOpen;
  }
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
  const headon = facing === 2 || facing === 3; // head-on door read direction (classify.ts (4))
  let [cgx, cgy] = step(gx, gy, facing, 0, -1); // entry pull-back (forward=-1)
  const visible: number[] = [];
  for (let d = 0; d < DEPTH_BOUND; d++) {
    [cgx, cgy] = step(cgx, cgy, facing, 0, 1); // advance forward 1
    visible.push(d);
    const front = forwardEdge(block, cgx, cgy, facing);
    const cL = cornerL(block, cgx, cgy, facing);
    const cR = cornerR(block, cgx, cgy, facing);
    if (frontOccludes(front, cL, cR, headon)) break; // inclusive stop
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
 * Whether the party's depth-0 forward edge is a STONE-FRAMED CLOSED DOORWAY: a door
 * (front==3) flanked by solid stone on BOTH the left and right corner edges. Viewed
 * from any facing this reads as a flat closed wall (the door's stone-framed face/back)
 * — the dead-end stone wall the engine fills the viewport with. (Reads the party's OWN
 * cell, matching the depth-0 origin of the build loop / the firing gate.)
 */
function isStoneFramedClosedDoorway(block: MazeBlock, party: MazeParty): boolean {
  const { gx, gy, facing } = party;
  const [c0x, c0y] = step(gx, gy, facing, 0, 0);
  return (
    forwardEdge(block, c0x, c0y, facing) === 3 &&
    isSolid(cornerL(block, c0x, c0y, facing)) &&
    isSolid(cornerR(block, c0x, c0y, facing))
  );
}

/**
 * The CLOSED-FRONT near full-height wall family. Returns the OR placement indices
 * for a corridor whose forward edge OCCLUDES at the party's own cell (visibleDepths
 * === [0]): the NEAR_WALL leaf + the corner-L/corner-R flanks, all at perspective
 * depth 0. Empty when the corridor is open at depth 0.
 *
 * ── STONE-FRAMED-DOORWAY DEAD-END (the NEAR-WALL fix, 2026-06-09 masked-mirror pass) ──
 * The corner-L/corner-R pieces (83/87, the img23/img26 full-height w4 h112 flanks)
 * render — TOGETHER with the leaf (placement 0, the flat img0 brick face) — as the
 * STONE FRAME of a flat dead-end wall, NOT floating arches. The user's "spurious
 * arches walking INTO the dungeon" report is about OPEN corridors (front=0); this
 * family is gated to a CLOSED front at depth 0 and never fires walking down an open
 * corridor (enumerated: only gy123-f0 + gy124-f2 in region 0 match the predicate).
 *
 * WHAT THE ENGINE EMITS vs WHAT REPRODUCES. The real-move capture
 * (freeroam-gx127-gy123-f0) shows a flat dead-end brick wall, but its CAPTURED
 * call-list is a receding-corridor list (ceiling/floor perspective twins 122/150 +
 * full-height side walls 6/9/84/88) — a DIFFERENT FRAME than the committed fixture
 * (the gy=118-vs-gy=121 transient-frame mismatch documented throughout the maze
 * findings). The masked-mirror compositor itself is FAITHFUL to the asm (re-verified
 * 2026-06-09: the destX sign-extension bug was fixed — leaf 6/9's destX=255 is signed
 * −1, now lands on the correct LEFT side; the geometry is byte-exact otherwise). But
 * composing that captured corridor list still renders a (correct-for-the-list)
 * receding corridor, ~33% vs the dead-end fixture — the frame mismatch, not the
 * compositor (see maze-masked-mirror.json masked-callist-fromasset-frame-mismatch).
 * The OR family {0,83,87} (the un-mirrored twins of the same geometry) reconstructs
 * the flat brick wall the engine shows and matches 98.15% (eyeball: a clean stone
 * wall, only the central statue decoration missing — the door-recess residue).
 *
 * So we OR-emit the closed-front family for a CLOSED front at depth 0 when it is a
 * STONE-FRAMED CLOSED DOORWAY (front==3 && solid(cornerL) && solid(cornerR)) — at
 * ANY facing. That covers BOTH the head-on look-back gate (facing 2/3, eyeball-
 * confirmed) AND the forward-walk dead-end (facing 0/1, gx127 gy123 f0 → 98.15%
 * stone wall). The prior pass (spurious-side-arch fix) over-corrected: it removed
 * 0/83/87 for ALL facing-0/1 closed fronts, which turned the genuine dead-end into a
 * BLACK VOID — it confused "the engine emits masked, not OR" (true) with "the OR
 * family is wrong" (false: the OR family is the only faithful reproduction we have).
 *
 * A facing-0/1 closed front that is NOT a stone-framed doorway (e.g. front==2 solid
 * with a door/open corner — gy123-f1's archway) still emits NOTHING here: its near
 * wall is a genuine recessed doorway (the door-recess masked family, residue), and
 * OR-blitting a flat wall over an open archway WOULD be spurious. The distinguishing
 * predicate is the stone-framed-doorway, not the facing.
 */
export function generateClosedFrontNearWall(
  visibleDepths: number[],
  facing: number,
  closedDoorway: boolean,
): number[] {
  if (visibleDepths.length !== 1 || visibleDepths[0] !== 0) return [];
  // OR-emit the closed-front family for:
  //   (a) a STONE-FRAMED CLOSED DOORWAY at depth 0 (front==3 framed by solid corners
  //       both sides) — the flat dead-end wall, at ANY facing (the forward-walk
  //       dead-end gx127 gy123 f0 AND the head-on look-back gate gy124 f2). This is
  //       the faithful stone-wall reproduction (98.15%, eyeball-confirmed); the
  //       engine's masked twins (6/9, 84/88) do not reproduce through our compositor.
  //   (b) a HEAD-ON door (facing 2/3) — the look-back-at-the-gate case where the
  //       door's FRONT face is read (even with open side corners) and the engine
  //       shows the closed gate filling the viewport (eyeball-confirmed).
  const headon = facing === 2 || facing === 3;
  if (!closedDoorway && !headon) return [];
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
/**
 * The side-wall SURFACE placement-index SET for one screen side, walked over the
 * visible depths. For each visible depth the side corner edge (cornerL for `left`,
 * cornerR for `right`) is read:
 *   - OPEN (code 0): extends the cumulative perspective trapezoid stack — emitting
 *     `min(openRun, 3)` panels at base[k] + d (LEFT bases {134,130,126}, RIGHT
 *     {138,142,146}) each with its +28 floor twin;
 *   - STONE (code 2): draws the full-height receding stone wall (base 15 LEFT / 19
 *     RIGHT at base + d) — see the STONE_WALL_BASE law below;
 *   - DOOR/recess (code 1|3): resets the open run; the door-recess piece is the
 *     documented decompiler-resistant residue (NOT emitted here).
 *
 * GENERALIZED 2026-06-09 (maze-freeroam pass): emits the symmetric stack on BOTH
 * sides (gated only by each side's own corner edge) and the full-height stone wall
 * for ANY (side, facing). The prior version SUPPRESSED the receding side wall of
 * turned corridors (kept `generated ⊆ captured` for the v8/v9 poke captures but
 * left the off-axis views BLACK — the "void" the player saw). The generalized
 * emission stays a SUBSET of every gated capture (v1/v5/v6/v7/v10/v11) — see
 * index-arithmetic.test.ts (byte-exact + generated⊆captured) — and lifts the
 * off-axis freeroam views (gx126gy121f3 +21pp, gx127gy122f3 +11pp via the wired
 * render). The entrance (gy121 f0) is unchanged (both sides open → identical set).
 */
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
  // CONTINUOUS NEAR-STONE WALL: this side is filled by the near-flank stack family
  // (generateNearStoneFlank), not the per-depth receding wall — suppress here.
  if (isContinuousNearStoneWall(block, party, visible, side)) return out;
  // FULL-HEIGHT stone-side wall law (generalized 2026-06-09 — maze-freeroam pass).
  // A STONE side corner draws a receding full-height wall: base 15 (LEFT) / 19 (RIGHT)
  // at `base + d`. This is the receding stone wall the player sees when turned to face
  // down a corridor with a solid wall along one side — the "black void" the off-axis
  // views showed. Two depths are EXCLUDED (matching every captured set byte-exact, zero
  // spurious across v1/v6/v7/v10/v11 + the 6 freeroam captures):
  //   (1) the NEAR depth of a stone run that begins at the party's own cell (the very
  //       first contiguous-from-near stone depth) — the engine fills that with the near
  //       full-height occluding piece, NOT the receding base+d (v10 has 20,21,22 but not
  //       19; gx126gy121f3 has 16,17 not 15);
  //   (2) the OCCLUSION-STOP depth when the front there is a DOOR (code 3) — the doorway
  //       is capped by the door-recess family, not a stone wall (v1's stop at d2 is a
  //       door → no 15/19 there). A SOLID-front (code 2) stop still draws the stone wall.
  // This is the single biggest off-axis win (gx126gy121f3 63%→84%, gx127gy122f3
  // 72%→84% via the wired render; the residual is dither-phase + door-recess residue,
  // NOT a missing wall). The PREVIOUS gate (`facing===0 && side==='right' &&
  // leftAllOpen`) only drew the v7 RIGHT-stone case and left LEFT-stone + facing≠0 as
  // residue — which is exactly what left the turned corridors black.
  const stop = visible[visible.length - 1]!;
  // NEAR-STONE JOG: a side that is STONE from the party's own cell (d0) for a run, then
  // OPENS, draws a near-stone wall that OCCLUDES the opening behind it. The engine caps
  // that wall's far edge at the last stone depth with the count-1 flank tip (img6 18 LEFT
  // / img10 22 RIGHT) + the banked corner (83/87 + lastStoneDepth), and draws NO open
  // side-surface past it. FRAME-SYNCED gx126-gy121-f3 (LEFT 2-2-2-0): the stone run is
  // d0..d2 → STONE_WALL {15,16,17→capped}, flank tip 18 + corner 85 at d2, and the d3
  // opening is occluded (no 137/165). Reaches 99.63% (the residual is the single-capture
  // deep special 108, left as documented residue). Detect the run length here.
  const nearStoneJogRun = nearStoneJogRunLength(block, party, visible, side);
  const jogLastDepth = nearStoneJogRun - 1;
  const jogFlankTip = side === 'left' ? 18 : 22; // img6 / img10 count-1 flank tip
  // Re-walk the corridor to read the per-depth side corner edge.
  let [cgx, cgy] = step(gx, gy, facing, 0, -1); // entry pull-back
  let openRun = 0;
  let prevStone = false;
  // Whether ANY visible passage (open OR door corner) precedes this depth. A stone
  // wall reached THROUGH a passage is a receding side wall the eye sees down the
  // corridor — it must emit. A stone wall at the party's OWN near cell with no
  // preceding passage is the near full-height occluder (handled elsewhere / drawn
  // by the engine's near piece, NOT the receding base+d) and stays excluded.
  let passedPassage = false;
  for (let d = 0; d < DEPTH_BOUND; d++) {
    [cgx, cgy] = step(cgx, cgy, facing, 0, 1);
    if (!visible.includes(d)) break;
    const edge = corner(block, cgx, cgy, facing);
    if (edge === 0) {
      // A near-stone JOG occludes the opening behind it — suppress the open side-surface
      // for the depths past the jog's stone run (the wall blocks the view of the opening).
      if (nearStoneJogRun > 0 && d >= nearStoneJogRun) { passedPassage = true; continue; }
      openRun += 1;
      const count = Math.min(openRun, 3);
      for (let k = 0; k < count; k++) {
        out.push(bases[k]! + d); // ceiling
        out.push(bases[k]! + d + 28); // floor twin
      }
      prevStone = false;
      passedPassage = true;
    } else if (edge === 2) {
      openRun = 0; // stone corner resets the open run
      void prevStone;
      const front = forwardEdge(block, cgx, cgy, facing);
      const skipDoorStop = d === stop && front === 3;
      // Emit the receding stone wall (base + d) UNLESS it's a door-capped stop. The
      // near-cell stone occluder (a CONTINUOUS near-stone wall) is handled separately
      // by generateNearStoneFlank (suppressed at the top of this fn), so a stone corner
      // reached here is a turned-corridor / stone-jog side wall and DOES emit at its
      // depth — INCLUDING d0 (the near stone wall at the party's own cell). FRAME-SYNCED
      // gx126-gy121-f3 (LEFT 2-2-2-0, a stone-from-d0 jog that opens at d3) draws the
      // d0 stone `15` — the prior `firstStoneOfNearRun` skip came from a stale transient
      // capture (the frame-synced ground truth has it). +2816px on that view.
      if (nearStoneJogRun >= 2 && d === jogLastDepth) {
        // The jog's far edge (only for a RECEDING jog, run ≥ 2): cap with the count-1
        // flank tip + the banked corner (83/87 + depth) instead of the plain receding
        // stone index (frame-synced gx126-gy121-f3: d2 draws flank 18 + corner 85, NOT
        // stone 17). A length-1 jog (just d0, e.g. gx124-gy121-f3 LEFT 2-0-0-0) has no
        // far flank edge — it draws the plain near stone wall (STONE_WALL + 0).
        out.push(jogFlankTip);
        out.push((side === 'left' ? 83 : 87) + d);
      } else if (!skipDoorStop) {
        out.push(STONE_WALL_BASE[side] + d);
      }
      prevStone = true;
    } else {
      openRun = 0; // a DOOR/recess corner (edge 1|3) resets the run; its recede is the
      // door-recess family (documented residue, not emitted by this side-wall fn).
      prevStone = false;
      passedPassage = true; // a door is a visible passage forward
    }
  }
  return out;
}

/** Full-height receding STONE side-wall base index per screen side (img3/img7 family,
 *  w4 h112; the wall a solid corridor side draws at perspective depth d as base + d).
 *  LEFT 15, RIGHT 19 — confirmed against v7 (RIGHT) + the freeroam captures (LEFT). */
const STONE_WALL_BASE = { left: 15, right: 19 } as const;

/**
 * The length of a NEAR-STONE JOG run on `side`: the # of contiguous STONE corner depths
 * starting at the party's own cell (d0) that is then followed by an OPEN corner (the
 * jog — the near stone wall occludes the opening behind it). Returns 0 when the side is
 * not a stone-from-d0 run that opens (a pure stone run to the stop, a door-interleaved
 * continuous wall, or an open-from-d0 side are all 0). Frame-synced gx126-gy121-f3 LEFT
 * 2-2-2-0 → 3.
 */
function nearStoneJogRunLength(
  block: MazeBlock,
  party: MazeParty,
  visible: number[],
  side: 'left' | 'right',
): number {
  const { gx, gy, facing } = party;
  const corner = side === 'left' ? cornerL : cornerR;
  let [jx, jy] = step(gx, gy, facing, 0, -1);
  let run = 0;
  let opensAfter = false;
  for (let d = 0; d < DEPTH_BOUND; d++) {
    [jx, jy] = step(jx, jy, facing, 0, 1);
    if (!visible.includes(d)) break;
    const e = corner(block, jx, jy, facing);
    if (e === 2 && run === d) run = d + 1; // extend the contiguous stone run from d0
    else if (e === 0 && run > 0) { opensAfter = true; break; }
    else break; // a door (or non-d0 open) breaks the pure stone-from-d0 jog
  }
  return opensAfter ? run : 0;
}

// ---------------------------------------------------------------------------
// THE NEAR-STONE WALL FLANK family (the asymmetric near-stone occluder).
//
// RE refined 2026-06-09 (maze-masked-generation parity-odd ceiling pass). When ONE
// corridor side is a CONTINUOUS WALL (never open — every visible-depth corner is
// stone OR a door, code != 0) and at least one of those corners is STONE, the engine
// does NOT draw the per-depth receding stone wall (STONE_WALL_BASE + d). Instead it
// fills that side's near band with the NEAR-WALL FLANK STACK — the same img4/5/6
// (LEFT 16/17/18) / img8/9/10 (RIGHT 20/21/22) panels the entrance corridor draws as
// its near side walls — plus the full-height corner piece (83 LEFT / 87 RIGHT), and
// (RIGHT only) the thin outer-edge vertical 118 (img41, destX 30, w1 h95). All drawn
// through the masked-mirror branch in a parity-ODD frame (twins 16↔20, 17↔21, 18↔22,
// 83↔87). FRAME-SYNCED ground truth: gx127 gy121 f1 (RIGHT profile 3-2-3-2, a
// door/stone-alternating continuous wall) emits exactly {20,21,22} + 87 + OR 118 and
// reaches the 99.16% ceiling. The CONTINUOUS-WALL gate (no open corner on that side)
// is what distinguishes it from a turned corridor that OPENS at some depth (gx126 f3
// LEFT 2-2-2-0, gx127 gy122 f3 RIGHT 0-2-2-0) — those draw the per-depth STONE_WALL +
// side-surface families instead, and this near-flank family does NOT fire (verified
// no-spurious across all freeroam captures).
// ---------------------------------------------------------------------------

/** The near-wall FLANK STACK + corner indices for a side, used when that side is a
 *  continuous near-stone wall. LEFT = img4/5/6 flank {16,17,18} + corner 83; RIGHT =
 *  img8/9/10 flank {20,21,22} + corner 87. The thin outer-edge vertical (118 RIGHT) is
 *  a per-view edge detail gated separately (see generateNearStoneFlank): it appears for
 *  a DOOR-interleaved wall (gy121-f1 R 3-2-3-2 → 118) but is RUN-DEPENDENT/absent for a
 *  pure-stone wall (v7/v10 R 2-2-2-3 captured 110 / none — the documented oscillation).*/
const NEAR_STONE_FLANK = {
  left: { flank: [16, 17, 18], corner: 83 },
  right: { flank: [20, 21, 22], corner: 87 },
} as const;

/**
 * Whether `side` is a CONTINUOUS near-stone wall in this view: every visible-depth
 * corner edge on that side is non-open (stone code 2 or door code 3) AND at least one
 * is STONE. Such a side is filled by the near-flank stack (NEAR_STONE_FLANK), not the
 * per-depth receding stone wall. Reads the visible depths only.
 */
function isContinuousNearStoneWall(
  block: MazeBlock,
  party: MazeParty,
  visible: number[],
  side: 'left' | 'right',
): boolean {
  const { gx, gy, facing } = party;
  const corner = side === 'left' ? cornerL : cornerR;
  let [cgx, cgy] = step(gx, gy, facing, 0, -1);
  let sawStone = false;
  let allWalled = true;
  for (let d = 0; d < DEPTH_BOUND; d++) {
    [cgx, cgy] = step(cgx, cgy, facing, 0, 1);
    if (!visible.includes(d)) break;
    const edge = corner(block, cgx, cgy, facing);
    if (edge === 0) allWalled = false;
    if (edge === 2) sawStone = true;
  }
  return allWalled && sawStone;
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
    // the viewport center; no side-wall surfaces (they'd be behind the wall). The
    // closed-front family OR-emits 0/83/87 for a STONE-FRAMED CLOSED DOORWAY (front==3
    // framed by solid corners both sides — the flat dead-end wall, at any facing) and
    // for a HEAD-ON door (facing 2/3). A facing-0/1 NON-stone-framed closed front
    // (gy123-f1's open archway) emits nothing (its wall is the door-recess residue).
    // See generateClosedFrontNearWall for the full law.
    const closedDoorway = isStoneFramedClosedDoorway(block, party);
    return [
      ...generateSkeletonIndices(visible),
      ...generateClosedFrontNearWall(visible, party.facing, closedDoorway),
    ];
  }
  // A near-stone JOG on either side occludes the corridor's deep stop, so the deep-solid
  // FAR-closed wall family ({leaf,83,87}+stop) does NOT fire (it would land behind the
  // near stone wall — spurious; frame-synced gx126-gy121-f3 has no {3,86,90}).
  const jogOccludes =
    nearStoneJogRunLength(block, party, visible, 'left') > 0 ||
    nearStoneJogRunLength(block, party, visible, 'right') > 0;
  return [
    ...generateSkeletonIndices(visible),
    ...generateSideWall(block, party, visible, 'left'),
    ...generateSideWall(block, party, visible, 'right'),
    ...generateNearStoneFlank(block, party, visible, 'left'),
    ...generateNearStoneFlank(block, party, visible, 'right'),
    ...(jogOccludes ? [] : generateFarClosedWall(block, party, visible)),
  ];
}

/**
 * The NEAR-STONE WALL FLANK placement indices for one side, emitted when that side is
 * a CONTINUOUS near-stone wall (isContinuousNearStoneWall): the near-flank stack
 * {16,17,18} (LEFT) / {20,21,22} (RIGHT) + the full-height corner 83/87 + (RIGHT) the
 * thin outer vertical 118. Empty otherwise. These mirror through the parity-ODD masked
 * branch (twins 16↔20, 17↔21, 18↔22, 83↔87); 118 stays OR (the LEAF_OR_SET-style
 * centered/edge piece). Byte-exact addition for gx127 gy121 f1 (RIGHT 3-2-3-2 → the
 * 99.16% ceiling).
 */
function generateNearStoneFlank(
  block: MazeBlock,
  party: MazeParty,
  visible: number[],
  side: 'left' | 'right',
): number[] {
  if (!isContinuousNearStoneWall(block, party, visible, side)) return [];
  const fam = NEAR_STONE_FLANK[side];
  const out: number[] = [...fam.flank, fam.corner];
  // The thin outer-edge vertical (118, img41 destX 30) shows the deeper structure through
  // a DOOR-INTERLEAVED near wall (a corner code 3 within the run). It does NOT appear for
  // a pure-stone wall (the v7/v10 oscillation). Gate on a door corner present in the run.
  if (side === 'right' && hasDoorCornerInRun(block, party, visible, side)) out.push(118);
  return out;
}

/** Whether the near wall on `side` has a DOOR corner (code 3) in the NEAR band (depth
 *  0 or 1). A door at the wall's FAR end (d3) does not let the edge detail through —
 *  only a near door (gy121-f1 doors at d0/d2) does; v7/v10's lone d3 door does not. */
function hasDoorCornerInRun(
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
    if (d <= 1 && corner(block, cgx, cgy, facing) === 3) return true;
  }
  return false;
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
  // The far near-wall family (NEAR_WALL leaf + corner-L 83 + corner-R 87, banked to
  // the stop depth) caps the corridor when:
  //   (1) a CLOSED DOORWAY (door framed by stone, code 3) closes the view — byte-exact
  //       vs v1 (door at d2 → {2,85,89}); OR
  //   (2) a SOLID wall (code 2) closes the view at a DEEP stop (depth ≥ 2). At a deep
  //       stop the far wall is a distinct small piece centred at the vanishing point
  //       (gx124gy121f0: solid wall at d2 → {2,85,89} fills the centre void). At a
  //       SHALLOW solid stop (depth 1) the wall merges with the near side surface and
  //       NO distinct far piece is drawn — v5 (solid wall at d1) has no {1,84,88}, so
  //       the depth bound preserves v5's byte-exact set.
  const closedDoor = front === 3 && isSolid(cL) && isSolid(cR);
  const deepSolid = front === 2 && stop >= 2;
  // HEAD-ON DOOR (look-back pass 2026-06-09). A door (code 3) viewed head-on
  // (facing 2/3) caps the corridor as a closed gate even with OPEN side corners —
  // the same closed-front near-wall family banked to the stop depth. EYEBALL-
  // confirmed vs the engine for gx127 gy122 f2 (door at the corridor end, the gate
  // recessed into the far wall). The colourful portcullis-leaf detail is the
  // documented door-recess residue; the {leaf,83,87}+stop family draws the gate's
  // stone frame + recess structure (no void).
  const headonDoor = front === 3 && (facing === 2 || facing === 3);
  if (!closedDoor && !deepSolid && !headonDoor) return [];
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
  // STRAIGHT-CORRIDOR gate (added 2026-06-09, maze-freeroam validation). The flank
  // mirror is the symmetric near-wall blit of a STRAIGHT corridor; it only renders
  // correctly when the passage stays open one cell DEEPER too (depth-1 corners open,
  // or the view stops at depth 0). When a side corner goes stone at depth 1 (e.g.
  // gx127 gy122 f3, cornerR=2 at depth 1) the engine draws a DIFFERENT (asymmetric)
  // masked set, and emitting the canonical symmetric flanks there is SPURIOUS — it
  // measurably REGRESSES that view's pixel parity (82%→72% through the wired path).
  // The entrance / v5 / v11 corridors keep depth-1 corners open and are unaffected.
  if (visible.includes(1)) {
    const [c1x, c1y] = step(gx, gy, facing, 0, 1); // one cell forward
    if (cornerL(block, c1x, c1y, facing) !== 0 || cornerR(block, c1x, c1y, facing) !== 0) {
      return [];
    }
  }
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
      // SLOT-AWARE orientation gate (the slot/face attribution, corrected by the
      // dectrace real-move emit trace — docs/re/findings/maze-decoration-generation
      // .json `decoration-slot-gate-from-trace`). The FRONT cell is classified by
      // classify_front_side (0x3828), whose gate is `orient2 == facing` (0x3af1).
      // The LATERAL neighbours (LEFT/RIGHT) are classified by the CORNER classifiers
      // (corner-L 0x3c11 / corner-R 0x3dce), whose gate is `(orient2 + 1) % 4 ==
      // facing` (0x3d5b: inc; idiv 4). So a decoration renders on a face ONLY when
      // its slot's gate matches:
      //   front: orient2 == facing
      //   left/right: (orient2 + 1) % 4 == facing
      // For level-0 (all orient2 == 0) this means the FRONT face decorates at facing
      // 0 (north) and the lateral faces would decorate only at facing 1 — i.e. the
      // fountain (gx126 column, orient2 0) renders as a FRONT wall when the party
      // stands IN that column facing north, NOT as a LEFT side wall when passing it
      // in the adjacent gx127 corridor. This is the slot offset the eyeball pass saw
      // (view-case-09 rendered on the FRONT wall while the model attributed LEFT) and
      // the dectrace confirmed: the gy121 LEFT-slot fountain emits NO decoration —
      // its visual is the ordinary side-wall surface family.
      const gateMatches = slot === 'front'
        ? o === facing
        : ((o + 1) & 3) === facing;
      if (!gateMatches) continue;
      hits.push({ depth: d, slot, gx: sx, gy: sy, special4: sp, orient2: o, shapeCode: decorationShapeCode(sp) });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// THE PARITY-ODD WHOLE-FRAME MASKED LAW (the generalized masked-family generator —
// 2026-06-09 frame-synced pass). RE pinned in docs/re/findings/maze-masked-generation
// .json (parity_odd_masked_law). The unblock: the freeroam captures are now
// FRAME-SYNCED (each view's call-list composes to its own framebuffer ≥98% for the
// clean views; gx126gy121f3 99.95%, gx127gy122f0 99.45%, gx127gy121f1 99.16%,
// gx127gy123f0 98.15%), so the captured masked sets are RELIABLE, reproducible
// ground truth (was 29–84% transient before).
//
// DECISIVE FINDING. The PARITY of (gx+gy+facing) selects the whole-frame branch:
//   - parity-EVEN → the FORWARD-OR branch: side walls drawn OR-direct (generateCallist),
//     the near flanks via the few masked-mirror calls (generateNearFlankMasked).
//   - parity-ODD  → the WHOLE FRAME is drawn through the MASKED-mirror branch. The
//     engine emits the SAME placement geometry the parity-EVEN OR generator computes
//     (generateCallist's index SET — verified a near-exact match for gx127gy121f1:
//     the engine's masked-DST set == generateCallist ∪ {21,87,118}), but each piece
//     is a MASKED blit, not an OR blit. A masked piece drawn mirrored ≠ the same piece
//     drawn OR-direct (the mirror flips it), so the generator MUST emit them as masked.
//
// THE CONVERSION (OR index → masked call). For a parity-ODD view, each generated OR
// placement index `idx` becomes a masked call `{src: mirrorTwin(idx), dst: idx}`:
//   - ceiling/floor PERSPECTIVE twins (122–125 / 150–153) are CENTERED → self-mirror
//     (src == dst): the engine emits `122→122`, `150→150`, …;
//   - SIDE-WALL panels (the LEFT 126–137 / RIGHT 138–149 ceiling banks + the 154–165 /
//     166–177 floor banks) are drawn as the mirror of the OPPOSITE-side bank: the
//     engine emits `138→134` (RIGHT-bank src mirrored into LEFT-bank dst), `143→131`,
//     `148→128`, etc. The pairing is bank-REVERSED (LEFT bank A↔RIGHT bank C, B↔B,
//     C↔A) so the geometry mirrors about page col 20;
//   - the NEAR-WALL CORNER/FLANK families (leaf 0 self; corners 83↔87/84↔88/85↔89/
//     86↔90; flanks 16↔20/17↔21/18↔22; full-height occluders 6↔9; the count-pairs
//     4↔13/7↔10) mirror by the col-20 law (`src.destX + dst.destX + dst.count == 40`).
//   - the 6 top-strip chrome pieces stay OR (they are emitted in EVERY frame, both
//     branches — verified across all 5 parity-odd captures).
// The COMPOSITOR is byte-exact (maze-masked-mirror.json), so emitting these masked
// calls produces the engine's mirrored pixels: composing the engine's OWN masked
// set reaches the per-view self-repro ceiling (gx127gy122f0 99.45%, gx127gy121f1
// 99.16%, gx127gy122f2 97.45%, gx127gy123f1 83.94% — validate-freeroam-fixture.ts),
// and the GENERATED set (generateCallist DST + this twin) reaches the same ceiling
// where the generated DST set matches (the clean views).
//
// RESIDUE (documented, NOT papered over): for the deep-recess views (gx124gy121f0)
// the engine also masks a DOOR-RECESS family (36–81: the deep-door perspective
// pieces) whose pairing is REVERSED vs the side-wall law (src = the SAME-side deeper
// slot, not the opposite-side mirror); those are the decompiler-resistant ray-march
// residue (maze-wall-family-seeding.json) — left as the documented per-view floor.
// The full-height stone-wall mirror (15↔19) similarly differs (gx127gy123f1's 19→15).
// ---------------------------------------------------------------------------

/** The 6 constant top-strip chrome pieces (emitted OR in EVERY frame, both branches). */
const TOP_STRIP_SET = new Set<number>(EMIT_BASES.TOP_STRIPS);

/**
 * The MIRROR-TWIN of a placement index: the index whose image, drawn through the
 * masked-mirror branch into THIS index's geometry, reproduces the engine's masked
 * blit. Centered pieces (ceiling/floor perspective twins, the leaf) self-mirror
 * (twin == idx). Side-wall pieces mirror to the bank-reversed opposite side; the
 * near-wall corner/flank families mirror by the col-20 law. Built explicitly from
 * the frame-synced engine masked pairings (maze-masked-generation.json). Returns
 * `idx` unchanged for any index with no known mirror (self-mirror fallback).
 */
export function mirrorTwin(idx: number): number {
  return MIRROR_TWIN.get(idx) ?? idx;
}

const MIRROR_TWIN: Map<number, number> = (() => {
  const m = new Map<number, number>();
  const pair = (a: number, b: number) => {
    m.set(a, b);
    m.set(b, a);
  };
  const self = (lo: number, hi: number) => {
    for (let i = lo; i <= hi; i++) m.set(i, i);
  };
  // CENTERED perspective ceiling/floor twins → self-mirror.
  self(122, 125); // ceiling 122+d
  self(150, 153); // floor 150+d
  // SIDE-WALL ceiling banks: LEFT 126–129(A)/130–133(B)/134–137(C) mirror to the
  // bank-REVERSED RIGHT 146–149(C)/142–145(B)/138–141(A) (slot-for-slot).
  for (let s = 0; s < 4; s++) {
    pair(126 + s, 146 + s);
    pair(130 + s, 142 + s);
    pair(134 + s, 138 + s);
    // SIDE-WALL floor banks: LEFT 154–157/158–161/162–165 ↔ RIGHT 174–177/170–173/166–169.
    pair(154 + s, 174 + s);
    pair(158 + s, 170 + s);
    pair(162 + s, 166 + s);
  }
  // NEAR full-height wall: leaf 0 self; the four corner pieces 83↔87, 84↔88, 85↔89,
  // 86↔90 (col-20 mirror, byte-exact in the gy121-f2 gate capture).
  m.set(0, 0);
  pair(83, 87);
  pair(84, 88);
  pair(85, 89);
  pair(86, 90);
  // NEAR-WALL FLANK families (imgIdx 0/4/5/6/8/9/10): the full-height occluders 6↔9,
  // the count-3 panels 16↔20/17↔21/18↔22, the count-4/count-3 flank pairs 4↔13/7↔10.
  pair(6, 9);
  pair(16, 20);
  pair(17, 21);
  pair(18, 22);
  pair(4, 13);
  pair(7, 10);
  m.set(1, 1); // far-closed leaf self
  return m;
})();

/**
 * Convert a parity-EVEN OR placement-index SET (generateCallist) into the parity-ODD
 * WHOLE-FRAME MASKED call list: each placement becomes a masked call `{src:
 * mirrorTwin(idx), dst: idx, mode:'or'}`, except the top-strip chrome (stays OR).
 *
 * This is the generalized masked-family generator: it reproduces the engine's
 * masked-mirror emission for parity-ODD views (where the whole frame is drawn through
 * the masked branch), reaching the per-view self-repro ceiling for the views whose
 * generated index SET matches the engine's (the clean off-axis corridors). See the
 * PARITY-ODD WHOLE-FRAME MASKED LAW block.
 */
export function generateParityOddMasked(block: MazeBlock, party: MazeParty): CallList {
  const out: CallList = [];
  const set = [...generateCallist(block, party), ...generateNearOccluderColumns(block, party)];
  // The CENTERED far-closed / near-wall LEAF (placement `0 + stop`, the img0 flat
  // doorway/wall face at the corridor vanishing point) is drawn OR-DIRECT even in the
  // parity-ODD branch — its image is centered on page col 20, so the engine emits a
  // plain OR-blit (not a self-mirror). VERIFIED frame-synced: gy122-f0 emits `OR 1`
  // (leaf 0 + stop 1), NOT a masked `1→1` (which lands the wrong half: 90%→99.45%).
  // The flanking corners (83/87 + stop) STILL mirror (84↔88) — only the leaf stays OR.
  const leafOr = new Set<number>(LEAF_OR_SET(block, party));
  // The near-stone wall's thin outer-edge vertical (118, img41 destX 30) is OR-direct
  // even in the parity-ODD branch (it sits at the page edge, not mirrored — frame-synced
  // gy121-f1 emits `OR 118`).
  leafOr.add(118);
  for (const idx of set) {
    if (TOP_STRIP_SET.has(idx) || leafOr.has(idx)) {
      out.push({ kind: 'OR', src: idx });
    } else {
      out.push({ kind: 'masked', src: mirrorTwin(idx), dst: idx, mode: 'or' });
    }
  }
  return out;
}

/** The centered LEAF placement index that stays OR-direct in the parity-ODD branch:
 *  the far-closed-wall leaf (`0 + stop`, the img0 flat doorway face at the corridor
 *  vanishing point) when the corridor caps at a CLOSED DOORWAY or a HEAD-ON door. Its
 *  image is centered on page col 20 so the engine OR-blits it rather than self-mirroring
 *  (frame-synced gy122-f0: `OR 1`, not masked `1→1`). The flanking corners (83/87 + stop)
 *  STILL mirror. The leaf is NOT kept OR for a DEEP-SOLID stop (the `{2,85,89}` family is
 *  itself spurious there — the engine draws the door-recess family instead). */
function LEAF_OR_SET(block: MazeBlock, party: MazeParty): number[] {
  const visible = computeVisibleDepths(block, party);
  if (visible.length < 2) return [];
  const stop = visible[visible.length - 1]!;
  const { gx, gy, facing } = party;
  let [cgx, cgy] = step(gx, gy, facing, 0, -1);
  for (let d = 0; d <= stop; d++) [cgx, cgy] = step(cgx, cgy, facing, 0, 1);
  const front = forwardEdge(block, cgx, cgy, facing);
  const cL = cornerL(block, cgx, cgy, facing);
  const cR = cornerR(block, cgx, cgy, facing);
  const closedDoor = front === 3 && isSolid(cL) && isSolid(cR);
  const headonDoor = front === 3 && (facing === 2 || facing === 3);
  return closedDoor || headonDoor ? [EMIT_BASES.NEAR_WALL + stop] : [];
}

/**
 * The NEAR full-height OCCLUDER COLUMNS (placements 6 / 9, the img0 w14 h87 stone
 * jambs) the engine draws when a corridor caps at a STONE-FRAMED CLOSED DOORWAY one
 * cell ahead (the visible stop is depth ≥ 1 with front==3 framed by solid corners
 * both sides). The columns frame the recessed closed doorway at the corridor end.
 * Byte-exact addition for gx127 gy122 f0 (the deep corridor that ends in a closed
 * doorway one cell ahead) — its frame-synced capture emits `9→6` / `6→9` masked
 * (lifts that view 67%→90%). The predicate is the stone-framed-doorway-at-the-stop;
 * it does NOT fire for an OPEN-framed head-on door (gx127 gy122 f2, both corners
 * open at the stop) or for views that cap at depth 0 — verified no regression across
 * the parity-odd captures. Emitted only in the parity-ODD masked branch (the columns
 * are drawn through the masked-mirror branch, mirror twin 6↔9). */
function generateNearOccluderColumns(block: MazeBlock, party: MazeParty): number[] {
  const visible = computeVisibleDepths(block, party);
  const stop = visible[visible.length - 1]!;
  if (stop < 1) return []; // depth-0 caps are handled by the near-wall families
  const { gx, gy, facing } = party;
  let [cgx, cgy] = step(gx, gy, facing, 0, -1);
  for (let d = 0; d <= stop; d++) [cgx, cgy] = step(cgx, cgy, facing, 0, 1);
  const front = forwardEdge(block, cgx, cgy, facing);
  const cL = cornerL(block, cgx, cgy, facing);
  const cR = cornerR(block, cgx, cgy, facing);
  return front === 3 && isSolid(cL) && isSolid(cR) ? [6, 9] : [];
}

// ---------------------------------------------------------------------------
// THE HEAD-ON-DOOR ARCHWAY FRAME (the entrance gate look-back — 2026-06-09
// frame-synced pass). RE pinned in docs/re/findings/maze-masked-generation.json
// (head_on_door_archway). The user's report: "turning around to look back at the
// entrance gate renders the gate superimposed on a flat wall, with no arch around
// it." The frame-synced capture (gx127 gy121 f2, the look-back at the entrance door)
// reproduces 89.21% from its OWN call-list — and that call-list is the ORNATE ARCHWAY
// FRAME, identical to the entrance corridor's (gy121-f0) OR set: the near full-height
// COLUMNS (6, 9), the near-wall FLANK strips (16–22), the DOOR-RECESS archway frame
// (23–34: the img11–img22 arch/column pieces), the ceiling/floor PERSPECTIVE twins
// (122–125, 150–153), the depth-0 side-wall pieces (134, 138, 162, 166) and the 6
// strips. The generator previously emitted the flat-wall approximation {0,83,87}
// (62.44%) for this head-on door — a flat wall the gate is superimposed on, exactly
// the bug. Replacing it with the archway frame OR set reaches the 89.21% ceiling
// (eyeball: the stone arch + columns frame the gate; the residual ~11% is the
// colourful portcullis-LEAF grid, a decoration draw path beyond the OR/masked
// background compose — the same class as the entrance's 18px deep-door residual).
//
// THE PREDICATE. This fires for a HEAD-ON DOOR (facing 2/3) at the party's OWN cell
// (front==3) with OPEN side corners — i.e. a door viewed head-on that is NOT a
// stone-framed closed doorway (which is a flat dead-end wall, handled by
// generateClosedFrontNearWall). Enumerated over region 0: the entrance door cell
// (gy121-f2) is the look-back gate; a stone-framed doorway (gy123-f0/gy124-f2) is a
// flat wall, not an arch. So the archway never fires on a flat dead-end or an open
// corridor.
// ---------------------------------------------------------------------------

/** The ornate ARCHWAY FRAME OR set the engine draws for the entrance-gate look-back
 *  (a head-on door at the party's own cell with open side corners). The near columns +
 *  flank strips + door-recess arch frame + the depth-0 perspective/side-wall pieces.
 *  Byte-exact vs the gy121-f2 frame-synced capture (89.21% — the ceiling; the residual
 *  is the portcullis-leaf decoration). */
const ARCHWAY_FRAME = [
  6, 9, // near full-height columns (img0, the gate's stone jambs)
  16, 17, 18, 20, 21, 22, // near-wall flank strips (img4/5/6/8/9/10)
  23, 25, 26, 28, 29, 31, 32, 34, // DOOR-RECESS archway frame (img11–img22 arch pieces)
  122, 123, 124, 125, // ceiling perspective twins
  150, 151, 152, 153, // floor perspective twins
  134, 138, 162, 166, // depth-0 side-wall pieces
] as const;

/**
 * Whether the party stands AT a HEAD-ON door (facing 2/3, front==3) with OPEN side
 * corners — the entrance-gate look-back. The engine fills the viewport with the
 * ornate archway frame (the columns + door-recess arch), NOT a flat wall.
 */
function isHeadOnDoorArchway(block: MazeBlock, party: MazeParty): boolean {
  const { gx, gy, facing } = party;
  if (facing !== 2 && facing !== 3) return false;
  const [c0x, c0y] = step(gx, gy, facing, 0, 0);
  return (
    forwardEdge(block, c0x, c0y, facing) === 3 &&
    !isSolid(cornerL(block, c0x, c0y, facing)) &&
    !isSolid(cornerR(block, c0x, c0y, facing))
  );
}

// ---------------------------------------------------------------------------
// THE HEAD-ON-DOOR-AHEAD ARCHWAY (the look-back with the gate ONE CELL AHEAD —
// 2026-06-09 parity-odd ceiling pass). When the party looks head-on (facing 2/3)
// down an OPEN passage that caps at a door at depth `stop ≥ 1` (the look-back where
// the entrance gate is one cell ahead — gx127 gy122 f2), the engine draws the open
// passage's NEAR-WALL FLANK family at the party's own cell (the count-pairs 4/7/10/13
// OR + the flank panels 17/18/21/22 masked) framing the corridor, PLUS the door-recess
// arch banked to the stop depth (`{23,26,29,32} + stop` OR — the recessed gate at the
// corridor end), on top of the ceiling/floor twins + side walls (generateCallist). This
// REPLACES the spurious far-closed flat gate ({1,84,88}) the parity-odd converter would
// emit. FRAME-SYNCED gx127 gy122 f2 → 97.45% (the ceiling; residual = the portcullis-leaf
// decoration grid). The predicate distinguishes it from the door-AT-own-cell archway
// (isHeadOnDoorArchway, stop 0) and the stone-framed closed doorway (a flat wall).
// ---------------------------------------------------------------------------

/** The near-wall open-passage FLANK count-pairs (img2/img7-family, the 4/7/10/13 strips
 *  the entrance corridor draws as its close side walls) — OR-direct at the party's own
 *  cell when looking head-on down an open passage to a door ahead. */
const HEADON_NEAR_FLANK_OR = [4, 7, 10, 13] as const;
/** The depth-1 flank PANELS (img5/6/9/10) drawn masked-mirror in the head-on-door-ahead
 *  archway (twins 17↔21, 18↔22). */
const HEADON_NEAR_FLANK_MASKED = [17, 18, 21, 22] as const;
/** The door-recess arch BASE indices (img11/14/17/20 arch pieces); the recessed gate
 *  draws `base + stop` for a door at depth `stop`. */
const DOOR_RECESS_ARCH_BASE = [23, 26, 29, 32] as const;

/**
 * Whether the party looks head-on (facing 2/3) down an OPEN passage that caps at a DOOR
 * one or more cells ahead (the look-back with the gate ahead): open d0 corners + front
 * open at d0, the occlusion stop is a head-on door at depth ≥ 1.
 */
function headOnDoorAheadStop(block: MazeBlock, party: MazeParty): number | null {
  const { gx, gy, facing } = party;
  if (facing !== 2 && facing !== 3) return null;
  const visible = computeVisibleDepths(block, party);
  const stop = visible[visible.length - 1]!;
  if (stop < 1) return null;
  // The party's own cell must be an open passage (the flanks frame an open corridor).
  const [c0x, c0y] = step(gx, gy, facing, 0, 0);
  if (
    forwardEdge(block, c0x, c0y, facing) !== 0 ||
    cornerL(block, c0x, c0y, facing) !== 0 ||
    cornerR(block, c0x, c0y, facing) !== 0
  ) return null;
  // The stop must be a head-on door.
  let [cgx, cgy] = step(gx, gy, facing, 0, -1);
  for (let d = 0; d <= stop; d++) [cgx, cgy] = step(cgx, cgy, facing, 0, 1);
  return forwardEdge(block, cgx, cgy, facing) === 3 ? stop : null;
}

/**
 * The FULL per-view background blit CALL LIST derived from the maze block + party
 * (no captured frame). Three branches, selected by geometry + frame parity:
 *
 *   - HEAD-ON DOOR ARCHWAY (a door at the party's own cell viewed head-on, open
 *     corners): the ornate archway-frame OR set (the entrance-gate look-back) —
 *     reaches the 89.21% ceiling (the portcullis-leaf decoration is the residual).
 *   - PARITY-ODD: the WHOLE FRAME drawn through the masked-mirror branch
 *     (generateParityOddMasked) — the generalized masked-family generator that
 *     reproduces the off-axis/turned corridors' masked side walls.
 *   - PARITY-EVEN (the default): the OR families (generateCallist) + the near-wall
 *     flank masked-mirror calls (generateNearFlankMasked). BYTE-EXACT for the
 *     canonical maze-corridor (gx127 gy121 facing0): the OR set + the 4 near-flank
 *     masked calls (13→4, 10→7, 7→10, 4→13) reach ≥99.9% of the engine viewport.
 *
 * Compose with `composeCallList` / `composeBackgroundFromAsset`.
 */
export function generateFullCallList(block: MazeBlock, party: MazeParty): CallList {
  // HEAD-ON DOOR look-back: the ornate archway frame (the entrance gate). Emit the
  // arch/columns OR set instead of the flat-wall {0,83,87} approximation.
  if (isHeadOnDoorArchway(block, party)) {
    return [
      ...ARCHWAY_FRAME.map((src): BackgroundCall => ({ kind: 'OR', src })),
      ...EMIT_BASES.TOP_STRIPS.map((src): BackgroundCall => ({ kind: 'OR', src })),
    ];
  }
  // HEAD-ON DOOR ONE CELL AHEAD (the look-back with the gate ahead): the open-passage
  // near flanks frame the corridor + the door-recess arch recesses the gate at the stop.
  const headonStop = headOnDoorAheadStop(block, party);
  if (headonStop !== null) {
    // The ceiling/floor twins + side-wall surfaces (drawn through the parity branch),
    // EXCLUDING the spurious far-closed flat gate ({leaf,83,87}+stop / {1,84,88}).
    const farGate = new Set<number>([
      EMIT_BASES.NEAR_WALL + headonStop, 1,
      83 + headonStop, 87 + headonStop, 84, 88,
    ]);
    const parityOdd = (party.gx + party.gy + party.facing) % 2 !== 0;
    const skeleton = generateCallist(block, party).filter((i) => !farGate.has(i));
    const skelCalls: CallList = parityOdd
      ? skeleton.map((idx) =>
          TOP_STRIP_SET.has(idx)
            ? ({ kind: 'OR', src: idx } as const)
            : ({ kind: 'masked', src: mirrorTwin(idx), dst: idx, mode: 'or' } as const),
        )
      : skeleton.map((src) => ({ kind: 'OR', src }) as const);
    return [
      ...skelCalls,
      ...HEADON_NEAR_FLANK_OR.map((src): BackgroundCall => ({ kind: 'OR', src })),
      ...HEADON_NEAR_FLANK_MASKED.map(
        (dst): BackgroundCall => ({ kind: 'masked', src: mirrorTwin(dst), dst, mode: 'or' }),
      ),
      ...DOOR_RECESS_ARCH_BASE.map(
        (b): BackgroundCall => ({ kind: 'OR', src: b + headonStop }),
      ),
    ];
  }
  // PARITY-ODD: the whole frame is drawn through the masked-mirror branch.
  if ((party.gx + party.gy + party.facing) % 2 !== 0) {
    return generateParityOddMasked(block, party);
  }
  // PARITY-EVEN: OR families + the near-flank masked-mirror calls.
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
