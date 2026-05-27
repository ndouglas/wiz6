/**
 * canvas.ts — helpers for reading and asserting on EGA canvas content in Playwright e2e tests.
 *
 * The wiz6 viewer renders to a 320×200 internal-resolution <canvas> (CSS-scaled 3×).
 * These helpers operate on the INTERNAL pixel buffer (320×200, via getImageData),
 * not the CSS-scaled display size.
 */

import type { Page } from '@playwright/test';
import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CanvasCapture {
  width: number;
  height: number;
  /** Row-major RGBA pixel data. Length = width * height * 4. */
  rgba: number[];
}

// ---------------------------------------------------------------------------
// Core capture
// ---------------------------------------------------------------------------

/**
 * Capture the internal pixel buffer of a <canvas> element.
 *
 * Reads the 320×200 ImageData from the canvas's 2D context (the EGA internal
 * resolution) regardless of how the canvas is CSS-scaled on screen.
 *
 * @param page     Playwright Page
 * @param selector CSS selector for the canvas (default: 'canvas')
 */
export async function captureCanvas(page: Page, selector = 'canvas'): Promise<CanvasCapture> {
  return page.evaluate((sel: string) => {
    const c = document.querySelector(sel) as HTMLCanvasElement | null;
    if (!c) throw new Error(`Canvas not found: ${sel}`);
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Could not get 2d context from canvas');
    const d = ctx.getImageData(0, 0, c.width, c.height);
    return {
      width: c.width,
      height: c.height,
      rgba: Array.from(d.data),
    };
  }, selector);
}

// ---------------------------------------------------------------------------
// Non-blank polling
// ---------------------------------------------------------------------------

/**
 * Poll until the canvas has rendered a non-blank frame.
 *
 * "Blank" means all pixels are the background color (EGA gray: 85,85,85 or
 * pure black 0,0,0) or the canvas hasn't painted anything yet. We wait until
 * at least `minNonBackground` pixels differ from those two background values.
 *
 * Default minNonBackground is 500 (well above noise; the chrome frame has
 * thousands of lit pixels once rendered).
 *
 * @param page               Playwright Page
 * @param selector           Canvas CSS selector (default: 'canvas')
 * @param minNonBackground   Minimum non-background pixel count (default: 500)
 * @param timeoutMs          Maximum wait time in ms (default: 15_000)
 */
export async function waitForNonBlankCanvas(
  page: Page,
  selector = 'canvas',
  minNonBackground = 500,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const nonBackground = await page.evaluate(
      ({ sel, min }: { sel: string; min: number }) => {
        const c = document.querySelector(sel) as HTMLCanvasElement | null;
        if (!c) return 0;
        const ctx = c.getContext('2d');
        if (!ctx) return 0;
        const d = ctx.getImageData(0, 0, c.width, c.height);
        const data = d.data;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]!;
          const g = data[i + 1]!;
          const b = data[i + 2]!;
          // Skip pure black (0,0,0) and EGA gray background (85,85,85)
          const isBlack = r === 0 && g === 0 && b === 0;
          const isGray  = r === 85 && g === 85 && b === 85;
          if (!isBlack && !isGray) count++;
          // Short-circuit once we have enough
          if (count >= min) return count;
        }
        return count;
      },
      { sel: selector, min: minNonBackground },
    );

    if (nonBackground >= minNonBackground) return;

    await page.waitForTimeout(100);
  }

  throw new Error(
    `Canvas did not render ${minNonBackground} non-background pixels within ${timeoutMs}ms`,
  );
}

// ---------------------------------------------------------------------------
// PNG artifact saver (debug helper)
// ---------------------------------------------------------------------------

/**
 * Encode an RGBA buffer as a minimal PNG and write it to disk.
 *
 * Uses a pure-JS PNG encoder so it works in Playwright's Node environment
 * without native addons.
 *
 * @param path    Output file path
 * @param capture Canvas capture from captureCanvas()
 */
export function saveCanvasPng(path: string, capture: CanvasCapture): void {
  const { width, height, rgba } = capture;
  const png = encodePngRgba(width, height, new Uint8Array(rgba));
  writeFileSync(path, png);
}

// ---------------------------------------------------------------------------
// Minimal pure-JS PNG encoder
// ---------------------------------------------------------------------------

/** Compute CRC32 of a byte buffer. */
function crc32(buf: Uint8Array): number {
  const TABLE = buildCrcTable();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

let _crcTable: Uint32Array | undefined;
function buildCrcTable(): Uint32Array {
  if (_crcTable) return _crcTable;
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c >>> 0;
  }
  _crcTable = t;
  return t;
}

function writeU32BE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset]     = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8)  & 0xff;
  buf[offset + 3] =  value         & 0xff;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  writeU32BE(out, 0, data.length);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  const crcInput = out.subarray(4, 8 + data.length);
  writeU32BE(out, 8 + data.length, crc32(crcInput));
  return out;
}

/**
 * Encode a 320×200 RGBA image as a PNG.
 *
 * This is a standalone port of the same minimal encoder used in
 * packages/cli/src/lib/png.ts — duplicated here so the e2e helpers have
 * zero dependency on Node-only CLI packages.
 */
export function encodePngRgba(width: number, height: number, rgba: Uint8Array): Uint8Array {
  // IHDR
  const ihdrData = new Uint8Array(13);
  writeU32BE(ihdrData, 0, width);
  writeU32BE(ihdrData, 4, height);
  ihdrData[8]  = 8;  // bit depth
  ihdrData[9]  = 2;  // color type: RGB (we strip alpha for simplicity, add back for RGBA)
  ihdrData[9]  = 6;  // color type: RGBA
  ihdrData[10] = 0;  // compression
  ihdrData[11] = 0;  // filter
  ihdrData[12] = 0;  // interlace

  // Raw image data: prepend filter byte (0 = None) per row
  const rowBytes = width * 4;
  const rawLen   = height * (1 + rowBytes);
  const raw      = new Uint8Array(rawLen);
  for (let y = 0; y < height; y++) {
    raw[y * (1 + rowBytes)] = 0; // filter = None
    raw.set(rgba.subarray(y * rowBytes, (y + 1) * rowBytes), y * (1 + rowBytes) + 1);
  }

  // Deflate (zlib) — use Node's built-in deflate (imported at top of file)
  const compressed = deflateSync(raw);

  const chunks: Uint8Array[] = [
    makeChunk('IHDR', ihdrData),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', new Uint8Array(0)),
  ];

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const totalLen = sig.length + chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(totalLen);
  out.set(sig, 0);
  let pos = sig.length;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}
