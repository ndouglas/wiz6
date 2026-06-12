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
