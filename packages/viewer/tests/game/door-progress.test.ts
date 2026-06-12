/**
 * Unit tests for composeDoorProgress / composeDoorResult.
 *
 * These are BEHAVIORAL tests — they verify that:
 *   - Buffer dimensions are correct.
 *   - The bar grows monotonically (filled:5 > filled:0, filled:18 > filled:5).
 *   - Filled bar cells contain non-background pixels; unfilled cells do not.
 *   - Result frames contain text pixels and differ from each other.
 *
 * Byte-exact engine pixel parity is DEFERRED (TODO #089 / #090).
 */

import { describe, it, expect } from 'vitest';
import { DOOR_MENU } from '@wiz6/data';
import {
  composeDoorProgress,
  composeDoorResult,
  type DoorProgressKind,
} from '../../src/pages/game/compose-door-progress.js';

const STRIP_W = DOOR_MENU.strip.w;   // 160
const STRIP_H = DOOR_MENU.strip.h;   // 40
const EXPECTED_LEN = STRIP_W * STRIP_H; // 6400

const BG_GRAY = 8;
const CELL = 8;

/** Count pixels that differ from the gray background. */
function nonBgPixels(buf: Uint8Array): number {
  let n = 0;
  for (const v of buf) if (v !== BG_GRAY) n++;
  return n;
}

/**
 * Count non-gray pixels in the bar row (y-local 16..23) within the bar
 * columns [cellStart, cellEnd) × CELL + bx.
 */
function barCellNonBg(buf: Uint8Array, cellStart: number, cellEnd: number): number {
  const bx = 8;
  const by = 16;
  let n = 0;
  for (let row = by; row < by + CELL; row++) {
    for (let c = cellStart; c < cellEnd; c++) {
      for (let col = 0; col < CELL; col++) {
        const x = bx + c * CELL + col;
        if (x < STRIP_W && buf[row * STRIP_W + x] !== BG_GRAY) n++;
      }
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// composeDoorProgress — buffer size
// ---------------------------------------------------------------------------

describe('composeDoorProgress', () => {
  it.each<DoorProgressKind>(['strain', 'tumble'])(
    '%s: returns a buffer of length STRIP_W * STRIP_H',
    (kind) => {
      expect(composeDoorProgress(kind, 0, 18).length).toBe(EXPECTED_LEN);
    },
  );

  // ---------------------------------------------------------------------------
  // filled:0 — no bar pixels in the bar cell row
  // ---------------------------------------------------------------------------
  it.each<DoorProgressKind>(['strain', 'tumble'])(
    '%s filled:0 has no bar-cell non-gray pixels',
    (kind) => {
      const buf = composeDoorProgress(kind, 0, 18);
      expect(barCellNonBg(buf, 0, 18)).toBe(0);
    },
  );

  // ---------------------------------------------------------------------------
  // Bar grows monotonically: filled:5 > filled:0, filled:18 > filled:5
  // ---------------------------------------------------------------------------
  it('strain bar grows monotonically (filled 0 < 5 < 18)', () => {
    const b0  = composeDoorProgress('strain', 0,  18);
    const b5  = composeDoorProgress('strain', 5,  18);
    const b18 = composeDoorProgress('strain', 18, 18);
    expect(nonBgPixels(b5)).toBeGreaterThan(nonBgPixels(b0));
    expect(nonBgPixels(b18)).toBeGreaterThan(nonBgPixels(b5));
  });

  it('tumble bar grows monotonically (filled 0 < 5 < 18)', () => {
    const b0  = composeDoorProgress('tumble', 0,  18);
    const b5  = composeDoorProgress('tumble', 5,  18);
    const b18 = composeDoorProgress('tumble', 18, 18);
    expect(nonBgPixels(b5)).toBeGreaterThan(nonBgPixels(b0));
    expect(nonBgPixels(b18)).toBeGreaterThan(nonBgPixels(b5));
  });

  // ---------------------------------------------------------------------------
  // Filled cells have glyph pixels; unfilled cells do not (bar row)
  // ---------------------------------------------------------------------------
  it('strain filled:5 — cells 0..4 have non-bg pixels, cells 5..17 do not', () => {
    const buf = composeDoorProgress('strain', 5, 18);
    expect(barCellNonBg(buf, 0, 5)).toBeGreaterThan(0);
    expect(barCellNonBg(buf, 5, 18)).toBe(0);
  });

  it('tumble filled:5 — cells 0..4 have non-bg pixels, cells 5..17 do not', () => {
    const buf = composeDoorProgress('tumble', 5, 18);
    expect(barCellNonBg(buf, 0, 5)).toBeGreaterThan(0);
    expect(barCellNonBg(buf, 5, 18)).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // filled:18 — all bar cells filled
  // ---------------------------------------------------------------------------
  it('strain filled:18 — all 18 bar cells have non-bg pixels', () => {
    const buf = composeDoorProgress('strain', 18, 18);
    // Every cell column in [0..17] must contain at least one glyph pixel.
    for (let c = 0; c < 18; c++) {
      expect(barCellNonBg(buf, c, c + 1)).toBeGreaterThan(0);
    }
  });

  // ---------------------------------------------------------------------------
  // strain vs tumble differ (different header strings)
  // ---------------------------------------------------------------------------
  it('strain and tumble produce different buffers (different header)', () => {
    const s = composeDoorProgress('strain', 5, 18);
    const t = composeDoorProgress('tumble', 5, 18);
    let differs = false;
    for (let i = 0; i < s.length; i++) if (s[i] !== t[i]) { differs = true; break; }
    expect(differs).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// composeDoorResult
// ---------------------------------------------------------------------------

describe('composeDoorResult', () => {
  it.each(['success', 'failure', 'jammed'] as const)(
    '%s: returns a buffer of length STRIP_W * STRIP_H',
    (outcome) => {
      expect(composeDoorResult(outcome).length).toBe(EXPECTED_LEN);
    },
  );

  it.each(['success', 'failure', 'jammed'] as const)(
    '%s: contains non-gray text pixels',
    (outcome) => {
      const buf = composeDoorResult(outcome);
      expect(nonBgPixels(buf)).toBeGreaterThan(0);
    },
  );

  it('success, failure, and jammed produce different buffers', () => {
    const s = composeDoorResult('success');
    const f = composeDoorResult('failure');
    const j = composeDoorResult('jammed');

    // All three must differ pairwise.
    let sfDiff = false, sjDiff = false, fjDiff = false;
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== f[i]) sfDiff = true;
      if (s[i] !== j[i]) sjDiff = true;
      if (f[i] !== j[i]) fjDiff = true;
    }
    expect(sfDiff, 'success vs failure should differ').toBe(true);
    expect(sjDiff, 'success vs jammed should differ').toBe(true);
    expect(fjDiff, 'failure vs jammed should differ').toBe(true);
  });
});
