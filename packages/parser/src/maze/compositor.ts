/**
 * compositor.ts — STAGE-1 maze wall compositor, ported verbatim from
 * tools/parity/render-maze-frame.ts (RE-validated, 100% byte-exact on the
 * y3 frame's wall region).
 *
 * See tools/parity/render-maze-frame.ts for full RE commentary and the disasm
 * anchors (ega.drv FUN_1c94 / FUN_210c / planar-writer @ file 0x1f6e).
 *
 * SHARED TYPES NOTE:
 *   CompositorCall — exported here (compositor is the natural home: it defines
 *     the per-piece blit contract). flush.ts (Task 6) returns CompositorCall[].
 *   MazeSpan — exported here alongside CompositorCall (both are consumed or
 *     produced by the flush pass which links spans -> calls). build.ts (Task 7)
 *     returns MazeSpan[]. Having both in compositor.ts keeps the pipeline types
 *     co-located and avoids a separate types.ts file.
 *
 * IMPORT DIFF FROM PROTOTYPE:
 *   - PLANE_STRIDE, PAGE_ROW_BYTES imported from @wiz6/data (not redefined here)
 *   - PieceDescriptor imported from @wiz6/data (uses presenceBitmap: Uint8Array,
 *     not bitmap: number[]; all bitmap access sites updated accordingly)
 *   - .js extensions on all relative imports (TS ESM)
 */

import { PLANE_STRIDE, PAGE_ROW_BYTES, type PieceDescriptor, type MazeRenderAssets } from '@wiz6/data';

// Re-export PAGE_ROW_BYTES for callers that only import compositor.
export { PLANE_STRIDE, PAGE_ROW_BYTES };

const PLANE_SRC_OFF = [0, 8, 0x10, 0x18];

// ---------------------------------------------------------------------------
// Internal store record (not exported — only used by the planar writer).
// ---------------------------------------------------------------------------

interface CompositorStore {
  si: number; // source atlas byte offset (plane-0 byte; +8/+0x10/+0x18 = planes 1/2/3)
  di: number; // dest page byte offset
  cl: number; // sub-byte X phase (the shr ax,cl convergence)
  bx: number; // set-mask (post not-bx)
  dx: number; // clear-mask (post xchg dl,dh)
  clipLo?: number | undefined; // screen-x clip window lo (inclusive); columns left of this keep their page value
  clipHi?: number | undefined; // screen-x clip window hi (exclusive); columns at/right of this keep their page value
}

/**
 * The per-store screen-x CLIP mask. Each store writes a 16-bit word covering two
 * page byte-columns (di and di+1 within the row, stride 0x28). EGA bit order: a
 * byte's bit 7 is its leftmost pixel. So in the little-endian word `out`
 * (= page[di] | page[di+1]<<8): bit b in 0..7 maps to screen-x = xbase+7-b (column
 * di), and bit b in 8..15 maps to screen-x = xbase+23-b (column di+1). A set mask
 * bit = pixel INSIDE [clipLo, clipHi) (written); a clear bit keeps the page's
 * original pixel. Pieces with the full viewport clip (72/248) are unaffected in the
 * cropped comparison; clipped pieces (e.g. 72/216) stop their overdraw at clipHi,
 * and complementary pairs (72/216 + 216/248) tile the full width without overwrite.
 */
function clipWord(di: number, clipLo: number, clipHi: number): number {
  const xbase = (di % 0x28) * 8;
  let mask = 0;
  for (let b = 0; b < 16; b++) {
    const x = b < 8 ? xbase + 7 - b : xbase + 23 - b;
    if (x >= clipLo && x < clipHi) mask |= 1 << b;
  }
  return mask & 0xffff;
}

// ---------------------------------------------------------------------------
// Shared pipeline types (exported for flush.ts / build.ts / render.ts).
// ---------------------------------------------------------------------------

/** One FUN_1c94 compositor call: piece byte + screen coords. */
export interface CompositorCall {
  piece: number;   // 1-indexed descriptor index (the piece-string byte)
  x0: number;      // [bp+0xe] screen x (sub-byte): di += x0>>3, cl = x0&7
  arg10: number;   // [bp+0x10] dest row base: di base = arg10 * 0x28
  tile?: number;   // [bp+0xc] source-seg selector (constant 2 for solid walls)
  flags?: number;  // [bp+0x16] H/V flip (0 for corridor walls)
  clipLo?: number; // [bp+0x12] x-clip lo (screen px); columns left of this are suppressed
  clipHi?: number; // [bp+0x14] x-clip hi (screen px); columns at/right of this are suppressed
}

/** One generator span (the 11-byte record the wmaze emitters append @0x50d0). */
export interface MazeSpan {
  x0: number;         // screen x of the near edge (already seam-refined)
  x1: number;         // FUN_1c94 dest-row base (the far/converging edge column)
  clipLo: number;     // viewport x-clip lo (72 for the corridor)
  clipHi: number;     // viewport x-clip hi (248)
  walltype: number;   // 0xff = edge-marker (Pass A only); else FUN_1c94 tile index
  seamIdx: number;    // -> the FUN_1c94 piece byte (the descriptor index)
  depthField: number; // the depth this edge belongs to (flush matches 0x5040)
  seamAlt?: number;   // ANIMATION 2nd-frame piece: the door/recess piece flickers
                      // between seamIdx (phase 0) and seamAlt (phase 1). The engine
                      // toggles a global clock; all animated spans toggle in sync.
                      // Absent = static piece. See deriveDoorCenterpieceSpans + the
                      // recaptured wall-cases (docs/re/findings/maze-deepdoor-drawpath.json).
}

// ---------------------------------------------------------------------------
// Planar-writer primitives (verbatim from prototype).
// ---------------------------------------------------------------------------

/**
 * Apply one planar-writer column store to a 4-plane page (plane stride 0x2000).
 * `atlas` is the source segment bytes (ds=0x6a0f base) for this store's group.
 */
export function applyStore(page: Uint8Array, atlas: Uint8Array, s: CompositorStore): void {
  const { si, di, cl, bx, dx, clipLo, clipHi } = s;
  // Per-store screen-x clip: outside [clipLo, clipHi) the page keeps its original
  // pixel. cmask bit set = inside the window (written). Full window when unset.
  const cmask = clipLo !== undefined && clipHi !== undefined ? clipWord(di, clipLo, clipHi) : 0xffff;
  for (let p = 0; p < 4; p++) {
    let ax = ((atlas[si + PLANE_SRC_OFF[p]!] ?? 0) << 8) & 0xffff; // ah:00
    ax = (ax >>> cl) & 0xffff; // shr ax,cl
    ax &= bx; // and ax,bx (set-mask)
    const merged = (((ax & 0xff) << 8) | ((ax >> 8) & 0xff)) & 0xffff; // xchg al,ah
    const base = p * PLANE_STRIDE + di;
    const orig = (page[base]! | (page[base + 1]! << 8)) & 0xffff;
    let d = (orig & dx) & 0xffff; // and ax,dx (clear-mask)
    let out = (d | merged) & 0xffff;
    // Restore clipped-out pixels to the original page value.
    if (cmask !== 0xffff) out = ((out & cmask) | (orig & ~cmask)) & 0xffff;
    page[base] = out & 0xff;
    page[base + 1] = (out >> 8) & 0xff;
  }
}

/**
 * Re-derive the set/clear masks from cl + the source transparency, matching the
 * engine's `rcr` mask build. Equivalent to the captured bx/dx; use this when you
 * only have (si, di, cl) and the atlas, not the live masks.
 */
export function deriveMasks(atlas: Uint8Array, si: number, cl: number): { bx: number; dx: number } {
  const bh = (atlas[si]! & atlas[si + 8]! & atlas[si + 0x10]! & atlas[si + 0x18]!) & 0xff;
  let bx = ((bh << 8) | 0xff) & 0xffff;
  let cf = 1; // stc
  for (let k = 0; k < cl; k++) {
    const ncf = bx & 1;
    bx = ((bx >>> 1) | (cf << 15)) & 0xffff;
    cf = ncf;
  }
  let dx = bx;
  bx = (~bx) & 0xffff; // not bx -> set-mask
  dx = (((dx & 0xff) << 8) | ((dx >> 8) & 0xff)) & 0xffff; // xchg dl,dh -> clear-mask
  return { bx, dx };
}

// ---------------------------------------------------------------------------
// Piece decoder (verbatim from prototype, adapted: d.bitmap -> d.presenceBitmap).
// ---------------------------------------------------------------------------

const COMPOSE_CLEAR = 0xff; // transparent fill

/** Decode a piece's source cells into a compose buffer (FUN_210c). The buffer is
 *  a w-cells x h-rows grid; cell (cx,cy) occupies buffer[(cy*w + cx)*0x20 ..].
 *  Each 8x8 cell is 4 planes of 8 bytes: plane p row r at cell[p*8 + r].
 *  Present cells (presence bit set) merge the source cell (src+=0x20); absent
 *  cells stay 0xff (transparent). Returns the compose buffer. */
export function decodePieceToComposeBuffer(atlas: Uint8Array, d: PieceDescriptor): Uint8Array {
  const cells = d.w * d.h;
  const buf = new Uint8Array(cells * 0x20).fill(COMPOSE_CLEAR);
  let src = d.srcPtr;
  let bmByte = 0;
  let bmBit = 0; // presence bit rotates from bit0 (dl starts 1, rol dl,1)
  // FUN_210c walks cells in the buffer's natural order (row-major: cy outer, cx
  // inner) — the presence bitmap is consumed in the same order.
  for (let i = 0; i < cells; i++) {
    const present = (d.presenceBitmap[bmByte]! >> bmBit) & 1;
    bmBit++;
    if (bmBit === 8) { bmBit = 0; bmByte++; }
    if (present) {
      // 4-plane masked merge of the source cell into the compose cell.
      const dst = i * 0x20;
      for (let r = 0; r < 8; r++) {
        for (let p = 0; p < 4; p++) {
          buf[dst + p * 8 + r] = atlas[src + p * 8 + r]!;
        }
      }
      src += 0x20;
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Planar-writer per-store helper (internal).
// ---------------------------------------------------------------------------

/** One planar-writer column store with masks derived from cl + source
 *  transparency (the validated rcr build). */
function applyStoreDerived(page: Uint8Array, buf: Uint8Array, si: number, di: number, cl: number, clipLo?: number, clipHi?: number): void {
  const { bx, dx } = deriveMasks(buf, si, cl);
  applyStore(page, buf, { si, di, cl, bx, dx, clipLo, clipHi });
}

// ---------------------------------------------------------------------------
// High-level piece blit (verbatim from prototype).
// ---------------------------------------------------------------------------

/** High-level: render one compositor call into the page from the descriptor +
 *  atlas. Computes di/cl from (x0, arg10) and runs the planar writer over the
 *  decoded compose buffer. */
export function renderPieceCall(
  page: Uint8Array,
  atlas: Uint8Array,
  d: PieceDescriptor,
  call: CompositorCall,
): void {
  const buf = decodePieceToComposeBuffer(atlas, d);
  const x0 = call.x0 & 0xffff;
  let cl: number;
  let diColBase: number;
  const rowBase = (call.arg10 * 0x28) & 0xffff;
  if (x0 & 0x8000) {
    const neg = (-((x0 << 16) >> 16)) & 0xffff;
    diColBase = (rowBase - (neg >> 3)) & 0xffff;
    if (neg & 7) diColBase = (diColBase - 1) & 0xffff;
    cl = (8 - (neg & 7)) & 7;
  } else {
    diColBase = (rowBase + (x0 >> 3)) & 0xffff;
    cl = x0 & 7;
  }
  // Writer triple loop. The compose buffer si layout: cell (cx,cy) at
  // (cy*w + cx)*0x20; within a cell, byte (p*8 + r). The writer's si walks: per
  // texel-col it reads si..si+0x18 (the 4 planes of one row? no — bh=src[si]&
  // src[si+8].. = the 4 planes at the SAME byte). si advances +1 per inner step
  // (8 inner = 8 bytes = the 8 rows of plane 0... ), then si+=0x18 to skip to the
  // next cell's first byte vertically. di+=0x28 per inner (down one screen row),
  // di col base +1 per middle cell, di base +0x140 per outer.
  //
  // Concretely (matching the asm): outer = h (cell-rows), middle = w (cells
  // across), inner = 8 (the 8 bytes of a cell's plane-0 = 8 screen rows).
  const w = d.w, h = d.h;
  // Per-span screen-x clip (the engine's [bp+0x12]/[bp+0x14] window). Full-clip
  // pieces (72/248) are unaffected within the cropped viewport; clipped pieces
  // (e.g. 72/216) stop their overdraw, and complementary pairs tile cleanly.
  const clipLo = call.clipLo, clipHi = call.clipHi;
  let si = 0;
  for (let cy = 0; cy < h; cy++) {
    const diOuter = (diColBase + cy * 0x140) & 0xffff;
    let diCol = diOuter;
    for (let cx = 0; cx < w; cx++) {
      let di = diCol;
      for (let k = 0; k < 8; k++) {
        applyStoreDerived(page, buf, si, di, cl, clipLo, clipHi);
        si = (si + 1) & 0xffff;
        di = (di + 0x28) & 0xffff;
      }
      si = (si + 0x18) & 0xffff;
      diCol = (diCol + 1) & 0xffff;
    }
  }
}

// ---------------------------------------------------------------------------
// Top-level entry point (verbatim from prototype).
// ---------------------------------------------------------------------------

/** Render a whole frame's wall pieces into `page` from the compositor call list
 *  + the descriptor table + the source atlas. This is the FROM-GEOMETRY render
 *  (no captured store stream). `page` should start as the floor/ceiling/
 *  background page (the engine composes walls ON TOP of that).
 *
 * @param page        4-plane EGA page (4 * PLANE_STRIDE bytes)
 * @param atlas       Source segment snapshot (ds=0x6a0f base)
 * @param descriptors PieceDescriptor[] from loadMazeAssets() — index 0 = piece 1
 * @param calls       CompositorCall[] from generateCallList() (flush pass)
 */
export function renderFrameFromGeometry(
  page: Uint8Array,
  atlas: Uint8Array,
  descriptors: PieceDescriptor[], // index 0 = piece 1
  calls: CompositorCall[],
): void {
  for (const call of calls) {
    const d = descriptors[call.piece - 1];
    if (!d || d.w === 0 || d.h === 0) continue;
    renderPieceCall(page, atlas, d, call);
  }
}

/** Render a whole frame's wall pieces into `page`, selecting the SOURCE ATLAS +
 *  DESCRIPTORS per call by the call's `tile` (= span.walltype). The engine's
 *  FUN_1c94 resolves the per-tile descriptor-table + atlas segment via
 *  cs:[0x17a+2*tile]+cs:[0x169] (docs/re/findings/maze-tile-atlas-extract.json);
 *  here `assets.atlasByTile[tile]` holds each tile's extracted atlas. A tile not
 *  present in atlasByTile (or a call with no tile) falls back to the tile-2
 *  default (`assets.atlas`/`assets.pieceDescriptors`).
 *
 * @param page    4-plane EGA page (4 * PLANE_STRIDE bytes), pre-filled background
 * @param assets  MazeRenderAssets from loadMazeAssets() (tile-2 default + atlasByTile)
 * @param calls   CompositorCall[] from generateCallList() (each carries .tile)
 */
export function renderFrameFromAssets(
  page: Uint8Array,
  assets: MazeRenderAssets,
  calls: CompositorCall[],
): void {
  for (const call of calls) {
    const tile = call.tile ?? 2;
    const ta = assets.atlasByTile[tile];
    const atlas = ta?.atlas ?? assets.atlas;
    const descriptors = ta?.pieceDescriptors ?? assets.pieceDescriptors;
    const d = descriptors[call.piece - 1];
    if (!d || d.w === 0 || d.h === 0) continue;
    renderPieceCall(page, atlas, d, call);
  }
}
