import { describe, it, expect } from 'vitest';
import { composeClassPicker } from '../../../src/pages/castle/compose-class-picker.js';
import type { MessageDb } from '@wiz6/data';

// Class names per CLASS_REQUIREMENTS order.
const CLASS_LABELS = [
  'FIGHTER', 'MAGE', 'PRIEST', 'THIEF', 'RANGER', 'ALCHEMI',
  'BARD', 'PSIONIC', 'VALKYR', 'BISHOP', 'LORD', 'SAMURAI',
  'MONK', 'NINJA',
];

const stubDb = {
  indexedMessages: CLASS_LABELS.map((decodedText, i) => ({
    id: 120 + i, // class-name msg base = 120 (engine reference; verify)
    decodedText,
  })),
} as unknown as MessageDb;

function charAt(cells: Uint8Array, w: number, col: number, row: number): string {
  return String.fromCharCode(cells[(row * w + col) * 2] ?? 0);
}

describe('composeClassPicker', () => {
  it('renders only eligible class labels (others skipped)', () => {
    const w = composeClassPicker({
      cursorIdx: 0,
      eligibleClasses: [0, 1, 2], // Fighter, Mage, Priest
      db: stubDb,
    });
    // First three listed entries.
    let row0 = '';
    for (let c = 0; c < 20; c++) row0 += charAt(w.cells, w.widthCells, c, 1);
    expect(row0).toContain('FIGHTER');
  });

  it('highlights the cursor entry with attr 0x50', () => {
    const w = composeClassPicker({
      cursorIdx: 1, // second entry
      eligibleClasses: [0, 1, 2],
      db: stubDb,
    });
    // Cursor on Mage row.
    const attr = w.cells[(2 * w.widthCells + 1) * 2 + 1];
    expect(attr).toBe(0x50);
  });
});
