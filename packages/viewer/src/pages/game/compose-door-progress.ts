/**
 * composeDoorProgress / composeDoorResult — the FORCE/PICK strain/tumble band.
 *
 * The engine paints a FULL-WIDTH (320) band over the bottom of the maze view
 * during an OPEN-door FORCE/PICK attempt (strain) and its result. Three regions
 * stack inside the band (geometry: DOOR_STRAIN.band = {x:0,y:144,w:320,h:43}):
 *
 *   1. Header window (y144-151): black top/bottom border rows, gray-9 text.
 *      - STRAIN: split — left half is the WHO picker header ("WHO WILL TRY? EXIT"
 *        carried by the roster panel below); right half "STRAINING! PRESS <enter>"
 *        (FORCE) / "TUMBLING! PRESS <enter>" (PICK) at x168, with a dedicated RED
 *        enter-key sprite at x304.
 *      - RESULT: centered — "SUCCESS!" / "* FAILURE *" / "JAMMED".
 *   2. Left roster panel (x0-159, y157-186): the WHO picker roster with the
 *      TRYING member highlighted yellow-inverse — composeReviewPicker(slots,
 *      tryingSlot, DOOR_WHO). (For result frames the header above is replaced.)
 *   3. Right bar window (x160-319, y157-186): two stacked bordered sub-windows —
 *      TOP green (palette 6) progress bar = roll progress; BOTTOM dark-red
 *      (palette 12) threshold bar. Cells are 7px wide on an 8px pitch from x168.
 *
 * Both functions return a palette-INDEX buffer of size 320 × DOOR_STRAIN.band.h.
 * BYTE-EXACT against tools/parity/fixtures/engine/maze-door-strain*.idx.gz and
 * maze-door-result-*.idx.gz, gated by door-progress-parity.test.ts.
 *
 * Spec: docs/superpowers/plans/ (feat/open-door-force-pick, #089/#091).
 */

import { DOOR_STRAIN, DOOR_WHO, REVIEW_STRIP } from '@wiz6/data';
import wfont3Json from '../../data/wfont3.json' with { type: 'json' };
import { composeReviewPicker } from './compose-review-picker.js';

const BAND = DOOR_STRAIN.band;
const W = BAND.w; // 320
const H = BAND.h; // 43
const Y0 = BAND.y; // 144 — band-local y = screen y - Y0

const BG_GRAY = 8;
const BLACK = 0;
const CELL = 8;

const WFONT3 = wfont3Json as { glyphs: number[][] };

/** Roster panel rows (band-local) below the header window — copied verbatim from
 *  the WHO picker output. Header window is y144-151 = band-local 0..7. */
const ROSTER_Y0_LOCAL = DOOR_STRAIN.barWindow.top.borderTopY - Y0; // 157-144 = 13

export type DoorProgressKind = 'strain' | 'tumble';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Draw a glyph as COLORED text using the wfont3 plane-0 silhouette: wherever the
 *  glyph is a foreground pixel, write `stroke`; bg shows through. Matches the
 *  header rendering used by the WHO picker (drawColoredFromWfont3). */
function drawColored(buf: Uint8Array, px: number, py: number, code: number, stroke: number): void {
  const glyph = WFONT3.glyphs[code];
  if (!glyph) return;
  for (let row = 0; row < CELL; row++) {
    const y = py + row;
    if (y < 0 || y >= H) continue;
    const maskByte = glyph[row] ?? 0;
    for (let col = 0; col < CELL; col++) {
      const x = px + col;
      if (x < 0 || x >= W) continue;
      if ((maskByte >> (7 - col)) & 1) buf[y * W + x] = stroke;
    }
  }
}

/** Draw a colored string starting at screen-px cell origin (sx, sy). */
function drawColoredString(buf: Uint8Array, sx: number, sy: number, text: string, stroke: number): void {
  const px = sx - BAND.x;
  const py = sy - Y0;
  for (let i = 0; i < text.length; i++) {
    drawColored(buf, px + i * CELL, py, text.charCodeAt(i), stroke);
  }
}

/**
 * The RED enter-key sprite (DOOR_STRAIN.enterAt). A 7px box: palette-12 border,
 * palette-1 (white) arrow interior, on the gray background. Extracted byte-exact
 * from maze-door-strain.idx.gz at x304,y144-151. (8th column is gray-8 spacer.)
 */
const ENTER_SPRITE: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [12, 12, 12, 12, 12, 12, 12, 8],
  [12, 0, 0, 0, 1, 0, 12, 8],
  [12, 0, 1, 0, 1, 0, 12, 8],
  [12, 1, 1, 1, 1, 0, 12, 8],
  [12, 0, 1, 0, 0, 0, 12, 8],
  [12, 12, 12, 12, 12, 12, 12, 8],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

function drawEnterSprite(buf: Uint8Array): void {
  const px = DOOR_STRAIN.enterAt.x - BAND.x;
  const py = DOOR_STRAIN.enterAt.y - Y0;
  for (let row = 0; row < ENTER_SPRITE.length; row++) {
    const y = py + row;
    if (y < 0 || y >= H) continue;
    for (let col = 0; col < CELL; col++) {
      const x = px + col;
      if (x < 0 || x >= W) continue;
      buf[y * W + x] = ENTER_SPRITE[row]![col]!;
    }
  }
}

/** Header window top/bottom border rows: full-width black at y144 and y151. */
function drawHeaderBorder(buf: Uint8Array): void {
  const topLocal = Y0 - Y0; // 0
  const botLocal = REVIEW_STRIP.y + CELL - 1 - Y0; // y151 - 144 = 7
  for (let x = 0; x < W; x++) {
    buf[topLocal * W + x] = BLACK;
    buf[botLocal * W + x] = BLACK;
  }
}

/**
 * Copy the WHO-picker strip (composeReviewPicker output) into the band's left
 * half (x0-159). Both the strip and the band are anchored at screen y144, so
 * band-local row == strip-local row. `includeHeader=false` blanks the strip's
 * header content rows (band-local 1..6) to gray — used by result frames where
 * the WHO prompt is replaced by a centered result header.
 */
function blitLeftStrip(
  buf: Uint8Array,
  slots: ReadonlyArray<string | null>,
  tryingSlot: number,
  includeHeader: boolean,
): void {
  const strip = composeReviewPicker(slots, tryingSlot, DOOR_WHO);
  const sw = REVIEW_STRIP.w; // 160
  for (let r = 0; r < REVIEW_STRIP.h && r < H; r++) {
    const headerContentRow = r >= 1 && r <= 6;
    for (let c = 0; c < sw; c++) {
      buf[r * W + c] = !includeHeader && headerContentRow ? BG_GRAY : strip[r * sw + c]!;
    }
  }
  // The left panel's right-edge divider (x159 = sw-1) is black; the WHO strip
  // already paints it for its first REVIEW_STRIP.h rows (and result frames blank
  // the header rows there, which is correct), so only extend it down through the
  // band's extra bottom rows that the strip doesn't cover.
  for (let r = REVIEW_STRIP.h; r < H; r++) buf[r * W + (sw - 1)] = BLACK;
}

/**
 * Draw the right bar window (two stacked bordered sub-windows). `green` cells of
 * the top progress bar and `red` cells of the bottom threshold bar are filled.
 */
function drawBarWindow(buf: Uint8Array, green: number, red: number): void {
  const bw = DOOR_STRAIN.barWindow;
  const GRAY = 9;
  const lx = bw.borderLeftX;
  const rx = bw.borderRightX;
  const interiorX0 = lx + 2; // first black interior x (border col + 1px gray gap)
  const interiorX1 = rx - 2; // last black interior x (1px gray gap before border col)

  const drawSub = (
    sub: { borderTopY: number; borderBotY: number; barY0: number; barY1: number; color: number },
    fillCells: number,
  ): void => {
    const topL = sub.borderTopY - Y0;
    const botL = sub.borderBotY - Y0;
    // top & bottom gray border rows (between lx..rx inclusive).
    for (let x = lx; x <= rx; x++) {
      buf[topL * W + x] = GRAY;
      buf[botL * W + x] = GRAY;
    }
    // left & right gray border columns (interior rows).
    for (let yL = topL + 1; yL < botL; yL++) {
      buf[yL * W + lx] = GRAY;
      buf[yL * W + rx] = GRAY;
    }
    // black interior — a 1px gray gap inside the border on ALL FOUR sides (the
    // engine leaves rows topL+1/botL-1 and cols lx+1/rx-1 gray, black starts inset).
    for (let yL = topL + 2; yL <= botL - 2; yL++) {
      for (let x = interiorX0; x <= interiorX1; x++) buf[yL * W + x] = BLACK;
    }
    // bar cells.
    const barY0 = sub.barY0 - Y0;
    const barY1 = sub.barY1 - Y0;
    for (let c = 0; c < fillCells; c++) {
      const cx = bw.cellX0 + c * bw.cellPitch;
      for (let yL = barY0; yL <= barY1; yL++) {
        for (let i = 0; i < bw.cellWidth; i++) buf[yL * W + cx + i] = sub.color;
      }
    }
  };

  drawSub(bw.top, green);
  drawSub(bw.bottom, red);
}

// ---------------------------------------------------------------------------
// composeDoorProgress — STRAIN/TUMBLE frame
// ---------------------------------------------------------------------------

/**
 * Compose a FORCE/PICK attempt progress (strain/tumble) band frame.
 *
 * @param kind       'strain' = FORCE; 'tumble' = PICK.
 * @param progress   Green progress-bar cell count (the roll so far).
 * @param threshold  Red threshold-bar cell count (the required value).
 * @param slots      Per-slot member names (length 6, null = empty).
 * @param tryingSlot Panel slot index of the member trying (highlighted).
 */
export function composeDoorProgress(
  kind: DoorProgressKind,
  progress: number,
  threshold: number,
  slots: ReadonlyArray<string | null>,
  tryingSlot: number,
): Uint8Array {
  const buf = new Uint8Array(W * H);
  buf.fill(BG_GRAY);

  // 1. Left half = WHO picker strip (header "WHO WILL TRY? EXIT" + roster, the
  //    trying member highlighted).
  blitLeftStrip(buf, slots, tryingSlot, true);

  // 2. Header window border, extended to full width (x160-319).
  drawHeaderBorder(buf);

  // 3. Right-half prompt + enter sprite.
  const prompt = kind === 'strain' ? DOOR_STRAIN.strainPrompt.strain : DOOR_STRAIN.strainPrompt.tumble;
  drawColoredString(buf, DOOR_STRAIN.strainPromptAt.x, DOOR_STRAIN.strainPromptAt.y, prompt, DOOR_STRAIN.headerPalette);
  drawEnterSprite(buf);

  // 4. Right bar window.
  drawBarWindow(buf, progress, threshold);

  return buf;
}

// ---------------------------------------------------------------------------
// composeDoorResult — RESULT frame
// ---------------------------------------------------------------------------

/**
 * Compose a FORCE/PICK attempt result band frame.
 *
 * @param outcome    'success' | 'failure' | 'jammed'.
 * @param progress   Green progress-bar cell count.
 * @param threshold  Red threshold-bar cell count.
 * @param slots      Per-slot member names (length 6, null = empty).
 * @param tryingSlot Panel slot index of the member who tried (highlighted).
 */
export function composeDoorResult(
  outcome: 'success' | 'failure' | 'jammed',
  progress: number,
  threshold: number,
  slots: ReadonlyArray<string | null>,
  tryingSlot: number,
): Uint8Array {
  const buf = new Uint8Array(W * H);
  buf.fill(BG_GRAY);

  // 1. Left half = WHO picker roster (header blanked — the result header is
  //    centered full-width, replacing the WHO prompt).
  blitLeftStrip(buf, slots, tryingSlot, false);

  // 2. Header window border (full width).
  drawHeaderBorder(buf);

  // 3. Centered result header (replaces the split header — no WHO prompt).
  const runs = DOOR_STRAIN.resultHeader[outcome];
  for (const run of runs) {
    drawColoredString(buf, run.x, Y0, run.text, DOOR_STRAIN.headerPalette);
  }

  // 4. Right bar window.
  drawBarWindow(buf, progress, threshold);

  return buf;
}
