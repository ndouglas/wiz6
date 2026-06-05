/**
 * expand-asset.ts — Wiz6 maze background EXPANDER (Gap A), offline + byte-exact.
 *
 * RE RESULT (2026-06-05, "Gap A: record→work-buffer masked-image expander" pass).
 *
 * ── THE FINDING (asm-confirmed + byte-exact validated) ──
 *
 * The maze floor/ceiling/window background OR-blit (ega.drv dispatch entry 15,
 * FUN_0a93; see decode-floor-ceiling.ts) reads its 4-plane PLANAR sub-images from
 * a single contiguous WORK BUFFER (the "dataSeg", cs:[0x149]). That work buffer is
 * NOT built from the SCENARIO.DBS floor/ceiling bank records (the prior
 * maze-background-generation.json "real masked decompression" conclusion compared
 * the WRONG asset). It is `mazedata.ega`, loaded **verbatim** by ega.drv dispatch
 * entry 6 (FUN_0631) — the pixel data is stored ALREADY 4-plane planar on disk; the
 * "expand" is a trivial in-place DESCRIPTOR-TABLE NORMALIZATION, no pixel codec.
 *
 *   file `mazedata.ega` layout (102303 bytes):
 *     [0..1]   u16 numDesc   (=153)   — image-descriptor count
 *     [2..3]   u16 numPlace  (=366)   — placement-record count
 *     [4..]    numDesc image-descriptor records, 5 bytes each:
 *                 {u16 segDelta, u8 srcOffLow, u8 w, u8 h}
 *     [4 + numDesc*5 ..]  numPlace placement records, 5 bytes each:
 *                 {u8 imgIdx, u8 destX, u8 destRow, u8 bias, u8 count}
 *     [4 + numDesc*5 + numPlace*5 ..]  the 4-plane PLANAR pixel blob (verbatim)
 *
 *   FUN_0631 (ega.drv file 0x631, dispatch entry 6) — "the expander":
 *     1. lseek(0)+read the WHOLE file into the dataSeg (cs:[0x149]) buffer, verbatim
 *        (a 0x800-byte first read for the header/tables, then 0x8000-byte chunks
 *        across successive +0x800-paragraph segment bumps for the blob).
 *     2. placeOff (cs:[0x190]) = numDesc*5 + 4.
 *     3. blobStart = numPlace*5 + placeOff   (= the byte offset of the pixel blob).
 *        blobLo = blobStart & 0xf ; blobHi = blobStart >> 4.
 *     4. NORMALIZE each of the numDesc descriptors IN PLACE so its (segDelta:srcOff)
 *        addresses the blob within the segmented dataSeg:
 *          al        = (desc.srcOffLow + blobLo) & 0xff
 *          desc.srcOffLow = al & 0xf                       (new <16 byte offset)
 *          desc.segDelta  = desc.segDelta + (al >> 4) + blobHi   (paragraph)
 *        (the placement records are NOT touched.)
 *
 *   The OR-blit then reads, per descriptor: source segment = dataSeg + segDelta,
 *   source offset = srcOffLow (+ placement.bias), with 4 contiguous planes of
 *   (w*h) bytes each starting at that address. (asm: ega.drv 0xa93..0xb1c —
 *   ds += [bx]; si = [bx+2] + bias; w = [bx+3]; planeStride = [bx+3]*[bx+4].)
 *
 * VALIDATION (byte-exact, tolerance 0):
 *   - normalizeMazeData(read mazedata.ega) === the LIVE dataSeg captured at the
 *     OR-blit entry on the first render: 65536/65536 bytes (the captured window),
 *     and the full-file normalization keeps the pixel blob + placement region
 *     verbatim with only the 153 descriptors rewritten.
 *   - every per-image SOURCE work-buffer the OR-blit reads (the firstrender
 *     wb-*.bin captures: ceiling/window/floor/side-panel, 8 distinct images) is a
 *     byte-exact slice of the normalized buffer at its descriptor's
 *     (segDelta*16 + srcOffLow): 8/8 images, 100%.
 *
 * Anchors:
 *   - ega.drv FUN_0631 (file 0x631, dispatch entry 6): the loader/normalizer.
 *       int21 read @0x64d; numDesc/numPlace @0x652/0x662; descriptor-normalize
 *       loop @0x68b..0x6ad.
 *   - ega.drv FUN_0a93 (file 0xa93, dispatch entry 15): the OR-blit consumer
 *       (decode-floor-ceiling.ts). Descriptor read @0xaf0..0xb1c.
 *   - dataSeg = cs:[0x149]; placeOff = cs:[0x190]; imgDescOff = cs:[0x18e] (=4).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** One normalized image descriptor (5 bytes, post-FUN_0631). */
export interface MazeImageDesc {
  /** paragraphs added to the dataSeg base → the sub-image's source segment. */
  segDelta: number;
  /** plane-0 source byte offset within that segment (< 16, before bias). */
  srcOffLow: number;
  /** image width in bytes per plane row (= the si row stride). */
  w: number;
  /** image height in rows (= the outer row count). */
  h: number;
}

/** One placement record (5 bytes). */
export interface MazePlacement {
  /** index into the descriptor table. */
  imgIdx: number;
  /** dest page byte-column base. */
  destX: number;
  /** dest page row base (×0x28 for the byte offset). */
  destRow: number;
  /** added to destX-source AND to srcOff (sub-tile horizontal crop start). */
  bias: number;
  /** inner copy width (bytes copied per row; ≤ image width w). */
  count: number;
}

/** The fully-expanded maze background work buffer + tables (the OR-blit's input). */
export interface MazeWorkBuffer {
  /** the normalized work buffer (== the live dataSeg, byte-exact). */
  buffer: Uint8Array;
  /** image-descriptor table (numDesc entries), normalized. */
  descs: MazeImageDesc[];
  /** placement table (numPlace entries), verbatim from disk. */
  placements: MazePlacement[];
  /** byte offset of the pixel blob within `buffer`. */
  blobStart: number;
}

function u16(b: Uint8Array, o: number): number { return b[o]! | (b[o + 1]! << 8); }

/** Load mazedata.ega from the game image. */
export function loadMazeData(dir = 'test-fixtures/original'): Uint8Array {
  return new Uint8Array(readFileSync(resolve(dir, 'mazedata.ega')));
}

/**
 * Reproduce ega.drv FUN_0631 (dispatch entry 6): load mazedata.ega and normalize
 * the descriptor table in place, exactly as the engine does at first render.
 * Returns the work buffer (== the live dataSeg) plus the decoded tables.
 *
 * The pixel blob and the placement records are copied VERBATIM; only the 153
 * descriptors are rewritten (segDelta:srcOffLow ← blob-relative segment:offset).
 */
export function expandMazeData(file: Uint8Array): MazeWorkBuffer {
  const numDesc = u16(file, 0);
  const numPlace = u16(file, 2);
  const placeOff = numDesc * 5 + 4;
  const blobStart = numPlace * 5 + placeOff;
  const blobLo = blobStart & 0xf;
  const blobHi = blobStart >> 4;

  const buffer = new Uint8Array(file); // verbatim copy; descriptors rewritten below
  const descs: MazeImageDesc[] = [];
  for (let k = 0; k < numDesc; k++) {
    const bx = 4 + k * 5;
    // FUN_0631 0x68b..0x6ad — al = (srcOffLow + blobLo); split into <16 offset + paras.
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
    placements.push({ imgIdx: buffer[o]!, destX: buffer[o + 1]!, destRow: buffer[o + 2]!, bias: buffer[o + 3]!, count: buffer[o + 4]! });
  }

  return { buffer, descs, placements, blobStart };
}

/**
 * Extract the 4-plane PLANAR source bytes the OR-blit reads for a given image
 * descriptor, as a flat buffer the decode-floor-ceiling.ts PlacedImage walk can
 * read with si = descriptor's srcOffLow (+ bias). The slice spans
 * [segDelta*16 .. segDelta*16 + srcOffLow + 4*w*h] so a PlacedImage{src, si=srcOffLow+bias}
 * reads valid bytes for all 4 planes.
 */
export function extractSubImage(wb: MazeWorkBuffer, descIdx: number): { src: Uint8Array; si: number; w: number; h: number; planeStride: number } {
  const d = wb.descs[descIdx];
  if (!d) throw new Error(`descriptor ${descIdx} out of range (${wb.descs.length})`);
  const base = d.segDelta * 16;
  const planeStride = d.w * d.h;
  const end = base + d.srcOffLow + 4 * planeStride;
  return { src: wb.buffer.subarray(base, Math.min(end, wb.buffer.length)), si: d.srcOffLow, w: d.w, h: d.h, planeStride };
}

/**
 * Convenience: extract the source bytes addressed by a PLACEMENT record (resolves
 * its descriptor + applies the placement bias to the source offset), returning a
 * decode-floor-ceiling.ts PlacedImage. dataSeg-relative addressing means `src`
 * is a view into the whole work buffer, `si` is the absolute byte offset.
 */
export function placedImageFor(wb: MazeWorkBuffer, placementIdx: number) {
  const p = wb.placements[placementIdx];
  if (!p) throw new Error(`placement ${placementIdx} out of range (${wb.placements.length})`);
  const d = wb.descs[p.imgIdx]!;
  const planeStride = d.w * d.h;
  const si = d.segDelta * 16 + d.srcOffLow + p.bias;
  const di = p.destX + p.bias + 0x28 * p.destRow;
  return { src: wb.buffer, si, di, cx: p.count, w: d.w, h: d.h, planeStride };
}

/**
 * Build a masked-MIRROR blit (ega.drv FUN_0a93 file-0xbc6 branch) from the SOURCE
 * placement index (arg [bp+0xc] — supplies the source IMAGE descriptor) and the DEST
 * placement index (arg [bp+0x10] — supplies the dest GEOMETRY + per-row count).
 *
 * Asm-derived per-row geometry (verified byte-exact vs the engine's live per-call
 * page writes — see docs/re/findings/maze-masked-mirror.json):
 *   cx     = dest.count                                        (asm [bp-4])
 *   di     = dest.destX + dest.bias + 0x28*dest.destRow        (asm 0xc0e..0xc22)
 *   siBase = S.segDelta*16 + S.srcOffLow + (S.w-1) - dest.bias (asm 0xc3e..0xc4c)
 *   w/h/planeStride = the SOURCE image descriptor              (asm 0xc24..0xc39)
 * `mode`: 'or' (engine [bp+0xe] != 0) OR-merges, 'replace' (0) overwrites.
 */
export function maskedMirrorFor(
  wb: MazeWorkBuffer,
  srcPlacementIdx: number,
  dstPlacementIdx: number,
  mode: 'or' | 'replace',
) {
  const sp = wb.placements[srcPlacementIdx];
  const dp = wb.placements[dstPlacementIdx];
  if (!sp) throw new Error(`src placement ${srcPlacementIdx} out of range`);
  if (!dp) throw new Error(`dst placement ${dstPlacementIdx} out of range`);
  const S = wb.descs[sp.imgIdx]!;
  const planeStride = S.w * S.h;
  const siBase = S.segDelta * 16 + S.srcOffLow + (S.w - 1) - dp.bias;
  const di = dp.destX + dp.bias + 0x28 * dp.destRow;
  return { src: wb.buffer, siBase, di, cx: dp.count, w: S.w, h: S.h, planeStride, mode };
}
