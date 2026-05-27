/**
 * wpcmk creation window-set factory.
 *
 * Single source of truth for the six TileWindows used by the wpcmk
 * character-creation overlay, matching the §2 geometry from
 * docs/re/wpcmk-screens.md exactly.
 *
 * Coordinate system: screen-absolute (320×200 EGA). Cells are 8×8 px tiles.
 *
 * Persistent windows (created once by `wpcmk_entry_and_roster_menu` 0x59e0,
 * reused by most screens):
 *   top       — 40×20 @ (0,0)      attr 0x14  — stat panel / char-sheet
 *   bottomBar — 40×5  @ (0,160)    attr 0x13  — prompts / text input
 *   menuPanel — 19×13 @ (168,56)   attr 0x15  — race/sex/class/portrait lists
 *
 * Temporary windows (created per-screen, stack-local in the engine):
 *   skillTrain — 20×16 @ (160,32)  attr 0x19  — screen-13 skill training
 *   spellOuter — 20×16 @ (160,32)  attr 0x16  — screen-14 spell picker panel
 *   spellInner — 19×8  @ (168,56)  attr 0x17  — screen-14 spell picker grid
 *
 * Reference: docs/re/wpcmk-screens.md §2
 */

import { createTileWindow, clearWindow, type TileWindow } from '@wiz6/parser';
import { drawWindowChrome, drawCharSheetTemplate } from './chrome.js';

/** Single entry in the CREATION_WINDOW_GEOMETRY table. */
export interface WindowGeometryEntry {
  /** Stable identifier for this window slot. */
  id: 'top' | 'bottomBar' | 'menuPanel' | 'skillTrain' | 'spellOuter' | 'spellInner';
  /** Screen-absolute pixel X of the window's top-left corner. */
  screenX: number;
  /** Screen-absolute pixel Y of the window's top-left corner. */
  screenY: number;
  /** Width in 8×8-px cell units. */
  widthCells: number;
  /** Height in 8×8-px cell units. */
  heightCells: number;
  /**
   * Default attribute byte used by `clearWindow` on creation.
   * Low nibble = wfont index; high nibble = color/border style.
   */
  attr: number;
}

/**
 * Geometry + attr table for every wpcmk creation window, mirroring
 * docs/re/wpcmk-screens.md §2. Use this as the single source of truth;
 * the factory functions below derive from it.
 */
export const CREATION_WINDOW_GEOMETRY: readonly WindowGeometryEntry[] = [
  // Persistent windows — wpcmk_entry_and_roster_menu 0x59e0
  { id: 'top', screenX: 0, screenY: 0, widthCells: 40, heightCells: 20, attr: 0x14 },
  { id: 'bottomBar', screenX: 0, screenY: 160, widthCells: 40, heightCells: 5, attr: 0x13 },
  { id: 'menuPanel', screenX: 168, screenY: 56, widthCells: 19, heightCells: 13, attr: 0x15 },
  // Temporary windows — created per-screen in the engine
  { id: 'skillTrain', screenX: 160, screenY: 32, widthCells: 20, heightCells: 16, attr: 0x19 },
  { id: 'spellOuter', screenX: 160, screenY: 32, widthCells: 20, heightCells: 16, attr: 0x16 },
  { id: 'spellInner', screenX: 168, screenY: 56, widthCells: 19, heightCells: 8, attr: 0x17 },
] as const;

/** Helper: look up a geometry entry by id (asserts presence). */
function getGeometry(id: WindowGeometryEntry['id']): WindowGeometryEntry {
  const entry = CREATION_WINDOW_GEOMETRY.find((e) => e.id === id);
  if (!entry) throw new Error(`No geometry entry for window id "${id}"`);
  return entry;
}

/** Allocate a TileWindow from a geometry entry and draw the window chrome. */
function makeWindow(entry: WindowGeometryEntry): TileWindow {
  const win = createTileWindow({
    screenX: entry.screenX,
    screenY: entry.screenY,
    widthCells: entry.widthCells,
    heightCells: entry.heightCells,
  });
  drawWindowChrome(win);
  return win;
}

/** The three persistent windows present throughout wpcmk creation. */
export interface PersistentWindows {
  /** Full top area (stat panel, char-sheet). 40×20 @ (0,0) attr 0x14. */
  top: TileWindow;
  /** Bottom status bar (prompts, text input, dice roller). 40×5 @ (0,160) attr 0x13. */
  bottomBar: TileWindow;
  /** Right-side menu panel (race/sex/class/portrait lists). 19×13 @ (168,56) attr 0x15. */
  menuPanel: TileWindow;
}

/** Allocate a TileWindow from a geometry entry (no chrome). */
function blankWindow(entry: WindowGeometryEntry): TileWindow {
  return createTileWindow({
    screenX: entry.screenX,
    screenY: entry.screenY,
    widthCells: entry.widthCells,
    heightCells: entry.heightCells,
  });
}

/**
 * Create the three persistent wpcmk windows for the CHARACTER MENU, mirroring
 * the engine's `ui_setup_creation_windows` (wpcmk 0x5093):
 *
 *   - top:       cleared BLACK (char 0x00, attr 0x01 / wfont1), then the
 *                char-sheet frame template (FUN_06af) is drawn into it.
 *   - bottomBar: cleared GRAY  (char 0x20, attr 0x03 / wfont3) — no frame.
 *   - menuPanel: cleared GRAY  (char 0x20, attr 0x03 / wfont3) — no frame.
 *
 * The fill model is `clearWindow(char, attr)`: the attr's low nibble selects
 * the wfont, and the fill GLYPH (0x00 = solid black, 0x20 = solid gray in the
 * tile fonts) carries the colour. This is verified byte-exact against the
 * engine's live window cell memory (saves 1/2/3).
 *
 * Engine `ui_window_create` call sites: wpcmk 0x5a0b/0x5a31/0x5a57; clears at
 * 0x5093. RE: docs/re/findings/wpcmk-charmenu-toplayout.json.
 */
export function createPersistentWindows(): PersistentWindows {
  const top = blankWindow(getGeometry('top'));
  clearWindow(top, 0x00, 0x01);
  drawCharSheetTemplate(top);

  const bottomBar = blankWindow(getGeometry('bottomBar'));
  clearWindow(bottomBar, 0x20, 0x03);

  const menuPanel = blankWindow(getGeometry('menuPanel'));
  clearWindow(menuPanel, 0x20, 0x03);

  return { top, bottomBar, menuPanel };
}

/**
 * Create the temporary skill-training window for screen-13.
 *
 * Engine equivalent: `wpcmk_skill_training_loop` (0x1ae9), call site wpcmk 0x1b28.
 * Window: 20×16 @ (160,32) attr 0x19.
 */
export function createSkillTrainWindow(): TileWindow {
  return makeWindow(getGeometry('skillTrain'));
}

/** The two temporary windows used during screen-14 spell picking. */
export interface SpellPickWindows {
  /** Spell-picking panel. 20×16 @ (160,32) attr 0x16. */
  outer: TileWindow;
  /** 6-cell spell-pick grid (nested). 19×8 @ (168,56) attr 0x17. */
  inner: TileWindow;
}

/**
 * Create the two temporary spell-picking windows for screen-14.
 *
 * Engine equivalent: `ui_train_attribute_picker_grid` (0x229c), call sites
 * wpcmk 0x22bf (outer) and 0x22e5 (inner).
 */
export function createSpellPickWindows(): SpellPickWindows {
  return {
    outer: makeWindow(getGeometry('spellOuter')),
    inner: makeWindow(getGeometry('spellInner')),
  };
}
