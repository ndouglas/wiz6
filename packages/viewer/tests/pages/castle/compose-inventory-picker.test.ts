import { describe, it, expect } from 'vitest';
import {
  composeInventoryPicker,
  nextInventoryCursor,
} from '../../../src/pages/castle/compose-inventory-picker.js';

describe('nextInventoryCursor (items + NONE; NONE index == itemCount)', () => {
  it('Down advances through items, lands on NONE, clamps there', () => {
    expect(nextInventoryCursor(0, 'ArrowDown', 5)).toBe(1);
    expect(nextInventoryCursor(4, 'ArrowDown', 5)).toBe(5); // → NONE
    expect(nextInventoryCursor(5, 'ArrowDown', 5)).toBe(5); // clamp at NONE
  });
  it('Up retreats off NONE onto items, clamps at 0', () => {
    expect(nextInventoryCursor(5, 'ArrowUp', 5)).toBe(4); // NONE → last item
    expect(nextInventoryCursor(1, 'ArrowUp', 5)).toBe(0);
    expect(nextInventoryCursor(0, 'ArrowUp', 5)).toBe(0); // clamp at first item
  });
  it('with 0 items, only NONE (0) exists', () => {
    expect(nextInventoryCursor(0, 'ArrowDown', 0)).toBe(0);
    expect(nextInventoryCursor(0, 'ArrowUp', 0)).toBe(0);
  });
  it('non-vertical keys do not move', () => {
    expect(nextInventoryCursor(1, 'ArrowLeft', 5)).toBe(1);
    expect(nextInventoryCursor(1, 'ArrowRight', 5)).toBe(1);
    expect(nextInventoryCursor(1, 'Enter', 5)).toBe(1);
  });
});

describe('composeInventoryPicker', () => {
  const items = [{ name: 'LONGSWORD' }, { name: 'SANDALS' }];

  it('cursor on NONE: only the prompt bar (no row highlight)', () => {
    const windows = composeInventoryPicker({ prompt: 'ASSAY WHICH ITEM?', items, cursor: 2 });
    expect(windows).toHaveLength(1);
  });

  it('cursor on an item: prompt bar + a row-highlight overlay', () => {
    const windows = composeInventoryPicker({ prompt: 'ASSAY WHICH ITEM?', items, cursor: 0 });
    expect(windows).toHaveLength(2);
    // Row highlight sits on the first inventory row (cell row 9 → y=72).
    expect(windows[1]!.screenY).toBe(9 * 8);
  });
});
