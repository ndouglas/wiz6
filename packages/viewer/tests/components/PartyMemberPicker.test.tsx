import { describe, it, expect } from 'vitest';
import { nextCursor } from '../../src/components/PartyMemberPicker.js';

describe('nextCursor (picker nav, cursor -1 = EXIT)', () => {
  it('Down from EXIT goes to slot 0', () => expect(nextCursor(-1, 'ArrowDown', 3)).toBe(0));
  it('Down from slot 0 goes to slot 2', () => expect(nextCursor(0, 'ArrowDown', 3)).toBe(2));
  it('Down from last member clamps', () => {
    expect(nextCursor(2, 'ArrowDown', 3)).toBe(2);
    expect(nextCursor(1, 'ArrowDown', 3)).toBe(1);
  });
  it('Up from top member row → EXIT', () => {
    expect(nextCursor(0, 'ArrowUp', 3)).toBe(-1);
    expect(nextCursor(1, 'ArrowUp', 3)).toBe(-1);
  });
  it('Up from lower row moves up a row', () => expect(nextCursor(2, 'ArrowUp', 3)).toBe(0));
  it('Right from even goes to odd neighbour if present', () => {
    expect(nextCursor(0, 'ArrowRight', 3)).toBe(1);
    expect(nextCursor(2, 'ArrowRight', 3)).toBe(2);
  });
  it('Left from odd goes to even neighbour', () => expect(nextCursor(1, 'ArrowLeft', 3)).toBe(0));
  it('Left/Right on EXIT and Right on odd are no-ops', () => {
    expect(nextCursor(-1, 'ArrowLeft', 3)).toBe(-1);
    expect(nextCursor(-1, 'ArrowRight', 3)).toBe(-1);
    expect(nextCursor(1, 'ArrowRight', 3)).toBe(1);
  });
});
