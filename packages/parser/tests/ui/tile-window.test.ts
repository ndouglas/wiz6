import { describe, expect, it } from 'vitest';
import {
  createTileWindow,
  clearWindow,
  setCursor,
  puts,
  centeredPuts,
  renderTileWindow,
} from '../../src/ui/tile-window.js';
import { WIZ6_MAIN, type Font4bpp } from '@wiz6/data';

/** Make a fake 4bpp font where every char's first plane row 0 has only
 *  the leftmost pixel set (file color 1), so we can detect that a tile
 *  was actually rendered without depending on real font data. */
function fakeFont(): Font4bpp {
  const glyphs: number[][] = [];
  for (let c = 0; c < 128; c++) {
    const g: number[] = new Array(32).fill(0);
    g[0] = 0x80; // plane G, row 0, leftmost pixel
    glyphs.push(g);
  }
  return { id: 'fake', sourceFile: 'fake.ega', glyphCount: 128, glyphs };
}

describe('createTileWindow', () => {
  it('allocates a zeroed cell grid of w * h * 2 bytes', () => {
    const w = createTileWindow({ screenX: 8, screenY: 16, widthCells: 40, heightCells: 5 });
    expect(w.cells.length).toBe(40 * 5 * 2);
    expect(w.cells.every((b) => b === 0)).toBe(true);
    expect(w.cursorX).toBe(0);
    expect(w.cursorY).toBe(0);
  });
});

describe('clearWindow', () => {
  it('fills every cell with (char, attr) and resets the cursor', () => {
    const w = createTileWindow({ screenX: 0, screenY: 0, widthCells: 3, heightCells: 2 });
    w.cursorX = 2;
    w.cursorY = 1;
    clearWindow(w, 0x5f, 0x03);
    for (let i = 0; i < w.cells.length; i += 2) {
      expect(w.cells[i]).toBe(0x5f);
      expect(w.cells[i + 1]).toBe(0x03);
    }
    expect(w.cursorX).toBe(0);
    expect(w.cursorY).toBe(0);
  });
});

describe('setCursor', () => {
  it('clamps coordinates by modding with the window dimensions', () => {
    const w = createTileWindow({ screenX: 0, screenY: 0, widthCells: 4, heightCells: 3 });
    setCursor(w, 5, 4);
    expect(w.cursorX).toBe(1);
    expect(w.cursorY).toBe(1);
    setCursor(w, -1, -1);
    expect(w.cursorX).toBe(3);
    expect(w.cursorY).toBe(2);
  });
});

describe('puts', () => {
  it('writes each byte as (char, attr) advancing the cursor 1 cell per byte', () => {
    const w = createTileWindow({ screenX: 0, screenY: 0, widthCells: 4, heightCells: 2 });
    puts(w, 'abc', 0x03);
    expect(w.cells[0]).toBe(0x61); // 'a'
    expect(w.cells[1]).toBe(0x03); // attr
    expect(w.cells[2]).toBe(0x62); // 'b'
    expect(w.cells[3]).toBe(0x03);
    expect(w.cells[4]).toBe(0x63); // 'c'
    expect(w.cells[5]).toBe(0x03);
    expect(w.cursorX).toBe(3);
    expect(w.cursorY).toBe(0);
  });

  it('wraps x to the next row and y back to 0 at the bottom', () => {
    const w = createTileWindow({ screenX: 0, screenY: 0, widthCells: 2, heightCells: 2 });
    puts(w, 'abcde', 0x03);
    // 'a' at (0,0), 'b' at (1,0), 'c' at (0,1), 'd' at (1,1), 'e' wraps back to (0,0)
    expect(w.cells[0]).toBe(0x65); // 'e' overwrote 'a'
    expect(w.cells[2]).toBe(0x62); // 'b'
    expect(w.cells[4]).toBe(0x63); // 'c'
    expect(w.cells[6]).toBe(0x64); // 'd'
    expect(w.cursorX).toBe(1);
    expect(w.cursorY).toBe(0);
  });
});

describe('centeredPuts', () => {
  it("translates engine attr >= 0x10 by subtracting 0xF (so c61a's 0x12 → wfont3 attr 3)", () => {
    const w = createTileWindow({ screenX: 0, screenY: 0, widthCells: 10, heightCells: 1 });
    centeredPuts(w, 'AB', 0x12, 0x5f);
    // Every cell's attr should be 0x03 (= 0x12 - 0xF)
    for (let i = 1; i < w.cells.length; i += 2) {
      expect(w.cells[i]).toBe(0x03);
    }
  });

  it('pads with the given char on both sides of the text, centering even-length text', () => {
    const w = createTileWindow({ screenX: 0, screenY: 0, widthCells: 8, heightCells: 1 });
    centeredPuts(w, 'AB', 0x03, 0x5f); // 6 padding chars total → 3 left, 3 right
    const chars: number[] = [];
    for (let i = 0; i < w.cells.length; i += 2) chars.push(w.cells[i]!);
    expect(chars).toEqual([0x5f, 0x5f, 0x5f, 0x41, 0x42, 0x5f, 0x5f, 0x5f]);
  });

  it('handles odd-length text — left pad gets the smaller half', () => {
    const w = createTileWindow({ screenX: 0, screenY: 0, widthCells: 7, heightCells: 1 });
    centeredPuts(w, 'ABC', 0x03, 0x5f); // 4 padding total → 2 left, 2 right
    const chars: number[] = [];
    for (let i = 0; i < w.cells.length; i += 2) chars.push(w.cells[i]!);
    expect(chars).toEqual([0x5f, 0x5f, 0x41, 0x42, 0x43, 0x5f, 0x5f]);
  });
});

describe('renderTileWindow', () => {
  it('renders one tile per cell at the right screen position via the attr-selected font', () => {
    const font = fakeFont();
    const w = createTileWindow({ screenX: 16, screenY: 24, widthCells: 2, heightCells: 1 });
    puts(w, 'AB', 0x03); // attr_lo=3 → use font3
    const buf = new Uint8ClampedArray(40 * 32 * 4);
    renderTileWindow(w, buf, 40, 32, { font3: font }, WIZ6_MAIN);
    const getPx = (x: number, y: number) => {
      const i = (y * 40 + x) * 4;
      return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
    };
    // Leftmost pixel of row 0 of each glyph has file color 1.
    // WIZ6_MAIN.colors[1] = white. So (16, 24) and (16+8, 24) should be white.
    expect(getPx(16, 24)).toEqual([0xff, 0xff, 0xff, 0xff]);
    expect(getPx(24, 24)).toEqual([0xff, 0xff, 0xff, 0xff]);
    // Outside the rendered tiles: buffer untouched (alpha 0).
    expect(getPx(15, 24)).toEqual([0, 0, 0, 0]);
    // Inside a tile but on a row where every plane is zero → file color
    // 0 → palette[0] = (0,0,0) black. Tiles are OPAQUE so this gets
    // written as (0,0,0,0xff), not skipped. This is the key behavior of
    // the tile model.
    expect(getPx(16, 25)).toEqual([0, 0, 0, 0xff]);
  });

  it('skips cells whose attr selects a missing font', () => {
    const w = createTileWindow({ screenX: 0, screenY: 0, widthCells: 1, heightCells: 1 });
    puts(w, 'A', 0x03); // wants font3 but we'll provide none
    const buf = new Uint8ClampedArray(8 * 8 * 4);
    renderTileWindow(w, buf, 8, 8, {}, WIZ6_MAIN);
    // Buffer should be untouched (still all zero)
    expect(buf.every((b) => b === 0)).toBe(true);
  });
});
