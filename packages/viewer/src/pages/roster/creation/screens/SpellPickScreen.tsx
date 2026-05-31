/**
 * SpellPickScreen — screen-14: spell picking for caster classes.
 *
 * Only shown for classes where `classIsCaster(classIdx)` is true:
 *   Mage (1), Priest (2), Alchemist (5), Psionic (7), Bishop (9).
 *
 * Eligible spells: union of `spellsInBook(bookIdx)` for each book in the
 * class's `CLASS_SPELLBOOKS` entry with a nonzero pick count. For single-book
 * casters (Mage/Priest/Alchemist/Psionic) this is one book. For Bishop it is
 * Mage book + Priest book.
 *
 * Pick count required: sum of `CLASS_SPELLBOOKS[classIdx]`.
 *   Mage:      CLASS_SPELLBOOKS[1] = [2,0,0,0] → 2 picks
 *   Priest:    CLASS_SPELLBOOKS[2] = [0,2,0,0] → 2 picks
 *   Alchemist: CLASS_SPELLBOOKS[5] = [0,0,2,0] → 2 picks
 *   Psionic:   CLASS_SPELLBOOKS[7] = [0,0,0,2] → 2 picks
 *   Bishop:    CLASS_SPELLBOOKS[9] = [1,1,0,0] → 2 picks (1 from each)
 *
 * Reducer contract (state.ts):
 *   PICK_SPELL {entry} → appends to draft.spellPicks[], does NOT auto-advance.
 *   SPELLS_DONE         → advances screen to 'confirm'.
 *   The SCREEN is responsible for dispatching SPELLS_DONE when picks === required.
 *
 * Key handlers per §8 (same code scheme as all wpcmk screens):
 *   ArrowUp    (code 2) → cursor = prev eligible spell (clamp, no wrap)
 *   ArrowDown  (code 4) → cursor = next eligible spell (clamp, no wrap)
 *   ArrowRight (code 3) → dispatch PICK_SPELL { entry: <cursor entryIdx> };
 *                         then SPELLS_DONE if picks == required
 *   Enter      (code 5) → same as ArrowRight
 *   ArrowLeft  (code 1) → no-op (no spell removal)
 *   Escape     (code 0) → silently ignored per §8
 *
 * Render:
 *   Uses two temporary windows (§2):
 *     spellOuter — 20×16 @ (160,32)  attr 0x16 — outer panel: title + pick count
 *     spellInner — 19×8  @ (168,56)  attr 0x17 — inner grid: spell list with cursor
 *   Also renders the persistent top (stat panel) window.
 *   Title from MSG.spellsTitle (0x02bc), cost label from MSG.cost (0x0f75).
 *   Spell names from spellName(db, entryIdx) = msg (0xfa0 + entryIdx).
 *
 * Spec: docs/re/wpcmk-screens.md §5, §8, §9
 */

import { useState, useEffect, useCallback } from 'react';
import { setCursor, puts } from '@wiz6/parser';
import { CLASS_SPELLBOOKS, spellsInBook, SPELL_TABLE, WIZ6_MAIN } from '@wiz6/data';
import type { Palette } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../state.js';
import { createPersistentWindows, createSpellPickWindows } from '../ega/windows.js';
import { composeSpellPanel, REALM_NAMES } from '../ega/compose-spell-panel.js';
import { CreationCanvas } from '../ega/CreationCanvas.js';
import { MSG, creationString, spellName } from '../messages.js';
import { mapKey } from './ScreenProps.js';

// ---------------------------------------------------------------------------
// Eligible spell derivation
// ---------------------------------------------------------------------------

/**
 * Derive the list of eligible spells for a caster class.
 *
 * Returns a flat array of `{ entryIdx, bookIdx }` pairs, ordered by
 * book then by entryIdx within each book.
 * Sentinel entries (byte5 === 0, level === 0) are excluded by spellsInBook.
 *
 * For a single-book caster (Mage/Priest/Alchemist/Psionic) this is a list
 * from one book. For Bishop (Mage+Priest books) entries from both books are
 * included. A spell that appears in multiple active books is listed once per
 * book appearance (per engine's per-book filter behaviour).
 */
function eligibleSpells(classIdx: number): Array<{ entryIdx: number; bookIdx: number }> {
  const books = CLASS_SPELLBOOKS[classIdx];
  if (!books) return [];

  const result: Array<{ entryIdx: number; bookIdx: number }> = [];
  for (let bookIdx = 0; bookIdx < 4; bookIdx++) {
    const pickCount = books[bookIdx] ?? 0;
    if (pickCount === 0) continue;
    const spells = spellsInBook(bookIdx);
    for (const { entryIdx } of spells) {
      result.push({ entryIdx, bookIdx });
    }
  }
  return result;
}

/**
 * Total starter-spell picks required for the class.
 * Sum of all nonzero values in CLASS_SPELLBOOKS[classIdx].
 */
function totalPicksRequired(classIdx: number): number {
  const books = CLASS_SPELLBOOKS[classIdx];
  if (!books) return 0;
  return books.reduce<number>((sum, count) => sum + count, 0);
}

// ---------------------------------------------------------------------------
// SpellPickScreen component
// ---------------------------------------------------------------------------

export interface SpellPickScreenProps {
  state: CreationState;
  dispatch: (e: CreationEvent) => void;
  fontSet: FontSet;
  palette: Palette;
  db: MessageDb;
}

/**
 * SpellPickScreen — renders screen-14: class-specific spell picking.
 *
 * Dumb component. Pick accounting (appending to spellPicks[]) lives in the
 * reducer. This component tracks only the local cursor position, computes
 * how many picks have been made, and dispatches SPELLS_DONE when the
 * required count is reached.
 */
export function SpellPickScreen({
  state,
  dispatch,
  fontSet,
  palette,
  db,
}: SpellPickScreenProps) {
  const classIdx = state.draft.class ?? 0;
  const spells = eligibleSpells(classIdx);
  const required = totalPicksRequired(classIdx);
  const pickedSoFar = state.draft.spellPicks.length;

  // Cursor: index into the `spells` array.
  const [cursorIdx, setCursorIdx] = useState<number>(0);

  // -------------------------------------------------------------------------
  // Key handler
  // -------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const code = mapKey(e);
      if (code === null) return;

      switch (code) {
        case 2: // ArrowUp — prev spell (clamp, no wrap)
          setCursorIdx((prev) => Math.max(0, prev - 1));
          break;
        case 4: // ArrowDown — next spell (clamp, no wrap)
          setCursorIdx((prev) => Math.min(spells.length - 1, prev + 1));
          break;
        case 3: // ArrowRight — pick spell
        case 5: { // Enter — same as ArrowRight
          const spell = spells[cursorIdx];
          if (spell === undefined) break;
          dispatch({ type: 'PICK_SPELL', entry: spell.entryIdx });
          // After this pick, check if we've reached the required count
          if (pickedSoFar + 1 >= required) {
            dispatch({ type: 'SPELLS_DONE' });
          }
          break;
        }
        case 1: // ArrowLeft — no-op (no spell removal)
        default:
          break;
      }
    },
    [cursorIdx, spells, dispatch, pickedSoFar, required],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // Engine layout: a scrollable single-spell DETAIL view (NOT a flat list).
  // The cursor browses one spell at a time; the panel shows its name, realm,
  // level pips, and cost, with a scrollbar in the inner window's col 0.
  const pal = palette ?? WIZ6_MAIN;
  const { top, bottomBar } = createPersistentWindows();
  const { outer, inner } = createSpellPickWindows();

  const cur = spells[cursorIdx];
  const curName = cur ? spellName(db, cur.entryIdx) || `SPELL ${cur.entryIdx}` : '';
  // Realm (element) from the spell table's school index (0=Fire … 5=Divine).
  const entry = cur ? SPELL_TABLE[cur.entryIdx] : undefined;
  const realm = entry ? REALM_NAMES[entry.school] ?? '' : '';
  // COST stays blank: the engine shows no SP cost when LEARNING a starter spell
  // at creation (verified against the fixture) — cost is an in-game cast-time
  // concept, not a creation one. The pip bar is the engine's fixed decorative
  // bar (not spell-level based), handled by composeSpellPanel's default.
  // NOTE: temporary single-spell adapter onto the new list/sub-list contract —
  // Task 5 reworks this screen into the grid⇄sub-list state machine. For now we
  // render the browsed spell as a one-entry grid-browse list (no highlight, no
  // COST), preserving the existing behaviour.
  composeSpellPanel(outer, inner, {
    realm,
    spellNames: curName ? [curName] : [],
    selectedIdx: null,
    cost: null,
  });

  // Bottom-bar prompt (engine renders msg 0x2bf here, not inside the panel).
  const prompt =
    creationString(db, MSG.selectNewSpell) || 'SELECT A NEW SPELL FOR YOUR SPELLBOOK';
  setCursor(bottomBar, Math.floor((bottomBar.widthCells - prompt.length) / 2), 1);
  puts(bottomBar, prompt, 0x03);

  const windows = [top, bottomBar, outer, inner];
  return <CreationCanvas windows={windows} fontSet={fontSet} palette={pal} />;
}
