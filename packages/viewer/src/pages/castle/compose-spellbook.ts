/**
 * compose-spellbook.ts — camp SPELL read-only spellbook viewer (WPCVW SPELL
 * action). Renders the SAME screen shape as the character-creation spell picker,
 * but over the WPCVW character-view char sheet and listing the caster's KNOWN
 * spells (per-school) instead of the creation-available ones.
 *
 * Layers (z-order, lowest first), verified byte-exact vs the committed engine
 * fixtures tools/parity/fixtures/engine/spellbook-grid-fire / -sublist-fire:
 *   1. WPCVW main panel (composeMainPanel, 40×20 @ 0,0) — the full char sheet:
 *      portrait/header/stats/HP-STM/AC/inventory + the 6 school-mana icons.
 *   2. School cursor (drawSchoolCursor) over the current school's mana icon —
 *      only in GRID mode (in SUB-LIST mode the icon keeps its normal glyph,
 *      matching the creation picker; RE'd in compose-spell-screen-frame.ts).
 *   3. Spell panel (composeSpellPanel: spellOuter 20×16 @160,32 + spellInner
 *      19×8 @168,56) — the "SPELLS" list of the selected school's KNOWN spells,
 *      the realm label, and the COST box.
 *   4. Bottom prompt bar (bottomBar 40×5 @0,160) — centered footer
 *      "SELECT THE SPELL TO CAST" (msg id 701), white-on-gray (wfont3). Its
 *      last cell row carries the engine's gray+1px-black chrome baseline glyph
 *      (wfont3 0x1e) so screen row 199 is black, like every WPCVW screen.
 *
 * The list/cost differences from creation: spells come from knownSpellsBySchool
 * (the per-character spellbook) and the COST shows the selected spell's SP cost
 * (KnownSpell.cost = spell-table byte +0x2).
 *
 * PURE — no I/O. The caller supplies the message DB + portrait-patched font set
 * to renderCreationFrame/CharacterViewCanvas.
 */
import { setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { ActivePartyMember, MessageDb, KnownSpell } from '@wiz6/data';
import { knownSpellsBySchool } from '@wiz6/data';
import { composeMainPanel, type InventoryItem } from './compose-main-panel.js';
import { createPersistentWindows, createSpellPickWindows } from '../roster/creation/ega/windows.js';
import { composeSpellPanel, REALM_NAMES } from '../roster/creation/ega/compose-spell-panel.js';
import { drawSchoolCursor, drawCursorBlock } from '../roster/creation/ega/compose-school-cursor.js';
import { spellName, creationString } from '../roster/creation/messages.js';
import { SPELL_CANCEL_CELL } from './character-view-reducer.js';

/** msg.dbs id for the camp-SPELL footer "SELECT THE SPELL TO CAST". */
export const SELECT_SPELL_TO_CAST_MSG = 701;

/** wfont3 glyph 0x1e — the WPCVW screen baseline (7 rows gray + 1 row black). */
const CHROME_BOTTOM_BORDER_CHAR = 0x1e;

export interface SpellbookView {
  /** The caster whose spellbook is shown (char sheet + known spells). */
  member: ActivePartyMember;
  db: MessageDb;
  /** Current school cursor 0..5 (FIRE/WATER/AIR/EARTH/MENTAL/DIVINE), or
   *  SPELL_CANCEL_CELL (-1) = the CANCEL sentinel cell (renders "CANCEL"). */
  school: number;
  /** 'grid' = browsing schools; 'sublist' = a spell within the school is selected. */
  mode: 'grid' | 'sublist';
  /** Sub-list spell cursor (index into the school's known-spell list). Ignored in grid mode. */
  spellIdx: number;
  /** Inventory list for the char sheet (defaults to empty). */
  inventory?: ReadonlyArray<InventoryItem>;
  /** Carrying-capacity values for the char sheet. */
  cc?: { current: number; max: number };
  /** Age values for the char sheet. */
  age?: { years: number; second: number };
}

/**
 * Compose the camp SPELL spellbook windows for `view`. Returns the TileWindows
 * in z-order (lowest first). Pure.
 */
export function composeSpellbookFrame(view: SpellbookView): TileWindow[] {
  const { bottomBar } = createPersistentWindows();
  const { outer, inner } = createSpellPickWindows();

  // 1. WPCVW char sheet (with the 6 school-mana icons).
  const main = composeMainPanel({
    member: view.member,
    db: view.db,
    inventory: view.inventory,
    cc: view.cc,
    age: view.age,
  });

  // 3. Spell panel — KNOWN spells of the selected school, OR the CANCEL cell.
  // CANCEL sentinel (the engine's 0xffff cursor): the realm-label box reads
  // "CANCEL" (gray), the SPELLS list is empty, COST blank, and the selection
  // cursor lands on the spell-panel realm-row POWER cell (spellOuter col1 row12)
  // as the school-cursor block (drawn below) — no school icon is highlighted.
  // RE: docs/re/findings/wpcvw-spell-action.json.
  const onCancel = view.school === SPELL_CANCEL_CELL;
  const bySchool: KnownSpell[][] = knownSpellsBySchool(view.member);
  const list = onCancel ? [] : (bySchool[view.school] ?? []);
  const sel = view.mode === 'sublist' && !onCancel ? view.spellIdx : null;

  composeSpellPanel(outer, inner, {
    realm: onCancel ? 'CANCEL' : (REALM_NAMES[view.school] ?? ''),
    spellNames: list.map((s) => spellName(view.db, s.index) || `SPELL ${s.index}`),
    selectedIdx: sel,
    cost: sel !== null && list[sel] != null ? String(list[sel]!.cost) : null,
  });

  // 2. Selection cursor (solid bright-yellow highlight block, wfont0 0x63 @ 0x50)
  // — GRID mode only:
  //   - On a school cell: over that school's mana icon (drawSchoolCursor).
  //   - On the CANCEL cell: over the spell-panel realm-row POWER cell
  //     (spellOuter col1 row12) instead — the engine moves the same block there
  //     when the cursor walks off the grid onto CANCEL.
  // BLINK: the engine blinks this cursor (~2 ON / ~2-3 OFF, free-running). We
  // render it STATICALLY in the ON phase; the ON-phase engine fixtures (recipe
  // settleMs tuned to land ON) are the parity gate. See drawCursorBlock.
  if (view.mode === 'grid') {
    if (onCancel) drawCursorBlock(outer, 1, 12);
    else drawSchoolCursor(main, view.school);
  }

  // 4. Footer prompt centered on bottomBar row 1.
  const prompt = creationString(view.db, SELECT_SPELL_TO_CAST_MSG) || 'SELECT THE SPELL TO CAST';
  setCursor(bottomBar, Math.floor((bottomBar.widthCells - prompt.length) / 2), 1);
  puts(bottomBar, prompt, 0x03);

  // WPCVW screen baseline: fill the bottomBar's last cell row with the chrome
  // bottom-border glyph (gray + 1px black) so screen row 199 is black.
  const lastRow = bottomBar.heightCells - 1;
  for (let cx = 0; cx < bottomBar.widthCells; cx++) {
    const i = (lastRow * bottomBar.widthCells + cx) * 2;
    bottomBar.cells[i] = CHROME_BOTTOM_BORDER_CHAR;
    bottomBar.cells[i + 1] = 0x03;
  }

  return [main, bottomBar, outer, inner];
}
