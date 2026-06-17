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

  // A door is one physical EDGE shared by two (cell,facing) representations:
  // (gx,gy,facing) and its reciprocal (destCell, (facing+2)%4). Opening/welding one
  // side must apply to the other, else you can't walk BACK through a door you opened
  // from the far side (#091 walk-back bug). The engine stores walls as a shared edge.
  it('open() is edge-symmetric: opening one side opens the reciprocal', () => {
    const o = new DoorStateOverlay();
    o.open(124, 121, 2); // facing 2 from (124,121) -> steps to (124,120)
    expect(o.isOpen(124, 121, 2)).toBe(true);
    // Reciprocal: from (124,120) facing 0 you step back to (124,121) across the SAME edge.
    expect(o.isOpen(124, 120, 0)).toBe(true);
  });

  it('weld() is edge-symmetric: welding one side welds the reciprocal', () => {
    const o = new DoorStateOverlay();
    o.weld(124, 121, 2);
    expect(o.isWelded(124, 121, 2)).toBe(true);
    expect(o.isWelded(124, 120, 0)).toBe(true);
  });
});
