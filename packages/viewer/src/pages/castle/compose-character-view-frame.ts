/**
 * composeCharacterViewFrame — WPCVW state-0x11 character-view scaffold.
 *
 * Returns the array of TileWindows in z-order (lowest first). Verified from
 * the engine save 2 cell-grid dump (see tools/parity/fixtures/engine/
 * creation-review-member.png and the dump-cells findings):
 *   1. Main panel (40×20 at x=0, y=0) — hosts the character sheet content:
 *      stats column, portrait, race/class/sex header, ARMORCLASS, inventory
 *      list. Currently scaffold-empty; TODO #044.
 *   2. Stats panel (20×16 at x=20, y=4) — right-side label/value panel.
 *      Scaffold renders name + race/sex/class + LVL + 8 attrs; doesn't yet
 *      match the engine's portrait-top layout. TODO #044.
 *   3. Action menu (40×4 at x=0, y=20) — bottom strip with the 6 camp-enabled
 *      actions in 3-col × 2-row column-major layout. Per save 2 fixture this
 *      is where the action picker lives (NOT a party-member mini-row as the
 *      original RE pass mistakenly assumed).
 *
 * Z-order: main first, then stats overlays its right-half, then action menu
 * on the bottom strip.
 */

import type { TileWindow } from '@wiz6/parser';
import type { ActivePartyMember, MessageDb } from '@wiz6/data';
import { composeActionMenu } from './compose-action-menu.js';
import { composeMainPanel } from './compose-main-panel.js';
import { composeStatsPanel } from './compose-stats-panel.js';

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
    composeMainPanel({}),
    composeStatsPanel(current, view.db),
    composeActionMenu({ cursorIdx: view.cursorIdx, db: view.db }),
  ];
}
