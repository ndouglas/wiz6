/**
 * options-menu.ts — measured layout of the in-dungeon PARTY OPTIONS menu (the
 * "PRESS RETURN FOR OPTIONS" 3×3 command grid). An in-place bottom-strip overlay on
 * the maze screen (game_state stays 5; only the bottom strip changes). All constants
 * pinned from the engine via `trace-maze.ts screencap` (fixtures
 * tools/parity/fixtures/engine/options-menu-*.idx.gz, cursor on each cell).
 *
 * Measured 2026-06-11:
 *  - Navigation: column-major grid, CLAMP at edges (no wrap). down=row+1, right=col+1.
 *  - Columns at x=8 / 64 / 120; rows at y=160 / 168 / 176 (8px pitch).
 *  - Header "PARTY OPTIONS" at x≈24, y≈145, palette 9.
 *  - Cursor highlight = COLORED TEXT in palette 5 (yellow); normal text palette 1
 *    (white). No blink (settle-invariant). NOT inverse — confirmed by diffing the
 *    SEARCH↔USE cursor fixtures (the cell's text swaps yellow↔white).
 *
 * Spec: docs/superpowers/specs/2026-06-10-options-menu-shell-design.md.
 * The composer (compose-options-strip.ts) iterates these to byte-exact parity against
 * the fixtures — treat the pixel positions as accurate starting values.
 */

/** The 9 commands, in COLUMN-MAJOR grid order (index = col*3 + row, col & row in 0..2). */
export const OPTIONS_COMMANDS = [
  'search', 'review', 'spell', // column 0 (rows 0..2)
  'use', 'open', 'order',      // column 1
  'rest', 'disk', 'exit',      // column 2
] as const;
export type OptionsCommand = (typeof OPTIONS_COMMANDS)[number];

/** Display labels (uppercase, as the engine draws them). */
export const OPTIONS_LABELS: Record<OptionsCommand, string> = {
  search: 'SEARCH', review: 'REVIEW', spell: 'SPELL',
  use: 'USE', open: 'OPEN', order: 'ORDER',
  rest: 'REST', disk: 'DISK', exit: 'EXIT',
};

/** The header text drawn above the grid. */
export const OPTIONS_HEADER = 'PARTY OPTIONS';

/** Cursor navigation clamps at column/row edges (no wrap) — measured. */
export const OPTIONS_NAV_WRAP = false;

/** Bottom-strip region (screen px) the menu overlay occupies / the parity crop rect. */
export const OPTIONS_STRIP = { x: 0, y: 144, w: 160, h: 40 } as const;

/** Header origin (screen px), palette 9. */
export const OPTIONS_HEADER_AT = { x: 24, y: 145 } as const;

/** Per-cell label origin (screen px), index order (col*3 + row). */
export const OPTIONS_CELL_AT: ReadonlyArray<{ x: number; y: number }> = [
  { x: 8, y: 160 },   // 0 SEARCH (col0,row0)
  { x: 8, y: 168 },   // 1 REVIEW (col0,row1)
  { x: 8, y: 176 },   // 2 SPELL  (col0,row2)
  { x: 64, y: 160 },  // 3 USE    (col1,row0)
  { x: 64, y: 168 },  // 4 OPEN   (col1,row1)
  { x: 64, y: 176 },  // 5 ORDER  (col1,row2)
  { x: 120, y: 160 }, // 6 REST   (col2,row0)
  { x: 120, y: 168 }, // 7 DISK   (col2,row1)
  { x: 120, y: 176 }, // 8 EXIT   (col2,row2)
];

/** Text palettes: normal command = white (1); highlighted cursor = yellow (5). Header = 9. */
export const OPTIONS_TEXT_PALETTE = 1;
export const OPTIONS_HEADER_PALETTE = 9;

/** Cursor highlight: colored text (not inverse) in palette 5; no blink. */
export const OPTIONS_HILITE = { paletteIndex: 5, coloredText: true, blinks: false } as const;
