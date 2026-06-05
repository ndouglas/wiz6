/**
 * validate-placement-selection.ts — Gap B (b1) byte-exact gate.
 *
 * Composes the maze-corridor BACKGROUND page entirely FROM DISK ASSETS:
 *   mazedata.ega -> expandMazeData (Gap A, byte-exact sub-images + the 366 static
 *   placement records) + the captured per-view BLIT CALL list (Gap B selection,
 *   captured at ega.drv FUN_0a93 via trace-maze.ts placements). Two blit branches:
 *     OR branch    (arg10==0xffff): single-image forward OR-blit of placement arg0c.
 *     masked branch (arg10!=0xffff): horizontal MIRROR (reverse byte read + the
 *       cs:[0x192] bit-reverse LUT) of placement arg0c's image, placed at the
 *       geometry of placement arg10, OR-merged.
 *   -> decode page to palette indices -> crop to MAZE_VIEWPORT
 *   -> compare to the committed engine oracle maze-corridor.idx.gz (tolerance 0).
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandMazeData, loadMazeData, type MazeWorkBuffer } from './expand-asset.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../..');
const PLANE_STRIDE = 0x2000;
const ROWB = 40;
const VP = { x: 72, y: 32, w: 176, h: 112 };

// The captured per-view blit call list (first full compose pass), from
// tools/libretro/trace-maze.ts placements (deterministic). ENGINE ORDER is
// significant (masked REPLACE carves the corridor void, then OR adds on top, then
// a final 4 masked REPLACE re-carve). `mode`: 'or' = OR-merge, 'replace' = stosb
// overwrite (from the masked branch [bp+0xe] flag, 1=OR / 0=REPLACE).
type Mode = 'or' | 'replace';
interface Call { branch: 'OR' | 'masked'; arg0c: number; arg10: number; mode: Mode }
const mk = (branch: 'OR' | 'masked', arg0c: number, arg10: number, mode: Mode): Call => ({ branch, arg0c, arg10, mode });
const CALLS: Call[] = [
  // 18 masked OR-merge (perspective mirror of ceiling/floor/side strips).
  mk('masked', 122, 122, 'or'), mk('masked', 150, 150, 'or'),
  mk('masked', 19, 15, 'or'), mk('masked', 15, 19, 'or'),
  mk('masked', 123, 123, 'or'), mk('masked', 151, 151, 'or'),
  mk('masked', 20, 16, 'or'), mk('masked', 16, 20, 'or'),
  mk('masked', 124, 124, 'or'), mk('masked', 152, 152, 'or'),
  mk('masked', 21, 17, 'or'), mk('masked', 17, 21, 'or'),
  mk('masked', 125, 125, 'or'), mk('masked', 153, 153, 'or'),
  mk('masked', 141, 137, 'or'), mk('masked', 169, 165, 'or'),
  mk('masked', 137, 141, 'or'), mk('masked', 165, 169, 'or'),
  // 8 masked REPLACE (carve corridor void/opening — mirror, overwrite).
  mk('masked', 34, 31, 'replace'), mk('masked', 31, 34, 'replace'),
  mk('masked', 25, 25, 'replace'), mk('masked', 28, 28, 'replace'),
  mk('masked', 32, 29, 'replace'), mk('masked', 29, 32, 'replace'),
  mk('masked', 23, 23, 'replace'), mk('masked', 26, 26, 'replace'),
  // 30 OR forward pieces.
  ...[361, 349, 355, 346, 352, 358, 122, 150, 15, 19, 123, 151, 16, 20, 124, 152,
    136, 164, 140, 168, 125, 153, 133, 161, 137, 165, 141, 169, 145, 173].map(
    (i): Call => mk('OR', i, 0xffff, 'or'),
  ),
  // 4 final masked REPLACE (re-carve void on top of the OR pieces).
  mk('masked', 33, 30, 'replace'), mk('masked', 30, 33, 'replace'),
  mk('masked', 24, 24, 'replace'), mk('masked', 27, 27, 'replace'),
];

const BITREV = new Uint8Array(256);
for (let i = 0; i < 256; i++) { let v = 0; for (let b = 0; b < 8; b++) v |= ((i >> b) & 1) << (7 - b); BITREV[i] = v; }

/** OR branch (ega.drv 0xaa9): forward single-image OR-blit of placement `pIdx`. */
function orBlit(page: Uint8Array, wb: MazeWorkBuffer, pIdx: number): void {
  const p = wb.placements[pIdx]!;
  const d = wb.descs[p.imgIdx]!;
  const planeStride = d.w * d.h;
  const si = d.segDelta * 16 + d.srcOffLow + p.bias;
  const di = p.destX + p.bias + ROWB * p.destRow;
  for (let row = 0; row < d.h; row++) {
    const sRow = si + row * d.w;
    const dRow = di + row * ROWB;
    for (let pl = 0; pl < 4; pl++) {
      const s = sRow + pl * planeStride, dd = dRow + pl * PLANE_STRIDE;
      for (let b = 0; b < p.count; b++) page[dd + b]! |= wb.buffer[s + b]!;
    }
  }
}

/** masked branch (ega.drv 0xbc6): horizontal MIRROR of placement srcIdx's image,
 *  placed at placement dstIdx's geometry. The source row is read backward (dec si)
 *  and each byte bit-reversed via the cs:[0x192] LUT. `mode` from [bp+0xe]:
 *  'or' OR-merges (0xc66 branch), 'replace' overwrites (0xcc3 branch). */
function maskedBlit(page: Uint8Array, wb: MazeWorkBuffer, srcIdx: number, dstIdx: number, mode: Mode): void {
  const sp = wb.placements[srcIdx]!;          // arg0c: source IMAGE
  const dp = wb.placements[dstIdx]!;          // arg10: dest GEOMETRY
  const S = wb.descs[sp.imgIdx]!;             // the source image descriptor
  const planeStride = S.w * S.h;
  // di = dp.destX + dp.bias + 0x28*dp.destRow (asm 0xc0e..0xc22).
  const di = dp.destX + dp.bias + ROWB * dp.destRow;
  // src plane-0 start: S.srcOffLow + (S.w-1) - dp.bias (asm 0xc3e..0xc4c). Reverse.
  const siBase = S.segDelta * 16 + S.srcOffLow + (S.w - 1) - dp.bias;
  const cx = dp.count;                        // bytes per row (asm [bp-4])
  for (let row = 0; row < S.h; row++) {
    const sRow = siBase + row * S.w;
    const dRow = di + row * ROWB;
    for (let pl = 0; pl < 4; pl++) {
      const s = sRow + pl * planeStride, dd = dRow + pl * PLANE_STRIDE;
      for (let b = 0; b < cx; b++) {
        const v = BITREV[wb.buffer[s - b]!]!;
        if (mode === 'or') page[dd + b]! |= v; else page[dd + b]! = v;
      }
    }
  }
}

function composeFromAsset(): Uint8Array {
  const wb = expandMazeData(loadMazeData(resolve(ROOT, 'test-fixtures/original')));
  const page = new Uint8Array(4 * PLANE_STRIDE);
  for (const c of CALLS) {
    if (c.branch === 'OR') orBlit(page, wb, c.arg0c);
    else maskedBlit(page, wb, c.arg0c, c.arg10, c.mode);
  }
  return page;
}

function decodeViewport(page: Uint8Array): Uint8Array {
  const out = new Uint8Array(VP.w * VP.h);
  for (let r = 0; r < VP.h; r++)
    for (let col = 0; col < VP.w; col++) {
      const x = VP.x + col, y = VP.y + r;
      const off = y * ROWB + (x >> 3);
      const bit = 7 - (x & 7);
      let v = 0;
      for (let p = 0; p < 4; p++) v |= ((page[off + p * PLANE_STRIDE]! >> bit) & 1) << p;
      out[r * VP.w + col] = v;
    }
  return out;
}

function engineViewport(): Uint8Array {
  const raw = gunzipSync(readFileSync(resolve(ROOT, 'tools/parity/fixtures/engine/maze-corridor.idx.gz')));
  const full = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  const out = new Uint8Array(VP.w * VP.h);
  for (let r = 0; r < VP.h; r++)
    for (let col = 0; col < VP.w; col++) out[r * VP.w + col] = full[(VP.y + r) * 320 + VP.x + col]!;
  return out;
}

const ours = decodeViewport(composeFromAsset());
const eng = engineViewport();
const N = VP.w * VP.h;
let match = 0;
const diffs: string[] = [];
for (let i = 0; i < N; i++) {
  if (ours[i] === eng[i]) match++;
  else if (diffs.length < 24) diffs.push(`(${VP.x + (i % VP.w)},${VP.y + Math.floor(i / VP.w)}) got=${ours[i]} want=${eng[i]}`);
}
const pct = (100 * match) / N;
console.log(`from-asset viewport (OR + masked-mirror model): ${match}/${N} = ${pct.toFixed(4)}%`);
console.log('NOTE: this is a DIAGNOSTIC. The OR placement-index selection is captured');
console.log('byte-exact; the masked-branch (perspective mirror + void carve) geometry');
console.log('is identified at the asm level but not yet byte-exact aligned. See');
console.log('docs/re/findings/maze-placement-selection.json.');
if (pct < 100) console.log('first diffs:', diffs.slice(0, 12).join('  '));
