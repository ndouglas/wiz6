/**
 * composeEquipPicker — WPCVW state-0x11 EQUIP slot-picker overlay.
 *
 * RE: docs/re/findings/wpcvw-equip-action.json + wpcvw-equip-ux-correction.json.
 * The EQUIP action is a per-body-slot re-equip wizard. For the slot being
 * filled, the engine overlays the character sheet's inventory list with
 * per-row MARKERS and a bottom PROMPT bar. The cursor starts on NONE and the
 * player moves it (up/down) onto a candidate to equip it (ENTER).
 *
 * Per-row presentation (byte-exact vs the equip-slot0 / equip-slot1-* fixtures;
 * the marker is at inventory col 21, the name at cols 22..36, pad at attr 0x10):
 *   - EQUIPPED item            → ✓ (0x17) attr 0x40, name attr 0x60
 *   - CANDIDATE (not cursored) → ▸ (0x64) attr 0x50, name attr 0x40
 *   - CANDIDATE (cursored)     → ▸ (0x64) attr 0x50, name attr 0x50 (inverse box)
 *   - other carried item       → no marker (space) attr 0x40, name attr 0x90
 * The ▸ is a "this item can be equipped here" marker, NOT the cursor — the
 * cursor is the inverse box (on an item) or the highlighted NONE (in the prompt).
 *
 * Bottom PROMPT bar (40×5 @ y=20, replaces the action menu): "SELECT <slot> >
 * NONE". The trailing NONE is inverse-highlighted (attr 0x50) when the cursor is
 * on NONE, else plain (attr 0x03). Slot titles: 0x3c PRIMARY WEAPON .. 0x43 BOOTS.
 *
 * The returned windows OVERLAY a composeMainPanel frame (rendered first): the
 * prompt bar replaces the action-menu strip, and the per-row overlays repaint
 * the inventory list's marker+name cells (cols 21..36) with the equip markers.
 */

import { createTileWindow, clearWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import { creationString } from '../roster/creation/messages.js';

const CELL_PX = 8;

// ── Bottom prompt bar ────────────────────────────────────────────────────────
const BAR_W = 40;
const BAR_H = 5;
const BAR_Y = 20 * CELL_PX; // 160
const BAR_BG_ATTR = 0x03;
const PROMPT_COL = 2;
const PROMPT_ROW = 1;
const PROMPT_TEXT_ATTR = 0x03;
const PROMPT_NONE_ON_ATTR = 0x50;  // cursor on NONE → inverse highlight
const PROMPT_NONE_OFF_ATTR = 0x03; // cursor elsewhere → plain
const CHROME_BOTTOM_BORDER_CHAR = 0x1e;

// ── Inventory-row overlay (cols 21..36 of the main panel) ────────────────────
const INV_FIRST_ROW = 9;       // inventory row 0 → main-panel cell row 9
const ROW_COL0 = 21;           // overlay window starts at col 21 (marker col)
const ROW_W = 16;              // cols 21..36 (marker + 15-char name field)
const MARKER_COL = 0;          // window-local: col 21
const NAME_COL = 1;            // window-local: col 22
const NAME_WIDTH = 15;         // cols 22..36

const CHECK_CHAR = 0x17;       // ✓ equipped marker (font0)
const ARROW_CHAR = 0x64;       // ▸ candidate marker (font0)
const MARKER_EQUIPPED_ATTR = 0x40;
const MARKER_CANDIDATE_ATTR = 0x50;
const MARKER_NONE_ATTR = 0x40; // blank marker cell (space)
const NAME_EQUIPPED_ATTR = 0x60;
const NAME_CANDIDATE_ATTR = 0x40;
const NAME_CURSORED_ATTR = 0x50; // inverse box on the cursored candidate
const NAME_NORMAL_ATTR = 0x90;
const PAD_ATTR = 0x10;

// ── Message ids ──────────────────────────────────────────────────────────────
const MSG_SELECT_TEMPLATE = 0x3b;
const MSG_SLOT_TITLE_BASE = 0x3c;
const MSG_NONE = 0x44;

/** One carried-inventory row, in display order, with its EQUIP presentation. */
export interface EquipRow {
  name: string;
  /** 'equipped' (✓), 'candidate' (▸ — equippable in the current slot), or 'normal'. */
  state: 'equipped' | 'candidate' | 'normal';
  /** True if the cursor box is on this row (a cursored candidate). */
  cursored: boolean;
}

export interface EquipPickerView {
  db: MessageDb;
  /** Body slot 0..7 being filled (selects the slot-title message). */
  bodySlot: number;
  /** Slot title override (verbatim) instead of the msg-table lookup. */
  slotTitle?: string;
  /** Carried inventory rows in display order (aligned with composeMainPanel). */
  rows: ReadonlyArray<EquipRow>;
  /** True when the cursor is on NONE (highlights NONE in the prompt). */
  cursorOnNone: boolean;
}

const SLOT_TITLES = [
  'PRIMARY WEAPON', 'SECONDARY ITEM', 'MISC. ITEM', 'HELMET',
  'BODY ARMOR', 'LEG ARMOR', 'GAUNTLETS', 'BOOTS',
] as const;

function formatPrompt(db: MessageDb, slotTitle: string): string {
  const template = creationString(db, MSG_SELECT_TEMPLATE) || 'SELECT $ >';
  return template.replace('$', slotTitle);
}

function resolveSlotTitle(view: EquipPickerView): string {
  if (view.slotTitle !== undefined) return view.slotTitle;
  return creationString(view.db, MSG_SLOT_TITLE_BASE + view.bodySlot) || SLOT_TITLES[view.bodySlot] || '';
}

function composePromptBar(view: EquipPickerView): TileWindow {
  const w = createTileWindow({ screenX: 0, screenY: BAR_Y, widthCells: BAR_W, heightCells: BAR_H });
  // The highlighted NONE renders inverse (black on yellow); the prompt text is
  // plain wfont3. invertHighlight true → attr-0x50 cells draw inverse.
  w.invertHighlight = true;
  clearWindow(w, 0x20, BAR_BG_ATTR);
  for (let cx = 0; cx < BAR_W; cx++) {
    const idx = ((BAR_H - 1) * BAR_W + cx) * 2;
    w.cells[idx] = CHROME_BOTTOM_BORDER_CHAR;
    w.cells[idx + 1] = BAR_BG_ATTR;
  }
  const prompt = formatPrompt(view.db, resolveSlotTitle(view));
  setCursor(w, PROMPT_COL, PROMPT_ROW);
  puts(w, prompt, PROMPT_TEXT_ATTR);
  setCursor(w, PROMPT_COL + prompt.length, PROMPT_ROW);
  puts(w, ' ', PROMPT_TEXT_ATTR);
  const none = creationString(view.db, MSG_NONE) || 'NONE';
  setCursor(w, PROMPT_COL + prompt.length + 1, PROMPT_ROW);
  puts(w, none, view.cursorOnNone ? PROMPT_NONE_ON_ATTR : PROMPT_NONE_OFF_ATTR);
  return w;
}

/**
 * One inventory row's marker + recolored name (cols 21..36 of the panel),
 * returning 1-2 windows. The base row is always COLORED (invertHighlight false:
 * marker ▸/✓ + name colored + pad). For a CURSORED candidate, a second window
 * draws an INVERSE BOX over just the NAME cells (the engine keeps the ▸ marker
 * colored and the pad normal — only the name is boxed).
 */
function composeRow(view: EquipPickerView, rowIndex: number): TileWindow[] {
  const row = view.rows[rowIndex];
  if (!row) return [];
  const screenY = (INV_FIRST_ROW + rowIndex) * CELL_PX;
  const w = createTileWindow({ screenX: ROW_COL0 * CELL_PX, screenY, widthCells: ROW_W, heightCells: 1 });
  w.invertHighlight = false; // colored highlight path (stroke = palette[hi nibble])

  let marker = 0x20;
  let markerAttr = MARKER_NONE_ATTR;
  let nameAttr = NAME_NORMAL_ATTR;
  if (row.state === 'equipped') {
    marker = CHECK_CHAR; markerAttr = MARKER_EQUIPPED_ATTR; nameAttr = NAME_EQUIPPED_ATTR;
  } else if (row.state === 'candidate') {
    marker = ARROW_CHAR; markerAttr = MARKER_CANDIDATE_ATTR; nameAttr = NAME_CANDIDATE_ATTR;
  }

  setCursor(w, MARKER_COL, 0);
  puts(w, String.fromCharCode(marker), markerAttr);
  const name = row.name.slice(0, NAME_WIDTH);
  setCursor(w, NAME_COL, 0);
  puts(w, name, nameAttr);
  for (let c = NAME_COL + name.length; c <= NAME_WIDTH; c++) {
    const i = c * 2;
    w.cells[i] = 0x20;
    w.cells[i + 1] = PAD_ATTR;
  }
  if (!row.cursored) return [w];

  // Cursored candidate: inverse box over the NAME cells only (cols 22..22+len-1).
  const box = createTileWindow({
    screenX: (ROW_COL0 + NAME_COL) * CELL_PX,
    screenY,
    widthCells: Math.max(1, name.length),
    heightCells: 1,
  });
  box.invertHighlight = true;
  setCursor(box, 0, 0);
  puts(box, name, NAME_CURSORED_ATTR);
  return [w, box];
}

/**
 * Compose the EQUIP slot-picker overlay windows (z-order, lowest first): the
 * bottom prompt bar + one overlay per carried inventory row (markers + names),
 * painted over a composeMainPanel frame and replacing the action-menu strip.
 */
export function composeEquipPicker(view: EquipPickerView): TileWindow[] {
  const windows: TileWindow[] = [composePromptBar(view)];
  for (let i = 0; i < view.rows.length; i++) {
    windows.push(...composeRow(view, i));
  }
  return windows;
}
