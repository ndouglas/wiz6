import type { PicDescriptor, Palette } from '@wiz6/data';
import { EGA_FILE_INDEX_PERMUTATION } from './ega-permutation.js';

export interface RenderedSprite {
  /** Sprite width in pixels (descriptor.width * 8). */
  width: number;
  /** Sprite height in pixels (descriptor.height * 8). */
  height: number;
  /** RGBA pixel data, row-major. Alpha is 0 for color 15 (transparent) and 255 for all other colors. */
  rgba: Uint8ClampedArray;
}

/**
 * Render one descriptor's image. Cells are 4bpp EGA planar (32 bytes per
 * 8×8 cell: 8 bytes per plane × 4 planes, MSB-first within each plane byte).
 *
 * Plane order is [blue, green, red, intensity]: bytes 0..7 = plane B,
 * 8..15 = plane G, 16..23 = plane R, 24..31 = plane I. Bit assignment in the
 * raw on-disk 4-bit pattern: bit 0 = B, bit 1 = G, bit 2 = R, bit 3 = I.
 *
 * The on-disk bit pattern is NOT a direct palette index — Wiz6 stores sprite
 * indices under the same permutation used by `.ega` screen files. We map the
 * bit pattern through `EGA_FILE_INDEX_PERMUTATION` to obtain a standard EGA
 * palette index, then look up RGB in the supplied palette. The default
 * palette for sprite rendering is `EGA_DEFAULT` (the BIOS-default state the
 * engine runs against for the asset-rendering scenes we currently support).
 *
 * Color 15 (file bit-pattern, before permutation) is treated as transparent
 * (alpha=0) — matches what ega.drv's sprite-blit code does when compositing
 * sprites onto a scene.
 *
 * Skipped cells (mask bit unset) produce transparent regions and do NOT
 * advance the atlas pointer.
 */
export function renderPicDescriptor(
  descriptor: PicDescriptor,
  decodedBuffer: readonly number[],
  palette: Palette,
): RenderedSprite {
  const pxW = descriptor.width * 8;
  const pxH = descriptor.height * 8;
  const rgba = new Uint8ClampedArray(pxW * pxH * 4);
  let atlasOffset = descriptor.pos;
  for (let cy = 0; cy < descriptor.height; cy++) {
    for (let cx = 0; cx < descriptor.width; cx++) {
      const bitIdx = cy * descriptor.width + cx;
      const byteIdx = bitIdx >> 3;
      const bitInByte = bitIdx & 7;
      const populated =
        byteIdx < descriptor.mask.length &&
        ((descriptor.mask[byteIdx] ?? 0) & (1 << bitInByte)) !== 0;
      if (!populated) continue;
      if (atlasOffset + 32 > decodedBuffer.length) {
        // Atlas exhausted — skip rendering but advance offset so subsequent
        // cells stay aligned with the spec.
        atlasOffset += 32;
        continue;
      }
      for (let row = 0; row < 8; row++) {
        const planeB = decodedBuffer[atlasOffset + row] ?? 0;
        const planeG = decodedBuffer[atlasOffset + 8 + row] ?? 0;
        const planeR = decodedBuffer[atlasOffset + 16 + row] ?? 0;
        const planeI = decodedBuffer[atlasOffset + 24 + row] ?? 0;
        for (let col = 0; col < 8; col++) {
          const bit = 7 - col;
          const bB = (planeB >> bit) & 1;
          const bG = (planeG >> bit) & 1;
          const bR = (planeR >> bit) & 1;
          const bI = (planeI >> bit) & 1;
          const fileIdx = bB | (bG << 1) | (bR << 2) | (bI << 3);
          const pxX = cx * 8 + col;
          const pxY = cy * 8 + row;
          const idx = (pxY * pxW + pxX) * 4;
          if (fileIdx === 15) {
            rgba[idx] = 0;
            rgba[idx + 1] = 0;
            rgba[idx + 2] = 0;
            rgba[idx + 3] = 0;
          } else {
            const egaIdx = EGA_FILE_INDEX_PERMUTATION[fileIdx]!;
            const [r, g, b] = palette.colors[egaIdx]!;
            rgba[idx] = r;
            rgba[idx + 1] = g;
            rgba[idx + 2] = b;
            rgba[idx + 3] = 0xff;
          }
        }
      }
      atlasOffset += 32;
    }
  }
  return { width: pxW, height: pxH, rgba };
}

/**
 * Convenience: concatenate all of a Pic's segment-decoded byte arrays into
 * one flat array. Use this as the buffer argument to `renderPicDescriptor`.
 */
export function concatenatePicSegments(segments: ReadonlyArray<{ decodedBytes: ReadonlyArray<number> }>): number[] {
  const out: number[] = [];
  for (const s of segments) {
    for (const b of s.decodedBytes) out.push(b);
  }
  return out;
}

/**
 * Composite a single PIC descriptor onto an RGBA destination buffer at
 * (dstX, dstY). This is the per-descriptor primitive used by the engine's
 * f10c PIC renderer (ega.drv 0x1C94..0x20FF) — for each cell in the
 * descriptor's W×H grid, if the cell's mask bit is set, blit the 8×8
 * cell from the decoded buffer at (dstX + cx*8, dstY + cy*8), with
 * color-15 treated as transparent (no write — preserving whatever's
 * already at that pixel).
 *
 * The destination is clipped to (destW, destH); off-canvas pixels are
 * silently dropped.
 */
export function compositePicDescriptor(
  destRgba: Uint8ClampedArray,
  destW: number,
  destH: number,
  dstX: number,
  dstY: number,
  descriptor: PicDescriptor,
  decodedBuffer: readonly number[],
  palette: Palette,
): void {
  let atlasOffset = descriptor.pos;
  for (let cy = 0; cy < descriptor.height; cy++) {
    for (let cx = 0; cx < descriptor.width; cx++) {
      const bitIdx = cy * descriptor.width + cx;
      const byteIdx = bitIdx >> 3;
      const bitInByte = bitIdx & 7;
      const populated =
        byteIdx < descriptor.mask.length &&
        ((descriptor.mask[byteIdx] ?? 0) & (1 << bitInByte)) !== 0;
      if (!populated) continue;
      if (atlasOffset + 32 > decodedBuffer.length) {
        // Atlas exhausted but mask says draw — skip the cell but keep the
        // source cursor aligned with subsequent mask bits.
        atlasOffset += 32;
        continue;
      }
      for (let row = 0; row < 8; row++) {
        const py = dstY + cy * 8 + row;
        if (py < 0 || py >= destH) continue;
        const planeB = decodedBuffer[atlasOffset + row] ?? 0;
        const planeG = decodedBuffer[atlasOffset + 8 + row] ?? 0;
        const planeR = decodedBuffer[atlasOffset + 16 + row] ?? 0;
        const planeI = decodedBuffer[atlasOffset + 24 + row] ?? 0;
        for (let col = 0; col < 8; col++) {
          const bit = 7 - col;
          const fileIdx =
            ((planeB >> bit) & 1) |
            (((planeG >> bit) & 1) << 1) |
            (((planeR >> bit) & 1) << 2) |
            (((planeI >> bit) & 1) << 3);
          if (fileIdx === 15) continue; // transparent — preserve dest
          const px = dstX + cx * 8 + col;
          if (px < 0 || px >= destW) continue;
          const egaIdx = EGA_FILE_INDEX_PERMUTATION[fileIdx]!;
          const [r, g, b] = palette.colors[egaIdx]!;
          const idx = (py * destW + px) * 4;
          destRgba[idx] = r;
          destRgba[idx + 1] = g;
          destRgba[idx + 2] = b;
          destRgba[idx + 3] = 0xff;
        }
      }
      atlasOffset += 32;
    }
  }
}

/**
 * Run the engine's f10c PIC renderer: walk a 1-based descriptor-index
 * script (terminated by 0, or in our TS API by end-of-array) and
 * composite each named descriptor onto the destination buffer at
 * (dstX, dstY). Later descriptors overpaint earlier ones — color-15
 * transparency means earlier paint can show through later draws.
 *
 * Engine reference: ega.drv 0x1CEE..0x1D00 (dispatch loop) + 0x210C..
 * 0x225E (per-descriptor blit). Docs at `docs/re/pic.md` §Renderer.
 *
 * TS convention: pass 0-based descriptor indices (the engine's script
 * uses 1-based indices since 0 is the terminator). The terminator is
 * not part of `descIndices`.
 */
export function compositePicScript(
  destRgba: Uint8ClampedArray,
  destW: number,
  destH: number,
  dstX: number,
  dstY: number,
  descIndices: readonly number[],
  pic: { descriptors: readonly PicDescriptor[] },
  decodedBuffer: readonly number[],
  palette: Palette,
): void {
  for (const idx of descIndices) {
    const descriptor = pic.descriptors[idx];
    if (!descriptor) continue;
    compositePicDescriptor(
      destRgba,
      destW,
      destH,
      dstX,
      dstY,
      descriptor,
      decodedBuffer,
      palette,
    );
  }
}
