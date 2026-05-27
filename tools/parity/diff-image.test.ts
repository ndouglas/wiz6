/**
 * diff-image.test.ts — unit tests for compareRgba + writeDiffPng.
 *
 * Run via: pnpm vitest run tools/parity/diff-image.test.ts
 * (or from the tools/parity vitest config)
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareRgba, writeDiffPng } from './diff-image.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Make a blank 320×200 RGBA buffer filled with a single color. */
function makeBuffer(r: number, g: number, b: number, a = 255): Uint8Array {
  const buf = new Uint8Array(320 * 200 * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = a;
  }
  return buf;
}

/** Make a 320×200 buffer copied from `src` with a single pixel changed. */
function withPixel(
  src: Uint8Array,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): Uint8Array {
  const out = new Uint8Array(src);
  const base = (y * 320 + x) * 4;
  out[base] = r;
  out[base + 1] = g;
  out[base + 2] = b;
  out[base + 3] = a;
  return out;
}

// ─── compareRgba tests ───────────────────────────────────────────────────────

describe('compareRgba', () => {
  it('returns 100% match for two identical buffers', () => {
    const buf = makeBuffer(0, 0, 0);
    const result = compareRgba(buf, buf);
    expect(result.matchPct).toBe(100);
    expect(result.diffCount).toBe(0);
    expect(result.total).toBe(320 * 200);
    expect(result.firstDiffs).toHaveLength(0);
  });

  it('reports 100% match for two independently created identical buffers', () => {
    const a = makeBuffer(85, 85, 85);
    const b = makeBuffer(85, 85, 85);
    const result = compareRgba(a, b);
    expect(result.matchPct).toBe(100);
    expect(result.diffCount).toBe(0);
  });

  it('catches a single-pixel difference', () => {
    const a = makeBuffer(0, 0, 0);
    // Change pixel at (10, 20) to white
    const b = withPixel(a, 10, 20, 255, 255, 255);

    const result = compareRgba(a, b);
    expect(result.diffCount).toBe(1);
    expect(result.matchPct).toBeCloseTo(100 - (1 / (320 * 200)) * 100, 5);
    expect(result.firstDiffs).toHaveLength(1);
    expect(result.firstDiffs[0]).toMatchObject({ x: 10, y: 20 });
    expect(result.firstDiffs[0]!.a).toEqual([0, 0, 0, 255]);
    expect(result.firstDiffs[0]!.b).toEqual([255, 255, 255, 255]);
  });

  it('within-tolerance delta still matches (default tolerance=8)', () => {
    const a = makeBuffer(100, 100, 100);
    // Shift each channel by 7 (≤8 tolerance → should match)
    const b = makeBuffer(107, 107, 107);
    const result = compareRgba(a, b, { tolerance: 8 });
    expect(result.diffCount).toBe(0);
    expect(result.matchPct).toBe(100);
  });

  it('exceeds tolerance threshold is caught (tolerance=8, delta=9)', () => {
    const a = makeBuffer(100, 100, 100);
    // delta=9 > 8 → should NOT match
    const b = makeBuffer(109, 100, 100);
    const result = compareRgba(a, b, { tolerance: 8 });
    expect(result.diffCount).toBe(320 * 200); // all pixels differ
    expect(result.matchPct).toBe(0);
  });

  it('tolerance=0 matches only exact pixels', () => {
    const a = makeBuffer(100, 100, 100);
    const b = makeBuffer(101, 100, 100); // delta=1 in R
    const result = compareRgba(a, b, { tolerance: 0 });
    expect(result.diffCount).toBe(320 * 200);
  });

  it('reports correct width + height', () => {
    const a = makeBuffer(0, 0, 0);
    const b = makeBuffer(0, 0, 0);
    const result = compareRgba(a, b);
    expect(result.width).toBe(320);
    expect(result.height).toBe(200);
    expect(result.total).toBe(64000);
  });

  it('throws on buffer length mismatch', () => {
    const a = new Uint8Array(320 * 200 * 4);
    const b = new Uint8Array(320 * 100 * 4); // different size
    expect(() => compareRgba(a, b)).toThrow(/length mismatch/);
  });

  it('reports up to 10 firstDiffs even when many pixels differ', () => {
    const a = makeBuffer(0, 0, 0);
    const b = makeBuffer(255, 255, 255); // all pixels differ
    const result = compareRgba(a, b);
    expect(result.diffCount).toBe(320 * 200);
    expect(result.firstDiffs.length).toBe(10);
  });

  it('firstDiffs are ordered top-left to bottom-right', () => {
    const a = makeBuffer(0, 0, 0);
    const b = withPixel(withPixel(a, 5, 0, 255, 0, 0), 3, 0, 0, 255, 0);
    const result = compareRgba(a, b);
    // x=3 comes before x=5 in scan order
    expect(result.firstDiffs[0]!.x).toBe(3);
    expect(result.firstDiffs[1]!.x).toBe(5);
  });
});

// ─── writeDiffPng tests ──────────────────────────────────────────────────────

describe('writeDiffPng', () => {
  it('writes a PNG file for identical buffers (no red pixels expected)', () => {
    const buf = makeBuffer(85, 85, 85);
    const outPath = join(tmpdir(), `test-diff-identical-${Date.now()}.png`);
    writeDiffPng(buf, buf, outPath);
    expect(existsSync(outPath)).toBe(true);
  });

  it('writes a PNG file for differing buffers', () => {
    const a = makeBuffer(0, 0, 0);
    const b = makeBuffer(255, 255, 255);
    const outPath = join(tmpdir(), `test-diff-all-red-${Date.now()}.png`);
    writeDiffPng(a, b, outPath);
    expect(existsSync(outPath)).toBe(true);
  });

  it('throws on buffer length mismatch', () => {
    const a = new Uint8Array(320 * 200 * 4);
    const b = new Uint8Array(100);
    const outPath = join(tmpdir(), `test-diff-mismatch-${Date.now()}.png`);
    expect(() => writeDiffPng(a, b, outPath)).toThrow(/length mismatch/);
  });
});
