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

const ENGINE_W = 320;
const ENGINE_H = 200;

/** Portrait tiles are 8×8 4bpp EGA-planar; each portrait is a 3×3 grid → 24×24. */
const PORTRAIT_TILE_PX = 8;
const PORTRAIT_TILES_PER_SIDE = 3;

/** Engine X for the left-side party-portrait column (per FUN_0b0e). */
const PORTRAIT_BLIT_X = 2;
/** Engine Y baseline for portrait slot 0 (per FUN_0b0e: Y = slot*9 + 0x48). */
const PORTRAIT_BLIT_Y_BASE = 0x48;
/** Engine Y stride between portrait slots (per FUN_0b0e). */
const PORTRAIT_BLIT_Y_STRIDE = 9;

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
  // Resolve which portrait in the set. The CastleScreen receives a single
  // PortraitSet (wport1) which holds 14 portraits; portraitIndex values that
  // fall outside this set silently no-op (no engine partial draw).
  const portrait = portraitSet.portraits[portraitIndex];
  if (!portrait) return;
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
 * @param portraitSet    Loaded wport portrait set (default: null → no blit, used
 *                       by the empty-party castle parity fixtures).
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
  portraitSet: PortraitSet | null = null,
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

  // Active-party portraits — engine FUN_0b0e blits each member's portrait at
  // (X=2, Y=portraitSlotId*9 + 0x48) on the left-side party panel. We only
  // draw when both a portraitSet has been loaded AND there's at least one
  // active member, so the empty-party castle parity fixtures (which pass the
  // defaults) remain byte-exact.
  if (portraitSet && partyMembers.length > 0) {
    for (const member of partyMembers) {
      const portraitIndex = member.portraitIndex ?? 0;
      const y = member.portraitSlotId * PORTRAIT_BLIT_Y_STRIDE + PORTRAIT_BLIT_Y_BASE;
      blitPortrait(buf, portraitSet, portraitIndex, PORTRAIT_BLIT_X, y);
    }
  }

  return buf;
}
