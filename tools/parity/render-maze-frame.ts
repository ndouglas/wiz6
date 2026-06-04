/**
 * render-maze-frame.ts — STAGE-1 maze wall compositor, ported from the live
 * ega.drv planar writer (file 0x1f6e body, runtime cs=0x6b91 transient copy).
 *
 * This is the FROM-SOURCE wall renderer (NOT a page read-back): given the
 * per-column compositor argument stream (si, di, cl, bx-setmask, dx-clearmask)
 * + the per-group source-atlas snapshots (ds=0x6a0f) + a starting page (the
 * floor/ceiling background), it reproduces the engine's off-screen page wall
 * region BYTE-EXACTLY. Validated at 100% source-bit match across all 1936
 * stores of the reference corridor frame (see
 * docs/re/findings/maze-stage1-compositor.json).
 *
 * The planar writer per column store (disasm-anchored, live cs=0x6b91 ip 0x1dd):
 *   bh = src[si] & src[si+8] & src[si+0x10] & src[si+0x18]   (transparency)
 *   bl = 0xff ; stc ; rcr bx,cl ; dx = bx ; not bx ; xchg dl,dh
 *     -> bx = set-mask, dx = clear-mask  (both rotated by the sub-byte X phase cl)
 *   for plane p in {0,8,0x10,0x18}:
 *     ah = src[si + p] ; ax = ah:00 ; shr ax,cl ; and ax,bx ; xchg al,ah  (merged)
 *     page_word(di + 0x2000*planeIdx) = (page_word & dx) | merged
 *
 * The merge is a WORD store (little-endian) at the page byte-offset di; the
 * sub-byte X phase cl is THE per-column horizontal convergence ("U" placement).
 * Source si walks an 8x8 4-plane cell (8 texel columns, +0x18 to the next
 * cell-row); page di advances +0x28 (one 320px row) per source-row down the
 * screen — so each FUN_1c94 call paints a vertical-strip textured wall quad.
 *
 * IMPORTANT (the source-buffer gotcha): ds=0x6a0f is a MID-FRAME WORK BUFFER
 * that the engine RE-DECODES per FUN_1c94 call (per "group"), so a single
 * end-of-frame snapshot is wrong for early groups. The atlas must be snapshotted
 * at EACH group's first store. See the findings doc for the capture recipe.
 *
 * FROM-GEOMETRY bridge (the (walltype,depth) -> piece -> source-cell mapping,
 * RESOLVED 2026-06-04 — see docs/re/findings/maze-stage1-compositor.json
 * `compositor-bridge`). The wmaze generator emits per-edge SPANS (walltype, x0,
 * x1, seamIdx) [span_append 0x3f8d]; each span drives a sequence of FUN_1c94
 * compositor calls (ega.drv file 0x1c94, live relocated at lin 0x6d6a4). Each
 * call carries a PIECE BYTE (the [bp+0x1a] piece-string, a single byte) + a
 * sub-byte screen x `[bp+0xe]` (=x0) + a dest-row base `[bp+0x10]` (=arg10) +
 * a TILE INDEX `[bp+0xc]` (=2 for solid stone walls -> source seg via
 * cs:[0x169]+cs:[0x17a+2*tile]). The piece byte indexes a DESCRIPTOR TABLE at
 * the source segment (ds=0x514e in the captured run): descriptor (piece-1)*0x18
 * = {srcPtr (u16), w (cells), h (cell-rows), presence-bitmap[0x14]}. FUN_210c
 * decodes the piece's source 8x8 cells (at srcPtr, +0x20/cell, presence-bitmap
 * gated) into a compose buffer; the planar writer then blits it with
 *   di = arg10*0x28 + (x0>>3) ; cl = x0 & 7         (positive-x0 path, file 0x1f15)
 *   di = arg10*0x28 - (|x0|>>3) [-1 if |x0|&7] ; cl = (8-(|x0|&7))&7   (neg-x0)
 * The full pipeline (renderFrameFromGeometry below) reproduces the engine's
 * wall composite at 98.12% in the viewport (the residual ~371px are the tiny
 * seam/corner filler pieces 0xc/0xd/0xf at transparency boundaries; the main
 * wall faces 0xb/0xe are BYTE-EXACT). The floor/ceiling/side OR-blit background
 * is separately tracked (other-writer-or-blit in the findings).
 * Reproduce: `pnpm tsx tools/libretro/trace-maze.ts geom` (patched core).
 */

export interface CompositorStore {
  si: number; // source atlas byte offset (ds=0x6a0f plane-0 byte; +8/+0x10/+0x18 = planes 1/2/3)
  di: number; // dest page byte offset (offset-preserving -> screen via the IDENTITY page->VRAM map)
  cl: number; // sub-byte X phase (the shr ax,cl convergence)
  bx: number; // set-mask (post not-bx) captured/derived
  dx: number; // clear-mask (post xchg dl,dh) captured/derived
}

export const PLANE_STRIDE = 0x2000;
export const PAGE_ROW_BYTES = 40; // 320px / 8
const PLANE_SRC_OFF = [0, 8, 0x10, 0x18];

/**
 * Apply one planar-writer column store to a 4-plane page (plane stride 0x2000).
 * `atlas` is the source segment bytes (ds=0x6a0f base) for this store's group.
 */
export function applyStore(page: Uint8Array, atlas: Uint8Array, s: CompositorStore): void {
  const { si, di, cl, bx, dx } = s;
  for (let p = 0; p < 4; p++) {
    let ax = ((atlas[si + PLANE_SRC_OFF[p]!] ?? 0) << 8) & 0xffff; // ah:00
    ax = (ax >>> cl) & 0xffff; // shr ax,cl
    ax &= bx; // and ax,bx (set-mask)
    const merged = (((ax & 0xff) << 8) | ((ax >> 8) & 0xff)) & 0xffff; // xchg al,ah
    const base = p * PLANE_STRIDE + di;
    let d = (page[base]! | (page[base + 1]! << 8)) & 0xffff;
    d = (d & dx) & 0xffff; // and ax,dx (clear-mask)
    const out = (d | merged) & 0xffff;
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

/**
 * Render the wall region into `page` by replaying all stores (in trace order).
 * `atlasOf(storeIndex)` returns the source-atlas snapshot for that store's group.
 */
export function renderWalls(
  page: Uint8Array,
  stores: CompositorStore[],
  atlasOf: (storeIndex: number) => Uint8Array,
): void {
  for (let i = 0; i < stores.length; i++) applyStore(page, atlasOf(i), stores[i]!);
}

/* ============================================================================
 * FROM-GEOMETRY renderer — the recovered (walltype,depth) -> piece -> source
 * cell bridge, ported from the live ega.drv FUN_1c94 compositor + FUN_210c
 * masked piece decoder + the planar writer (all disasm-anchored, ega.drv file
 * 0x1c94 / 0x210c / 0x1f6e). See docs/re/findings/maze-stage1-compositor.json
 * (compositor-bridge finding).
 *
 * Pipeline per FUN_1c94 call (= one piece blit):
 *   1. Look up the descriptor at (piece-1)*0x18 in the source segment
 *      (cs:[0x169]+cs:[0x17a+2*tile]): {srcPtr (u16), w (cells), h (cell-rows),
 *      presence bitmap}.
 *   2. Decode the piece into a compose buffer (FUN_210c): clear to 0xff
 *      (transparent), walk the presence bitmap; present cell -> 4-plane masked
 *      merge of the 8x8 source cell at srcPtr (+0x20/cell) into the buffer.
 *   3. Run the planar writer (file 0x1f6e): for each source byte, shr ax,cl
 *      (sub-byte X), rcr set/clear masks, merge a WORD into the page at di.
 *      di = arg10*0x28 + (x0>>3); cl = x0&7  (positive-x0 path; the negative-x0
 *      path mirrors). Inner 8 (texel cols, di+=0x28 per = one screen row down),
 *      middle w (cells across, di byte+1 per cell-col), outer h (cell rows,
 *      di+=0x140 per). Source si walks the compose buffer: +1/byte, +0x18/cell.
 * ========================================================================== */

export interface PieceDescriptor {
  srcPtr: number; // byte offset within the source segment to the 4-plane cells
  w: number; // width in 8px cells
  h: number; // height in 8px cell-rows
  bitmap: number[]; // presence bitmap (desc+4..), bit rotates from lsb per cell
}

export interface CompositorCall {
  piece: number; // 1-indexed descriptor index (the piece-string byte)
  x0: number; // [bp+0xe] screen x (sub-byte): di += x0>>3, cl = x0&7
  arg10: number; // [bp+0x10] dest row base: di base = arg10 * 0x28
  tile?: number; // [bp+0xc] source-seg selector (constant 2 for solid walls)
  flags?: number; // [bp+0x16] H/V flip (0 for corridor walls)
}

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
    const present = (d.bitmap[bmByte]! >> bmBit) & 1;
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
  let si = 0;
  for (let cy = 0; cy < h; cy++) {
    const diOuter = (diColBase + cy * 0x140) & 0xffff;
    let diCol = diOuter;
    for (let cx = 0; cx < w; cx++) {
      let di = diCol;
      for (let k = 0; k < 8; k++) {
        applyStoreDerived(page, buf, si, di, cl);
        si = (si + 1) & 0xffff;
        di = (di + 0x28) & 0xffff;
      }
      si = (si + 0x18) & 0xffff;
      diCol = (diCol + 1) & 0xffff;
    }
  }
}

/** One planar-writer column store with masks derived from cl + source
 *  transparency (the validated rcr build). */
function applyStoreDerived(page: Uint8Array, buf: Uint8Array, si: number, di: number, cl: number): void {
  const { bx, dx } = deriveMasks(buf, si, cl);
  applyStore(page, buf, { si, di, cl, bx, dx });
}

/** Render a whole frame's wall pieces into `page` from the compositor call list
 *  + the descriptor table + the source atlas. This is the FROM-GEOMETRY render
 *  (no captured store stream). `page` should start as the floor/ceiling/
 *  background page (the engine composes walls ON TOP of that). */
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
