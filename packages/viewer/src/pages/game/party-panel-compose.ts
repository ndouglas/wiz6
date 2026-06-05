/**
 * party-panel-compose.ts — shared LEFT/RIGHT active-party panel + portrait
 * compositor.
 *
 * Extracted verbatim from `castle-frame.ts` so BOTH the MASTER OPTIONS castle
 * screen AND the in-dungeon maze view render the party panel from exactly the
 * same code path. RE-confirmed: the dungeon party panel is pixel-identical to
 * the MASTER OPTIONS panel (engine FUN_1b2d @ wbase 0x1b2d draws the same panel
 * windows in both states). Reusing this is what makes the maze panel byte-exact
 * for free (parity Task 5 depends on it).
 *
 * `composePartyPanels` writes the two 7×12-cell panel windows (LEFT @ screen
 * (8,40), RIGHT @ (256,40)) into the supplied RGBA buffer, then blits each
 * member's wport portrait on top. Empty slots render exactly as the engine does
 * — the panel windows are cleared to (0x20, 0x03) and only filled slots draw
 * content, so a partial party leaves the remaining slots as the engine's solid
 * gray space (no stale portrait).
 *
 * The per-slot field math (name / equipment / class / status / bars) lives in
 * `composePartyPanel` (party-panel-render.ts), the byte-exact TS port of
 * FUN_1b2d. This module is purely the windowing + blit driver.
 */

import {
  WIZ6_MAIN,
  type ActivePartyMember,
  type Font,
  type Font4bpp,
  type PortraitSet,
} from '@wiz6/data';
import { createTileWindow, clearWindow, setCursor, puts, renderTileWindow } from '@wiz6/parser';
import { composePartyPanel, NO_CONDITION_ICON } from './party-panel-render.js';

const ENGINE_W = 320;
const ENGINE_H = 200;

/** Portrait tiles are 8×8 4bpp EGA-planar; each portrait is a 3×3 grid → 24×24. */
const PORTRAIT_TILE_PX = 8;
const PORTRAIT_TILES_PER_SIDE = 3;

/** Engine X for the party-portrait column (LEFT panel, screenX=8). */
const PORTRAIT_BLIT_X_LEFT = 8;
/** Right panel mirror — screenX=256. */
const PORTRAIT_BLIT_X_RIGHT = 256;
/** Engine Y baseline for portrait slot 0 (panel row 1 = screen y=48). */
const PORTRAIT_BLIT_Y_BASE = 48;
/** Engine Y stride between portrait slots in the SAME panel column (4 rows = 32px). */
const PORTRAIT_BLIT_Y_STRIDE = 32;
/** Portraits per wport file (wport1=0..13, wport2=14..27, wport3=28..41). */
const PORTRAITS_PER_SET = 14;

/** Fonts the panel render needs. font3 is required; the rest may be null. */
export interface PanelFontSet {
  font0: Font | null;
  font1: Font4bpp | null;
  font3: Font4bpp | null;
  font4: Font4bpp | null;
}

/**
 * Blit one wport portrait (3×3 4bpp tiles → 24×24 pixels) at (dstX, dstY).
 * Each tile is 32 bytes (G/B/R/I planes × 8 rows), MSB-first within each plane
 * byte. The file-color value is used directly as the palette index.
 */
function blitPortrait(
  destRgba: Uint8ClampedArray,
  portraitSet: PortraitSet,
  portraitIndex: number,
  dstX: number,
  dstY: number,
): void {
  const portrait = portraitSet.portraits[portraitIndex];
  if (!portrait) {
    throw new Error(
      `blitPortrait: portraitIndex ${portraitIndex} out of range for set with ${portraitSet.portraits.length} portraits`,
    );
  }
  for (let ty = 0; ty < PORTRAIT_TILES_PER_SIDE; ty++) {
    for (let tx = 0; tx < PORTRAIT_TILES_PER_SIDE; tx++) {
      const glyph = portrait.tiles[ty * PORTRAIT_TILES_PER_SIDE + tx];
      if (!glyph) continue;
      const tileBaseX = dstX + tx * PORTRAIT_TILE_PX;
      const tileBaseY = dstY + ty * PORTRAIT_TILE_PX;
      for (let row = 0; row < 8; row++) {
        const py = tileBaseY + row;
        if (py < 0 || py >= ENGINE_H) continue;
        const pG = glyph[row] ?? 0;
        const pB = glyph[8 + row] ?? 0;
        const pR = glyph[16 + row] ?? 0;
        const pI = glyph[24 + row] ?? 0;
        for (let col = 0; col < 8; col++) {
          const bit = 7 - col;
          const fileIdx =
            ((pG >> bit) & 1) |
            (((pB >> bit) & 1) << 1) |
            (((pR >> bit) & 1) << 2) |
            (((pI >> bit) & 1) << 3);
          const px = tileBaseX + col;
          if (px < 0 || px >= ENGINE_W) continue;
          const color = WIZ6_MAIN.colors[fileIdx];
          if (!color) continue;
          const idx = (py * ENGINE_W + px) * 4;
          destRgba[idx] = color[0]!;
          destRgba[idx + 1] = color[1]!;
          destRgba[idx + 2] = color[2]!;
          destRgba[idx + 3] = 0xff;
        }
      }
    }
  }
}

/**
 * Render the active-party LEFT/RIGHT panel windows + portraits into `buf`.
 *
 * No-op (leaves the buffer untouched) when font3 is missing OR there are no
 * party members — the caller keeps whatever background it already painted.
 * Portraits are only blitted when `portraitSets` is supplied; otherwise just
 * the cell content is rendered (matches the empty-party castle parity fixtures
 * which pass `portraitSets = null`).
 *
 * @param buf           320×200 RGBA target (mutated in place).
 * @param partyMembers  Active-party members (0..6). Empty slots stay blank.
 * @param fonts         Panel font set (font3 required).
 * @param portraitSets  [wport1, wport2, wport3] or null (skip portrait blit).
 */
export function composePartyPanels(
  buf: Uint8ClampedArray,
  partyMembers: ReadonlyArray<ActivePartyMember>,
  fonts: PanelFontSet,
  portraitSets: ReadonlyArray<PortraitSet> | null,
): void {
  const { font3 } = fonts;
  if (!font3 || partyMembers.length === 0) return;

  // ── Panel cell content (FUN_1b2d). ───────────────────────────────────────
  const fontSet = { font0: fonts.font0, font1: fonts.font1, font3, font4: fonts.font4 };
  const leftPanel = createTileWindow({ screenX: 8, screenY: 40, widthCells: 7, heightCells: 12 });
  const rightPanel = createTileWindow({ screenX: 256, screenY: 40, widthCells: 7, heightCells: 12 });
  // Engine clears each panel to (0x20, 0x03) before redrawing slots — match
  // that so empty cells render as wfont3 0x20 (solid gray space), no stale art.
  clearWindow(leftPanel, 0x20, 0x03);
  clearWindow(rightPanel, 0x20, 0x03);

  for (let slot = 0; slot < partyMembers.length; slot++) {
    const member = partyMembers[slot]!;
    const panel = composePartyPanel(slot, member);
    const win = panel.column === 'left' ? leftPanel : rightPanel;
    const row = panel.panelRow;
    const f = panel.fields;

    // Row+0: name at col 0, attr 0x03 (wfont3).
    setCursor(win, 0, row);
    puts(win, f.name, 0x03);

    // Middle pane (cols 3-4): equipment / class / status+condition.
    setCursor(win, 3, row + 1);
    puts(win, String.fromCharCode(f.equipment[0]), 0x04);
    setCursor(win, 4, row + 1);
    puts(win, String.fromCharCode(f.equipment[1]), 0x04);

    setCursor(win, 3, row + 2);
    puts(win, String.fromCharCode(f.classSymbol[0]), 0x01);
    setCursor(win, 4, row + 2);
    puts(win, String.fromCharCode(f.classSymbol[1]), 0x01);

    setCursor(win, 3, row + 3);
    puts(win, String.fromCharCode((f.statusIcon + 0x25) & 0xff), 0x01);
    if (f.conditionIcon !== NO_CONDITION_ICON) {
      setCursor(win, 4, row + 3);
      puts(win, String.fromCharCode((f.conditionIcon + 0x25) & 0xff), 0x03);
    }

    // Right pane: vertical HP bar (col 5) + stamina bar (col 6), attr 0x01.
    for (let r = 0; r < 3; r++) {
      setCursor(win, 5, row + 1 + r);
      puts(win, String.fromCharCode(f.hpBar[r]!), 0x01);
      setCursor(win, 6, row + 1 + r);
      puts(win, String.fromCharCode(f.staminaBar[r]!), 0x01);
    }
  }

  renderTileWindow(leftPanel, buf, ENGINE_W, ENGINE_H, fontSet, WIZ6_MAIN);
  renderTileWindow(rightPanel, buf, ENGINE_W, ENGINE_H, fontSet, WIZ6_MAIN);

  // ── Portrait blits (FUN_0b0e), drawn AFTER the panel render. ──────────────
  if (portraitSets && portraitSets.length > 0) {
    for (let slot = 0; slot < partyMembers.length; slot++) {
      const member = partyMembers[slot]!;
      const portraitIndex = member.portraitIndex ?? 0;
      const setIdx = Math.floor(portraitIndex / PORTRAITS_PER_SET);
      const localIdx = portraitIndex % PORTRAITS_PER_SET;
      const set = portraitSets[setIdx];
      if (!set) {
        throw new Error(
          `composePartyPanels: member ${member.name} portraitIndex ${portraitIndex} maps to wport${setIdx + 1} which is not loaded`,
        );
      }
      const x = slot % 2 === 0 ? PORTRAIT_BLIT_X_LEFT : PORTRAIT_BLIT_X_RIGHT;
      const y = Math.floor(slot / 2) * PORTRAIT_BLIT_Y_STRIDE + PORTRAIT_BLIT_Y_BASE;
      blitPortrait(buf, set, localIdx, x, y);
    }
  }
}
