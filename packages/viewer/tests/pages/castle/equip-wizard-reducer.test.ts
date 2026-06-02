import { describe, it, expect } from 'vitest';
import { nextEquipCursor, nextPopulatedSlot } from '../../../src/pages/castle/equip-wizard-reducer.js';

// Engine-exact (RE: wpcvw-equip-ux-correction.json): the cursor CYCLES through
// [candidate0..N-1, NONE] where NONE == candidateCount, starting on NONE. 2
// candidates → positions 0,1 + NONE(2). DOWN/RIGHT forward, UP/LEFT back.
describe('nextEquipCursor (cycle through candidates + NONE)', () => {
  it('Down cycles NONE → candidate0 → candidate1 → NONE', () => {
    expect(nextEquipCursor(2, 'ArrowDown', 2)).toBe(0); // NONE → candidate0
    expect(nextEquipCursor(0, 'ArrowDown', 2)).toBe(1); // candidate0 → candidate1
    expect(nextEquipCursor(1, 'ArrowDown', 2)).toBe(2); // last candidate → NONE
  });
  it('Up cycles the reverse (NONE → last candidate → ... → candidate0 → NONE)', () => {
    expect(nextEquipCursor(2, 'ArrowUp', 2)).toBe(1); // NONE → last candidate
    expect(nextEquipCursor(1, 'ArrowUp', 2)).toBe(0);
    expect(nextEquipCursor(0, 'ArrowUp', 2)).toBe(2); // candidate0 → NONE
  });
  it('LEFT/RIGHT alias UP/DOWN', () => {
    expect(nextEquipCursor(2, 'ArrowRight', 2)).toBe(0);
    expect(nextEquipCursor(0, 'ArrowLeft', 2)).toBe(2);
  });
  it('with 0 candidates, only NONE (0) exists', () => {
    expect(nextEquipCursor(0, 'ArrowDown', 0)).toBe(0);
    expect(nextEquipCursor(0, 'ArrowUp', 0)).toBe(0);
  });
  it('non-nav keys do not move', () => {
    expect(nextEquipCursor(1, 'Enter', 2)).toBe(1);
  });
});

describe('nextPopulatedSlot', () => {
  const hasCands = (s: number) => s === 0 || s === 4 || s === 7;
  it('returns the next populated slot after `from`', () => {
    expect(nextPopulatedSlot(0, hasCands)).toBe(4);
    expect(nextPopulatedSlot(4, hasCands)).toBe(7);
  });
  it('returns null when no later slot has candidates', () => {
    expect(nextPopulatedSlot(7, hasCands)).toBeNull();
  });
  it('treats -1 as "before slot 0" so it finds the first populated slot', () => {
    expect(nextPopulatedSlot(-1, hasCands)).toBe(0);
  });
});
