/**
 * PortraitPickerScreen — screen-10: portrait picker.
 *
 * Engine routines:
 *   - `wpcmk_pick_portrait_loop` (0x4bad)
 *   - `portrait_load_from_disk`  (0x4a9a)
 *
 * Layout (per docs/re/wpcmk-screens.md §6 and cell-dump verification vs slot 1):
 *   - Persistent windows are kept open. `top` shows the standard char-sheet
 *     with the title slot set to "CHARACTER PORTRAIT" (msg 0x045f).
 *   - The current portrait is rendered as a 3×3 tile grid in `menuPanel` at
 *     cells (8..10, 3..5), all attr 0x02 (wfont2). The engine loads the active
 *     wport*.ega into the wfont2 slot for the duration of this screen; we
 *     replicate that by cloning fontSet.font2 with portrait tiles injected at
 *     glyphs 0x48..0x50.
 *   - `bottomBar` row 1: "◄► TO REVIEW PORTRAITS" (msg 0x0458) centered.
 *   - `bottomBar` row 2: "PRESS ▶ TO SELECT"      (msg 0x0459) centered.
 *
 * Controls (§6):
 *   - ArrowLeft  → (idx + 41) % 42
 *   - ArrowRight → (idx + 1)  % 42
 *   - Enter      → dispatch PICK_PORTRAIT { index }
 *   - ArrowUp/Down + Escape: no-op (§6, §8).
 *
 * Portrait → wport file mapping:
 *   - wport1: portraits 0..13
 *   - wport2: portraits 14..27
 *   - wport3: portraits 28..41
 *   - Each PortraitSet exposes `portraits[i].tiles[0..8]` in row-major 3×3 order,
 *     each tile being a 32-byte wfont-format glyph.
 *
 * Verified pixel-exact against engine save slot 1 (portrait 0, NATHAN samurai) in
 * tools/parity/screen-parity.test.ts → fixture creation-portrait-select.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { setCursor, puts } from '@wiz6/parser';
import { WIZ6_MAIN } from '@wiz6/data';
import type { Palette, PortraitSet } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../state.js';
import { createPersistentWindows } from '../ega/windows.js';
import { drawCharSheet } from '../ega/char-sheet.js';
import { CreationCanvas } from '../ega/CreationCanvas.js';
import { MSG, creationString } from '../messages.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Total portrait count — 42 portraits (0..41), per §6. */
const PORTRAIT_COUNT = 42;
/** Portraits per wport file. */
const PORTRAITS_PER_FILE = 14;
/** Base font-glyph index where the engine maps the 3×3 portrait tiles. */
const PORTRAIT_GLYPH_BASE = 0x48;
/** menuPanel cell where the 3×3 portrait tile grid begins. */
const PORTRAIT_CELL_X = 8;
const PORTRAIT_CELL_Y = 3;

// ---------------------------------------------------------------------------
// PortraitPickerScreen component
// ---------------------------------------------------------------------------

export interface PortraitPickerScreenProps {
  state: CreationState;
  dispatch: (e: CreationEvent) => void;
  fontSet: FontSet;
  palette: Palette;
  db: MessageDb;
  /** [wport1, wport2, wport3] — loaded by CreationPage; 14 portraits each. */
  portraits?: PortraitSet[];
}

export function PortraitPickerScreen({
  state,
  dispatch,
  fontSet,
  palette,
  db,
  portraits = [],
}: PortraitPickerScreenProps) {
  // Default-0 per §6 (engine writes 0 to *0x560c just before the loop starts).
  const [portraitIdx, setPortraitIdx] = useState<number>(0);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          setPortraitIdx((prev) => (prev + PORTRAIT_COUNT - 1) % PORTRAIT_COUNT);
          break;
        case 'ArrowRight':
          setPortraitIdx((prev) => (prev + 1) % PORTRAIT_COUNT);
          break;
        case 'Enter':
          dispatch({ type: 'PICK_PORTRAIT', index: portraitIdx });
          break;
        default:
          break;
      }
    },
    [dispatch, portraitIdx],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const { top, bottomBar, menuPanel } = createPersistentWindows();
  const pal = palette ?? WIZ6_MAIN;

  drawCharSheet(top, state.draft, db, creationString(db, MSG.portraitTitle));

  // bottomBar prompts (Math.ceil padding matches the engine's centering).
  const review = creationString(db, MSG.portraitReview);
  setCursor(bottomBar, Math.ceil((bottomBar.widthCells - review.length) / 2), 1);
  puts(bottomBar, review, 0x03);
  const select = creationString(db, MSG.portraitSelect);
  setCursor(bottomBar, Math.ceil((bottomBar.widthCells - select.length) / 2), 2);
  puts(bottomBar, select, 0x03);

  // menuPanel: 3×3 portrait tile grid at (8,3)..(10,5), attr 0x02 (wfont2).
  for (let r = 0; r < 3; r++) {
    setCursor(menuPanel, PORTRAIT_CELL_X, PORTRAIT_CELL_Y + r);
    for (let c = 0; c < 3; c++) {
      puts(menuPanel, String.fromCharCode(PORTRAIT_GLYPH_BASE + r * 3 + c), 0x02);
    }
  }

  // Build a font2 with the active portrait's 9 tiles injected at the engine's
  // glyph slots (0x48..0x50). Memoized by portraitIdx so font cloning only
  // happens on selection change, not on every keystroke.
  const fontSetWithPortrait = useMemo<FontSet>(() => {
    const fileIdx = Math.floor(portraitIdx / PORTRAITS_PER_FILE);
    const inFile = portraitIdx % PORTRAITS_PER_FILE;
    const set = portraits[fileIdx];
    const portrait = set?.portraits[inFile];
    const baseFont2 = fontSet.font2;
    if (!portrait || !baseFont2) return fontSet;
    const glyphs = baseFont2.glyphs.map((g, i) =>
      i >= PORTRAIT_GLYPH_BASE && i < PORTRAIT_GLYPH_BASE + 9
        ? portrait.tiles[i - PORTRAIT_GLYPH_BASE]!
        : g,
    );
    return { ...fontSet, font2: { ...baseFont2, glyphs } };
  }, [fontSet, portraits, portraitIdx]);

  const windows = [top, bottomBar, menuPanel];

  return <CreationCanvas windows={windows} fontSet={fontSetWithPortrait} palette={pal} />;
}
