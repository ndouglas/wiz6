/**
 * 4bpp wfont glyph decoder.
 *
 * Each glyph is 32 bytes: 4 EGA planes (G, B, R, I) × 8 rows.
 * Row N's plane bytes are at indices [N, N+8, N+16, N+24].
 * Within each plane byte, bit 7 is the leftmost pixel.
 *
 * Output: 8 rows × 8 columns of 4-bit palette indices (0..15).
 */
export type GlyphGrid = number[][];
export type Pattern = (number | '?')[][];

export function decodeGlyph(bytes: ArrayLike<number>): GlyphGrid {
  const out: GlyphGrid = [];
  for (let row = 0; row < 8; row++) {
    const pG = bytes[row] ?? 0;
    const pB = bytes[8 + row] ?? 0;
    const pR = bytes[16 + row] ?? 0;
    const pI = bytes[24 + row] ?? 0;
    const cells: number[] = [];
    for (let col = 0; col < 8; col++) {
      const bit = 7 - col;
      cells.push(
        ((pG >> bit) & 1) |
        (((pB >> bit) & 1) << 1) |
        (((pR >> bit) & 1) << 2) |
        (((pI >> bit) & 1) << 3),
      );
    }
    out.push(cells);
  }
  return out;
}

/**
 * Parse a pattern string into a grid. Pattern syntax:
 *   - 8 rows separated by ';'
 *   - Each row 8 chars, each char a hex digit (0..f) OR '?' for wildcard.
 * Example: '00000000;88888888;88888888;88888888;88888888;88888888;88888888;00000000'
 *          (the wfont3 0x5f banner-bar pattern)
 */
export function encodePattern(pattern: string): Pattern {
  const rows = pattern.split(';');
  if (rows.length !== 8) {
    throw new Error(`pattern must have 8 rows, got ${rows.length}`);
  }
  return rows.map((row, ri) => {
    if (row.length !== 8) {
      throw new Error(`row ${ri} must have 8 chars, got ${row.length}`);
    }
    return [...row].map((ch) => {
      if (ch === '?') return '?' as const;
      const n = parseInt(ch, 16);
      if (Number.isNaN(n)) throw new Error(`invalid pattern char '${ch}' at row ${ri}`);
      return n;
    });
  });
}

export function gridMatchesPattern(grid: GlyphGrid, pattern: Pattern): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = pattern[r]![c]!;
      if (p === '?') continue;
      if (grid[r]![c]! !== p) return false;
    }
  }
  return true;
}
