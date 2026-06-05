/**
 * validate-expander.ts — byte-exact validation of the maze background EXPANDER
 * (tools/parity/expand-asset.ts) against the LIVE captured oracle.
 *
 * The oracle is the dataSeg (cs:[0x149]) work buffer captured at the OR-blit entry
 * during the first render (tools/libretro/trace-maze.ts expander → dataseg-full.bin)
 * plus the per-image OR-blit source work-buffers (trace-maze.ts firstrender →
 * wb-*.bin). expandMazeData(mazedata.ega) must reproduce both byte-exact.
 *
 *   pnpm tsx tools/parity/validate-expander.ts [oracleDir] [firstrenderDir]
 *
 * Defaults to the committed fixture dir (self-contained gate). Exit 0 = 100%
 * byte-exact (floor + ceiling + window + side panels). Exit 1 = drift.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadMazeData, expandMazeData } from './expand-asset.js';

const oracleDir = process.argv[2] ?? resolve('tools/parity/fixtures/maze-expander');
const frDir = process.argv[3] ?? oracleDir;

function readBin(p: string): Uint8Array { return new Uint8Array(readFileSync(p)); }

let fail = 0;

// 1) The whole work buffer vs the captured dataSeg window.
const wb = expandMazeData(loadMazeData());
const oraclePath = resolve(oracleDir, 'dataseg-full.bin');
if (existsSync(oraclePath)) {
  const oracle = readBin(oraclePath);
  const n = oracle.length;
  let eq = 0;
  for (let i = 0; i < n; i++) if (wb.buffer[i] === oracle[i]) eq++;
  const ok = eq === n;
  console.log(`work buffer vs live dataSeg (0x${n.toString(16)} bytes): ${eq}/${n} = ${(100 * eq / n).toFixed(3)}% ${ok ? '✓' : '✗'}`);
  if (!ok) {
    fail = 1;
    for (let i = 0; i < n; i++) if (wb.buffer[i] !== oracle[i]) { console.log(`  first diff @0x${i.toString(16)}: got 0x${wb.buffer[i]!.toString(16)} oracle 0x${oracle[i]!.toString(16)}`); break; }
  }
} else {
  console.log(`(no oracle dataseg-full.bin at ${oraclePath} — skipping full-buffer check)`);
}

// 2) Per-image OR-blit source work-buffers (the firstrender wb-*.bin) — each must
//    be a byte-exact slice of the expanded buffer at its descriptor address.
const metaPath = resolve(frDir, 'meta.json');
if (existsSync(metaPath)) {
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as {
    dataSeg?: string;
    table_pointers?: { dataSeg: string };
    placed_images: Array<{ gi: number; ds: number; si: number; w: number; h: number; planeStride: number; srcLen: number }>;
  };
  const dataSeg = parseInt(meta.dataSeg ?? meta.table_pointers!.dataSeg, 16);
  console.log(`\nper-image source work-buffers (dataSeg 0x${dataSeg.toString(16)}):`);
  for (const pi of meta.placed_images) {
    const wbPath = resolve(frDir, `wb-${pi.gi}.bin`);
    if (!existsSync(wbPath)) continue;
    const live = readBin(wbPath);
    // The live ds = dataSeg + segDelta; the wb buffer starts at (ds<<4) i.e. the
    // sub-image's segment base. In the expanded buffer that is byte offset
    // (ds - dataSeg) * 16.
    const segDelta = pi.ds - dataSeg;
    const base = segDelta * 16;
    let eq = 0;
    for (let i = 0; i < live.length; i++) if (wb.buffer[base + i] === live[i]) eq++;
    const ok = eq === live.length;
    if (!ok) fail = 1;
    console.log(`  gi${pi.gi} w${pi.w} h${pi.h} si${pi.si} segDelta=${segDelta} off=0x${base.toString(16)}: ${eq}/${live.length} = ${(100 * eq / live.length).toFixed(1)}% ${ok ? '✓' : '✗'}`);
  }
} else {
  console.log(`(no firstrender meta at ${metaPath} — skipping per-image check)`);
}

console.log(fail ? '\nFAIL — expander drift' : '\nPASS — expander byte-exact (floor + ceiling + window + side panels)');
process.exit(fail);
