/**
 * composeCharacterViewFrame — WPCVW state-0x11 character-view scaffold.
 *
 * Returns the array of TileWindows in z-order (lowest first). Verified from
 * the engine save 2 cell-grid dump (see tools/parity/fixtures/engine/
 * creation-review-member.png and the dump-cells findings):
 *   1. Main panel (40×20 at x=0, y=0) — hosts the entire character sheet:
 *      portrait + header (rows 1-3), STR..KAR stats column + HP/STM/CND/GP/CC
 *      column (rows 5-12), ARMORCLASS sub-panel + slot icons (rows 5-7),
 *      inventory list (rows 9-13), school-mana grid (rows 14-18).
 *   2. Action menu (40×4 at x=0, y=20) — bottom strip with the 6 camp-enabled
 *      actions in 3-col × 2-row column-major layout.
 *
 * The engine ALSO allocates a stats panel (20×16 at x=20, y=4 attr 0x1a) but
 * keeps it EMPTY in state-0x11 (verified via save 2 cell dump — all spaces).
 * The allocation is preserved for action sub-UIs (EDIT submenu, etc.) that
 * write into it. For the scaffold we omit it entirely — any rendering would
 * occlude main-panel content.
 *
 * Z-order: main first, then action menu on the bottom strip.
 */

import type { TileWindow } from '@wiz6/parser';
import type { ActivePartyMember, MessageDb } from '@wiz6/data';
import { composeActionMenu } from './compose-action-menu.js';
import { composeMainPanel } from './compose-main-panel.js';

export interface CharacterViewView {
  members: ReadonlyArray<ActivePartyMember>;
  /** Slot index of the currently-viewed character. */
  currentSlot: number;
  /** Action-menu cursor index 0..5 into the camp-enabled subset; 5 = EXIT. */
  cursorIdx: number;
  db: MessageDb;
}

export function composeCharacterViewFrame(view: CharacterViewView): TileWindow[] {
  const current = view.members[view.currentSlot];
  if (!current) return [];
  return [
    composeMainPanel({ member: current }),
    composeActionMenu({ cursorIdx: view.cursorIdx, db: view.db }),
  ];
}
