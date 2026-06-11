import { describe, it, expect } from 'vitest';
import { moveOptionsCursor, commandAt } from '../../src/maze/options-menu.js';

describe('options menu navigation (3×3 column-major grid)', () => {
  it('commandAt maps the column-major index', () => {
    expect(commandAt(0)).toBe('search');
    expect(commandAt(1)).toBe('review');
    expect(commandAt(2)).toBe('spell');
    expect(commandAt(3)).toBe('use');
    expect(commandAt(8)).toBe('exit');
  });
  it('down moves within a column, right moves across columns', () => {
    expect(moveOptionsCursor(0, 'down')).toBe(1);   // SEARCH -> REVIEW
    expect(moveOptionsCursor(1, 'down')).toBe(2);   // REVIEW -> SPELL
    expect(moveOptionsCursor(0, 'right')).toBe(3);  // SEARCH -> USE
    expect(moveOptionsCursor(3, 'down')).toBe(4);   // USE -> OPEN
    expect(moveOptionsCursor(3, 'right')).toBe(6);  // USE -> REST
    expect(moveOptionsCursor(1, 'up')).toBe(0);     // REVIEW -> SEARCH
    expect(moveOptionsCursor(3, 'left')).toBe(0);   // USE -> SEARCH
  });
  it('clamps at the edges (OPTIONS_NAV_WRAP=false)', () => {
    expect(moveOptionsCursor(0, 'up')).toBe(0);     // top row clamps
    expect(moveOptionsCursor(0, 'left')).toBe(0);   // left col clamps
    expect(moveOptionsCursor(2, 'down')).toBe(2);   // bottom row clamps
    expect(moveOptionsCursor(8, 'right')).toBe(8);  // right col clamps
    expect(moveOptionsCursor(8, 'down')).toBe(8);   // bottom-right clamps both
  });
});
