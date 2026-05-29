/**
 * composeCharacterViewFrame — WPCVW state-0x11 character-view scaffold.
 *
 * Returns the array of TileWindows in z-order (lowest first). The view has
 * THREE windows per docs/re/findings/wpcvw-character-view-ux.json
 * wpcvw-view-main-window-geometry:
 *   1. Main panel (full screen 40×20) — hosts action menu + inventory grid.
 *   2. Stats panel (20×16 at x=20, y=4) — right-side character sheet.
 *   3. Party row (40×4 at x=0, y=20) — bottom mini-row.
 *
 * Z-order: main is drawn first, then stats overlays it, then party row.
 */

import type { TileWindow } from '@wiz6/parser';
import type { ActivePartyMember, MessageDb } from '@wiz6/data';
import { composeMainPanel } from './compose-main-panel.js';
import { composeStatsPanel } from './compose-stats-panel.js';
import { composePartyRow } from './compose-party-row.js';

export interface CharacterViewView {
  members: ReadonlyArray<ActivePartyMember>;
  /** Slot index of the currently-viewed character. */
  currentSlot: number;
  /** Action-menu cursor 0..11 (11 = EXIT). */
  cursorIdx: number;
  db: MessageDb;
}

export function composeCharacterViewFrame(view: CharacterViewView): TileWindow[] {
  const current = view.members[view.currentSlot];
  if (!current) return [];
  return [
    composeMainPanel({ cursorIdx: view.cursorIdx, db: view.db }),
    composeStatsPanel(current, view.db),
    composePartyRow({ members: view.members, currentSlot: view.currentSlot }),
  ];
}
