import { describe, it, expect } from 'vitest';
import { composeEditSubmenu } from '../../../src/pages/castle/compose-edit-submenu.js';
import type { MessageDb } from '@wiz6/data';

// Minimal MessageDb stub: returns the literal string for any msgId we
// reference. Keeps the test independent of the JSON.
const STUB_LABELS: Record<number, string> = {
  650: 'RENAME',
  651: 'CHGPORT',
  652: 'CHGPROF',
  653: 'REPLACE',
  654: 'EX',
};
const stubDb = {
  indexedMessages: Object.entries(STUB_LABELS).map(([id, decodedText]) => ({
    id: Number(id),
    decodedText,
  })),
} as unknown as MessageDb;

function attrAt(cells: Uint8Array, w: number, col: number, row: number): number {
  return cells[(row * w + col) * 2 + 1] ?? 0;
}

function charsAt(cells: Uint8Array, w: number, col: number, row: number, n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) {
    out += String.fromCharCode(cells[(row * w + col + i) * 2] ?? 0);
  }
  return out;
}

describe('composeEditSubmenu', () => {
  it('renders 5 entries in column-major order at the engine\'s picker coords', () => {
    const w = composeEditSubmenu({ cursorIdx: 0, db: stubDb });
    expect(w.widthCells).toBe(40);
    // Column-major: index 0 at (2, 1), index 1 at (2, 2), index 2 at (20, 1),
    // index 3 at (20, 2), index 4 at (38, 1).
    expect(charsAt(w.cells, 40, 2, 1, 6)).toBe('RENAME');
    expect(charsAt(w.cells, 40, 2, 2, 7)).toBe('CHGPORT');
    expect(charsAt(w.cells, 40, 20, 1, 7)).toBe('CHGPROF');
    expect(charsAt(w.cells, 40, 20, 2, 7)).toBe('REPLACE');
    expect(charsAt(w.cells, 40, 38, 1, 2)).toBe('EX');
  });

  it('REPLACE entry uses the dimmed disabled attr (0x07)', () => {
    const w = composeEditSubmenu({ cursorIdx: 0, db: stubDb });
    expect(attrAt(w.cells, 40, 20, 2)).toBe(0x07);
  });

  it('cursor highlight (attr 0x50) lands on the selected entry', () => {
    const w = composeEditSubmenu({ cursorIdx: 0, db: stubDb });
    expect(attrAt(w.cells, 40, 2, 1)).toBe(0x50);
  });

  it('non-cursor enabled entries use attr 0x05', () => {
    const w = composeEditSubmenu({ cursorIdx: 0, db: stubDb });
    expect(attrAt(w.cells, 40, 2, 2)).toBe(0x05); // CHGPORT
    expect(attrAt(w.cells, 40, 20, 1)).toBe(0x05); // CHGPROF
    expect(attrAt(w.cells, 40, 38, 1)).toBe(0x05); // EX
  });
});
