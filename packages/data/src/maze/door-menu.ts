/**
 * door-menu.ts — layout of the FORCE/PICK/EXIT door-action menu that appears
 * when the party presses OPEN facing a locked door. An in-place bottom-strip
 * overlay on the maze screen (same strip region as PARTY OPTIONS). Single
 * horizontal row of 3 labels.
 *
 * Labels: indexedMessages 534/535/536; header msg 0x7d2 ("PARTY OPTIONS").
 * Cell origins are initial estimates, corrected against maze-door-menu-*.idx.gz
 * engine fixtures in Task 3.3 (Stage 3 of the FORCE/PICK plan).
 *
 * Spec: docs/superpowers/plans/ (feat/open-door-force-pick, #089).
 */

/** FORCE/PICK/EXIT door menu — same bottom strip as PARTY OPTIONS, single row.
 *  Labels = indexedMessages 534/535/536; header msg 0x7d2. Cell origins are
 *  initial estimates corrected against maze-door-menu-*.idx.gz in Stage 3. */
export const DOOR_MENU = {
  labels: ['FORCE', 'PICK', 'EXIT'] as const,
  header: 'PARTY OPTIONS',
  strip: { x: 0, y: 144, w: 160, h: 40 },
  headerAt: { x: 24, y: 145 },
  cellAt: [ { x: 8, y: 168 }, { x: 64, y: 168 }, { x: 112, y: 168 } ],
  headerPalette: 9,
  hilite: { paletteIndex: 5, coloredText: false, blinks: false },
} as const;
