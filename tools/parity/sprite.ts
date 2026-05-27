/**
 * sprite.ts — sprite-at-index extraction and comparison helpers.
 *
 * Exports:
 *   renderFontGlyph(font, charCode, palette)   → { width:8, height:8, rgba }
 *   renderPicSprite(pic, descIndex, palette)    → { width, height, rgba }
 *   extractCell(screenRgba, screenW, x, y, w, h) → rgba
 *   spriteToPng(rgba, w, h, path)              → void
 *   assertSpriteMatches(actual, expected, opts?) → { match, matchPct }
 *
 * CLI usage (dump a single tile to PNG for eyeballing):
 *
 *   # 4bpp font glyph
 *   pnpm tsx tools/parity/sprite.ts --font wfont1 --char 0x00 --out /tmp/x.png
 *   pnpm tsx tools/parity/sprite.ts --font wfont4 --char 0x20
 *
 *   # 1bpp font glyph (wfont0)
 *   pnpm tsx tools/parity/sprite.ts --font wfont0 --char 0x41 --out /tmp/A.png
 *
 *   # Pic sprite by descriptor index
 *   pnpm tsx tools/parity/sprite.ts --pic original/mon11.pic --index 0 --out /tmp/sprite.png
 *
 * Docs: see tools/parity/README.md § "Sprite-level checks"
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Font, Font4bpp, Palette, PicDescriptor } from '../../packages/data/src/index.js';
import { FontSchema, Font4bppSchema, WIZ6_MAIN } from '../../packages/data/src/index.js';
import { renderTextRun4bpp } from '../../packages/parser/src/formats/wfont-4bpp-render.js';
import { renderTextRun } from '../../packages/parser/src/formats/wfont-render.js';
import {
  renderPicDescriptor,
  concatenatePicSegments,
} from '../../packages/parser/src/formats/pic-render.js';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';
import type { DiffOptions } from './diff-image.js';

// ─── Path helpers ─────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = resolve(__dirname, '..', '..');

function findMainCheckoutRoot(): string {
  const gitFilePath = join(WORKTREE_ROOT, '.git');
  let gitContent: string;
  try {
    gitContent = readFileSync(gitFilePath, 'utf-8');
  } catch {
    return WORKTREE_ROOT;
  }
  const match = /gitdir:\s*(.+)/.exec(gitContent);
  if (!match) return WORKTREE_ROOT;
  const gitDir = match[1]!.trim();
  const dotGitDir = gitDir.replace(/\/worktrees\/[^/]+$/, '');
  return resolve(dotGitDir, '..');
}

const MAIN_ROOT = findMainCheckoutRoot();

// ─── Public types ──────────────────────────────────────────────────────────────

export interface RenderedGlyph {
  width: 8;
  height: 8;
  rgba: Uint8ClampedArray;
}

export interface RenderedSprite {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

export interface SpriteMatchResult {
  /** True when matchPct >= threshold (default 95%). */
  match: boolean;
  matchPct: number;
}

// ─── renderFontGlyph ──────────────────────────────────────────────────────────

/**
 * Render a single 8×8 font glyph by char code.
 *
 * Handles both 4bpp wfonts (Font4bpp) and 1bpp wfonts (Font). The returned
 * rgba is always 8×8×4 = 256 bytes. For 1bpp fonts, set-bits render as the
 * palette color at index 7 (light gray / foreground) and clear-bits render
 * as palette color 0 (black / background).
 *
 * @param font     Font4bpp or Font (1bpp) loaded via their Zod schemas.
 * @param charCode Glyph index (e.g. 0x00, 0x20). Out-of-range → all-black.
 * @param palette  The EGA/VGA palette to resolve colors through. Defaults to WIZ6_MAIN.
 */
export function renderFontGlyph(
  font: Font4bpp | Font,
  charCode: number,
  palette: Palette = WIZ6_MAIN,
): RenderedGlyph {
  const rgba = new Uint8ClampedArray(8 * 8 * 4); // all-zero = fully transparent/black

  if ('palette' in font) {
    // 4bpp wfont (Font4bpp schema has a `palette` field)
    renderTextRun4bpp(
      rgba,
      8, // destW
      8, // destH
      0, // dstX
      0, // dstY
      String.fromCharCode(charCode),
      font,
      palette,
      {},
    );
  } else {
    // 1bpp wfont (Font schema — no palette field)
    // fg = palette index 7 (light gray in EGA), bg = palette index 0 (black)
    renderTextRun(
      rgba,
      8, // destW
      8, // destH
      0, // dstX
      0, // dstY
      String.fromCharCode(charCode),
      font,
      7, // fgIndex
      palette,
      0, // bgIndex
    );
  }

  return { width: 8, height: 8, rgba };
}

// ─── renderPicSprite ──────────────────────────────────────────────────────────

/**
 * Render a single PIC descriptor (sprite) by 0-based index.
 *
 * The descriptor's W×H cell grid is rendered at (0,0). Color 15 = transparent
 * (alpha=0), all other colors are fully opaque. Skipped mask cells remain
 * transparent.
 *
 * @param pic       Decoded Pic object (schema from @wiz6/data).
 * @param descIndex 0-based descriptor index into pic.descriptors.
 * @param palette   The EGA/VGA palette to resolve colors through.
 */
export function renderPicSprite(
  pic: { descriptors: readonly PicDescriptor[]; segments: readonly { decodedBytes: readonly number[] }[] },
  descIndex: number,
  palette: Palette = WIZ6_MAIN,
): RenderedSprite {
  const descriptor = pic.descriptors[descIndex];
  if (!descriptor) {
    throw new RangeError(
      `renderPicSprite: descIndex ${descIndex} out of range (${pic.descriptors.length} descriptors)`,
    );
  }
  const decodedBuffer = concatenatePicSegments(pic.segments);
  const { width, height, rgba } = renderPicDescriptor(descriptor, decodedBuffer, palette);
  return { width, height, rgba };
}

// ─── extractCell ─────────────────────────────────────────────────────────────

/**
 * Crop a rectangular region from a decoded engine screen buffer at pixel (x, y).
 *
 * This is the key bridge for engine-vs-ours sprite comparison: given the
 * full 320×200 RGBA from decodeVgaScreen, crop the 8×8 cell at a known
 * tile boundary to get what the engine actually drew there.
 *
 * Usage pattern:
 *   const engineScreen = decodeEngineScreen(savePath);
 *   const cellRgba = extractCell(engineScreen, 320, 0, 0, 8, 8);
 *   const ourGlyph = renderFontGlyph(wfont1, 0x00);
 *   const { matchPct } = assertSpriteMatches(ourGlyph.rgba, cellRgba);
 *
 * @param screenRgba Full RGBA frame buffer (SCREEN_WIDTH × SCREEN_HEIGHT × 4).
 * @param screenW    Width of the screen buffer (typically 320).
 * @param x          Left pixel coordinate of the cell (should be a multiple of 8).
 * @param y          Top pixel coordinate of the cell (should be a multiple of 8).
 * @param w          Cell width in pixels (default 8).
 * @param h          Cell height in pixels (default 8).
 * @returns          RGBA pixel data for the cell, row-major (w × h × 4 bytes).
 */
export function extractCell(
  screenRgba: Uint8Array | Uint8ClampedArray,
  screenW: number,
  x: number,
  y: number,
  w = 8,
  h = 8,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const srcIdx = ((y + row) * screenW + (x + col)) * 4;
      const dstIdx = (row * w + col) * 4;
      out[dstIdx] = screenRgba[srcIdx]!;
      out[dstIdx + 1] = screenRgba[srcIdx + 1]!;
      out[dstIdx + 2] = screenRgba[srcIdx + 2]!;
      out[dstIdx + 3] = screenRgba[srcIdx + 3]!;
    }
  }
  return out;
}

// ─── spriteToPng ─────────────────────────────────────────────────────────────

/**
 * Write a sprite's RGBA buffer to a PNG file.
 *
 * Useful for eyeballing individual glyphs/sprites during debugging or
 * when building fixtures. For 8×8 tiles the output will be tiny — open
 * in a viewer that supports nearest-neighbor zoom.
 *
 * @param rgba  Pixel data (w × h × 4 bytes, row-major RGBA).
 * @param w     Width in pixels.
 * @param h     Height in pixels.
 * @param path  Output file path (e.g. '/tmp/glyph-0x00.png').
 */
export function spriteToPng(
  rgba: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  path: string,
): void {
  const data = rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  const png = encodePngRgba(w, h, data);
  writeFileSync(path, png);
}

// ─── assertSpriteMatches ──────────────────────────────────────────────────────

/**
 * Assert that two sprite RGBA buffers match above a threshold.
 *
 * Thin wrapper over `compareRgba` that adds a boolean `match` flag.
 * Buffers must have the same length (same w × h). Tolerance defaults to 8
 * (accommodates AC→DAC rounding in palette lookups).
 *
 * The `threshold` (default 95%) is a soft assertion anchor — use it in
 * tests to catch regressions. For exact ground-truth checks, use tolerance=0
 * and threshold=100.
 *
 * @param actualRgba    Our rendered sprite buffer.
 * @param expectedRgba  Engine reference (from extractCell) or fixture.
 * @param opts          Diff options (tolerance, default 8).
 * @param threshold     Match percent threshold for the boolean flag (default 95).
 */
export function assertSpriteMatches(
  actualRgba: Uint8Array | Uint8ClampedArray | number[],
  expectedRgba: Uint8Array | Uint8ClampedArray | number[],
  opts?: DiffOptions,
  threshold = 95,
): SpriteMatchResult & { diffCount: number; total: number } {
  if (actualRgba.length !== expectedRgba.length) {
    throw new Error(
      `assertSpriteMatches: buffer length mismatch — actual=${actualRgba.length}, expected=${expectedRgba.length}`,
    );
  }
  if (actualRgba.length % 4 !== 0) {
    throw new Error(`assertSpriteMatches: buffer length ${actualRgba.length} is not a multiple of 4`);
  }
  const tolerance = opts?.tolerance ?? 8;
  const total = actualRgba.length / 4;
  let diffCount = 0;
  for (let i = 0; i < total; i++) {
    const base = i * 4;
    const dr = Math.abs((actualRgba[base]!) - (expectedRgba[base]!));
    const dg = Math.abs((actualRgba[base + 1]!) - (expectedRgba[base + 1]!));
    const db = Math.abs((actualRgba[base + 2]!) - (expectedRgba[base + 2]!));
    const da = Math.abs((actualRgba[base + 3]!) - (expectedRgba[base + 3]!));
    if (dr > tolerance || dg > tolerance || db > tolerance || da > tolerance) {
      diffCount++;
    }
  }
  const matchPct = ((total - diffCount) / total) * 100;
  return {
    match: matchPct >= threshold,
    matchPct,
    diffCount,
    total,
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────
//
// Only runs when executed directly (not imported as a module).

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);

  function getArg(flag: string): string | undefined {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
  }

  const fontArg = getArg('--font');
  const charArg = getArg('--char');
  const picArg = getArg('--pic');
  const indexArg = getArg('--index');
  const outArg = getArg('--out');

  if (fontArg && charArg) {
    // ── Font glyph dump ──────────────────────────────────────────────────────
    const charCode = Number(charArg); // parses 0x20 as hex, 32 as decimal
    const fontPath = join(MAIN_ROOT, 'extracted', 'fonts', `${fontArg}.json`);
    let fontJson: unknown;
    try {
      fontJson = JSON.parse(readFileSync(fontPath, 'utf-8'));
    } catch (e) {
      console.error(`Error reading font ${fontPath}: ${String(e)}`);
      process.exit(1);
    }

    // Determine if 4bpp or 1bpp by looking at glyph size in the JSON
    let font: Font4bpp | Font;
    try {
      font = Font4bppSchema.parse(fontJson);
    } catch {
      try {
        font = FontSchema.parse(fontJson);
      } catch {
        console.error(`Could not parse ${fontArg} as Font4bpp or Font`);
        process.exit(1);
      }
    }

    const glyph = renderFontGlyph(font, charCode);
    const outPath = outArg ?? `/tmp/${fontArg}-char-${charArg.replace(/^0x/i, 'x')}.png`;
    spriteToPng(glyph.rgba, 8, 8, outPath);

    // Check if all-black
    let allBlack = true;
    for (let i = 0; i < glyph.rgba.length; i += 4) {
      if (glyph.rgba[i] !== 0 || glyph.rgba[i + 1] !== 0 || glyph.rgba[i + 2] !== 0) {
        allBlack = false;
        break;
      }
    }
    console.log(`font:    ${fontArg}`);
    console.log(`char:    ${charArg} (${charCode})`);
    console.log(`output:  ${outPath}`);
    console.log(`all-black: ${allBlack}`);

  } else if (picArg && indexArg !== undefined) {
    // ── Pic sprite dump ──────────────────────────────────────────────────────
    const descIndex = Number(indexArg);
    let picPath = picArg;
    if (!picPath.startsWith('/')) {
      picPath = join(MAIN_ROOT, picPath);
    }

    // Use the parser to decode the pic
    const { decodePic } = await import('../../packages/parser/src/formats/pic.js');
    const raw = readFileSync(picPath);
    const pic = decodePic(new Uint8Array(raw.buffer));

    const sprite = renderPicSprite(pic, descIndex);
    const outPath = outArg ?? `/tmp/pic-desc-${descIndex}.png`;

    // spriteToPng expects Uint8Array, rgba is Uint8ClampedArray — convert
    const data = new Uint8Array(sprite.rgba.buffer, sprite.rgba.byteOffset, sprite.rgba.byteLength);
    const png = encodePngRgba(sprite.width, sprite.height, data);
    writeFileSync(outPath, png);

    console.log(`pic:     ${picPath}`);
    console.log(`index:   ${descIndex}`);
    console.log(`size:    ${sprite.width}×${sprite.height}`);
    console.log(`output:  ${outPath}`);

  } else {
    console.error(
      'usage:\n' +
      '  pnpm tsx tools/parity/sprite.ts --font wfont1 --char 0x00 [--out /tmp/x.png]\n' +
      '  pnpm tsx tools/parity/sprite.ts --font wfont4 --char 0x20\n' +
      '  pnpm tsx tools/parity/sprite.ts --pic original/mon11.pic --index 0 [--out /tmp/sprite.png]\n',
    );
    process.exit(1);
  }
}
