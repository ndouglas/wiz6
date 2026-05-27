/**
 * Decode the engine's exact displayed screen from a DOSBox-X save state offline.
 *
 * Reads the `Vga` zip member from the save state, extracts the interleaved VGA VRAM
 * at offset 0x84000, decodes 320x200 mode-0x0D planar pixels to RGBA via the direct
 * DAC palette (raw_index → DAC_6BIT[raw_index]), and writes a PNG.
 *
 * STATUS: GEOMETRY-faithful (correct VRAM base 0x84000, no masking; window layout,
 * interiors=black, bg=dark-gray all match the engine). KNOWN LIMITATION: gray frames
 * and white text currently collapse to BLUE (raw_index 1) — only plane 0 assembles;
 * planes 1–3 do not, so multi-plane colors (gray/white) are wrong. Resolving this needs
 * a plane-assembly RE pass on the higher-plane byte offsets within vga.mem.linear.
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
 *   rgb        = COMPOSED_PALETTE[raw_index]   (direct DAC_6BIT[raw_index], 6→8 bit)
 *
 * Palette: the DAC (blob 0x82FE9, 256×3×6-bit) holds BIOS-default EGA values; entries
 *   0–15 are used DIRECTLY by raw pixel index. (The AC registers at 0x82FC2 =
 *   [23,17,21,20,22,18,19,16, 7,1,5,4,6,2,3,0] are NOT applied: composing through them
 *   INVERTS the screen — index 0→white, frames→blue — which does not match the engine's
 *   displayed black interiors / gray frames / white text. Verified against the NUG
 *   creation screen and the CHARACTER MENU reference. AC_REGS kept below for reference.)
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
 * Invoke:
 *   pnpm tsx tools/parity/decode-screen.ts --save <path|N> [--out <png>]
 *
 * Default output: /tmp/engine-screen-<N>.png
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readVgaBlob } from '../../packages/mcp/src/vga-palette.js';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

// ─── Palette constants ────────────────────────────────────────────────────────

/**
 * AC registers (invariant across all captured saves, blob offset 0x82FC2).
 * Maps raw pixel index → DAC entry index.
 */
const AC_REGS = [23, 17, 21, 20, 22, 18, 19, 16, 7, 1, 5, 4, 6, 2, 3, 0] as const;

/**
 * BIOS-default EGA DAC, 6-bit per channel, entries 0..31.
 * Entries 0–15 are the low-intensity set; 16–31 the high-intensity set.
 * Verified from DAC dump at blob 0x82FE9 (all saves match).
 */
const DAC_6BIT: ReadonlyArray<readonly [number, number, number]> = [
  // Low-intensity (entries 0-15)
  [0,  0,  0], [0,  0,  42], [0,  42, 0], [0,  42, 42],
  [42, 0,  0], [42, 0,  42], [42, 21, 0], [42, 42, 42],
  [21, 21, 21],[21, 21, 63], [21, 63, 21],[21, 63, 63],
  [63, 21, 21],[63, 21, 63], [63, 63, 21],[63, 63, 63],
  // High-intensity (entries 16-31) — used by AC_REGS remapping
  [21, 21, 21],[21, 21, 63], [21, 63, 21],[21, 63, 63],
  [63, 21, 21],[63, 21, 63], [63, 63, 21],[63, 63, 63],
  [0,  0,  0], [0,  0,  42], [0,  42, 0], [0,  42, 42],
  [42, 0,  0], [42, 0,  42], [42, 21, 0], [42, 42, 42],
];

/**
 * Compose the full pixel→RGB palette through the AC→DAC pipeline.
 * raw_index → AC_REGS[raw_index] → DAC_6BIT[dac_entry] → 8-bit RGB (VGA bit-replication).
 */
function buildComposedPalette(): ReadonlyArray<readonly [number, number, number]> {
  // NOTE: empirically the visible screen uses the DAC entries DIRECTLY by raw pixel
  // index (raw_index → DAC_6BIT[raw_index]); the AC_REGS indirection produces an
  // INVERTED palette (index 0 → white, frames → blue) that does NOT match the engine's
  // displayed colors (black window interiors, gray frames, white text). Verified
  // against the NUG creation screen + the CHARACTER MENU reference. AC_REGS retained
  // above for documentation but not applied.
  return DAC_6BIT.slice(0, 16).map(([r6, g6, b6]) => [
    (r6 << 2) | (r6 >> 4),
    (g6 << 2) | (g6 >> 4),
    (b6 << 2) | (b6 >> 4),
  ] as const);
}

const COMPOSED_PALETTE = buildComposedPalette();

// ─── VGA VRAM layout constants ───────────────────────────────────────────────
const VRAM_OFFSET_IN_BLOB = 0x84000; // vga.mem.linear starts here (not 0x80000)
const VRAM_BYTES_PER_ROW  = 40;      // CRTC offset reg 0x13 = 0x14 → 40 bytes/row/plane
const SCREEN_WIDTH  = 320;
const SCREEN_HEIGHT = 200;
const PLANES = 4;

/**
 * Decode a 320×200 mode-0x0D EGA screen from a DOSBox-X save state Vga blob.
 *
 * Pixel addressing (interleaved 4-plane layout):
 *   vga_addr         = y × VRAM_BYTES_PER_ROW + (x >> 3)
 *   plane_byte_offset = VRAM_OFFSET_IN_BLOB + vga_addr × PLANES + plane
 *   bit_position      = 7 − (x & 7)                       (MSB first)
 *   raw_index         = bit_n(p0) | bit_n(p1)<<1 | bit_n(p2)<<2 | bit_n(p3)<<3
 *   rgb               = COMPOSED_PALETTE[raw_index]        (AC→DAC composed)
 *
 * No masking is applied. The ~170 DOSBox-X internal-state bytes that land inside
 * vga.mem.linear produce < 0.3% noise pixels — documented in dosbox-vga-save-layout.json.
 */
function decodeVgaScreen(blob: Uint8Array): Uint8Array {
  const rgba = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT * 4);
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

      const rawIndex =
        ((b0 >> bitPos) & 1) |
        (((b1 >> bitPos) & 1) << 1) |
        (((b2 >> bitPos) & 1) << 2) |
        (((b3 >> bitPos) & 1) << 3);

      const [r, g, b] = COMPOSED_PALETTE[rawIndex]!;
      const offset = (y * SCREEN_WIDTH + x) * 4;
      rgba[offset] = r;
      rgba[offset + 1] = g;
      rgba[offset + 2] = b;
      rgba[offset + 3] = 0xff;
    }
  }

  return rgba;
}

/**
 * Compute structural statistics for validation.
 *
 * For the CHARACTER MENU save (save 1 as of 2026-05-27):
 *   - Background color: light-gray (170,170,170) — pixel raw_index 8, dominant
 *   - Window fill: white (255,255,255) — pixel raw_index 0
 *   - Frames: dark blue (85,85,255) — pixel raw_index 1
 *   - Menu text: white and blue in bottom rows
 *   - Expected: white > 30%, light-gray > 30%, white_bottom_rows > 500
 *
 * These statistics work for ANY Wiz6 screen captured at a UI state:
 *   - light-gray or white together > 50% (UI background)
 *   - white pixels in bottom 40 rows > 0 (text visible on-screen)
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
  // Low for structured tile-rendered screens; high for noise/wrong-base decodes.
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

// ─── CLI ─────────────────────────────────────────────────────────────────────

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

// Structural (GEOMETRY) validation: the decoded image must be a plausible Wiz6 UI
// screen under the direct DAC palette (raw_index → DAC_6BIT[raw_index]):
//   - black > 15%   : window interiors / empty VRAM (raw_index 0 = black)
//   - dark-gray > 10%: the attr-8 gray UI background (raw_index 8)
// This validates GEOMETRY (correct VRAM base, no scrambled-noise decode). It does
// NOT validate exact frame/text COLOR: see the KNOWN LIMITATION below — gray frames
// and white text currently collapse to blue (index 1), i.e. only plane 0 assembles;
// planes 1–3 do not, so multi-plane colors are wrong. That is a remaining VGA-layout
// detail (the higher-plane byte offsets within vga.mem.linear). Geometry is faithful;
// color fidelity for frames/text is pending a plane-assembly RE pass.
const passed =
  stats.blackPct > 15 &&
  stats.dGrayPct > 10;

if (passed) {
  console.log('  structural (geometry) check: PASS');
  console.log('  NOTE: frame/text colors collapse to blue (planes 1-3 unresolved) — geometry is faithful, full color pending.');
} else {
  console.error(`  structural check: FAIL`);
  console.error(`    black=${stats.blackPct.toFixed(1)}% (need >15%), dark-gray=${stats.dGrayPct.toFixed(1)}% (need >10%)`);
  process.exit(1);
}
