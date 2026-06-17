/**
 * diff-door-frames.ts — VERIFICATION (#089): diff captured engine FORCE
 * strain/result frames against composeDoorProgress / composeDoorResult.
 *
 * Engine fixtures are full-screen 320x200 palette-index frames captured by
 * `trace-maze.ts doorframes`. We crop each to the 160x40 door strip (same as
 * door-menu-parity.test.ts) and diff against our composer output.
 *
 * Usage: pnpm tsx tools/parity/diff-door-frames.ts [engDir]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { DOOR_MENU } from '../../packages/data/src/maze/door-menu.js';
import {
  composeDoorProgress,
  composeDoorResult,
} from '../../packages/viewer/src/pages/game/compose-door-progress.js';
import { COMPOSED_PALETTE } from './decode-screen.js';

const SCREEN_W = 320;
const { x: SX, y: SY, w: STRIP_W, h: STRIP_H } = DOOR_MENU.strip;

const engDir = process.argv[2] ?? '/tmp/wiz6-doorframes';

function loadStrip(name: string): Uint8Array {
  const full = new Uint8Array(gunzipSync(readFileSync(`${engDir}/${name}.idx.gz`)));
  const out = new Uint8Array(STRIP_W * STRIP_H);
  for (let r = 0; r < STRIP_H; r++)
    for (let c = 0; c < STRIP_W; c++) out[r * STRIP_W + c] = full[(SY + r) * SCREEN_W + (SX + c)]!;
  return out;
}

function diff(a: Uint8Array, b: Uint8Array): { n: number; cells: string[] } {
  let n = 0;
  const cells: string[] = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      n++;
      if (cells.length < 12) cells.push(`(x${i % STRIP_W},y${Math.floor(i / STRIP_W)}) ours=${a[i]} eng=${b[i]}`);
    }
  }
  return { n, cells };
}

/** ASCII art of a strip: map palette index -> a glyph so positions are legible.
 *  '.' = bg gray(8)  '#'=black(0)  digits/letters = other indices. */
function ascii(buf: Uint8Array): string {
  const ch = (v: number) => (v === 8 ? '.' : v === 0 ? ' ' : v.toString(16));
  let s = '';
  for (let r = 0; r < STRIP_H; r++) {
    let line = '';
    for (let c = 0; c < STRIP_W; c++) line += ch(buf[r * STRIP_W + c]!);
    s += line + '\n';
  }
  return s;
}

/** Which columns/rows have any NON-bg, NON-black ink (the text/bar pixels). */
function inkExtent(buf: Uint8Array): { xMin: number; xMax: number; yMin: number; yMax: number; indices: Set<number> } {
  let xMin = 999, xMax = -1, yMin = 999, yMax = -1;
  const indices = new Set<number>();
  for (let r = 0; r < STRIP_H; r++)
    for (let c = 0; c < STRIP_W; c++) {
      const v = buf[r * STRIP_W + c]!;
      if (v !== 8 && v !== 0) {
        indices.add(v);
        if (c < xMin) xMin = c;
        if (c > xMax) xMax = c;
        if (r < yMin) yMin = r;
        if (r > yMax) yMax = r;
      }
    }
  return { xMin, xMax, yMin, yMax, indices };
}

// Minimal PNG encoder (RGBA, no deps beyond zlib).
import { deflateSync } from 'node:zlib';
function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const t = new TextEncoder().encode(type);
  const len = data.length;
  const out = new Uint8Array(12 + len);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, len);
  out.set(t, 4);
  out.set(data, 8);
  dv.setUint32(8 + len, crc32(out.subarray(4, 8 + len)));
  return out;
}
function encodePng(idx: Uint8Array, w: number, h: number, scale = 3): Uint8Array {
  const sw = w * scale, sh = h * scale;
  const raw = new Uint8Array(sh * (1 + sw * 4));
  for (let y = 0; y < sh; y++) {
    raw[y * (1 + sw * 4)] = 0;
    for (let x = 0; x < sw; x++) {
      const v = idx[Math.floor(y / scale) * w + Math.floor(x / scale)]!;
      const rgb = COMPOSED_PALETTE[v] ?? [255, 0, 255];
      const o = y * (1 + sw * 4) + 1 + x * 4;
      raw[o] = rgb[0]!; raw[o + 1] = rgb[1]!; raw[o + 2] = rgb[2]!; raw[o + 3] = 255;
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, sw); dv.setUint32(4, sh); ihdr[8] = 8; ihdr[9] = 6;
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}
/** Stack ours-over-eng for a side-by-side PNG (ours top, gap, eng bottom). */
function sideBySide(ours: Uint8Array, eng: Uint8Array, name: string): void {
  const gap = 2;
  const H = STRIP_H * 2 + gap;
  const comp = new Uint8Array(STRIP_W * H).fill(0);
  comp.set(ours, 0);
  for (let r = 0; r < STRIP_H; r++) comp.set(eng.subarray(r * STRIP_W, (r + 1) * STRIP_W), (STRIP_H + gap + r) * STRIP_W);
  writeFileSync(`${engDir}/cmp-${name}.png`, encodePng(comp, STRIP_W, H, 3));
}

function report(name: string, ours: Uint8Array, eng: Uint8Array): void {
  const d = diff(ours, eng);
  const oi = inkExtent(ours), ei = inkExtent(eng);
  console.log(`\n========== ${name} ==========`);
  console.log(`  pixel diff: ${d.n}/${ours.length}`);
  console.log(`  OUR ink: x[${oi.xMin}..${oi.xMax}] y[${oi.yMin}..${oi.yMax}] indices={${[...oi.indices].sort((a, b) => a - b).join(',')}}`);
  console.log(`  ENG ink: x[${ei.xMin}..${ei.xMax}] y[${ei.yMin}..${ei.yMax}] indices={${[...ei.indices].sort((a, b) => a - b).join(',')}}`);
  if (d.cells.length) console.log(`  first diffs: ${d.cells.join(' | ')}`);
  console.log(`  --- ENGINE strip (ascii: '.'=gray8 ' '=black0 hex=other) ---`);
  console.log(ascii(eng).split('\n').map((l) => '  E|' + l).join('\n'));
  console.log(`  --- OUR strip ---`);
  console.log(ascii(ours).split('\n').map((l) => '  O|' + l).join('\n'));
  sideBySide(ours, eng, name);
}

// --- RESULT frames ---
report('result-success', composeDoorResult('success'), loadStrip('maze-door-result-success'));
report('result-failure', composeDoorResult('failure'), loadStrip('maze-door-result-failure'));

// --- STRAIN bar frames (chrome static; fill animates). Diff each captured frame
//     against our bar at a few fill levels so we can see the static-chrome match. ---
for (let f = 0; f < 4; f++) {
  const eng = loadStrip(`maze-door-strain-bar-${f}`);
  // Our composer doesn't know the engine's fill; report against filled=0 (chrome only)
  // and against a guessed fill so the diff isolates chrome vs fill.
  report(`strain-bar-${f}-vs-fill0`, composeDoorProgress('strain', 0, 18), eng);
}

console.log('\nPNGs written: ' + engDir + '/cmp-*.png (ours top / eng bottom, 3x)');
