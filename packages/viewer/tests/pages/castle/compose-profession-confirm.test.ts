import { describe, it, expect } from 'vitest';
import { composeProfessionConfirm } from '../../../src/pages/castle/compose-profession-confirm.js';

function charAt(cells: Uint8Array, w: number, col: number, row: number): string {
  return String.fromCharCode(cells[(row * w + col) * 2] ?? 0);
}

describe('composeProfessionConfirm', () => {
  it('renders the warning text + YES / NO entries', () => {
    const w = composeProfessionConfirm({ cursorYes: false });
    let text = '';
    for (let r = 0; r < w.heightCells; r++) {
      for (let c = 0; c < w.widthCells; c++) text += charAt(w.cells, w.widthCells, c, r);
      text += '\n';
    }
    expect(text).toMatch(/CONFIRM|XP|LEVEL/i);
    expect(text).toMatch(/YES/);
    expect(text).toMatch(/NO/);
  });

  it('NO is highlighted by default (cursorYes=false)', () => {
    const w = composeProfessionConfirm({ cursorYes: false });
    // Find the NO row and confirm its attr is 0x50.
    let noRow = -1;
    let noCol = -1;
    for (let r = 0; r < w.heightCells; r++) {
      for (let c = 0; c < w.widthCells - 1; c++) {
        if (charAt(w.cells, w.widthCells, c, r) === 'N' && charAt(w.cells, w.widthCells, c + 1, r) === 'O') {
          noRow = r; noCol = c; break;
        }
      }
      if (noRow >= 0) break;
    }
    expect(noRow).toBeGreaterThanOrEqual(0);
    expect(w.cells[(noRow * w.widthCells + noCol) * 2 + 1]).toBe(0x50);
  });

  it('YES is highlighted when cursorYes=true', () => {
    const w = composeProfessionConfirm({ cursorYes: true });
    let yesRow = -1;
    let yesCol = -1;
    for (let r = 0; r < w.heightCells; r++) {
      for (let c = 0; c < w.widthCells - 2; c++) {
        if (
          charAt(w.cells, w.widthCells, c, r) === 'Y' &&
          charAt(w.cells, w.widthCells, c + 1, r) === 'E' &&
          charAt(w.cells, w.widthCells, c + 2, r) === 'S'
        ) {
          yesRow = r; yesCol = c; break;
        }
      }
      if (yesRow >= 0) break;
    }
    expect(yesRow).toBeGreaterThanOrEqual(0);
    expect(w.cells[(yesRow * w.widthCells + yesCol) * 2 + 1]).toBe(0x50);
  });
});
