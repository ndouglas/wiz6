/**
 * ⚠️ KNOWN BUG (2026-05-27): this decoder's output is HORIZONTALLY/VERTICALLY
 * SHIFTED relative to the engine's true screen — empirically a +14-cell / +2-row
 * cyclic offset on the CHARACTER MENU (likely a CRTC display-start / origin
 * miscalculation). Do NOT trust its framebuffer for pixel parity. For tile-level
 * parity, read the engine's live window CELL memory instead (tools/parity/
 * dump-cells.py → fixtures/cells/*.json), which is authoritative and immune to
 * this bug. See packages/viewer/tests/.../ega/cell-parity.test.ts. Fixing the
 * display-start math here is tracked in TODO #019.
 *
 * Decode the engine's exact displayed screen from a DOSBox-X save state offline.
 *
 * Reads the `Vga` zip member from the save state, extracts the interleaved VGA VRAM
 * at offset 0x84000, decodes 320x200 mode-0x0D planar pixels to RGBA via the wiz6-main
 * AC→DAC palette pipeline, and writes a PNG.
 *
 * VGA blob layout (DOSBox-X 2026.05.02, confirmed empirically across saves 1-13):
 *
 *   blob[0x000000..0x07FFFF]  – mostly-zero VGA register header (~512 KB, <0.1% non-zero)
 *   blob[0x080000..0x083FFF]  – VGA state dump: CRTC registers at 0x82F8C, DAC palette
 *                               at 0x82FE9 (768 bytes, 256 × 3 × 6-bit), attribute
 *                               controller registers at 0x82FC2, EGA lookup tables.
 *   blob[0x084000..0x0C3FFF]  – vga.mem.linear (256 KB = 4 planes × 64 KB, interleaved):
 *                               blob[0x84000 + vgaAddr * 4 + plane] = plane byte for VGA addr.
 *   blob[0x0C4000..0x0C4F47]  – trailing state (~4 KB).
 *
 * Pixel pipeline for mode-0x0D (320×200 EGA 16-color):
 *   vga_addr   = y × 40 + (x >> 3)
 *   plane_byte[p] = blob[0x84000 + vga_addr × 4 + p]
 *   bit_pos    = 7 − (x & 7)        (MSB first, 8 pixels per VGA address)
 *   raw_index  = bit_n(plane0) | bit_n(plane1)<<1 | bit_n(plane2)<<2 | bit_n(plane3)<<3
 *   rgb        = COMPOSED_PALETTE[raw_index]   (wiz6-main AC→DAC chain, see below)
 *
 * Palette pipeline — wiz6-main AC→BIOS-DAC:
 *   The VRAM plane bits form a 4-bit EGA attribute. The Wiz6 engine programs the
 *   VGA Attribute Controller via INT 10h AH=10h AL=02h with the wiz6-main table from
 *   wroot.exe offset 0x2043: [0x00,0x17,0x11,0x15,0x14,0x16,0x12,0x13,
 *                              0x10,0x07,0x01,0x05,0x04,0x06,0x02,0x03].
 *   Each entry is a DAC index into the BIOS-default VGA palette (blob 0x82FE9).
 *   Key attribute→color mappings for the CHARACTER MENU state:
 *     attr 0 → DAC[0]  = (0,0,0)       = black         [window interiors]
 *     attr 1 → DAC[23] = (63,63,63)    = white         [menu option text]
 *     attr 8 → DAC[16] = (21,21,21)    = dark-gray     [screen background]
 *     attr 9 → DAC[7]  = (42,42,42)    = light-gray    [frame double-lines]
 *   The blob's AC registers at 0x82FC2 = [23,17,21,…] are the BIOS-default EGA
 *   attribute controller values (NOT the wiz6-main table). The wiz6-main table is
 *   baked into wroot.exe and programmed at startup; the blob field captures the
 *   hardware register state AFTER the game has programmed its own table — the
 *   two differ because DOSBox-X's save format serialises the HW register in a
 *   shifted/raw layout that does NOT match the original INT 10h argument bytes.
 *   Always use the wiz6-main AC table (WIZ6_MAIN_AC below) for decoding.
 *
 * Why the game's VRAM uses only EGA planes 0 and 3:
 *   The character menu is drawn with a specific EGA write strategy:
 *   - Background fill: Map Mask = 0b1000 (plane 3 only) → attr 8 = dark-gray background.
 *   - Window borders: Map Mask = 0b0001 (plane 0 only) on top of existing background
 *     → plane 3 left set + plane 0 set = attr 9 = light-gray via wiz6-main AC.
 *   - Menu text glyphs: plane 0 set only (plane 3 cleared for text rows by window clear)
 *     → attr 1 = white via wiz6-main AC.
 *   - Window interior: cleared with plane 3 = 0 → attr 0 = black.
 *   Planes 1 and 2 are never written for this UI mode; save state correctly reflects that.
 *
 * CRTC display-start = 0 (registers 0x0C/0x0D = 0x00) in all captured saves.
 * CRTC offset reg 0x13 = 0x14 → 40 bytes/plane/row (correct for 320-pixel-wide mode).
 *
 * Residual DOSBox-X internal state: DOSBox-X writes ~170 internal-state bytes into
 * vga.mem.linear at VGA addresses 621–646 (screen rows 15–16, right-side columns) and
 * a handful of other positions (rows 18–23, 49–54, 121–131). These produce ~161 pixels
 * of colored noise in areas that would otherwise be uniform background. They are invariant
 * across all captured saves (not game-drawn VRAM). Their visual impact is negligible
 * (< 0.3% of screen pixels), so no masking is applied. See dosbox-vga-save-layout.json.
 *
 * Invoke (CLI):
 *   pnpm tsx tools/parity/decode-screen.ts --save <path|N> [--out <png>]
 *
 * Default output: /tmp/engine-screen-<N>.png
 *
 * Exports:
 *   decodeSaveToScreen(savePath) → { indices, rgba }
 *   SCREEN_WIDTH, SCREEN_HEIGHT, WIZ6_MAIN_AC, COMPOSED_PALETTE
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readVgaBlob } from '../../packages/mcp/src/vga-palette.js';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

// ─── Palette constants ────────────────────────────────────────────────────────

/**
 * Wiz6-main AC palette register values (from wroot.exe offset 0x2043, 16 bytes).
 * Each entry is a BIOS-default VGA DAC index. The engine programs these via
 * INT 10h AH=10h AL=02h at startup. Verified in docs/re/palette-discovery.md.
 *
 * raw_index (4-bit EGA attribute from plane bits) → AC entry → DAC[AC[i]] → RGB.
 */
export const WIZ6_MAIN_AC = [
  0x00, 0x17, 0x11, 0x15, 0x14, 0x16, 0x12, 0x13,
  0x10, 0x07, 0x01, 0x05, 0x04, 0x06, 0x02, 0x03,
] as const;

/**
 * BIOS-default VGA DAC, 6-bit per channel, first 32 entries.
 * Entries 0–15: low-intensity EGA colours.
 * Entries 16–31: high-intensity EGA colours (DAC duplicate; AC indices 0x10–0x17 land here).
 * Entries 24–31 repeat the low-intensity set (DAC indices 0x18–0x1F = 24–31).
 * Verified from DAC dump at blob 0x82FE9 (invariant across all captured saves).
 */
export const DAC_6BIT: ReadonlyArray<readonly [number, number, number]> = [
  // Low-intensity (entries 0-15)
  [0,  0,  0], [0,  0,  42], [0,  42, 0], [0,  42, 42],
  [42, 0,  0], [42, 0,  42], [42, 21, 0], [42, 42, 42],
  [21, 21, 21],[21, 21, 63], [21, 63, 21],[21, 63, 63],
  [63, 21, 21],[63, 21, 63], [63, 63, 21],[63, 63, 63],
  // High-intensity (entries 16-31) — WIZ6_MAIN_AC entries 0x10–0x17 index here
  [21, 21, 21],[21, 21, 63], [21, 63, 21],[21, 63, 63],
  [63, 21, 21],[63, 21, 63], [63, 63, 21],[63, 63, 63],
  // Low-intensity repeat (entries 24-31) — WIZ6_MAIN_AC entries 0x17 = DAC[23] = white
  [0,  0,  0], [0,  0,  42], [0,  42, 0], [0,  42, 42],
  [42, 0,  0], [42, 0,  42], [42, 21, 0], [42, 42, 42],
];

/**
 * Compose the full pixel→RGB palette through the wiz6-main AC→DAC pipeline.
 * raw_index → WIZ6_MAIN_AC[raw_index] → DAC_6BIT[dac_entry] → 8-bit RGB (VGA bit-replication).
 *
 * Key attribute→colour mappings for the CHARACTER MENU state (saves 1–3):
 *   attr 0 → black       (window interiors)
 *   attr 1 → white       (menu option text)
 *   attr 8 → dark-gray   (screen background)
 *   attr 9 → light-gray  (double-line frame borders)
 */
function buildComposedPalette(): ReadonlyArray<readonly [number, number, number]> {
  return WIZ6_MAIN_AC.map((dacIdx) => {
    const [r6, g6, b6] = DAC_6BIT[dacIdx]!;
    return [
      (r6 << 2) | (r6 >> 4),
      (g6 << 2) | (g6 >> 4),
      (b6 << 2) | (b6 >> 4),
    ] as const;
  });
}

export const COMPOSED_PALETTE = buildComposedPalette();

// ─── VGA VRAM layout constants ───────────────────────────────────────────────
const VRAM_OFFSET_IN_BLOB = 0x84000; // vga.mem.linear starts here (not 0x80000)
const VRAM_BYTES_PER_ROW  = 40;      // CRTC offset reg 0x13 = 0x14 → 40 bytes/row/plane
export const SCREEN_WIDTH  = 320;
export const SCREEN_HEIGHT = 200;
const PLANES = 4;

/**
 * Decode 320×200 mode-0x0D EGA screen from a VGA blob to raw EGA index array.
 *
 * Returns a Uint8Array of length SCREEN_WIDTH * SCREEN_HEIGHT where each byte
 * is the 4-bit raw EGA attribute index (0–15).
 */
export function decodeVgaIndices(blob: Uint8Array): Uint8Array {
  const indices = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT);
  const base = VRAM_OFFSET_IN_BLOB;

  for (let y = 0; y < SCREEN_HEIGHT; y++) {
    for (let x = 0; x < SCREEN_WIDTH; x++) {
      const vgaAddr = y * VRAM_BYTES_PER_ROW + (x >> 3);
      const blobBase = base + vgaAddr * PLANES;
      const bitPos = 7 - (x & 7);

      const b0 = blob[blobBase]!;
      const b1 = blob[blobBase + 1]!;
      const b2 = blob[blobBase + 2]!;
      const b3 = blob[blobBase + 3]!;

      indices[y * SCREEN_WIDTH + x] =
        ((b0 >> bitPos) & 1) |
        (((b1 >> bitPos) & 1) << 1) |
        (((b2 >> bitPos) & 1) << 2) |
        (((b3 >> bitPos) & 1) << 3);
    }
  }

  return indices;
}

/**
 * Convert EGA index array to RGBA using the wiz6-main AC→DAC composed palette.
 *
 * @param indices Uint8Array of length SCREEN_WIDTH * SCREEN_HEIGHT (4-bit values 0–15)
 * @returns Uint8Array of length SCREEN_WIDTH * SCREEN_HEIGHT * 4 (RGBA, row-major)
 */
export function indicesToRgba(indices: Uint8Array): Uint8Array {
  const rgba = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT * 4);
  for (let i = 0; i < indices.length; i++) {
    const [r, g, b] = COMPOSED_PALETTE[indices[i]!]!;
    const offset = i * 4;
    rgba[offset] = r;
    rgba[offset + 1] = g;
    rgba[offset + 2] = b;
    rgba[offset + 3] = 0xff;
  }
  return rgba;
}

/**
 * Decode a DOSBox-X save state to a 320×200 screen.
 *
 * @param savePath Path to the .sav file (ZIP containing Vga member).
 * @returns Object with:
 *   - `indices`: Uint8Array(64000) — 4-bit EGA index per pixel, palette-independent
 *   - `rgba`:    Uint8Array(256000) — RGBA via wiz6-main AC→DAC pipeline
 */
export function decodeSaveToScreen(savePath: string): {
  indices: Uint8Array;
  rgba: Uint8Array;
} {
  const blob = readVgaBlob(savePath);
  const indices = decodeVgaIndices(blob);
  const rgba = indicesToRgba(indices);
  return { indices, rgba };
}

// ─── Internal: decode for CLI (RGBA from blob) ────────────────────────────────

function decodeVgaScreen(blob: Uint8Array): Uint8Array {
  return indicesToRgba(decodeVgaIndices(blob));
}

/**
 * Compute structural statistics for validation.
 *
 * For the CHARACTER MENU saves (saves 1–3, game_state 0x10):
 *   - Background: dark-gray (85,85,85)   = EGA attr 8 → wiz6-main AC[8]=0x10 → DAC[16]
 *   - Window fill: black (0,0,0)          = EGA attr 0 → AC[0]=0x00 → DAC[0]
 *   - Frame lines: light-gray (170,170,170) = EGA attr 9 → AC[9]=0x07 → DAC[7]
 *   - Menu text: white (255,255,255)      = EGA attr 1 → AC[1]=0x17 → DAC[23]
 *
 * Validation thresholds for a plausible Wiz6 UI screen (any of saves 1–3):
 *   - black > 25%     : window interiors
 *   - dark-gray > 20% : screen background
 *   - light-gray > 2% : frame/border lines (thin double-line borders)
 *   - white > 0.3%    : menu text (save 2 has minimal text = CREATE PC / EXIT ≈ 0.5%)
 */
function computeStats(rgba: Uint8Array): {
  blackPct: number;
  whitePct: number;
  lGrayPct: number;
  dGrayPct: number;
  whiteBottomRows: number;
  noisePixels: number;
} {
  const total = SCREEN_WIDTH * SCREEN_HEIGHT;
  let black = 0, white = 0, lGray = 0, dGray = 0, whiteBottom = 0;

  for (let i = 0; i < total; i++) {
    const r = rgba[i * 4]!;
    const g = rgba[i * 4 + 1]!;
    const b = rgba[i * 4 + 2]!;
    const y = Math.floor(i / SCREEN_WIDTH);
    if (r === 0 && g === 0 && b === 0) black++;
    else if (r === 255 && g === 255 && b === 255) {
      white++;
      if (y >= SCREEN_HEIGHT - 40) whiteBottom++;
    }
    else if (r === 170 && g === 170 && b === 170) lGray++;
    else if (r === 85 && g === 85 && b === 85) dGray++;
  }

  // Isolated-pixel noise: pixels whose color differs from ALL 4 cardinal neighbors.
  let noisePixels = 0;
  for (let y = 1; y < SCREEN_HEIGHT - 1; y++) {
    for (let x = 1; x < SCREEN_WIDTH - 1; x++) {
      const i = (y * SCREEN_WIDTH + x) * 4;
      const r = rgba[i]!, g = rgba[i + 1]!, b = rgba[i + 2]!;
      const neighbors = [
        [rgba[(i - SCREEN_WIDTH * 4)]!, rgba[(i - SCREEN_WIDTH * 4) + 1]!, rgba[(i - SCREEN_WIDTH * 4) + 2]!],
        [rgba[(i + SCREEN_WIDTH * 4)]!, rgba[(i + SCREEN_WIDTH * 4) + 1]!, rgba[(i + SCREEN_WIDTH * 4) + 2]!],
        [rgba[i - 4]!, rgba[i - 3]!, rgba[i - 2]!],
        [rgba[i + 4]!, rgba[i + 5]!, rgba[i + 6]!],
      ];
      if (neighbors.every(([nr, ng, nb]) => nr !== r || ng !== g || nb !== b)) {
        noisePixels++;
      }
    }
  }

  return {
    blackPct: (black / total) * 100,
    whitePct: (white / total) * 100,
    lGrayPct: (lGray / total) * 100,
    dGrayPct: (dGray / total) * 100,
    whiteBottomRows: whiteBottom,
    noisePixels,
  };
}

// ─── CLI (only runs when executed directly, not when imported) ────────────────

import { fileURLToPath as _fileURLToPath } from 'node:url';
import { dirname as _dirname } from 'node:path';

const _isMain = process.argv[1] === _fileURLToPath(import.meta.url) ||
  process.argv[1]?.endsWith('decode-screen.ts') ||
  process.argv[1]?.endsWith('decode-screen.js');

if (_isMain) {
  function resolveSavePath(arg: string): { path: string; saveNum: string } {
    if (/^\d+$/.test(arg)) {
      return {
        path: join(process.cwd(), 'tools', 'dosbox', 'save', `${arg}.sav`),
        saveNum: arg,
      };
    }
    const m = arg.match(/(\d+)/);
    return { path: arg, saveNum: m ? m[1]! : '0' };
  }

  const args = process.argv.slice(2);
  const saveIdx = args.indexOf('--save');
  const outIdx  = args.indexOf('--out');

  if (saveIdx < 0 || saveIdx + 1 >= args.length) {
    console.error('usage: pnpm tsx tools/parity/decode-screen.ts --save <path|N> [--out <png>]');
    process.exit(1);
  }

  const { path: savePath, saveNum } = resolveSavePath(args[saveIdx + 1]!);
  const outPath =
    outIdx >= 0 && outIdx + 1 < args.length
      ? args[outIdx + 1]!
      : `/tmp/engine-screen-${saveNum}.png`;

  const blob = readVgaBlob(savePath);
  const rgba = decodeVgaScreen(blob);
  const png  = encodePngRgba(SCREEN_WIDTH, SCREEN_HEIGHT, rgba);
  writeFileSync(outPath, png);

  const stats = computeStats(rgba);
  console.log(`decoded ${SCREEN_WIDTH}×${SCREEN_HEIGHT} from ${savePath}`);
  console.log(`  → ${outPath}`);
  console.log(`  black:       ${stats.blackPct.toFixed(1)}%`);
  console.log(`  white:       ${stats.whitePct.toFixed(1)}%`);
  console.log(`  light-gray:  ${stats.lGrayPct.toFixed(1)}%`);
  console.log(`  dark-gray:   ${stats.dGrayPct.toFixed(1)}%`);
  console.log(`  white pixels in bottom 40 rows: ${stats.whiteBottomRows}`);
  console.log(`  isolated noise pixels: ${stats.noisePixels}`);

  // Structural validation: the decoded image must be a plausible Wiz6 UI screen
  // under the wiz6-main AC→DAC palette. Four-color check:
  //   - black > 25%     : window interiors (attr 0 = black via AC[0]=0x00→DAC[0])
  //   - dark-gray > 20% : screen background (attr 8 → AC[8]=0x10 → DAC[16] = dark-gray)
  //   - light-gray > 2% : frame/border lines (attr 9 → AC[9]=0x07 → DAC[7] = light-gray)
  //   - white > 0.3%    : menu option text (attr 1 → AC[1]=0x17 → DAC[23] = white)
  //                       (0.3% to accommodate save 2 which has minimal text ≈ 0.5%)
  const passed =
    stats.blackPct > 25 &&
    stats.dGrayPct > 20 &&
    stats.lGrayPct > 2 &&
    stats.whitePct > 0.3;

  if (passed) {
    console.log('  structural check: PASS (black windows + dark-gray bg + light-gray frames + white text)');
  } else {
    console.error(`  structural check: FAIL`);
    console.error(`    black=${stats.blackPct.toFixed(1)}% (need >25%), dark-gray=${stats.dGrayPct.toFixed(1)}% (need >20%), light-gray=${stats.lGrayPct.toFixed(1)}% (need >2%), white=${stats.whitePct.toFixed(1)}% (need >0.3%)`);
    process.exit(1);
  }
}
