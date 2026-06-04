/**
 * render-tables.ts — RE'd static lookup tables for the maze wall compositor.
 *
 * Values are VERBATIM copies from their respective sources:
 *   PLANE_STRIDE, PAGE_ROW_BYTES, SEAMIDX_CORNER_SOLID_BASE
 *     — from tools/parity/render-maze-frame.ts (lines 63-64, 326)
 *   SEAM_X0_WT2, SEAM_X1_WT2
 *     — from tools/parity/maze-generator.test.ts (lines 32-39),
 *       live DGROUP 0x36e4 / 0x3717 wt=2 slice captures
 *   CONVERGE_LEFT_BY_DEPTH, CONVERGE_RIGHT_BY_DEPTH
 *     — from docs/re/findings/maze-stage1-compositor.json,
 *       finding `convergence-seam-tables-are-data-corrected`
 */

/** EGA page plane stride (bytes between plane 0 and plane 1 within the page). */
export const PLANE_STRIDE = 0x2000;

/** Bytes per screen row in the EGA page (320px / 8 bits/byte = 40). */
export const PAGE_ROW_BYTES = 40;

/**
 * Per-depth wall convergence screen columns (RE-confirmed, data-corrected).
 * Index 0 = depth 0 (unused / no convergence), 1..3 = depths 1..3.
 * Source: docs/re/findings/maze-stage1-compositor.json
 *   `convergence-seam-tables-are-data-corrected`
 */
export const CONVERGE_LEFT_BY_DEPTH = Uint16Array.from([0, 104, 128, 144]);
export const CONVERGE_RIGHT_BY_DEPTH = Uint16Array.from([0, 216, 192, 176]);

/**
 * Corner type-9 solid side-wall seamIdx base values.
 * seamIdx = depthField + sideBase. Empirically fitted to live wt=2 spans.
 * Source: tools/parity/render-maze-frame.ts line 326.
 */
export const SEAMIDX_CORNER_SOLID_BASE = { left: 12, right: 10 } as const;

// Raw wt=2 slice bytes (live DGROUP 0x36e4 / 0x3717 captures, first 0x20 bytes).
// Source: tools/parity/maze-generator.test.ts lines 32-39.
const SEAM_X0_WT2_SLICE = Uint8Array.from([
  0x00, 0x00, 0x87, 0x87, 0x91, 0x91, 0x9a, 0x9a, 0x48, 0x48, 0x69, 0x69, 0x82, 0x82, 0xd5, 0xd5,
  0xbf, 0xbf, 0xb2, 0xb2, 0x88, 0x88, 0x93, 0x93, 0x99, 0x99, 0x88, 0x88, 0x90, 0x90, 0x98, 0x98,
]);
const SEAM_X1_WT2_SLICE = Uint8Array.from([
  0x00, 0x39, 0x3e, 0x42, 0x39, 0x3a, 0x3f, 0x39, 0x3a, 0x3f, 0x34, 0x3b, 0x40, 0x35, 0x3c, 0x40,
  0x34, 0x34, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

/** Build the full sparse seam buffer for a single walltype's slice, placing it
 *  at offset 0x13a*wt so refineSpanColumns can index directly. */
function buildSeamBuf(wt: number, slice: Uint8Array): Uint8Array {
  const buf = new Uint8Array(0x13a * (wt + 1) + slice.length);
  buf.set(slice, 0x13a * wt);
  return buf;
}

/**
 * Full-stride seam buffer for walltype 2 — x0 (screen-x of near edge).
 * The wt=2 slice (DGROUP 0x36e4, first 0x20 bytes) is placed at offset 0x13a*2
 * so that refineSpanColumns(x0Base, x1Base, 2, seamIdx, SEAM_X0_WT2, SEAM_X1_WT2)
 * works directly: x0 = seam_x0[0x13a*2 + 2*seamIdx].
 * Source bytes: tools/parity/maze-generator.test.ts lines 32-35 (SEAM_X0_WT2).
 */
export const SEAM_X0_WT2 = buildSeamBuf(2, SEAM_X0_WT2_SLICE);

/**
 * Full-stride seam buffer for walltype 2 — x1 (FUN_1c94 dest-row base).
 * The wt=2 slice (DGROUP 0x3717, first 0x20 bytes) is placed at offset 0x13a*2.
 * refineSpanColumns: x1 = seam_x1[0x13a*2 + 1*seamIdx].
 * Source bytes: tools/parity/maze-generator.test.ts lines 36-39 (SEAM_X1_WT2).
 */
export const SEAM_X1_WT2 = buildSeamBuf(2, SEAM_X1_WT2_SLICE);
