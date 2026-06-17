/**
 * door-menu.ts — layout of the FORCE/PICK/EXIT door-action menu that appears
 * when the party presses OPEN facing a locked door. An in-place bottom-strip
 * overlay on the maze screen (same strip region as PARTY OPTIONS). Single
 * horizontal row of 3 labels.
 *
 * Labels: indexedMessages 534/535/536; header msg 0x7d2 ("PARTY OPTIONS").
 * Cell origins pinned against maze-door-menu-*.idx.gz engine fixtures in
 * Task 3.3 (Stage 3 of the FORCE/PICK plan):
 *  - headerAt { x:24, y:145 } — first palette-9 pixel at strip-local x=24, row=1.
 *  - cellAt: single row y=160 (strip-local y=16), columns at x=8/64/120.
 *    Measured from yellow (palette 5) highlight bounds in each fixture.
 *
 * Spec: docs/superpowers/plans/ (feat/open-door-force-pick, #089).
 */

/** WHO WILL TRY? door member-picker chrome (msg 537). Same panel as REVIEW WHO?
 *  but header at x=8 and EXIT at x=120 — pinned byte-exact vs maze-door-who.idx.gz
 *  (Task 3.5, 2026-06-11). Pass as the third arg to composeReviewPicker. */
export const DOOR_WHO = {
  header: 'WHO WILL TRY?',
  headerAt: { x: 8, y: 144 },
  exitAt: { x: 120, y: 144 },
} as const;

/** FORCE/PICK strain/tumble + result band geometry — the FULL-WIDTH (320) band
 *  the engine paints over the maze view during an OPEN-door FORCE/PICK attempt
 *  and its result. Pinned byte-exact vs maze-door-strain*.idx.gz /
 *  maze-door-result-*.idx.gz (verify/door-frames, #089/#091).
 *
 *  Three regions stack vertically inside the band:
 *   - Header window  (y144-151): black top/bottom border rows (y144,y151),
 *     gray-9 colored text. STRAIN = split ("WHO WILL TRY? EXIT" left half via
 *     the WHO roster picker + "STRAINING! PRESS <enter>" right half at x168);
 *     RESULT = centered ("SUCCESS!" / "* FAILURE *").
 *   - Left roster panel (y157-186, x0-159): the WHO picker roster with the
 *     TRYING member highlighted (composeReviewPicker, DOOR_WHO chrome).
 *   - Right bar window (y157-186, x160-319): two stacked bordered sub-windows —
 *     TOP green (palette 6) progress bar, BOTTOM dark-red (palette 12) threshold
 *     bar. Cells are 7px wide on an 8px pitch, first cell at x168.
 */
export const DOOR_STRAIN = {
  /** Full band region (screen px). y144 (header top border) .. y186 (red window bottom border). */
  band: { x: 0, y: 144, w: 320, h: 43 },
  /** Header text palette (gray). */
  headerPalette: 9,
  /** STRAIN right-half prompt: cell origin (screen px) of the first glyph. */
  strainPromptAt: { x: 168, y: 144 },
  /** STRAIN prompt strings (FORCE / PICK). '\x16' = the engine '!' glyph; the
   *  trailing enter key is drawn as a dedicated red sprite (ENTER_GLYPH). */
  strainPrompt: { strain: 'STRAINING\x16 PRESS ', tumble: 'TUMBLING\x16 PRESS ' } as const,
  /** Enter-key sprite cell origin (screen px). */
  enterAt: { x: 304, y: 144 },
  /** RESULT centered headers, as explicit (x, text) cell runs (screen px). */
  resultHeader: {
    success: [{ x: 128, text: 'SUCCESS\x16' }],
    failure: [{ x: 112, text: '*' }, { x: 128, text: 'FAILURE' }, { x: 192, text: '*' }],
    jammed: [{ x: 128, text: 'JAMMED' }],
  } as const,
  /** Right bar window: two stacked sub-windows. */
  barWindow: {
    /** Left/right gray-9 border columns (screen px). */
    borderLeftX: 165,
    borderRightX: 314,
    /** TOP (green progress) sub-window: border rows, bar rows, first cell x. */
    top: { borderTopY: 157, borderBotY: 170, barY0: 161, barY1: 166, color: 6 },
    /** BOTTOM (red threshold) sub-window. */
    bottom: { borderTopY: 173, borderBotY: 186, barY0: 177, barY1: 182, color: 12 },
    /** Bar cell geometry. */
    cellX0: 168,
    cellPitch: 8,
    cellWidth: 7,
  },
} as const;

/** FORCE/PICK/EXIT door menu — same bottom strip as PARTY OPTIONS, single row.
 *  Labels = indexedMessages 534/535/536; header msg 0x7d2. Cell origins are
 *  byte-exact against maze-door-menu-*.idx.gz (pinned Task 3.3, 2026-06-11). */
export const DOOR_MENU = {
  labels: ['FORCE', 'PICK', 'EXIT'] as const,
  header: 'PARTY OPTIONS',
  strip: { x: 0, y: 144, w: 160, h: 40 },
  headerAt: { x: 24, y: 145 },
  cellAt: [ { x: 8, y: 160 }, { x: 64, y: 160 }, { x: 120, y: 160 } ],
  headerPalette: 9,
  hilite: { paletteIndex: 5, coloredText: false, blinks: false },
} as const;
