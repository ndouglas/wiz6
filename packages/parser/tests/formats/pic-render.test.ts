import { describe, expect, it } from 'vitest';
import {
  renderPicDescriptor,
  compositePicDescriptor,
  compositePicScript,
} from '../../src/formats/pic-render.js';
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

describe('compositePicDescriptor', () => {
  it('writes color-15 cells as transparent (no destination write)', () => {
    // Atlas cell with all-1 bits in every plane → file color 15 = transparent
    const buffer = Array(32).fill(0xff);
    const d = descriptor({ pos: 0, width: 1, height: 1, mask: [0x01] });
    // Pre-fill destination with a sentinel color
    const dest = new Uint8ClampedArray(8 * 8 * 4);
    for (let i = 0; i < dest.length; i += 4) {
      dest[i] = 0x42;
      dest[i + 1] = 0x42;
      dest[i + 2] = 0x42;
      dest[i + 3] = 0xff;
    }
    compositePicDescriptor(dest, 8, 8, 0, 0, d, buffer, EGA_DEFAULT);
    // Every pixel should still be the sentinel (transparent left dest alone)
    expect(Array.from(dest.subarray(0, 4))).toEqual([0x42, 0x42, 0x42, 0xff]);
    expect(Array.from(dest.subarray(252, 256))).toEqual([0x42, 0x42, 0x42, 0xff]);
  });

  it('writes opaque cells through, leaving transparent cells of an overpainted descriptor untouched', () => {
    // Layer A: 1×1 cell, all-zero atlas → file pattern 0 → EGA index 0 (black)
    const bufferA = Array(32).fill(0);
    const descA = descriptor({ pos: 0, width: 1, height: 1, mask: [0x01] });
    // Layer B: 1×1 cell, all-1 atlas → file pattern 15 → transparent
    const bufferB = Array(32).fill(0xff);
    const descB = descriptor({ pos: 0, width: 1, height: 1, mask: [0x01] });

    const dest = new Uint8ClampedArray(8 * 8 * 4);
    compositePicDescriptor(dest, 8, 8, 0, 0, descA, bufferA, EGA_DEFAULT);
    // Layer A wrote black; overpaint with transparent layer B (should NOT overwrite)
    compositePicDescriptor(dest, 8, 8, 0, 0, descB, bufferB, EGA_DEFAULT);
    expect(Array.from(dest.subarray(0, 4))).toEqual([0, 0, 0, 0xff]);
  });

  it('clips writes to destination bounds without throwing', () => {
    const buffer = Array(32).fill(0);
    const d = descriptor({ pos: 0, width: 1, height: 1, mask: [0x01] });
    const dest = new Uint8ClampedArray(8 * 8 * 4);
    // Render at (-4, -4) — half off-canvas
    compositePicDescriptor(dest, 8, 8, -4, -4, d, buffer, EGA_DEFAULT);
    // Should not throw; lower-right quadrant of the sprite should land
    // at dest top-left (pixels (0,0)..(3,3))
    expect(Array.from(dest.subarray(0, 4))).toEqual([0, 0, 0, 0xff]);
  });
});

describe('compositePicScript', () => {
  it('walks a multi-descriptor script and composites in order', () => {
    const bufferA = Array(32).fill(0); // black
    const bufferB = Array(64).fill(0);
    // Two descriptors back-to-back in a shared buffer
    const shared = [...bufferA, ...bufferB];
    const descA = descriptor({ pos: 0, width: 1, height: 1, mask: [0x01] });
    const descB = descriptor({ pos: 32, width: 1, height: 1, mask: [0x01] });

    const dest = new Uint8ClampedArray(8 * 8 * 4);
    compositePicScript(
      dest,
      8, 8, 0, 0,
      [0, 1],
      { descriptors: [descA, descB] },
      shared,
      EGA_DEFAULT,
    );
    // Both descriptors target the same (0,0); end state = last one (B) wins
    // Both produce black for file-pattern-0 atlas, so result is black
    expect(Array.from(dest.subarray(0, 4))).toEqual([0, 0, 0, 0xff]);
  });

  it('skips undefined descriptor indices silently', () => {
    const dest = new Uint8ClampedArray(8 * 8 * 4);
    compositePicScript(dest, 8, 8, 0, 0, [99], { descriptors: [] }, [], EGA_DEFAULT);
    // No throw, no writes
    expect(Array.from(dest.subarray(0, 4))).toEqual([0, 0, 0, 0]);
  });
});
