import type { PicDescriptor } from '@wiz6/data';

/** Standard EGA 16-color palette (RGB triples, 0..255). */
export const EGA_PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [0x00, 0x00, 0x00], [0x00, 0x00, 0xaa], [0x00, 0xaa, 0x00], [0x00, 0xaa, 0xaa],
  [0xaa, 0x00, 0x00], [0xaa, 0x00, 0xaa], [0xaa, 0x55, 0x00], [0xaa, 0xaa, 0xaa],
  [0x55, 0x55, 0x55], [0x55, 0x55, 0xff], [0x55, 0xff, 0x55], [0x55, 0xff, 0xff],
  [0xff, 0x55, 0x55], [0xff, 0x55, 0xff], [0xff, 0xff, 0x55], [0xff, 0xff, 0xff],
];

/**
 * Wiz6's effective logical-color → RGB palette.
 *
 * Derived from the palette table at wroot.exe file offset 0x2054, loaded
 * via INT 10h AX=1002h ("Set palette block"). The byte table is the
 * sequence of physical EGA palette register values for logical colors
 * 0..15:
 *
 *     [0, 15, 9, 13, 12, 14, 10, 11, 8, 7, 1, 5, 4, 6, 2, 3]
 *
 * Each physical value is then decoded as the standard 6-bit EGA palette
 * register encoding (bits 0-2 = primary BGR, bits 3-5 = secondary BGR;
 * primary contributes 0xAA per channel, secondary 0x55).
 *
 * The ONE empirical override is logical 1: the Wiz6 palette table maps
 * it to physical 15 (`#aaaaff` lavender), but the actual game renders
 * the Wizardry-logo letters as pure white. Either there's a third
 * palette load we haven't located, or the game patches this single
 * register at runtime. Either way the override is the only deviation
 * from the static table that empirically matches the game.
 *
 * Logical 15 is unused here — the renderer treats it as transparent.
 */
export const WIZ6_PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [0x00, 0x00, 0x00], // 0:  black                   (phys  0)
  [0xff, 0xff, 0xff], // 1:  WHITE                   (override — table value phys 15 = lavender)
  [0x00, 0x00, 0xff], // 2:  pure blue               (phys  9)
  [0xaa, 0x00, 0xff], // 3:  bright violet           (phys 13)
  [0xaa, 0x00, 0x55], // 4:  wine red / sword body   (phys 12)
  [0xaa, 0xaa, 0x55], // 5:  olive-yellow            (phys 14)
  [0x00, 0xaa, 0x55], // 6:  teal-green              (phys 10)
  [0x00, 0xaa, 0xff], // 7:  bright cyan             (phys 11)
  [0x00, 0x00, 0x55], // 8:  very dark blue          (phys  8)
  [0xaa, 0xaa, 0xaa], // 9:  light gray              (phys  7)
  [0x00, 0x00, 0xaa], // 10: blue / water            (phys  1)
  [0xaa, 0x00, 0xaa], // 11: magenta                 (phys  5)
  [0xaa, 0x00, 0x00], // 12: red / sword highlight   (phys  4)
  [0xaa, 0xaa, 0x00], // 13: dark yellow / brown     (phys  6)
  [0x00, 0xaa, 0x00], // 14: green / vines           (phys  2)
  [0xff, 0xff, 0xff], // 15: (unused — rendered as transparent)
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
 * Plane order is [blue, green, red, intensity]: bytes 0..7 = plane B,
 * 8..15 = plane G, 16..23 = plane R, 24..31 = plane I. Color bit layout:
 * bit 0 = B, bit 1 = G, bit 2 = R, bit 3 = I.
 *
 * Logical colors are looked up via `WIZ6_PALETTE` (the game's custom
 * mapping loaded at startup via INT 10h AX=1002h) rather than the
 * vanilla EGA hardware default; the values in the sprite data are
 * "logical" colors that the game's palette setup remaps to physical
 * EGA colors before display. Without this step, walls that should be
 * dithered gray come out as light blue, etc.
 *
 * Color 15 is treated as transparent (alpha=0) — matches what ega.drv's
 * sprite-blit code does when compositing sprites onto a scene.
 *
 * Skipped cells (mask bit unset) produce transparent regions and do NOT
 * advance the atlas pointer.
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
            const [r, g, b] = WIZ6_PALETTE[color]!;
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
