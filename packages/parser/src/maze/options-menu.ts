/**
 * options-menu.ts — pure navigation for the in-dungeon PARTY OPTIONS 3×3 grid.
 * Column-major index: index = col*3 + row (col,row in 0..2). Layout/labels live in
 * @wiz6/data (options-menu.ts, measured from the engine).
 */
import { OPTIONS_COMMANDS, OPTIONS_NAV_WRAP, type OptionsCommand } from '@wiz6/data';

export type { OptionsCommand };

const COLS = 3;
const ROWS = 3;

export function commandAt(index: number): OptionsCommand {
  return OPTIONS_COMMANDS[index]!;
}

/** Move the cursor over the 3×3 grid. Clamps at edges (or wraps if OPTIONS_NAV_WRAP). */
export function moveOptionsCursor(index: number, dir: 'up' | 'down' | 'left' | 'right'): number {
  let col = Math.floor(index / ROWS);
  let row = index % ROWS;
  if (dir === 'up') row = OPTIONS_NAV_WRAP ? (row + ROWS - 1) % ROWS : Math.max(0, row - 1);
  else if (dir === 'down') row = OPTIONS_NAV_WRAP ? (row + 1) % ROWS : Math.min(ROWS - 1, row + 1);
  else if (dir === 'left') col = OPTIONS_NAV_WRAP ? (col + COLS - 1) % COLS : Math.max(0, col - 1);
  else col = OPTIONS_NAV_WRAP ? (col + 1) % COLS : Math.min(COLS - 1, col + 1);
  return col * ROWS + row;
}
