/**
 * render-maze-page.ts — decode the Wiz6 maze off-screen compose page into a
 * 320x200 indexed/RGB image.
 *
 * BACKGROUND (see docs/re/findings/maze-planar-transform.json):
 * The first-person maze view is composed by the ega.drv entry-10 blit
 * (FUN_1c94 / its planar writer at file 0x1f6e..0x20fb), run from a relocated
 * transient copy. It writes a 4-plane EGA OFF-SCREEN PAGE (segment 0x4182 in the
 * CLEAN_STATE layout; heap-dependent per run), then a separate page->VRAM blit
 * (ega.drv FUN @ the cs=0x6b91 segment ip 0x8b3) copies the page rectangles to
 * A000 VRAM.
 *
 * PAGE LAYOUT (CONFIRMED): 4 EGA planes, plane p at pageBase + p*0x2000, row
 * stride 0x28 (40 bytes/row = 320px). pixel(x,y) index =
 *   sum_p ( (page[y*40 + x/8 + p*0x2000] >> (7-(x%8))) & 1 ) << p
 *
 * THE PAGE->VRAM BLIT IS FULLY OFFSET-PRESERVING (RESOLVED 2026-06-04):
 * Tracing the page->VRAM rep-movsb (cs=0x6b91 ip 0x909, the plane-0 store) over
 * one redraw logs si==di for ALL 810 stores (0 mismatches), di covering screen
 * rows 0..143 incl. the entire 3D VIEWPORT (rows 32..143). So page[off] -> VRAM[off]
 * everywhere: a uniform 40B/row decode IS the complete screen render. There is NO
 * per-slot repositioning descriptor for the viewport (the prior pass's "viewport
 * stored at a different page location" was a CAPTURE-TIMING artifact, not a transform).
 *
 * CAPTURE TIMING IS THE ONLY GOTCHA: stage-1 (compositor) and stage-2 (page->VRAM
 * blit) INTERLEAVE within one redraw. Capturing the page at the FIRST plane store
 * catches a half-composed viewport (decodes to ~41% vs the framebuffer). Capture
 * the page at the LAST plane-0 store (skip = storeCount-1) to get the fully
 * composed page -> 100.00% pixel-exact on the viewport (x72..247, y32..143) AND
 * the chrome (rows 144..199) AND the banner (rows 0..31). The viewport side panels
 * (x0..71 / x248..319) are static UI not refreshed by a 3D-view redraw, so they
 * read stale in a viewport-only capture (expected).
 * See docs/re/findings/maze-planar-transform.json (viewport-page-screen-map-offset-preserving).
 *
 * Usage:
 *   pnpm tsx tools/parity/render-maze-page.ts <page.bin> [out.png]
 *   page.bin = a >=0x8000-byte dump of the compose page (4 planes @ 0x2000 stride).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const W = 320;
const H = 200;
const ROWB = 40;
const PLANE_STRIDE = 0x2000;

// Default EGA 16-color palette (index -> RGB). The live game REMAPS several of
// these via the EGA palette registers (e.g. the stone walls use indices that the
// default palette shows as blue/cyan but the game shows as grays). For a faithful
// render, override with the live palette registers.
const EGA: Array<[number, number, number]> = [
  [0, 0, 0], [0, 0, 170], [0, 170, 0], [0, 170, 170],
  [170, 0, 0], [170, 0, 170], [170, 85, 0], [170, 170, 170],
  [85, 85, 85], [85, 85, 255], [85, 255, 85], [85, 255, 255],
  [255, 85, 85], [255, 85, 255], [255, 255, 85], [255, 255, 255],
];

export function decodePageIndex(page: Uint8Array, x: number, y: number): number {
  const off = y * ROWB + (x >> 3);
  const bit = 7 - (x & 7);
  let idx = 0;
  for (let p = 0; p < 4; p++) {
    idx |= ((page[off + p * PLANE_STRIDE]! >> bit) & 1) << p;
  }
  return idx;
}

export function decodePageRgba(page: Uint8Array, palette = EGA): Uint8Array {
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = palette[decodePageIndex(page, x, y)]!;
      const o = (y * W + x) * 4;
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
    }
  }
  return out;
}

function encodePng(rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  let q = 0;
  for (let y = 0; y < H; y++) {
    raw[q++] = 0;
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      raw[q++] = rgba[o]!; raw[q++] = rgba[o + 1]!; raw[q++] = rgba[o + 2]!;
    }
  }
  const crc = (buf: Buffer) => {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i]!;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (~c) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(t));
    return Buffer.concat([len, t, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

if (process.argv[1]?.endsWith('render-maze-page.ts')) {
  const inPath = process.argv[2];
  const outPath = process.argv[3] ?? '/tmp/wiz6-maze-page.png';
  if (!inPath) {
    console.error('usage: render-maze-page.ts <page.bin> [out.png]');
    process.exit(1);
  }
  const page = new Uint8Array(readFileSync(inPath));
  writeFileSync(outPath, encodePng(decodePageRgba(page)));
  console.log(`decoded ${inPath} -> ${outPath}`);
}
