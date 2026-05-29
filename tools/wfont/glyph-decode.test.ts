import { describe, expect, it } from 'vitest';
import { decodeGlyph, encodePattern } from './glyph-decode.js';

describe('decodeGlyph', () => {
  it('decodes a 32-byte 4bpp tile into an 8×8 palette-index grid', () => {
    // wfont3 char 0x5f (underscore-bar): black row 0 + 6 gray rows + black row 7
    // 4 plane bytes per row: planes G, B, R, I (MSB-first within each plane byte)
    // Row N's 4 planes are at bytes [N], [N+8], [N+16], [N+24].
    // For "all 0" rows: all plane bits are 0. For "all 8" rows: only plane I bit is set.
    const bytes = new Uint8Array(32);
    // rows 1-6: all 8 (plane I = 0xff, others 0)
    for (let r = 1; r <= 6; r++) bytes[24 + r] = 0xff;
    // rows 0 and 7 stay as zeros (all black)

    const grid = decodeGlyph(bytes);
    expect(grid).toHaveLength(8);
    expect(grid[0]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]); // black top
    expect(grid[1]).toEqual([8, 8, 8, 8, 8, 8, 8, 8]); // gray
    expect(grid[6]).toEqual([8, 8, 8, 8, 8, 8, 8, 8]); // gray
    expect(grid[7]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]); // black bottom
  });

  it('encodePattern parses a pattern string into a grid', () => {
    const grid = encodePattern('00000000;88888888;88888888;88888888;88888888;88888888;88888888;00000000');
    expect(grid).toHaveLength(8);
    expect(grid[0]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(grid[1]).toEqual([8, 8, 8, 8, 8, 8, 8, 8]);
    expect(grid[7]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('encodePattern allows ? as wildcard', () => {
    const grid = encodePattern('????????;88888888;????????;????????;????????;????????;????????;00000000');
    expect(grid[0]).toEqual(['?', '?', '?', '?', '?', '?', '?', '?']);
    expect(grid[1]).toEqual([8, 8, 8, 8, 8, 8, 8, 8]);
  });
});
