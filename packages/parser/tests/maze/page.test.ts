import { describe, it, expect } from 'vitest';
import { decodePageIndex } from '../../src/maze/page.js';
import { PLANE_STRIDE } from '@wiz6/data';

describe('decodePageIndex', () => {
  it('reads a single set pixel from plane 0 at (x,y)=(0,0)', () => {
    const page = new Uint8Array(4 * PLANE_STRIDE);
    page[0] = 0x80; // plane0, row0, leftmost bit set
    const idx = decodePageIndex(page, 320, 200);
    expect(idx[0]).toBe(1); // plane0 contributes bit 0
  });
  it('combines all 4 planes into a 0..15 index', () => {
    const page = new Uint8Array(4 * PLANE_STRIDE);
    for (let p = 0; p < 4; p++) page[p * PLANE_STRIDE] = 0x80;
    expect(decodePageIndex(page, 320, 200)[0]).toBe(15);
  });
});
