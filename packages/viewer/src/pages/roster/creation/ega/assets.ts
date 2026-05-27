/**
 * Font + palette wiring for wpcmk character-creation screens.
 *
 * Provides `loadCreationFontSet()` which assembles the `FontSet` expected by
 * `renderTileWindow`, and re-exports the `WIZ6_MAIN` palette under the alias
 * `CREATION_PALETTE`.
 *
 * ## Which fonts do creation screens need?
 *
 * The creation window attr bytes are 0x13–0x19. `renderTileWindow` masks each
 * cell's attr to its low nibble to select the wfont:
 *   - 0x01 → low nibble 1 → wfont1 (window chrome frame tiles)
 *   - 0x13 → low nibble 3 → wfont3 (bottomBar)
 *   - 0x14 → low nibble 4 → wfont4 (top)
 *   - 0x15, 0x16, 0x17, 0x19 → nibbles 5, 6, 7, 9 → no mapped font (cells
 *     skipped by `pickFont`; those windows are cleared + redrawn with attr=3
 *     or attr=4 text by the per-screen handlers)
 *   - attr low nibble == 0 and attr != 0 → highlight path → wfont0 (1bpp)
 *
 * Mirror of CastleScreen's font-set, extended with wfont1 (chrome) and
 * wfont4 for the top window.
 *
 * Reference: docs/re/findings/wfont-tile-system.json,
 *            docs/re/wpcmk-screens.md §2,
 *            docs/re/findings/wpcmk-window-chrome.json
 */

import { WIZ6_MAIN, type Font, type Font4bpp } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import { loadFont as defaultLoadFont, loadFont4bpp as defaultLoadFont4bpp } from '../../../../data-loader.js';

// Re-export WIZ6_MAIN under a creation-screens-scoped alias.
export { WIZ6_MAIN } from '@wiz6/data';
export const CREATION_PALETTE = WIZ6_MAIN;

export interface CreationFontSetLoaders {
  /** Loader for 1bpp fonts. Defaults to the real fetch-based loadFont. */
  loadFont?: (url: string) => Promise<Font>;
  /** Loader for 4bpp fonts. Defaults to the real fetch-based loadFont4bpp. */
  loadFont4bpp?: (url: string) => Promise<Font4bpp>;
}

/**
 * Load and assemble the FontSet for all wpcmk creation screens.
 *
 * Loads:
 *   - wfont0 (1bpp) — used by the highlight path (selected-row cursor)
 *   - wfont1 (4bpp) — used by window chrome cells (attr=0x01, frame tiles)
 *   - wfont3 (4bpp) — used by cells with attr low nibble 3 (e.g. bottomBar)
 *   - wfont4 (4bpp) — used by cells with attr low nibble 4 (e.g. top panel)
 *
 * Font 2 is not used by any creation-screen attr and is left null.
 *
 * The loaders are injectable to allow tests to supply disk-reading replacements
 * instead of relying on fetch('/fonts/...') which doesn't work in vitest/node.
 * Production callers use the defaults (the real fetch-based loaders), matching
 * exactly how CastleScreen loads its fonts.
 */
export async function loadCreationFontSet(opts?: CreationFontSetLoaders): Promise<FontSet> {
  const _loadFont = opts?.loadFont ?? defaultLoadFont;
  const _loadFont4bpp = opts?.loadFont4bpp ?? defaultLoadFont4bpp;

  const [font0, font1, font3, font4] = await Promise.all([
    _loadFont('/fonts/wfont0.json'),
    _loadFont4bpp('/fonts/wfont1.json'),
    _loadFont4bpp('/fonts/wfont3.json'),
    _loadFont4bpp('/fonts/wfont4.json'),
  ]);

  return {
    font0,
    font1,
    font2: null,
    font3,
    font4,
  };
}
