/**
 * maze-data.ts — pure decoder for `mazedata.ega` (the maze background asset bank)
 * and the per-placement blit-record builders the background compositor consumes.
 *
 * Ported VERBATIM (byte-exact) from the RE-validated tools/parity/expand-asset.ts
 * (ega.drv FUN_0631 dispatch-entry-6 loader/normalizer) so the parser is
 * self-contained — no I/O here, the caller passes the raw `mazedata.ega` bytes.
 *
 * ── FILE LAYOUT (asm-confirmed, ega.drv file 0x631; see maze-expander.json) ──
 *   [0..1]  u16 numDesc   (=153)
 *   [2..3]  u16 numPlace  (=366)
 *   [4..]   numDesc image-descriptor records (5 B): {u16 segDelta, u8 srcOffLow, u8 w, u8 h}
 *   [..]    numPlace placement records       (5 B): {u8 imgIdx,destX,destRow,bias,count}
 *   [..]    the 4-plane PLANAR pixel blob (verbatim)
 *
 * FUN_0631 normalizes each descriptor IN PLACE so (segDelta:srcOffLow) addresses the
 * blob within the segmented dataSeg; the placement records + pixel blob are verbatim.
 */
import type { BackgroundPlacement, MaskedMirrorPlacement } from '@wiz6/data';

/** One normalized image descriptor (5 B, post-FUN_0631). */
export interface MazeImageDesc {
  segDelta: number;
  srcOffLow: number;
  w: number;
  h: number;
}

/** One placement record (5 B). */
export interface MazePlacement {
  imgIdx: number;
  destX: number;
  destRow: number;
  bias: number;
  count: number;
}

/** The fully-expanded maze background work buffer + tables. */
export interface MazeWorkBuffer {
  buffer: Uint8Array<ArrayBuffer>;
  descs: MazeImageDesc[];
  placements: MazePlacement[];
  blobStart: number;
}

function u16(b: Uint8Array, o: number): number {
  return b[o]! | (b[o + 1]! << 8);
}

/**
 * Sign-extend a destX BYTE the way the engine does. ega.drv FUN_0a93 loads the
 * placement's destX with `mov al,[si+1]; cbw` (file 0xad7 in the OR branch, 0xc11
 * in the masked-mirror branch), so destX is a SIGNED i8: a stored 0xff (255) is
 * dest column −1, not +255. Three placements carry a negative destX (6/38/44, all
 * destX=255 = −1) — the LEFT-side full-height corner-wall flanks (img0 w14 h87),
 * whose dest page column is one byte LEFT of the page origin. Without this the
 * piece lands ~256 bytes downstream (wrong screen side); with it the LEFT/RIGHT
 * corner walls mirror symmetrically about the viewport centre.
 */
function signExtendDestX(destX: number): number {
  return destX >= 128 ? destX - 256 : destX;
}

/**
 * Reproduce ega.drv FUN_0631: parse `mazedata.ega` and normalize the descriptor
 * table in place. The pixel blob + placement records are copied VERBATIM; only the
 * 153 descriptors are rewritten (segDelta:srcOffLow ← blob-relative segment:offset).
 */
export function expandMazeData(file: Uint8Array): MazeWorkBuffer {
  const numDesc = u16(file, 0);
  const numPlace = u16(file, 2);
  const placeOff = numDesc * 5 + 4;
  const blobStart = numPlace * 5 + placeOff;
  const blobLo = blobStart & 0xf;
  const blobHi = blobStart >> 4;

  const buffer = new Uint8Array(file.length);
  buffer.set(file);
  const descs: MazeImageDesc[] = [];
  for (let k = 0; k < numDesc; k++) {
    const bx = 4 + k * 5;
    const al = (buffer[bx + 2]! + blobLo) & 0xff;
    const srcOffLow = al & 0xf;
    const segDelta = (u16(buffer, bx) + (al >> 4) + blobHi) & 0xffff;
    buffer[bx + 2] = srcOffLow;
    buffer[bx] = segDelta & 0xff;
    buffer[bx + 1] = (segDelta >> 8) & 0xff;
    descs.push({ segDelta, srcOffLow, w: buffer[bx + 3]!, h: buffer[bx + 4]! });
  }

  const placements: MazePlacement[] = [];
  for (let k = 0; k < numPlace; k++) {
    const o = placeOff + k * 5;
    placements.push({
      imgIdx: buffer[o]!,
      destX: buffer[o + 1]!,
      destRow: buffer[o + 2]!,
      bias: buffer[o + 3]!,
      count: buffer[o + 4]!,
    });
  }

  return { buffer, descs, placements, blobStart };
}

/**
 * Build an OR-branch BackgroundPlacement (ega.drv FUN_0a93 0xaa9) from a placement
 * index. Forward single-image OR-blit of `placementIdx`'s own image.
 */
export function orPlacementFor(wb: MazeWorkBuffer, placementIdx: number): BackgroundPlacement {
  const p = wb.placements[placementIdx];
  if (!p) throw new Error(`placement ${placementIdx} out of range (${wb.placements.length})`);
  const d = wb.descs[p.imgIdx]!;
  const planeStride = d.w * d.h;
  return {
    src: wb.buffer,
    si: d.segDelta * 16 + d.srcOffLow + p.bias,
    di: signExtendDestX(p.destX) + p.bias + 0x28 * p.destRow,
    cx: p.count,
    w: d.w,
    h: d.h,
    planeStride,
  };
}

/**
 * Build a masked-MIRROR placement (ega.drv FUN_0a93 file-0xbc6 branch) from the
 * SOURCE placement index (supplies the source IMAGE) and the DEST placement index
 * (supplies the dest GEOMETRY + per-row count). Asm-derived, byte-exact verified —
 * see docs/re/findings/maze-masked-mirror.json.
 *
 *   cx     = dest.count
 *   di     = signExtend(dest.destX) + dest.bias + 0x28*dest.destRow
 *   siBase = S.segDelta*16 + S.srcOffLow + (S.w-1) - dest.bias
 *
 * destX is a SIGNED i8 (engine `cbw` at file 0xc11): a stored 0xff is column −1.
 *   w/h/planeStride = the SOURCE image descriptor
 */
export function maskedMirrorFor(
  wb: MazeWorkBuffer,
  srcPlacementIdx: number,
  dstPlacementIdx: number,
  mode: 'or' | 'replace',
): MaskedMirrorPlacement {
  const sp = wb.placements[srcPlacementIdx];
  const dp = wb.placements[dstPlacementIdx];
  if (!sp) throw new Error(`src placement ${srcPlacementIdx} out of range`);
  if (!dp) throw new Error(`dst placement ${dstPlacementIdx} out of range`);
  const S = wb.descs[sp.imgIdx]!;
  const planeStride = S.w * S.h;
  return {
    src: wb.buffer,
    siBase: S.segDelta * 16 + S.srcOffLow + (S.w - 1) - dp.bias,
    di: signExtendDestX(dp.destX) + dp.bias + 0x28 * dp.destRow,
    cx: dp.count,
    w: S.w,
    h: S.h,
    planeStride,
    mode,
  };
}
