#!/usr/bin/env -S pnpm tsx
/**
 * wfont inspect — render every glyph of a wfont to a labeled PNG sheet.
 *
 * Usage:
 *   pnpm tsx tools/wfont/inspect.ts <font-name>   # one font (wfont0..wfont4)
 *   pnpm tsx tools/wfont/inspect.ts --all         # all five
 *
 * Output: extracted/font-sheets/<font-name>.png (16×8 grid at 4× scale, with
 * hex char codes labeled below each glyph).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { decodeGlyph } from './glyph-decode.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const FONTS_DIR = join(REPO_ROOT, 'extracted', 'fonts');
const OUT_DIR = join(REPO_ROOT, 'extracted', 'font-sheets');

// WIZ6_MAIN palette (16 entries, RGB). Inline to avoid pulling in @wiz6/data.
const PALETTE: [number, number, number][] = [
  [0x00, 0x00, 0x00], [0xff, 0xff, 0xff], [0x00, 0xaa, 0x00], [0x55, 0xff, 0x55],
  [0xff, 0x55, 0x55], [0xff, 0xff, 0x55], [0x55, 0xff, 0xff], [0x00, 0x00, 0x00],
  [0x55, 0x55, 0x55], [0xaa, 0xaa, 0xaa], [0xff, 0x00, 0x00], [0xff, 0x55, 0xff],
  [0xff, 0x00, 0x00], [0xff, 0x55, 0xff], [0x00, 0xaa, 0xaa], [0xaa, 0xaa, 0xaa],
];
// Note: this palette is APPROXIMATE for visualization — the engine's exact
// AC→DAC chain is in @wiz6/data WIZ6_MAIN. For inspection purposes, the
// per-pixel distinction matters more than the exact colors.

const SCALE = 4;
const GLYPH_W = 8;
const GLYPH_H = 8;
const COLS = 16;
const ROWS = 8;
const LABEL_H = 8;
const CELL_W = GLYPH_W * SCALE;
const CELL_H = GLYPH_H * SCALE + LABEL_H;
const PAD = 2;
const SHEET_W = COLS * (CELL_W + PAD) + PAD;
const SHEET_H = ROWS * (CELL_H + PAD) + PAD;

// Minimal 5×7 digit font for labels (chars '0'..'9', 'a'..'f', 'x')
// Each glyph is 7 bytes; bit 0 = leftmost pixel.
const LABEL_FONT: Record<string, number[]> = {
  '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  '3': [0x0e, 0x11, 0x01, 0x06, 0x01, 0x11, 0x0e],
  '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  'a': [0x00, 0x00, 0x0e, 0x01, 0x0f, 0x11, 0x0f],
  'b': [0x10, 0x10, 0x1e, 0x11, 0x11, 0x11, 0x1e],
  'c': [0x00, 0x00, 0x0e, 0x10, 0x10, 0x11, 0x0e],
  'd': [0x01, 0x01, 0x0f, 0x11, 0x11, 0x11, 0x0f],
  'e': [0x00, 0x00, 0x0e, 0x11, 0x1f, 0x10, 0x0e],
  'f': [0x06, 0x09, 0x08, 0x1c, 0x08, 0x08, 0x08],
  'x': [0x00, 0x00, 0x11, 0x0a, 0x04, 0x0a, 0x11],
};

function drawLabel(png: PNG, x: number, y: number, text: string): void {
  let cx = x;
  for (const ch of text) {
    const glyph = LABEL_FONT[ch] ?? [0, 0, 0, 0, 0, 0, 0];
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        const bit = (glyph[r]! >> (4 - c)) & 1;
        if (bit) {
          const px = cx + c;
          const py = y + r;
          if (px < png.width && py < png.height) {
            const i = (py * png.width + px) * 4;
            png.data[i] = 0xff;
            png.data[i + 1] = 0xff;
            png.data[i + 2] = 0xff;
            png.data[i + 3] = 0xff;
          }
        }
      }
    }
    cx += 6;
  }
}

function renderFontSheet(fontName: string): void {
  const fontPath = join(FONTS_DIR, `${fontName}.json`);
  if (!existsSync(fontPath)) {
    console.error(`font not found: ${fontPath}`);
    process.exitCode = 1;
    return;
  }
  const font = JSON.parse(readFileSync(fontPath, 'utf-8'));
  const png = new PNG({ width: SHEET_W, height: SHEET_H });
  // Background: dark gray (palette 8) for visual contrast.
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0x22;
    png.data[i + 1] = 0x22;
    png.data[i + 2] = 0x22;
    png.data[i + 3] = 0xff;
  }
  for (let code = 0; code < 128; code++) {
    const bytes = font.glyphs?.[code];
    if (!bytes || bytes.length !== 32) continue;
    const grid = decodeGlyph(bytes);
    const col = code % COLS;
    const row = Math.floor(code / COLS);
    const cx0 = PAD + col * (CELL_W + PAD);
    const cy0 = PAD + row * (CELL_H + PAD);
    for (let gy = 0; gy < GLYPH_H; gy++) {
      for (let gx = 0; gx < GLYPH_W; gx++) {
        const pi = grid[gy]![gx]!;
        const rgb = PALETTE[pi] ?? [0xff, 0x00, 0xff]; // magenta sentinel
        for (let sy = 0; sy < SCALE; sy++) {
          for (let sx = 0; sx < SCALE; sx++) {
            const px = cx0 + gx * SCALE + sx;
            const py = cy0 + gy * SCALE + sy;
            const i = (py * png.width + px) * 4;
            png.data[i] = rgb[0]!;
            png.data[i + 1] = rgb[1]!;
            png.data[i + 2] = rgb[2]!;
            png.data[i + 3] = 0xff;
          }
        }
      }
    }
    drawLabel(png, cx0, cy0 + GLYPH_H * SCALE + 1, `0x${code.toString(16).padStart(2, '0')}`);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `${fontName}.png`);
  writeFileSync(outPath, PNG.sync.write(png));
  console.log(`wrote ${outPath}`);
}

const args = process.argv.slice(2);
if (args[0] === '--all') {
  for (const name of ['wfont0', 'wfont1', 'wfont2', 'wfont3', 'wfont4']) renderFontSheet(name);
} else if (args[0]) {
  renderFontSheet(args[0]);
} else {
  console.error('usage: pnpm tsx tools/wfont/inspect.ts <font-name> | --all');
  process.exitCode = 1;
}
