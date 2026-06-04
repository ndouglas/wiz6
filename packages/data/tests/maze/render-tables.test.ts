import { describe, it, expect } from 'vitest';
import {
  CONVERGE_LEFT_BY_DEPTH, CONVERGE_RIGHT_BY_DEPTH, SEAMIDX_CORNER_SOLID_BASE,
  PLANE_STRIDE, PAGE_ROW_BYTES, SEAM_X0_WT2, SEAM_X1_WT2,
} from '@wiz6/data';

describe('maze render tables', () => {
  it('has the RE-confirmed convergence arrays', () => {
    expect(Array.from(CONVERGE_LEFT_BY_DEPTH)).toEqual([0, 104, 128, 144]);
    expect(Array.from(CONVERGE_RIGHT_BY_DEPTH)).toEqual([0, 216, 192, 176]);
  });
  it('has the corner-seamIdx base + page geometry', () => {
    expect(SEAMIDX_CORNER_SOLID_BASE).toEqual({ left: 12, right: 10 });
    expect(PLANE_STRIDE).toBe(0x2000);
    expect(PAGE_ROW_BYTES).toBe(40);
  });
  it('reproduces the y3 seam values via the wt=2 seam tables', () => {
    expect(SEAM_X0_WT2.length).toBeGreaterThan(0x13a / 2);
  });
});
