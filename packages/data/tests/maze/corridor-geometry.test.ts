import { describe, it, expect } from 'vitest';
import { MAZE_VIEWPORT, CONVERGE_LEFT, CONVERGE_RIGHT, CORRIDOR_CENTER_X } from '../../src/maze/corridor-geometry.js';

describe('corridor geometry', () => {
  it('viewport rect matches the engine viewport', () => {
    expect(MAZE_VIEWPORT).toEqual({ x: 72, y: 32, w: 176, h: 112 });
  });
  it('convergence columns narrow toward center with depth', () => {
    expect(CONVERGE_LEFT).toEqual([0, 104, 128, 144]);
    expect(CONVERGE_RIGHT).toEqual([0, 216, 192, 176]);
    for (let d = 2; d <= 3; d++) {
      expect(CONVERGE_LEFT[d]!).toBeGreaterThan(CONVERGE_LEFT[d - 1]!);
      expect(CONVERGE_RIGHT[d]!).toBeLessThan(CONVERGE_RIGHT[d - 1]!);
    }
    expect(CORRIDOR_CENTER_X).toBe(160);
  });
});
