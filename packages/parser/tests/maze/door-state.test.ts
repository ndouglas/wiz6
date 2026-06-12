import { describe, it, expect } from 'vitest';
import { DoorStateOverlay } from '../../src/maze/door-state.js';

describe('DoorStateOverlay', () => {
  it('records an opened edge -> passable', () => {
    const o = new DoorStateOverlay();
    o.open(128, 131, 1);
    expect(o.isOpen(128, 131, 1)).toBe(true);
    expect(o.isOpen(128, 131, 0)).toBe(false);
  });
  it('records welding', () => {
    const o = new DoorStateOverlay();
    o.weld(128, 131, 1);
    expect(o.isWelded(128, 131, 1)).toBe(true);
  });
});
