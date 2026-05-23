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
 * Empirically calibrated against actual-game screenshots. Base layer is
 * the standard EGA 16-color palette (the BIOS default for mode 0Dh);
 * seven logical colors are overridden where pixel-picked actual-game
 * values diverged from the standard.
 *
 * Overrides:
 *   1   WHITE          (was blue)         — Wizardry logo letters, scene highlights
 *   5   BRIGHT YELLOW  (was magenta)      — credits text, gem/fountain body
 *   6   BRIGHT GREEN   (was brown)        — succubus/demon skin (mon45 Rebecca)
 *   9   LIGHT GRAY     (was light blue)   — wall stippling highlight pixels
 *   10  BLUE           (was light green)  — mon08 water (deeper shade)
 *   13  BROWN          (was bright magenta) — fountain accents
 *   14  GREEN          (was bright yellow) — vines / moss (dragonsc foliage)
 *
 * Logical 15 (= "all 4 planes set" sentinel) is treated as transparent
 * by the renderer to support sprite-blit compositing.
 *
 * Known regression: **mon57 (spaceship) body should be blue but renders
 * as green** because it uses logical index 2 (standard EGA green) which
 * the engine reprograms to blue at runtime via the EGA Attribute
 * Controller for that scene. The same problem affects mon08's statue
 * water flow (multiple shades of blue, one renders as green). A global
 * palette override for index 2 would fix the ship but break dragonsc
 * foliage + other scenes that legitimately want green. The proper fix
 * is per-scene palette switching — see TODO at the file bottom.
 *
 * The two static palette tables we located in wroot.exe (file offsets
 * 0x2043 and 0x2054, both loaded via INT 10h AX=1002h) don't match these
 * empirical mappings — they give "duller" / less-intensity-boosted
 * versions of the same hues. The actual game must patch palette
 * registers at runtime, or there's a third palette load we haven't
 * located. Empirically this seven-override palette matches all the
 * screenshot calibrations so far.
 */
export const WIZ6_PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [0x00, 0x00, 0x00], // 0:  black                   (standard EGA)
  [0xff, 0xff, 0xff], // 1:  WHITE                   (override — was blue)
  [0x00, 0xaa, 0x00], // 2:  green                   (standard EGA; mon57 wants blue here)
  [0x00, 0xaa, 0xaa], // 3:  cyan                    (standard EGA)
  [0xaa, 0x00, 0x00], // 4:  red                     (standard EGA — chest body shadow)
  [0xff, 0xff, 0x55], // 5:  BRIGHT YELLOW           (override — was magenta)
  [0x00, 0xff, 0x00], // 6:  BRIGHT GREEN            (override — was brown; succubus skin)
  [0xaa, 0xaa, 0xaa], // 7:  light gray              (standard EGA)
  [0x55, 0x55, 0x55], // 8:  dark gray               (standard EGA)
  [0xaa, 0xaa, 0xaa], // 9:  LIGHT GRAY              (override — was light blue)
  [0x00, 0x00, 0xaa], // 10: BLUE                    (override — was light green)
  [0x55, 0xff, 0xff], // 11: light cyan              (standard EGA)
  [0xff, 0x55, 0x55], // 12: bright red              (standard EGA — chest body highlight)
  [0xaa, 0x55, 0x00], // 13: BROWN                   (override — was bright magenta)
  [0x00, 0xaa, 0x00], // 14: GREEN                   (override — was bright yellow; vines)
  [0xff, 0xff, 0xff], // 15: white                   (unused — rendered as transparent)
];

// TODO: per-scene palette switching. Wiz6 reprograms the EGA Attribute
// Controller per scene via INT 10h AX=1002h (verified at wroot 0x209B and
// 0x2105). Until we trace which palette is active during each .pic load,
// scenes that reprogram logical index 2 → blue (mon57 spaceship, mon08
// statue water) render with green where blue is intended.

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
