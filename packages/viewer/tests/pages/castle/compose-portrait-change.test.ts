import { describe, it, expect } from 'vitest';
import { composePortraitChange } from '../../../src/pages/castle/compose-portrait-change.js';
import type { MessageDb } from '@wiz6/data';

const stubDb = {
  indexedMessages: [
    { id: 0x458, decodedText: '◄► TO REVIEW PORTRAITS' },
    { id: 0x459, decodedText: 'PRESS ▶ TO SELECT' },
  ],
} as unknown as MessageDb;

function charAt(cells: Uint8Array, w: number, col: number, row: number): string {
  return String.fromCharCode(cells[(row * w + col) * 2] ?? 0);
}

describe('composePortraitChange', () => {
  it('window is 20×16 at (x=20, y=4) — engine geometry', () => {
    const w = composePortraitChange({ previewIdx: 0, db: stubDb });
    expect(w.widthCells).toBe(20);
    expect(w.heightCells).toBe(16);
    expect(w.screenX).toBe(20 * 8);
    expect(w.screenY).toBe(4 * 8);
  });

  it('renders 3×3 portrait tile grid at chars 0x48..0x50', () => {
    const w = composePortraitChange({ previewIdx: 0, db: stubDb });
    // Grid is centered-ish inside the sub-window; pick a known coord per
    // wpcmk's PortraitChangeScreen pattern: (8, 3)..(10, 5).
    expect(charAt(w.cells, 20, 8, 3).charCodeAt(0)).toBe(0x48);
    expect(charAt(w.cells, 20, 9, 3).charCodeAt(0)).toBe(0x49);
    expect(charAt(w.cells, 20, 10, 3).charCodeAt(0)).toBe(0x4a);
    expect(charAt(w.cells, 20, 10, 5).charCodeAt(0)).toBe(0x50);
  });

  it('renders msg 0x458 on row 9 and msg 0x459 on row 12', () => {
    const w = composePortraitChange({ previewIdx: 0, db: stubDb });
    // The text content is what matters; exact column depends on centering.
    let row9 = '';
    for (let c = 0; c < 20; c++) row9 += charAt(w.cells, 20, c, 9);
    let row12 = '';
    for (let c = 0; c < 20; c++) row12 += charAt(w.cells, 20, c, 12);
    expect(row9).toContain('REVIEW');
    expect(row12).toContain('SELECT');
  });
});
