/**
 * composeStatsPanel — WPCVW right-side stats panel (20×16 @ x=20, y=4).
 *
 * Engine reference: ui_render_character_stats_panel @ wpcvw 0xf47 (per
 * docs/re/findings/wpcvw-naming-pass.json fn-stats-render).
 *
 * Scaffold layout — minimal but readable. Phase B pixel-parity pass will
 * tighten cell positions against the captured state-0x11 fixture.
 *
 *   Row 0:  centered name        (attr 0x03)
 *   Row 1:  race / sex           (attr 0x03)
 *   Row 2:  class                 (attr 0x03)
 *   Row 3:  AC + HP/SP            (attr 0x03)
 *   Rows 5..12: 8 attribute rows (label left, value right-aligned, attr 0x03)
 */

import { createTileWindow, clearWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { ActivePartyMember, MessageDb } from '@wiz6/data';
import { creationString, RACE_NAME_BASE, CLASS_NAME_BASE, SEX_NAME_BASE } from '../roster/creation/messages.js';

const CELL_PX = 8;
const PANEL_W = 20;
const PANEL_H = 16;
const PANEL_X = 20 * CELL_PX; // 160
const PANEL_Y = 4 * CELL_PX;  // 32
const ATTR = 0x03;

interface AttrRow {
  label: string;
  value: number;
}

function attrRows(m: ActivePartyMember): AttrRow[] {
  return [
    { label: 'STR', value: m.attributes.str },
    { label: 'INT', value: m.attributes.int },
    { label: 'PIE', value: m.attributes.pie },
    { label: 'VIT', value: m.attributes.vit },
    { label: 'DEX', value: m.attributes.dex },
    { label: 'SPD', value: m.attributes.spd },
    { label: 'PER', value: m.attributes.per },
    { label: 'KAR', value: m.attributes.kar },
  ];
}

export function composeStatsPanel(member: ActivePartyMember, db: MessageDb): TileWindow {
  const w = createTileWindow({
    screenX: PANEL_X,
    screenY: PANEL_Y,
    widthCells: PANEL_W,
    heightCells: PANEL_H,
  });
  clearWindow(w, 0x20, ATTR);

  // Row 0: centered name.
  const name = member.name.slice(0, PANEL_W);
  setCursor(w, Math.max(0, Math.floor((PANEL_W - name.length) / 2)), 0);
  puts(w, name, ATTR);

  // Row 1: race / sex (e.g. "HUMAN MALE").
  const race = creationString(db, RACE_NAME_BASE + member.race);
  const sex = creationString(db, SEX_NAME_BASE + member.sex);
  setCursor(w, 0, 1);
  puts(w, `${race} ${sex}`.slice(0, PANEL_W), ATTR);

  // Row 2: class.
  const cls = creationString(db, CLASS_NAME_BASE + member.class);
  setCursor(w, 0, 2);
  puts(w, cls.slice(0, PANEL_W), ATTR);

  // Row 3: level placeholder (AC + HP/SP need derived fields not on ActivePartyMember).
  setCursor(w, 0, 3);
  puts(w, `LVL ${member.level}`.slice(0, PANEL_W), ATTR);

  // Rows 5..12: 8 attribute rows. Label cols 0..2, value cols 16..18 (right-aligned 3-wide).
  const rows = attrRows(member);
  for (let i = 0; i < rows.length; i++) {
    setCursor(w, 0, 5 + i);
    puts(w, rows[i]!.label, ATTR);
    const valueStr = String(rows[i]!.value).padStart(3, ' ');
    setCursor(w, PANEL_W - 3, 5 + i);
    puts(w, valueStr, ATTR);
  }

  return w;
}
