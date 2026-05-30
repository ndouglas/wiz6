/**
 * diff-image.ts — pixel-level RGBA frame comparator.
 *
 * Exports:
 *   compareRgba(a, b, opts?) → DiffResult
 *   writeDiffPng(a, b, path) → void  (writes a red-overlay diff PNG)
 *
 * Usage:
 *   import { compareRgba, writeDiffPng } from './diff-image.js';
 *
 *   const result = compareRgba(ourRgba, engineRgba, { tolerance: 8 });
 *   console.log(`match: ${result.matchPct.toFixed(1)}%`);
 *   writeDiffPng(ourRgba, engineRgba, '/tmp/diff.png');
 *
 * Tolerance semantics:
 *   A pixel is "matching" if every RGBA channel differs by ≤ tolerance.
 *   Default tolerance=8 accommodates the AC→DAC rounding that can shift
 *   palette entries by a few LSBs vs. the EGA_DEFAULT constants used in
 *   decode-screen.ts (see docs/re/findings/palette-loads.json).
 *
 * The diff PNG highlights every mismatching pixel in red (255,0,0,255)
 * and copies matching pixels as-is from buffer `a`. Useful for visual
 * inspection of layout offsets, missing elements, etc.
 */

import { writeFileSync } from 'node:fs';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

// ─── Public types ────────────────────────────────────────────────────────────

export interface DiffOptions {
  /**
   * Per-channel tolerance (0–255). A pixel matches if every channel differs
   * by ≤ tolerance. Default: 8.
   */
  tolerance?: number;
}

export interface PixelDiff {
  x: number;
  y: number;
  /** Pixel RGBA from buffer `a` (ours). */
  a: readonly [number, number, number, number];
  /** Pixel RGBA from buffer `b` (engine). */
  b: readonly [number, number, number, number];
}

export interface DiffResult {
  width: number;
  height: number;
  /** Total number of pixels (width × height). */
  total: number;
  /** Number of pixels where at least one channel exceeds tolerance. */
  diffCount: number;
  /**
   * Percentage of matching pixels (0–100).
   * matchPct = 100 × (total − diffCount) / total
   */
  matchPct: number;
  /**
   * First up to 10 mismatching pixels — for quick diagnostics.
   * Empty when diffCount === 0.
   */
  firstDiffs: PixelDiff[];
}

// ─── Core comparator ────────────────────────────────────────────────────────

/**
 * Compare two 320×200 RGBA frame buffers pixel-by-pixel.
 *
 * Both buffers must be length = width × height × 4 (RGBA row-major).
 * If sizes differ, throws an error.
 *
 * @param a    Our render buffer (Uint8Array or number[]).
 * @param b    Engine reference buffer (Uint8Array or number[]).
 * @param opts Options (tolerance, etc.).
 * @returns    DiffResult with match statistics + first diverging pixels.
 */
export function compareRgba(
  a: Uint8Array | Uint8ClampedArray | number[],
  b: Uint8Array | Uint8ClampedArray | number[],
  opts?: DiffOptions,
): DiffResult {
  const tolerance = opts?.tolerance ?? 8;

  if (a.length !== b.length) {
    throw new Error(
      `compareRgba: buffer length mismatch — a=${a.length}, b=${b.length}`,
    );
  }

  if (a.length % 4 !== 0) {
    throw new Error(`compareRgba: buffer length ${a.length} is not a multiple of 4`);
  }

  const total = a.length / 4;
  const width = 320;
  const height = Math.round(total / width);

  if (width * height !== total) {
    throw new Error(
      `compareRgba: buffer has ${total} pixels which is not exactly 320×N`,
    );
  }

  let diffCount = 0;
  const firstDiffs: PixelDiff[] = [];
  const MAX_FIRST = 10;

  for (let i = 0; i < total; i++) {
    const base = i * 4;
    const ar = a[base]!;
    const ag = a[base + 1]!;
    const ab = a[base + 2]!;
    const aa = a[base + 3]!;
    const br = b[base]!;
    const bg = b[base + 1]!;
    const bb = b[base + 2]!;
    const ba = b[base + 3]!;

    const match =
      Math.abs(ar - br) <= tolerance &&
      Math.abs(ag - bg) <= tolerance &&
      Math.abs(ab - bb) <= tolerance &&
      Math.abs(aa - ba) <= tolerance;

    if (!match) {
      diffCount++;
      if (firstDiffs.length < MAX_FIRST) {
        firstDiffs.push({
          x: i % width,
          y: Math.floor(i / width),
          a: [ar, ag, ab, aa],
          b: [br, bg, bb, ba],
        });
      }
    }
  }

  const matchPct = ((total - diffCount) / total) * 100;

  return { width, height, total, diffCount, matchPct, firstDiffs };
}

/**
 * Multi-reference comparator: a pixel "matches" if it is within tolerance of
 * the corresponding pixel in ANY of the supplied reference buffers.
 *
 * This is the `match(all($target, any($refs)))` semantics — the tool for
 * comparing a single captured frame against an animation that has more than
 * one valid phase. Render every phase, pass them all as `refs`, and a pixel
 * passes if it equals the captured frame in *some* phase. Because the phases
 * are identical everywhere except the animated regions, the per-pixel slack is
 * automatically confined to those regions — static content must still match
 * every reference identically.
 *
 * Use it, e.g., for the castle fountain (two parity phases) or to match a
 * dungeon viewport against any frame of its animation loop.
 *
 * @param target The single frame under test (e.g. our render, or the fixture).
 * @param refs   One or more reference frames; pixel passes if it matches any.
 * @param opts   Options (tolerance, default 8).
 */
export function compareRgbaMulti(
  target: Uint8Array | Uint8ClampedArray | number[],
  refs: ReadonlyArray<Uint8Array | Uint8ClampedArray | number[]>,
  opts?: DiffOptions,
): DiffResult {
  const tolerance = opts?.tolerance ?? 8;

  if (refs.length === 0) {
    throw new Error('compareRgbaMulti: need at least one reference buffer');
  }
  for (let r = 0; r < refs.length; r++) {
    if (refs[r]!.length !== target.length) {
      throw new Error(
        `compareRgbaMulti: buffer length mismatch — target=${target.length}, refs[${r}]=${refs[r]!.length}`,
      );
    }
  }
  if (target.length % 4 !== 0) {
    throw new Error(`compareRgbaMulti: buffer length ${target.length} is not a multiple of 4`);
  }

  const total = target.length / 4;
  const width = 320;
  const height = Math.round(total / width);
  if (width * height !== total) {
    throw new Error(`compareRgbaMulti: buffer has ${total} pixels which is not exactly 320×N`);
  }

  let diffCount = 0;
  const firstDiffs: PixelDiff[] = [];
  const MAX_FIRST = 10;

  for (let i = 0; i < total; i++) {
    const base = i * 4;
    const tr = target[base]!;
    const tg = target[base + 1]!;
    const tb = target[base + 2]!;
    const ta = target[base + 3]!;

    let matched = false;
    for (let r = 0; r < refs.length; r++) {
      const ref = refs[r]!;
      if (
        Math.abs(tr - ref[base]!) <= tolerance &&
        Math.abs(tg - ref[base + 1]!) <= tolerance &&
        Math.abs(tb - ref[base + 2]!) <= tolerance &&
        Math.abs(ta - ref[base + 3]!) <= tolerance
      ) {
        matched = true;
        break;
      }
    }

    if (!matched) {
      diffCount++;
      if (firstDiffs.length < MAX_FIRST) {
        const r0 = refs[0]!;
        firstDiffs.push({
          x: i % width,
          y: Math.floor(i / width),
          a: [tr, tg, tb, ta],
          b: [r0[base]!, r0[base + 1]!, r0[base + 2]!, r0[base + 3]!],
        });
      }
    }
  }

  const matchPct = ((total - diffCount) / total) * 100;
  return { width, height, total, diffCount, matchPct, firstDiffs };
}

// ─── Diff PNG writer ─────────────────────────────────────────────────────────

/**
 * Write a diff PNG to `path`.
 *
 * Matching pixels (within default tolerance=8) are drawn from buffer `a`.
 * Mismatching pixels are drawn as solid red (255, 0, 0, 255).
 *
 * Useful for visual debugging — open in any PNG viewer to instantly see
 * which regions diverge between our render and the engine reference.
 *
 * @param a    Our render buffer.
 * @param b    Engine reference buffer.
 * @param path Output file path (e.g. '/tmp/diff.png').
 * @param opts Comparator options (tolerance, default 8).
 */
export function writeDiffPng(
  a: Uint8Array | Uint8ClampedArray | number[],
  b: Uint8Array | Uint8ClampedArray | number[],
  path: string,
  opts?: DiffOptions,
): void {
  const tolerance = opts?.tolerance ?? 8;
  const len = a.length;

  if (len !== b.length) {
    throw new Error(`writeDiffPng: buffer length mismatch — a=${len}, b=${b.length}`);
  }

  const total = len / 4;
  const width = 320;
  const height = Math.round(total / width);

  const out = new Uint8Array(len);

  for (let i = 0; i < total; i++) {
    const base = i * 4;
    const ar = a[base]!;
    const ag = a[base + 1]!;
    const ab = a[base + 2]!;
    const aa = a[base + 3]!;
    const br = b[base]!;
    const bg = b[base + 1]!;
    const bb = b[base + 2]!;
    const ba = b[base + 3]!;

    const match =
      Math.abs(ar - br) <= tolerance &&
      Math.abs(ag - bg) <= tolerance &&
      Math.abs(ab - bb) <= tolerance &&
      Math.abs(aa - ba) <= tolerance;

    if (match) {
      out[base] = ar;
      out[base + 1] = ag;
      out[base + 2] = ab;
      out[base + 3] = aa;
    } else {
      // Red: mismatch highlight
      out[base]     = 255;
      out[base + 1] = 0;
      out[base + 2] = 0;
      out[base + 3] = 255;
    }
  }

  const png = encodePngRgba(width, height, out);
  writeFileSync(path, png);
}
