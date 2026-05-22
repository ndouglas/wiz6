import { describe, expect, it } from 'vitest';
import { renderPicDescriptor, EGA_PALETTE } from '../../src/formats/pic-render.js';
import type { PicDescriptor } from '@wiz6/data';

function descriptor(opts: { pos: number; width: number; height: number; mask: number[] }): PicDescriptor {
  return {
    index: 0,
    pos: opts.pos,
    width: opts.width,
    height: opts.height,
    mask: [...opts.mask, ...Array(20 - opts.mask.length).fill(0)].slice(0, 20),
  };
}

describe('renderPicDescriptor', () => {
  it('renders a 1×1-cell sprite with one populated cell of color 0 (black)', () => {
    // 32-byte cell at offset 0: all zeros => every pixel is color 0 (black)
    const buffer = Array(32).fill(0);
    const d = descriptor({ pos: 0, width: 1, height: 1, mask: [0x01] });
    const out = renderPicDescriptor(d, buffer);
    expect(out.width).toBe(8);
    expect(out.height).toBe(8);
    // 8×8×4 RGBA bytes = 256
    expect(out.rgba.length).toBe(256);
    // Check pixel (0,0): black with alpha 255
    expect(Array.from(out.rgba.subarray(0, 4))).toEqual([0, 0, 0, 255]);
    // Check pixel (7,7) — last pixel
    const last = 8 * 8 * 4 - 4;
    expect(Array.from(out.rgba.subarray(last, last + 4))).toEqual([0, 0, 0, 255]);
  });

  it('renders color 15 (white) as transparent (alpha 0)', () => {
    // 32-byte cell where every plane bit is set in row 0:
    //   plane 0 row 0 = 0xFF, plane 1 row 0 = 0xFF, plane 2 row 0 = 0xFF, plane 3 row 0 = 0xFF
    // → all 8 pixels of row 0 are color 15 = transparent
    const buffer = Array(32).fill(0);
    buffer[0] = 0xff;
    buffer[8] = 0xff;
    buffer[16] = 0xff;
    buffer[24] = 0xff;
    const d = descriptor({ pos: 0, width: 1, height: 1, mask: [0x01] });
    const out = renderPicDescriptor(d, buffer);
    // Pixel (0,0): transparent
    expect(Array.from(out.rgba.subarray(0, 4))).toEqual([0, 0, 0, 0]);
    // Pixel (0,7): also transparent (same row)
    expect(Array.from(out.rgba.subarray(7 * 4, 7 * 4 + 4))).toEqual([0, 0, 0, 0]);
    // Pixel (1,0): color 0 (black) since row 1 has no set planes
    const row1off = 8 * 4;
    expect(Array.from(out.rgba.subarray(row1off, row1off + 4))).toEqual([0, 0, 0, 255]);
  });

  it('renders color 2 (green) when only the green plane (bytes 0-7) is set', () => {
    // Plane order in file: [G, B, R, I]. Bytes 0-7 are green.
    // EGA color 2 = green = (0x00, 0xAA, 0x00).
    const buffer = Array(32).fill(0);
    buffer[0] = 0xff;
    const d = descriptor({ pos: 0, width: 1, height: 1, mask: [0x01] });
    const out = renderPicDescriptor(d, buffer);
    expect(Array.from(out.rgba.subarray(0, 4))).toEqual([0x00, 0xaa, 0x00, 0xff]);
  });

  it('renders color 1 (blue) when only the blue plane (bytes 8-15) is set', () => {
    const buffer = Array(32).fill(0);
    buffer[8] = 0xff;
    const d = descriptor({ pos: 0, width: 1, height: 1, mask: [0x01] });
    const out = renderPicDescriptor(d, buffer);
    expect(Array.from(out.rgba.subarray(0, 4))).toEqual([0x00, 0x00, 0xaa, 0xff]);
  });

  it('renders color 12 (light red) when red (16-23) and intensity (24-31) planes are set', () => {
    const buffer = Array(32).fill(0);
    buffer[16] = 0xff;
    buffer[24] = 0xff;
    const d = descriptor({ pos: 0, width: 1, height: 1, mask: [0x01] });
    const out = renderPicDescriptor(d, buffer);
    expect(Array.from(out.rgba.subarray(0, 4))).toEqual([0xff, 0x55, 0x55, 0xff]);
  });

  it('renders color 14 (yellow) when green + red + intensity planes are set', () => {
    // Yellow = R + G + I = color 0b1110 = 14. EGA palette[14] = (0xFF, 0xFF, 0x55).
    // Verified empirically against the live credits sprite — text should be yellow,
    // not purple (which is what the swapped plane order produced).
    const buffer = Array(32).fill(0);
    buffer[0] = 0xff;   // green
    buffer[16] = 0xff;  // red
    buffer[24] = 0xff;  // intensity
    const d = descriptor({ pos: 0, width: 1, height: 1, mask: [0x01] });
    const out = renderPicDescriptor(d, buffer);
    expect(Array.from(out.rgba.subarray(0, 4))).toEqual([0xff, 0xff, 0x55, 0xff]);
  });

  it('skips unpopulated cells without consuming atlas bytes', () => {
    // 2×1 sprite, mask = 0b10 (only cell 1 is populated).
    const buffer = Array(32).fill(0);
    buffer[8] = 0xff;  // blue plane row 0 — gives blue
    const d = descriptor({ pos: 0, width: 2, height: 1, mask: [0b10] });
    const out = renderPicDescriptor(d, buffer);
    expect(out.width).toBe(16);
    expect(out.height).toBe(8);
    // Pixel (0,0) — left half — should be transparent (no cell painted here)
    expect(Array.from(out.rgba.subarray(0, 4))).toEqual([0, 0, 0, 0]);
    // Pixel (0,8) — right half row 0 col 0 — should be blue from the populated cell
    expect(Array.from(out.rgba.subarray(8 * 4, 8 * 4 + 4))).toEqual([0x00, 0x00, 0xaa, 0xff]);
  });
});

describe('EGA_PALETTE', () => {
  it('has 16 entries', () => {
    expect(EGA_PALETTE).toHaveLength(16);
  });

  it('entry 0 is black', () => {
    expect(EGA_PALETTE[0]).toEqual([0, 0, 0]);
  });

  it('entry 15 is white', () => {
    expect(EGA_PALETTE[15]).toEqual([0xff, 0xff, 0xff]);
  });
});
