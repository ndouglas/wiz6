/**
 * SpellPickScreen — screen-14: spell picking for caster classes.
 *
 * Two-level state machine:
 *   GRID mode   — 3×2 school grid (6 schools, cursor 0..5).
 *   SUB-LIST mode — per-school spell list with highlighted selection.
 *
 * Grid layout (idiv-3): row = school/3, col = school%3.
 *   row0 = schools {0,1,2}, row1 = schools {3,4,5}.
 *
 * Navigation (key codes from mapKey: 1=left,2=up,3=right,4=down,5=enter,0=esc):
 *
 * GRID mode:
 *   up (2):    school-1 if col > 0
 *   down (4):  school+1 if col < 2
 *   left (1):  school-3 if school >= 3
 *   right (3): school+3 if school < 3
 *   enter (5): enter sub-list if grid[school].length > 0
 *   esc (0):   no-op
 *
 * SUB-LIST mode:
 *   up (2):    spellIdx-1, clamp >= 0
 *   down (4):  spellIdx+1, clamp <= list.length-1
 *   enter (5): dispatch PICK_SPELL; if done → SPELLS_DONE, else → grid
 *   left (1) or esc (0): return to grid
 *
 * Reducer contract (state.ts):
 *   PICK_SPELL {entry} → appends to draft.spellPicks[], does NOT auto-advance.
 *   SPELLS_DONE         → advances screen to 'confirm'.
 *
 * Spec: docs/re/wpcmk-screens.md §5, §8, §9
 *       docs/re/findings/spell-picker-eligibility.json
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { setCursor, puts } from '@wiz6/parser';
import { creationSpellGrid, creationPickCount, spellCost, WIZ6_MAIN } from '@wiz6/data';
import type { Palette, PortraitSet } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../state.js';
import { createPersistentWindows, createSpellPickWindows } from '../ega/windows.js';
import { composeSpellPanel, REALM_NAMES } from '../ega/compose-spell-panel.js';
import { drawCharSheet } from '../ega/char-sheet.js';
import { patchFontSetWithPortrait } from '../ega/skill-train-frame.js';
import { drawSchoolCursor } from '../ega/compose-school-cursor.js';
import { CreationCanvas } from '../ega/CreationCanvas.js';
import { MSG, creationString, spellName } from '../messages.js';
import { mapKey } from './ScreenProps.js';

// ---------------------------------------------------------------------------
// Exported pure navigation helpers (tested directly)
// ---------------------------------------------------------------------------

/**
 * Grid-mode: compute the next school index after a key press.
 * school 0..5, grid col = school%3, row = school/3 (integer).
 *
 * code 1 = left  → school-3 if school >= 3, else clamp
 * code 2 = up    → school-1 if col > 0, else clamp
 * code 3 = right → school+3 if school < 3, else clamp
 * code 4 = down  → school+1 if col < 2, else clamp
 * other  → unchanged
 */
export function gridNextSchool(school: number, code: number): number {
  const col = school % 3;
  if (code === 2) return col > 0 ? school - 1 : school;          // up
  if (code === 4) return col < 2 ? school + 1 : school;          // down
  if (code === 1) return school >= 3 ? school - 3 : school;      // left
  if (code === 3) return school < 3 ? school + 3 : school;       // right
  return school;
}

/**
 * Sub-list mode: compute the next spell index after a key press.
 *
 * code 2 = up   → max(0, idx-1)
 * code 4 = down → min(len-1, idx+1)
 * other  → unchanged
 */
export function sublistNextIdx(idx: number, len: number, code: number): number {
  if (code === 2) return Math.max(0, idx - 1);
  if (code === 4) return Math.min(Math.max(0, len - 1), idx + 1);
  return idx;
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
  /** [wport1, wport2, wport3]. Falls back gracefully (no portrait) if empty. */
  portraits?: PortraitSet[];
}

/**
 * SpellPickScreen — renders screen-14: class-specific spell picking.
 *
 * Dumb component. Pick accounting (appending to spellPicks[]) lives in the
 * reducer. This component tracks the school cursor, grid/sublist mode, and
 * dispatches SPELLS_DONE when the required count is reached.
 */
export function SpellPickScreen({
  state,
  dispatch,
  fontSet,
  palette,
  db,
  portraits = [],
}: SpellPickScreenProps) {
  const classIdx = state.draft.class ?? 0;
  const grid = creationSpellGrid(classIdx);
  const required = creationPickCount(classIdx);
  const pickedSoFar = state.draft.spellPicks.length;

  // Two-level state machine state.
  const [school, setSchool] = useState<number>(0);
  const [mode, setMode] = useState<'grid' | 'sublist'>('grid');
  const [spellIdx, setSpellIdx] = useState<number>(0);

  // -------------------------------------------------------------------------
  // Key handler
  // -------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const code = mapKey(e);
      // Escape (null) in sublist mode → return to grid (cancel selection).
      if (code === null) {
        if (mode === 'sublist') {
          setMode('grid');
          setSpellIdx(0);
        }
        return;
      }

      if (mode === 'grid') {
        if (code === 1 || code === 2 || code === 3 || code === 4) {
          setSchool((s) => gridNextSchool(s, code));
        } else if (code === 5) {
          // enter → drill into sub-list if school has spells
          const list = grid[school];
          if (list && list.length > 0) {
            setMode('sublist');
            setSpellIdx(0);
          }
        }
        // esc (null) and unknown keys → no-op in grid
      } else {
        // sublist mode
        const list = grid[school] ?? [];
        if (code === 2 || code === 4) {
          // up/down — move within sub-list
          setSpellIdx((idx) => sublistNextIdx(idx, list.length, code));
        } else if (code === 5) {
          // enter — pick spell
          const spell = list[spellIdx];
          if (spell !== undefined) {
            dispatch({ type: 'PICK_SPELL', entry: spell.entryIdx });
            if (pickedSoFar + 1 >= required) {
              dispatch({ type: 'SPELLS_DONE' });
            } else {
              // Return to grid for next pick.
              setMode('grid');
              setSpellIdx(0);
            }
          }
        } else if (code === 1) {
          // left — cancel, return to grid
          setMode('grid');
          setSpellIdx(0);
        }
        // esc (null) is handled above the grid/sublist branch (sets mode→grid)
      }
    },
    [mode, school, spellIdx, grid, dispatch, pickedSoFar, required],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const pal = palette ?? WIZ6_MAIN;
  // Portrait is rendered via a font2 patch (same mechanism as the other
  // char-sheet screens), keyed on the draft's portrait index.
  const fontSetWithPortrait = useMemo(
    () => patchFontSetWithPortrait(fontSet, portraits, state.draft.portrait),
    [fontSet, portraits, state.draft.portrait],
  );
  const { top, bottomBar } = createPersistentWindows();
  const { outer, inner } = createSpellPickWindows();

  // The persistent stat panel (header, HP/STM, the 6 school-mana icons, portrait
  // region) must be drawn before the school cursor overdraws its icon — this is
  // the whole left side of the screen, identical to the other creation screens.
  drawCharSheet(top, state.draft, db);

  const list = grid[school] ?? [];
  const sel = mode === 'sublist' ? spellIdx : null;

  composeSpellPanel(outer, inner, {
    realm: REALM_NAMES[school] ?? '',
    spellNames: list.map((s) => spellName(db, s.entryIdx) || `SPELL ${s.entryIdx}`),
    selectedIdx: sel,
    cost:
      sel !== null && list[sel] != null
        ? String(spellCost(list[sel]!.entry))
        : null,
  });

  // School cursor overdraws the current school's mana icon (after the char sheet).
  drawSchoolCursor(top, school);

  // Bottom-bar prompt (engine renders msg 0x2bf here, not inside the panel).
  const prompt =
    creationString(db, MSG.selectNewSpell) || 'SELECT A NEW SPELL FOR YOUR SPELLBOOK';
  setCursor(bottomBar, Math.floor((bottomBar.widthCells - prompt.length) / 2), 1);
  puts(bottomBar, prompt, 0x03);

  const windows = [top, bottomBar, outer, inner];
  return <CreationCanvas windows={windows} fontSet={fontSetWithPortrait} palette={pal} />;
}
