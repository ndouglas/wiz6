import type { EgaScreen, Palette } from '@wiz6/data';
import type { RenderedSprite } from './pic-render.js';
import { EGA_FILE_INDEX_PERMUTATION } from './ega-permutation.js';

/**
 * Per-plane source-coordinate transform for the 32 KB EGA screen files.
 *
 * Each `.scr` plane is stored with a per-plane PRE-APPLIED SHIFT:
 *   shiftX = (64 * planeIdx) % width  (cyclic horizontal rotation)
 *   shiftY = -5 * planeIdx             (vertical drop)
 *
 * The storage cyclic-rotates the whole 8000-byte plane buffer, so the data
 * rolls across row boundaries at the shift column — producing an additional
 * one-row Y shift for columns LEFT of the wrap. Discovered in the Stage 1f.3
 * alignment work; produces pixel-accurate composites for titlepag, graveyrd,
 * and dragonsc. See `docs/re/ega-screen.md`.
 */
function sourceCoordForPlane(
  planeIdx: number,
  x: number,
  y: number,
  width: number,
  height: number,
): { srcX: number; srcY: number } | null {
  const shiftX = (64 * planeIdx) % width;
  const shiftY = -5 * planeIdx;
  const yDrop = x < shiftX ? 1 : 0;
  const srcY = y - shiftY - yDrop;
  if (srcY < 0 || srcY >= height) return null;
  const srcX = (((x - shiftX) % width) + width) % width;
  return { srcX, srcY };
}

function bitAt(plane: readonly number[], width: number, srcX: number, srcY: number): number {
  const bytesPerRow = width / 8;
  const byteIdx = srcY * bytesPerRow + (srcX >> 3);
  const bitIdx = 7 - (srcX & 7);
  return ((plane[byteIdx] ?? 0) >> bitIdx) & 1;
}

/**
 * Render an EGA screen to row-major RGBA bytes.
 *
 * Color 0 (background) → alpha 0 (transparent). All other colors → opaque.
 * Returned image is `screen.width × screen.height` pixels (typically 320×200).
 */
export function renderEgaScreen(screen: EgaScreen, palette: Palette): RenderedSprite {
  const { width, height, planes } = screen;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let fileIdx = 0;
      for (let p = 0; p < 4; p++) {
        const plane = planes[p];
        if (!plane) continue;
        const src = sourceCoordForPlane(p, x, y, width, height);
        if (!src) continue;
        fileIdx |= bitAt(plane, width, src.srcX, src.srcY) << p;
      }
      // Permute file bit-pattern → standard EGA palette index, then look up RGB.
      const idx = EGA_FILE_INDEX_PERMUTATION[fileIdx]!;
      const offset = (y * width + x) * 4;
      if (fileIdx === 0) {
        rgba[offset + 3] = 0;
      } else {
        const rgb = palette.colors[idx] ?? [0, 0, 0];
        rgba[offset] = rgb[0]!;
        rgba[offset + 1] = rgb[1]!;
        rgba[offset + 2] = rgb[2]!;
        rgba[offset + 3] = 0xff;
      }
    }
  }
  return { width, height, rgba };
}
