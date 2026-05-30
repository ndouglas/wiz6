/**
 * composeClassPicker — class-selection picker for WPCVW EDIT/CHANGE PROFESSION.
 *
 * Engine: wpcvw_class_change_execute @ wpcvw.ovr 0x6054 builds an
 * availability table (FUN_5c95) before opening the picker. We use
 * @wiz6/data's eligibleClasses(attrs) to compute the same set.
 *
 * Layout: single-column list inside the wpcvw main panel. Each row shows
 * the class name (msg 120+classIdx — class-name msg base). Cursor highlight
 * uses inverse attr 0x50; non-cursor rows use attr 0x05.
 *
 * Spec: docs/superpowers/specs/2026-05-29-wpcvw-edit-submenu-design.md
 */

import { createTileWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import { creationString } from '../roster/creation/messages.js';

const PANEL_W = 40;
const PANEL_H = 20;
const CLASS_LABEL_MSG_BASE = 120;
const COL = 1;
const ROW_BASE = 1;
const ATTR_ENABLED = 0x05;
const ATTR_HIGHLIGHT = 0x50;

export interface ClassPickerView {
  /** Index into eligibleClasses[] (0..eligibleClasses.length-1). */
  cursorIdx: number;
  /** Class indices the character qualifies for (from eligibleClasses(attrs)). */
  eligibleClasses: ReadonlyArray<number>;
  db: MessageDb;
}

export function composeClassPicker(view: ClassPickerView): TileWindow {
  const w = createTileWindow({
    screenX: 0,
    screenY: 0,
    widthCells: PANEL_W,
    heightCells: PANEL_H,
  });
  w.invertHighlight = true;

  for (let i = 0; i < view.eligibleClasses.length; i++) {
    const classIdx = view.eligibleClasses[i]!;
    const label = creationString(view.db, CLASS_LABEL_MSG_BASE + classIdx);
    if (!label) continue;
    setCursor(w, COL, ROW_BASE + i);
    puts(w, label, i === view.cursorIdx ? ATTR_HIGHLIGHT : ATTR_ENABLED);
  }
  return w;
}
