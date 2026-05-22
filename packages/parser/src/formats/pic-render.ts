import type { PicDescriptor } from '@wiz6/data';

/** Standard EGA 16-color palette (RGB triples, 0..255). */
export const EGA_PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [0x00, 0x00, 0x00], [0x00, 0x00, 0xaa], [0x00, 0xaa, 0x00], [0x00, 0xaa, 0xaa],
  [0xaa, 0x00, 0x00], [0xaa, 0x00, 0xaa], [0xaa, 0x55, 0x00], [0xaa, 0xaa, 0xaa],
  [0x55, 0x55, 0x55], [0x55, 0x55, 0xff], [0x55, 0xff, 0x55], [0x55, 0xff, 0xff],
  [0xff, 0x55, 0x55], [0xff, 0x55, 0xff], [0xff, 0xff, 0x55], [0xff, 0xff, 0xff],
];

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
 * Plane order in the stored byte stream is [green, blue, red, intensity]:
 * bytes 0..7 = plane G, 8..15 = plane B, 16..23 = plane R, 24..31 = plane I.
 * Verified empirically: with this order the credits sprite renders yellow
 * text (matches the live game). Phase 1A+B's notes said [B, G, R, I] but
 * that produced purple text for the same data.
 *
 * Color 15 is treated as transparent (alpha=0). Skipped cells (mask bit
 * unset) produce transparent regions and do NOT advance the atlas pointer.
 */
export function renderPicDescriptor(
  descriptor: PicDescriptor,
  decodedBuffer: readonly number[],
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
        const planeG = decodedBuffer[atlasOffset + row] ?? 0;
        const planeB = decodedBuffer[atlasOffset + 8 + row] ?? 0;
        const planeR = decodedBuffer[atlasOffset + 16 + row] ?? 0;
        const planeI = decodedBuffer[atlasOffset + 24 + row] ?? 0;
        for (let col = 0; col < 8; col++) {
          const bit = 7 - col;
          // Color bit layout: bit 0 = blue, bit 1 = green, bit 2 = red, bit 3 = intensity.
          // So EGA_PALETTE[color] indexes into the standard EGA 16-color table.
          const bB = (planeB >> bit) & 1;
          const bG = (planeG >> bit) & 1;
          const bR = (planeR >> bit) & 1;
          const bI = (planeI >> bit) & 1;
          const color = bB | (bG << 1) | (bR << 2) | (bI << 3);
          const pxX = cx * 8 + col;
          const pxY = cy * 8 + row;
          const idx = (pxY * pxW + pxX) * 4;
          if (color === 15) {
            rgba[idx] = 0;
            rgba[idx + 1] = 0;
            rgba[idx + 2] = 0;
            rgba[idx + 3] = 0;
          } else {
            const [r, g, b] = EGA_PALETTE[color]!;
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
