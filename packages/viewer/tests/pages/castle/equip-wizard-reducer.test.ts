import { describe, it, expect } from 'vitest';
import { nextEquipCursor, nextPopulatedSlot } from '../../../src/pages/castle/equip-wizard-reducer.js';

describe('nextEquipCursor (candidates + skip; SKIP index == candidateCount)', () => {
  it('Right advances, clamps at SKIP (== candidateCount)', () => {
    expect(nextEquipCursor(0, 'ArrowRight', 2)).toBe(1);
    expect(nextEquipCursor(1, 'ArrowRight', 2)).toBe(2); // → SKIP
    expect(nextEquipCursor(2, 'ArrowRight', 2)).toBe(2); // clamp at SKIP
  });
  it('Left retreats, clamps at 0', () => {
    expect(nextEquipCursor(2, 'ArrowLeft', 2)).toBe(1);
    expect(nextEquipCursor(0, 'ArrowLeft', 2)).toBe(0);
  });
  it('with 0 candidates, only SKIP (0) exists', () => {
    expect(nextEquipCursor(0, 'ArrowRight', 0)).toBe(0);
    expect(nextEquipCursor(0, 'ArrowLeft', 0)).toBe(0);
  });
  it('non-horizontal keys do not move', () => {
    expect(nextEquipCursor(1, 'ArrowUp', 2)).toBe(1);
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
