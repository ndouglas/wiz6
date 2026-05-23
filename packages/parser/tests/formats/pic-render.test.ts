import { describe, expect, it } from 'vitest';
import { renderPicDescriptor } from '../../src/formats/pic-render.js';
import { EGA_FILE_INDEX_PERMUTATION } from '../../src/formats/ega-permutation.js';
import { WIZ6_MAIN, EGA_DEFAULT } from '@wiz6/data';
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
  it('renders a 1×1-cell sprite with one populated cell of file pattern 0 (black)', () => {
    const buffer = Array(32).fill(0);
    const d = descriptor({ pos: 0, width: 1, height: 1, mask: [0x01] });
    const out = renderPicDescriptor(d, buffer, EGA_DEFAULT);
    expect(out.width).toBe(8);
    expect(out.height).toBe(8);
    expect(out.rgba.length).toBe(256);
    // File pattern 0 → permutation[0] = 0 → EGA_DEFAULT.colors[0] = black
    expect(Array.from(out.rgba.subarray(0, 4))).toEqual([0, 0, 0, 255]);
  });

  it('renders file pattern 1 (B plane bit set) via permuted EGA index', () => {
    const buffer = Array(32).fill(0);
    buffer[0] = 0xff;
    const d = descriptor({ pos: 0, width: 1, height: 1, mask: [0x01] });
    const out = renderPicDescriptor(d, buffer, EGA_DEFAULT);
    // File pattern 1 → permutation[1] = 15 → EGA_DEFAULT.colors[15] (white)
    const egaIdx = EGA_FILE_INDEX_PERMUTATION[1]!;
    const [r, g, b] = EGA_DEFAULT.colors[egaIdx]!;
    expect(Array.from(out.rgba.subarray(0, 4))).toEqual([r, g, b, 0xff]);
  });

  it('renders file pattern 5 (B+R) via permuted EGA index', () => {
    const buffer = Array(32).fill(0);
    buffer[0] = 0xff;
    buffer[16] = 0xff;
    const d = descriptor({ pos: 0, width: 1, height: 1, mask: [0x01] });
    const out = renderPicDescriptor(d, buffer, EGA_DEFAULT);
    // File pattern 5 → permutation[5] = 14 → EGA_DEFAULT.colors[14] (yellow)
    const egaIdx = EGA_FILE_INDEX_PERMUTATION[5]!;
    const [r, g, b] = EGA_DEFAULT.colors[egaIdx]!;
    expect(Array.from(out.rgba.subarray(0, 4))).toEqual([r, g, b, 0xff]);
  });

  it('renders file pattern 15 (all planes set) as transparent', () => {
    // The original driver's sprite-blit code treats pattern 15 (= all 4 planes
    // set, the inverse of the per-pixel mask) as a transparency marker. Our
    // renderer follows the same rule, applied BEFORE the permutation.
    const buffer = Array(32).fill(0);
    buffer[0] = 0xff;
    buffer[8] = 0xff;
    buffer[16] = 0xff;
    buffer[24] = 0xff;
    const d = descriptor({ pos: 0, width: 1, height: 1, mask: [0x01] });
    const out = renderPicDescriptor(d, buffer, EGA_DEFAULT);
    expect(Array.from(out.rgba.subarray(0, 4))).toEqual([0, 0, 0, 0]);
  });

  it('skips unpopulated cells (mask bit unset) without consuming atlas bytes', () => {
    // 2×1 sprite, mask = 0b10 — only cell 1 (right half) is populated.
    const buffer = Array(32).fill(0);
    buffer[0] = 0xff;  // populated cell will paint a single colour here
    const d = descriptor({ pos: 0, width: 2, height: 1, mask: [0b10] });
    const out = renderPicDescriptor(d, buffer, EGA_DEFAULT);
    expect(out.width).toBe(16);
    expect(out.height).toBe(8);
    // Pixel (0,0) — left half — transparent (cell skipped)
    expect(Array.from(out.rgba.subarray(0, 4))).toEqual([0, 0, 0, 0]);
    // Pixel (0,8) — right half — file pattern 1 → permutation[1] = 15 → white
    const egaIdx = EGA_FILE_INDEX_PERMUTATION[1]!;
    const [r, g, b] = EGA_DEFAULT.colors[egaIdx]!;
    expect(Array.from(out.rgba.subarray(8 * 4, 8 * 4 + 4))).toEqual([r, g, b, 0xff]);
  });

  it('looks up the permuted index in whatever palette is passed (e.g. WIZ6_MAIN)', () => {
    // File pattern 5 → permutation[5] = 14 → WIZ6_MAIN.colors[14]
    const buffer = Array(32).fill(0);
    buffer[0] = 0xff;
    buffer[16] = 0xff;
    const d = descriptor({ pos: 0, width: 1, height: 1, mask: [0x01] });
    const out = renderPicDescriptor(d, buffer, WIZ6_MAIN);
    const egaIdx = EGA_FILE_INDEX_PERMUTATION[5]!;
    const [r, g, b] = WIZ6_MAIN.colors[egaIdx]!;
    expect(Array.from(out.rgba.subarray(0, 4))).toEqual([r, g, b, 0xff]);
  });
});

describe('EGA_DEFAULT', () => {
  it('has 16 entries', () => {
    expect(EGA_DEFAULT.colors).toHaveLength(16);
  });

  it('entry 0 is black', () => {
    expect(EGA_DEFAULT.colors[0]).toEqual([0, 0, 0]);
  });

  it('entry 15 is white', () => {
    expect(EGA_DEFAULT.colors[15]).toEqual([0xff, 0xff, 0xff]);
  });
});

describe('WIZ6_MAIN', () => {
  it('has 16 entries', () => {
    expect(WIZ6_MAIN.colors).toHaveLength(16);
  });

  it('logical 0 is black (physical 0)', () => {
    expect(WIZ6_MAIN.colors[0]).toEqual([0, 0, 0]);
  });
});
