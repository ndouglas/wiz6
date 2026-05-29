import { describe, it, expect } from 'vitest';
import { composeMainPanel } from '../../../src/pages/castle/compose-main-panel.js';

describe('composeMainPanel', () => {
  it('returns a 40×20 TileWindow at screen (0, 0)', () => {
    const win = composeMainPanel({});
    expect(win.widthCells).toBe(40);
    expect(win.heightCells).toBe(20);
    expect(win.screenX).toBe(0);
    expect(win.screenY).toBe(0);
  });

  it('clears the panel to (space, attr 0x03) — scaffold-empty placeholder', () => {
    const win = composeMainPanel({});
    for (let i = 0; i < win.cells.length; i += 2) {
      expect(win.cells[i]).toBe(0x20); // space
      expect(win.cells[i + 1]).toBe(0x03); // attr
    }
  });
});
