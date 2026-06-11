/**
 * review-picker.ts — measured layout of the in-dungeon "REVIEW WHO?" member picker
 * (OPTIONS → REVIEW). An in-place bottom-strip overlay on the maze screen (game_state
 * stays 5); lists the active party members at their party-panel slots + an EXIT cell in
 * the header row. The cursor starts on EXIT. Pinned from the engine via
 * `trace-maze.ts screencap` (fixtures tools/parity/fixtures/engine/review-who-*.idx.gz:
 * exit / m0=THESUS / m1=LYSANDR / m2=TEMPEST, reference roster).
 *
 * Measured 2026-06-11:
 *  - Header "REVIEW WHO?" at x16,y144 (palette 9). EXIT cell at x112,y144 (header row).
 *  - Member SLOTS = the party-panel layout: 2 columns (left x16 / right x88) × 3 rows
 *    (y160 / y168 / y176). Slot index 0..2 = left column rows; 3..5 = right column rows.
 *    A member is drawn at the slot it occupies in the panels (reuse MazeView's per-member
 *    panel-position mapping — e.g. the reference party is THESUS=slot0, LYSANDR=slot1,
 *    TEMPEST=slot3). Member name = palette 1 (white) normal.
 *  - Cursor highlight = INVERSE (palette-5 yellow bar, palette-0 black strokes), no blink
 *    — same attr model as the OPTIONS menu (the attr-sign lesson). NOT colored text.
 *  - Navigation (CLAMP, no wrap): from EXIT, ↓ → the first occupied member; ↑/←/→ stay on
 *    EXIT. In the member grid: ↑ from row 0 → EXIT; ↓ → next occupied row in the column;
 *    ←/→ → the other column's same row (or nearest occupied); clamp at edges/empties.
 *
 * Spec: docs/superpowers/specs/2026-06-11-options-review-command-design.md.
 * The composer (compose-review-picker.ts) iterates these to byte-exact parity against the
 * fixtures — treat the pixel positions as accurate starting values.
 */

export const REVIEW_HEADER = 'REVIEW WHO?';

/** Cursor navigation clamps at edges (no wrap) — measured. */
export const REVIEW_NAV_WRAP = false;

/** Bottom-strip rect (screen px) the picker occupies / the parity crop rect. */
export const REVIEW_STRIP = { x: 0, y: 144, w: 160, h: 40 } as const;

/** Header origin (screen px), palette 9. */
export const REVIEW_HEADER_AT = { x: 16, y: 144 } as const;

/** EXIT cell origin (screen px), in the header row (highlighted when the cursor is on it). */
export const REVIEW_EXIT_AT = { x: 112, y: 144 } as const;

/** Party-panel SLOT origins (screen px), indexed by panel slot 0..5 (0-2 = left column
 *  rows 0-2; 3-5 = right column rows 0-2). A member's name is drawn at REVIEW_SLOT_AT[slot]
 *  where `slot` is the member's panel position (reuse the MazeView party-panel mapping). */
export const REVIEW_SLOT_AT: ReadonlyArray<{ x: number; y: number }> = [
  { x: 16, y: 160 }, // slot 0 — left col, row 0
  { x: 16, y: 168 }, // slot 1 — left col, row 1
  { x: 16, y: 176 }, // slot 2 — left col, row 2
  { x: 88, y: 160 }, // slot 3 — right col, row 0
  { x: 88, y: 168 }, // slot 4 — right col, row 1
  { x: 88, y: 176 }, // slot 5 — right col, row 2
];

/** Text palettes: member name = white (1) normal; header = 9. */
export const REVIEW_TEXT_PALETTE = 1;
export const REVIEW_HEADER_PALETTE = 9;

/** Cursor highlight: INVERSE (yellow bar, black strokes) in palette 5; no blink. */
export const REVIEW_HILITE = { paletteIndex: 5, coloredText: false, blinks: false } as const;
