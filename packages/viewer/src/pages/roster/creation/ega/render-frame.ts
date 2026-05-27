/**
 * Creation-screen frame compositor.
 *
 * `renderCreationFrame` composites an arbitrary list of TileWindows into a
 * 320×200×4 RGBA buffer. Pure function — no DOM, no canvas, no I/O.
 *
 * Background fill convention: dim gray (WIZ6_MAIN.colors[8] = `[0x55, 0x55, 0x55]`)
 * at full alpha, matching CastleScreen's bg-fill ("Engine writes color attribute 8
 * to the bordering pixels").
 *
 * Each window is composited via `renderTileWindow` at its own `screenX/screenY`.
 *
 * Reference: packages/viewer/src/pages/game/CastleScreen.tsx — composeFrame()
 */

import { renderTileWindow, type FontSet, type TileWindow } from '@wiz6/parser';
import { WIZ6_MAIN, type Palette } from '@wiz6/data';

const ENGINE_W = 320;
const ENGINE_H = 200;

/**
 * Composite `windows` into a 320×200 RGBA frame.
 *
 * @param windows  TileWindows to render, in paint order (first = bottom).
 * @param fontSet  Font set for glyph lookup (see loadCreationFontSet).
 * @param palette  EGA palette for colour lookup (typically WIZ6_MAIN).
 * @returns        `Uint8ClampedArray` of length 320 × 200 × 4 (RGBA, row-major).
 */
export function renderCreationFrame(
  windows: TileWindow[],
  fontSet: FontSet,
  palette: Palette,
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(ENGINE_W * ENGINE_H * 4);

  // Background fill: dim gray — color attribute 8 under WIZ6_MAIN.
  // Matches CastleScreen's composeFrame() fill convention.
  const GRAY = (palette ?? WIZ6_MAIN).colors[8] ?? [0x55, 0x55, 0x55];
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = GRAY[0]!;
    rgba[i + 1] = GRAY[1]!;
    rgba[i + 2] = GRAY[2]!;
    rgba[i + 3] = 0xff;
  }

  // Composite each window at its screen position.
  for (const win of windows) {
    renderTileWindow(win, rgba, ENGINE_W, ENGINE_H, fontSet, palette);
  }

  return rgba;
}
