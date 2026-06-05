/**
 * background.test.ts — gate for the maze BACKGROUND OR-blit compositor
 * (src/maze/background.ts composeBackground / applyPlacedImage), the ported
 * ega.drv DISPATCH ENTRY 15 = FUN_0a93 floor/ceiling/side-panel/window decoder.
 *
 * This gates the OR-blit WALK MATH (4-plane planar OR-copy: cx bytes/row, w-byte
 * source row stride, planeStride plane jump, PAGE_ROW_BYTES dest row stride,
 * PLANE_STRIDE dest plane stride) deterministically against hand-constructed
 * placements with known expected output. The byte-exact reproduction of the LIVE
 * ENGINE background page (99.93%, the same-run captured-records oracle) is gated
 * separately by the engine fixture pair in
 * tools/parity/maze-floor-ceiling-parity.test.ts (the parser composeBackground is
 * a verbatim port of the decoder that test validates).
 */
import { describe, it, expect } from 'vitest';
import { composeBackground, applyPlacedImage } from '../../src/maze/background.js';
import { PLANE_STRIDE, PAGE_ROW_BYTES, type BackgroundPlacement } from '@wiz6/data';

/** Decode one pixel's 4-bit palette index from a 4-plane EGA page. */
function pixelIndex(page: Uint8Array, x: number, y: number): number {
  const off = y * PAGE_ROW_BYTES + (x >> 3);
  const bit = 7 - (x & 7);
  let idx = 0;
  for (let p = 0; p < 4; p++) idx |= ((page[off + p * PLANE_STRIDE]! >> bit) & 1) << p;
  return idx;
}

describe('background OR-blit — applyPlacedImage walk', () => {
  it('places a single-byte 1×1 image: each plane sets the matching index bit', () => {
    const page = new Uint8Array(4 * PLANE_STRIDE);
    // src: 4 contiguous planes, planeStride=1, each plane byte = 0xFF (all 8 px set).
    const src = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
    applyPlacedImage(page, { src, si: 0, di: 0, cx: 1, w: 1, h: 1, planeStride: 1 });
    // di=0 -> page byte (0,0). All 4 planes set -> every px in that byte = index 15.
    for (let x = 0; x < 8; x++) expect(pixelIndex(page, x, 0)).toBe(15);
    // The next row is untouched.
    expect(pixelIndex(page, 0, 1)).toBe(0);
  });

  it('OR-merges (does not overwrite): a second placement adds bits', () => {
    const page = new Uint8Array(4 * PLANE_STRIDE);
    // First: plane 0 only -> index 1.
    applyPlacedImage(page, {
      src: new Uint8Array([0xff, 0x00, 0x00, 0x00]),
      si: 0, di: 0, cx: 1, w: 1, h: 1, planeStride: 1,
    });
    expect(pixelIndex(page, 0, 0)).toBe(1);
    // Second: plane 2 only -> ORs in bit 2 -> index 1|4 = 5.
    applyPlacedImage(page, {
      src: new Uint8Array([0x00, 0x00, 0xff, 0x00]),
      si: 0, di: 0, cx: 1, w: 1, h: 1, planeStride: 1,
    });
    expect(pixelIndex(page, 0, 0)).toBe(5);
  });

  it('honors destX/destRow (di = destX + 0x28*destRow) and the 0x28 row stride', () => {
    const page = new Uint8Array(4 * PLANE_STRIDE);
    // destX byte 3 (x=24..31), destRow 5 -> di = 3 + 0x28*5 = 203; 2 rows tall.
    const di = 3 + PAGE_ROW_BYTES * 5;
    const src = new Uint8Array(2 * 1 * 4); // w=1,h=2,planeStride=2
    // plane 0 both rows = 0x80 (only the leftmost px of the byte set).
    src[0] = 0x80; // row0 plane0
    src[1] = 0x80; // row1 plane0
    applyPlacedImage(page, { src, si: 0, di, cx: 1, w: 1, h: 2, planeStride: 2 });
    // x = 24 (byte 3, bit 7), rows 5 and 6 set to index 1.
    expect(pixelIndex(page, 24, 5)).toBe(1);
    expect(pixelIndex(page, 24, 6)).toBe(1);
    expect(pixelIndex(page, 24, 7)).toBe(0);
    expect(pixelIndex(page, 25, 5)).toBe(0);
  });

  it('cx < w crops the copy width (per-row partial run)', () => {
    const page = new Uint8Array(4 * PLANE_STRIDE);
    // w=2 (row stride 2 bytes) but cx=1 -> only the first byte of each row copied.
    const planeStride = 2 * 1; // w*h
    const src = new Uint8Array(4 * planeStride);
    src[0] = 0xff; // row0 byte0 plane0
    src[1] = 0xff; // row0 byte1 plane0 (must NOT be copied)
    applyPlacedImage(page, { src, si: 0, di: 0, cx: 1, w: 2, h: 1, planeStride });
    expect(pixelIndex(page, 0, 0)).toBe(1); // byte 0 copied
    expect(pixelIndex(page, 8, 0)).toBe(0); // byte 1 NOT copied
  });

  it('composeBackground applies an ordered list in sequence', () => {
    const page = new Uint8Array(4 * PLANE_STRIDE);
    const mk = (planeByte: number, di: number): BackgroundPlacement => {
      const src = new Uint8Array(4);
      src[planeByte] = 0xff;
      return { src, si: 0, di, cx: 1, w: 1, h: 1, planeStride: 1 };
    };
    composeBackground(page, [mk(0, 0), mk(1, 0), mk(0, PAGE_ROW_BYTES)]);
    expect(pixelIndex(page, 0, 0)).toBe(3); // bits 0|1 at page byte (0,0)
    expect(pixelIndex(page, 0, 1)).toBe(1); // bit 0 at page byte (0,1) — di = one row
  });
});
