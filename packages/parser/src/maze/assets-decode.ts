/**
 * assets-decode.ts — ISOMORPHIC (node-free) decoder for the committed maze
 * render assets (atlas + piece descriptors).
 *
 * This module has NO `node:*` imports and no `Buffer` use, so it compiles and
 * runs in the browser (Vite) as well as Node. The node-only convenience loader
 * `loadMazeAssets()` (which imports the committed JSON fixture) lives in
 * assets.ts; the browser loads the same shape via the viewer's data-loader and
 * decodes it here. The two paths share THIS decoder, so the atlas/descriptor
 * BYTES are guaranteed identical regardless of platform.
 */

import { MazeRenderAssetsSchema, type MazeRenderAssets } from '@wiz6/data';

/** The on-disk JSON shape of the committed maze-assets asset. */
export interface MazeAssetsRaw {
  atlasB64: string;
  pieceDescriptors: { srcPtr: number; w: number; h: number; bitmapB64: string }[];
  /** base64 of the raw `mazedata.ega` file bytes (the from-asset background source). */
  mazedataB64: string;
}

/** Isomorphic base64 → Uint8Array (no Buffer; uses atob in the browser, a manual
 *  decode in Node where atob may be absent in older runtimes — but Node 16+ and
 *  all browsers provide globalThis.atob). */
function base64ToBytes(b64: string): Uint8Array {
  const bin = (globalThis as { atob?: (s: string) => string }).atob;
  if (typeof bin === 'function') {
    const s = bin(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  // Fallback (very old runtimes): manual base64 decode.
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = b64.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let acc = 0;
  let oi = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = table.indexOf(clean[i]!);
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[oi++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}

/** Decode the parsed maze-assets JSON into a validated MazeRenderAssets. Pure. */
export function decodeMazeAssets(raw: MazeAssetsRaw): MazeRenderAssets {
  const atlas = base64ToBytes(raw.atlasB64);
  const mazedata = base64ToBytes(raw.mazedataB64);
  const pieceDescriptors = raw.pieceDescriptors.map((d) => ({
    srcPtr: d.srcPtr,
    w: d.w,
    h: d.h,
    presenceBitmap: base64ToBytes(d.bitmapB64),
  }));
  return MazeRenderAssetsSchema.parse({ atlas, pieceDescriptors, mazedata });
}
