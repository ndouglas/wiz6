import { describe, it, expect } from 'vitest';
import {
  composeInventoryPicker,
  nextInventoryCursor,
} from '../../../src/pages/castle/compose-inventory-picker.js';

// Engine-exact nav (RE: ui_pick_inventory_item @ wpcvw 0x1a48). NONE = index
// itemCount; NONE sits OUTSIDE both ends — entering from NONE (either dir) lands
// on the TOP item (#072). 5 items → indices 0..4, NONE = 5.
describe('nextInventoryCursor (engine-exact; NONE index == itemCount)', () => {
  it('Up-from-NONE jumps to the TOP item (#072 fix)', () => {
    expect(nextInventoryCursor(5, 'ArrowUp', 5)).toBe(0);
  });
  it('Down-from-NONE also enters at the TOP item (engine quirk)', () => {
    expect(nextInventoryCursor(5, 'ArrowDown', 5)).toBe(0);
  });
  it('Up on an item moves up; from item 0 → NONE', () => {
    expect(nextInventoryCursor(3, 'ArrowUp', 5)).toBe(2);
    expect(nextInventoryCursor(0, 'ArrowUp', 5)).toBe(5); // top → NONE
  });
  it('Down on an item moves down; from the last item → NONE', () => {
    expect(nextInventoryCursor(1, 'ArrowDown', 5)).toBe(2);
    expect(nextInventoryCursor(4, 'ArrowDown', 5)).toBe(5); // last → NONE
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
