/**
 * compose-spell-screen-frame.ts — builds ALL four windows of the character-
 * creation spell picker (screen-14) so the live `SpellPickScreen` component and
 * the full-screen parity test render through the SAME code path (lockstep).
 *
 * Windows (matches the engine, verified full-screen vs the creation-spell-*
 * fixtures): the persistent `top` char sheet (header + stats + HP/STM + the
 * 6 school-mana icons) with the 3×3 portrait tile glyphs overlaid; the spell
 * panel (`outer`/`inner`); and the `bottomBar` prompt. The school cursor is
 * drawn ONLY in grid mode — in sub-list mode the engine leaves the school's
 * mana icon in its normal glyph. The portrait FONT patch
 * (patchFontSetWithPortrait) is applied by the caller at render time.
 */
import { setCursor, puts, type TileWindow } from '@wiz6/parser';
import { creationSpellGrid, spellCost, type CreationSpell } from '@wiz6/data';
import type { MessageDb } from '@wiz6/data';
import type { DraftState } from '../state.js';
import { createPersistentWindows, createSpellPickWindows } from './windows.js';
import { drawCharSheet } from './char-sheet.js';
import { composeSpellPanel, REALM_NAMES } from './compose-spell-panel.js';
import { drawSchoolCursor } from './compose-school-cursor.js';
import { spellName, creationString, MSG } from '../messages.js';

/** wfont2 portrait tile glyph base — 0x48..0x50 hold the 3×3 portrait tiles. */
const PORTRAIT_GLYPH_BASE = 0x48;

/**
 * The per-school level-1 spell grid for `classIdx`, with already-picked spells
 * removed (a spell can't be learned twice). Returns 6 arrays (school 0..5).
 */
export function pickableGrid(classIdx: number, spellPicks: number[]): CreationSpell[][] {
  const picked = new Set(spellPicks);
  return creationSpellGrid(classIdx).map((schoolSpells) =>
    schoolSpells.filter((s) => !picked.has(s.entryIdx)),
  );
}

export interface SpellScreenView {
  draft: DraftState;
  /** Current school cursor 0..5. */
  school: number;
  /** 'grid' = browsing schools; 'sublist' = picking a spell within a school. */
  mode: 'grid' | 'sublist';
  /** Sub-list spell cursor (ignored in grid mode). */
  spellIdx: number;
}

/**
 * Compose the four spell-picker windows for `view`. Pure (no React); the caller
 * supplies the portrait-patched font set to renderCreationFrame/CreationCanvas.
 */
export function composeSpellScreenFrame(view: SpellScreenView, db: MessageDb): TileWindow[] {
  const { top, bottomBar } = createPersistentWindows();
  const { outer, inner } = createSpellPickWindows();

  // Persistent char sheet (header, stats, HP/STM, the 6 school-mana icons).
  drawCharSheet(top, view.draft, db);

  // Portrait: 3×3 tile glyphs (0x48..0x50, attr 0x02 = wfont2) at top cells
  // (1,1)..(3,3). drawCharSheet leaves those cells as gray spaces; we overlay
  // the portrait glyph chars, which the patched wfont2 maps to the tiles.
  for (let r = 0; r < 3; r++) {
    setCursor(top, 1, 1 + r);
    puts(
      top,
      String.fromCharCode(PORTRAIT_GLYPH_BASE + r * 3) +
        String.fromCharCode(PORTRAIT_GLYPH_BASE + r * 3 + 1) +
        String.fromCharCode(PORTRAIT_GLYPH_BASE + r * 3 + 2),
      0x02,
    );
  }

  const grid = pickableGrid(view.draft.class ?? 0, view.draft.spellPicks);
  const list = grid[view.school] ?? [];
  const sel = view.mode === 'sublist' ? view.spellIdx : null;

  composeSpellPanel(outer, inner, {
    realm: REALM_NAMES[view.school] ?? '',
    spellNames: list.map((s) => spellName(db, s.entryIdx) || `SPELL ${s.entryIdx}`),
    selectedIdx: sel,
    cost: sel !== null && list[sel] != null ? String(spellCost(list[sel]!.entry)) : null,
  });

  // School cursor (solid highlight block over the mana icon) only in GRID mode.
  if (view.mode === 'grid') drawSchoolCursor(top, view.school);

  const prompt =
    creationString(db, MSG.selectNewSpell) || 'SELECT A NEW SPELL FOR YOUR SPELLBOOK';
  setCursor(bottomBar, Math.floor((bottomBar.widthCells - prompt.length) / 2), 1);
  puts(bottomBar, prompt, 0x03);

  return [top, bottomBar, outer, inner];
}
