/**
 * Pure castle-screen (MASTER OPTIONS / main menu) compositor — renders one
 * 320×200 RGBA frame for a given parity tick and menu state. No DOM, no canvas.
 *
 * Extracted from CastleScreen so the engine-derived placements + parity-gated
 * water overlays can be pixel-parity-tested against the committed main-menu
 * fixtures (tools/parity/castle-parity.test.ts). CastleScreen drives this each
 * RAF tick; the test invokes it at both parity values.
 */

import {
  WIZ6_MAIN,
  type ActivePartyMember,
  type Font,
  type Font4bpp,
  type Pic,
  type PortraitSet,
} from '@wiz6/data';
import {
  compositePicScript,
  createTileWindow,
  clearWindow,
  setCursor,
  puts,
  centeredPuts,
  renderTileWindow,
  type MainMenuOption,
} from '@wiz6/parser';
import { composePartyPanel, NO_CONDITION_ICON } from './party-panel-render.js';

const ENGINE_W = 320;
const ENGINE_H = 200;

/** Portrait tiles are 8×8 4bpp EGA-planar; each portrait is a 3×3 grid → 24×24. */
const PORTRAIT_TILE_PX = 8;
const PORTRAIT_TILES_PER_SIDE = 3;

/** Engine X for the party-portrait column. Empirical from the
 *  castle-1-members fixture: portrait blits at panel cell col 0 of the
 *  LEFT panel window (screenX=8) — i.e. x=8 in screen coords.
 *
 *  (Resolved.) The `dcf2(buf, 2, portrait_id*9+0x48, 9)` call in FUN_0b0e is
 *  NOT a screen blit — dcf2 is a RAM→RAM tile-bank loader (its args are
 *  bank_sel / dest_row / n_rows, not X / Y). It stages the portrait's 9 tiles
 *  into an offscreen resource bank; the actual on-screen draw (this X=8/Y=48
 *  geometry, verified pixel-exact vs the castle-{1..6} fixtures) is performed
 *  downstream by the standard tile renderer. There was never a coord transform
 *  to reproduce — see docs/re/findings/dcf2-portrait-transform.json.
 */
const PORTRAIT_BLIT_X_LEFT = 8;
/** Right panel mirror — screenX=256. */
const PORTRAIT_BLIT_X_RIGHT = 256;
/** Engine Y baseline for portrait slot 0. The portrait blits into panel row
 *  1 (rows 1..3 of the slot's 4-row block, overlapping the colored-bar
 *  grid which FUN_1b2d writes underneath). Panel window starts at screenY=40
 *  so row 1 = screen y=48. */
const PORTRAIT_BLIT_Y_BASE = 48;
/** Engine Y stride between portrait slots in the SAME panel column. Each
 *  slot's panel block is 4 rows tall = 32 px. */
const PORTRAIT_BLIT_Y_STRIDE = 32;
/** Portraits per wport file (wport1=0..13, wport2=14..27, wport3=28..41). */
const PORTRAITS_PER_SET = 14;

/**
 * Blit one wport portrait (3×3 4bpp tiles → 24×24 pixels) at (dstX, dstY).
 * Mirrors the per-pixel plane-decoding from `renderTextRun4bpp` — each tile is
 * 32 bytes (G/B/R/I planes × 8 rows), MSB-first within each plane byte. The
 * file-color value is used directly as the palette index.
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
 * Compose one castle-screen frame to RGBA. Returns a fresh
 * (ENGINE_W*ENGINE_H*4)-byte buffer ready for `ctx.putImageData` / pixel-parity
 * comparison.
 *
 * @param parity         0 or 1 — engine's FUN_013b parity tick. parity=1 draws
 *                       the slot-5/6 water overlays on top of the gate art.
 * @param dragonscRgba   `dragonsc.scr` rendered via renderEgaScreen, or null.
 * @param mon08Pic       `mon08.pic` parsed, or null.
 * @param mon08Decoded   `concatenatePicSegments(mon08Pic.segments)`, or null.
 * @param wfont3         wfont3 (4bpp main UI font), or null.
 * @param wfont0         wfont0 (1bpp text-mask for the highlight path), or null.
 * @param menuOptions    Visible main-menu options.
 * @param selectedIdx    Index into `menuOptions` of the highlighted entry.
 * @param wfont1         wfont1 (4bpp panel-edge font), or null.
 * @param partyMembers   Active-party members to blit portraits for. Default: empty.
 * @param portraitSets   Loaded wport portrait sets [wport1, wport2, wport3] holding
 *                       portraits 0..13 / 14..27 / 28..41 respectively. Default null
 *                       (no blit, used by the empty-party castle parity fixtures).
 */
export function composeCastleFrame(
  parity: number,
  dragonscRgba: Uint8ClampedArray | null,
  mon08Pic: Pic | null,
  mon08Decoded: number[] | null,
  wfont3: Font4bpp | null,
  wfont0: Font | null,
  menuOptions: readonly MainMenuOption[],
  selectedIdx: number,
  wfont1: Font4bpp | null = null,
  partyMembers: ReadonlyArray<ActivePartyMember> = [],
  portraitSets: ReadonlyArray<PortraitSet> | null = null,
  wfont4: Font4bpp | null = null,
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(ENGINE_W * ENGINE_H * 4);

  // Engine writes color attribute 8 to the bordering pixels around the
  // dungeon viewport. Under WIZ6_MAIN AC, that's DAC[16] = dim gray.
  const GRAY = WIZ6_MAIN.colors[8] ?? [0x55, 0x55, 0x55];
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = GRAY[0]!;
    buf[i + 1] = GRAY[1]!;
    buf[i + 2] = GRAY[2]!;
    buf[i + 3] = 0xff;
  }

  // dragonsc.scr is 320×200 but visible content lives in rows 4..38. The
  // gray ground starts at the top of the dungeon viewport (y=32), so we
  // crop dragonsc to rows 0..31 only — the dragon decorations at rows 32..44
  // are covered by other windows in the engine's render.
  // Copy RGB only — renderEgaScreen marks color-0 pixels transparent (alpha=0),
  // but a displayed framebuffer is opaque (the engine's is). Keep buf's 0xff alpha.
  if (dragonscRgba) {
    const DRAGONSC_TOP_ROWS = 32;
    const bytes = ENGINE_W * DRAGONSC_TOP_ROWS * 4;
    for (let i = 0; i < bytes; i += 4) {
      buf[i] = dragonscRgba[i]!;
      buf[i + 1] = dragonscRgba[i + 1]!;
      buf[i + 2] = dragonscRgba[i + 2]!;
    }
  }
  if (mon08Pic && mon08Decoded) {
    compositePicScript(buf, ENGINE_W, ENGINE_H, 72, 32, [0], mon08Pic, mon08Decoded, WIZ6_MAIN);
    compositePicScript(buf, ENGINE_W, ENGINE_H, 160, 32, [1], mon08Pic, mon08Decoded, WIZ6_MAIN);
    compositePicScript(buf, ENGINE_W, ENGINE_H, 128, 49, [2], mon08Pic, mon08Decoded, WIZ6_MAIN);
    compositePicScript(buf, ENGINE_W, ENGINE_H, 160, 49, [3], mon08Pic, mon08Decoded, WIZ6_MAIN);
  }

  // Parity-gated water overlays from FUN_0732 slots 5 + 6.
  if (parity !== 0 && mon08Pic && mon08Decoded) {
    compositePicScript(buf, ENGINE_W, ENGINE_H, 208, 52, [4], mon08Pic, mon08Decoded, WIZ6_MAIN);
    compositePicScript(buf, ENGINE_W, ENGINE_H, 72, 125, [5], mon08Pic, mon08Decoded, WIZ6_MAIN);
  }

  // Menu UI bottom band — three stacked windows per wroot-window-heap-allocator.
  if (wfont3) {
    const fontSet = { font0: wfont0, font1: wfont1, font3: wfont3 };

    // Banner row: "\x7f\x5f\x5fmaster\x5foptions\x5f\x5f\x7f" centered with
    // padding 0x5f, attr 0x12 (translated to 3 by centeredPuts → wfont3).
    const banner = createTileWindow({ screenX: 0, screenY: 144, widthCells: 40, heightCells: 1 });
    clearWindow(banner, 0x5f, 0x03);
    centeredPuts(banner, '\x7f\x5f\x5fmaster\x5foptions\x5f\x5f\x7f', 0x12, 0x5f);
    renderTileWindow(banner, buf, ENGINE_W, ENGINE_H, fontSet, WIZ6_MAIN);

    // Lower pane: option grid via FUN_025c's (cursorX = slot/4 * 19 + 2,
    // cursorY = slot%4 + 1). Selected entry uses the highlight path (attr 0x50
    // → black-on-yellow inverse via invertHighlight=true).
    const pane = createTileWindow({ screenX: 0, screenY: 152, widthCells: 40, heightCells: 5 });
    clearWindow(pane, 0x20, 0x03);
    pane.invertHighlight = true;
    const X_BASE = 2;
    const Y_BASE = 1;
    const X_STRIDE = 19;
    const ROWS_PER_COL = 4;
    for (let i = 0; i < menuOptions.length; i++) {
      const opt = menuOptions[i]!;
      const cx = Math.floor(i / ROWS_PER_COL) * X_STRIDE + X_BASE;
      const cy = (i % ROWS_PER_COL) + Y_BASE;
      setCursor(pane, cx, cy);
      const attr = i === selectedIdx ? 0x50 : 0x03;
      puts(pane, opt.label, attr);
    }
    renderTileWindow(pane, buf, ENGINE_W, ENGINE_H, fontSet, WIZ6_MAIN);

    // Status row (engine handle 0x7394): 40×1 @ cell (0,24), attr 0x03 (wfont3).
    // Cleared with char 0x1E (NOT 0x20) — verified by dumping the live window
    // struct from save 1: every cell is (0x1E, 0x03). The 0x1E tile in wfont3
    // is gray-top with a black bottom row, producing the engine's 1-px black
    // scanline at y=199.
    const status = createTileWindow({ screenX: 0, screenY: 192, widthCells: 40, heightCells: 1 });
    clearWindow(status, 0x1e, 0x03);
    renderTileWindow(status, buf, ENGINE_W, ENGINE_H, fontSet, WIZ6_MAIN);

    // Party-panel border edges flanking the gate viewport. The engine's
    // party_left (heavy frame) extends its R-edge tile (wfont1 0x1C) into
    // cell col 8 rows 4-17 — a gray tile with a black right-edge column that
    // produces the 1-px black line at x=71. Symmetrically party_right (light
    // frame) puts its L-edge tile (wfont1 0x1A) at cell col 31 rows 4-17.
    // Verified by sampling the engine fixture (cells col 8 = pure black col at
    // x=71 only; col 31 = pure black col at x=248 only). The wider party-panel
    // bodies are empty (partySize=0) so we only need the gate-adjacent edges.
    if (wfont1) {
      const leftEdge = createTileWindow({ screenX: 64, screenY: 32, widthCells: 1, heightCells: 14 });
      clearWindow(leftEdge, 0x1c, 0x01);
      renderTileWindow(leftEdge, buf, ENGINE_W, ENGINE_H, fontSet, WIZ6_MAIN);
      const rightEdge = createTileWindow({ screenX: 248, screenY: 32, widthCells: 1, heightCells: 14 });
      clearWindow(rightEdge, 0x1a, 0x01);
      renderTileWindow(rightEdge, buf, ENGINE_W, ENGINE_H, fontSet, WIZ6_MAIN);
    }
  }

  // Active-party info panels — FUN_1b2d @ wbase 0x1b2d. For each active
  // member, compose the panel-cell content into the appropriate LEFT or RIGHT
  // panel window, then blit the portrait on top (FUN_0b0e overwrites cols
  // 0..2, rows 1..3 of the slot's block — the portrait pane).
  //
  // Ground truth (live cell dump from save 2, NATHAN slot 0 / NUG2 slot 1):
  //   row+0 .............. name (attr 0x03)
  //   col 3-4, row+1 ..... equipment (attr 0x04 / wfont4; empty hands 0x25/0x26)
  //   col 3-4, row+2 ..... class symbol (attr 0x01 / wfont1)
  //   col 3,   row+3 ..... status icon (attr 0x01)
  //   col 4,   row+3 ..... condition icon (attr 0x03; cleared if none)
  //   col 5,   rows 1-3 .. HP bar (attr 0x01, FUN_1a4c base 0x56)
  //   col 6,   rows 1-3 .. stamina bar (attr 0x01, base 0x63)
  //   cols 0-2, rows 1-3 . portrait (blitted below, covers these cells)
  //
  // LEFT panel = DGROUP 0x4fba @ cell (1,5) = screen (8,40), 7×12 cells.
  // RIGHT panel = DGROUP 0x4fb8 @ cell (32,5) = screen (256,40).
  if (wfont3 && partyMembers.length > 0) {
    const fontSet = { font0: wfont0, font1: wfont1, font3: wfont3, font4: wfont4 };
    const leftPanel = createTileWindow({ screenX: 8, screenY: 40, widthCells: 7, heightCells: 12 });
    const rightPanel = createTileWindow({ screenX: 256, screenY: 40, widthCells: 7, heightCells: 12 });
    // Engine clears each panel to (0x20, 0x03) before redrawing slots — match
    // that so empty cells render as wfont3 0x20 (solid gray space).
    clearWindow(leftPanel, 0x20, 0x03);
    clearWindow(rightPanel, 0x20, 0x03);

    for (let slot = 0; slot < partyMembers.length; slot++) {
      const member = partyMembers[slot]!;
      const panel = composePartyPanel(slot, member);
      const win = panel.column === 'left' ? leftPanel : rightPanel;
      const row = panel.panelRow;
      const f = panel.fields;

      // Row+0: name at col 0, attr 0x03 (wfont3). clearWindow already padded
      // the rest of the row with 0x20.
      setCursor(win, 0, row);
      puts(win, f.name, 0x03);

      // Middle pane (cols 3-4): equipment / class / status+condition.
      // Equipment (right + left hand), attr 0x04 / wfont4.
      setCursor(win, 3, row + 1);
      puts(win, String.fromCharCode(f.equipment[0]), 0x04);
      setCursor(win, 4, row + 1);
      puts(win, String.fromCharCode(f.equipment[1]), 0x04);

      // Class symbol (2 consecutive glyphs), attr 0x01 / wfont1.
      setCursor(win, 3, row + 2);
      puts(win, String.fromCharCode(f.classSymbol[0]), 0x01);
      setCursor(win, 4, row + 2);
      puts(win, String.fromCharCode(f.classSymbol[1]), 0x01);

      // Status icon (col 3), attr 0x01 / wfont1. Engine writes `icon + 0x25`.
      setCursor(win, 3, row + 3);
      puts(win, String.fromCharCode((f.statusIcon + 0x25) & 0xff), 0x01);
      // Condition icon (col 4), attr 0x03. NO_CONDITION_ICON → leave cleared.
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
  }

  // Active-party portrait blits — engine FUN_0b0e overwrites panel cells
  // (col 0..2, row 1..3 of each slot's block) with a 24×24 wport sprite.
  // Drawn AFTER the panel render so the portrait covers the colored-bar
  // glyphs underneath (matching the engine's render order).
  //
  // Portraits 0..13 live in wport1, 14..27 in wport2, 28..41 in wport3 —
  // pick the right set per portraitIndex; within the set, the entry index
  // is portraitIndex % PORTRAITS_PER_SET. We only draw when portraitSets has
  // been loaded so the empty-party fixtures (defaults) remain byte-exact.
  //
  // X for even slots = PORTRAIT_BLIT_X_LEFT (LEFT panel); odd = RIGHT.
  // Y = panel cell row 1 of the slot's block = (slot/2)*4 + 1 cells →
  //     (slot/2)*32 + PORTRAIT_BLIT_Y_BASE pixels.
  if (portraitSets && portraitSets.length > 0 && partyMembers.length > 0) {
    for (let slot = 0; slot < partyMembers.length; slot++) {
      const member = partyMembers[slot]!;
      const portraitIndex = member.portraitIndex ?? 0;
      const setIdx = Math.floor(portraitIndex / PORTRAITS_PER_SET);
      const localIdx = portraitIndex % PORTRAITS_PER_SET;
      const set = portraitSets[setIdx];
      if (!set) {
        throw new Error(
          `composeCastleFrame: member ${member.name} portraitIndex ${portraitIndex} maps to wport${setIdx + 1} which is not loaded`,
        );
      }
      const x = slot % 2 === 0 ? PORTRAIT_BLIT_X_LEFT : PORTRAIT_BLIT_X_RIGHT;
      const y = Math.floor(slot / 2) * PORTRAIT_BLIT_Y_STRIDE + PORTRAIT_BLIT_Y_BASE;
      blitPortrait(buf, set, localIdx, x, y);
    }
  }

  return buf;
}
