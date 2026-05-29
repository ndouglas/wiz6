/**
 * composePartyRow — WPCVW bottom party row (40×4 @ x=0, y=20).
 *
 * Engine reference: party_member_ui_render @ wpcvw 0x465 (per
 * docs/re/findings/wpcvw-naming-pass.json fn-party-row-render).
 *
 * Scaffold renders only the 7-char name per slot (cols 7*N..7*N+6, name on
 * row 0). Phase B will add HP/SP bars, condition icon, sex/race glyph, and
 * weapon icons once the wpcvw glyph-IDs are pinned from a captured fixture.
 */

import { createTileWindow, clearWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { ActivePartyMember } from '@wiz6/data';

const CELL_PX = 8;
const PANEL_W = 40;
const PANEL_H = 4;
const PANEL_X = 0;
const PANEL_Y = 20 * CELL_PX; // 160
const ATTR = 0x03;
const ATTR_CURRENT = 0x50; // TODO: confirm highlight attr against engine fixture
const SLOT_WIDTH = 7;
const NAME_WIDTH = 7;

export interface PartyRowView {
  members: ReadonlyArray<ActivePartyMember>;
  /** Slot index of the currently-viewed character (0..members.length-1). */
  currentSlot: number;
}

export function composePartyRow(view: PartyRowView): TileWindow {
  const w = createTileWindow({
    screenX: PANEL_X,
    screenY: PANEL_Y,
    widthCells: PANEL_W,
    heightCells: PANEL_H,
  });
  clearWindow(w, 0x20, ATTR);

  for (let s = 0; s < view.members.length && s < 6; s++) {
    const member = view.members[s]!;
    const name = member.name.slice(0, NAME_WIDTH);
    const attr = s === view.currentSlot ? ATTR_CURRENT : ATTR;
    setCursor(w, s * SLOT_WIDTH, 0);
    puts(w, name, attr);
  }

  return w;
}
