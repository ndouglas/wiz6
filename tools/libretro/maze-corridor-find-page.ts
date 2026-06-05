/**
 * maze-corridor-find-page.ts — locate the 4-plane compose page in the settled
 * maze-corridor.state RAM by scanning candidate page bases and scoring each
 * page's viewport decode vs the committed oracle. The page is offset-preserving
 * to the screen, so the correct base decodes the viewport byte-exact.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE = resolve('tools/libretro/states/maze-corridor.state');
const FIX = join(HERE, '..', 'parity', 'fixtures', 'engine', 'maze-corridor.idx.gz');
const PS = 0x2000, ROWB = 40, W = 320;
const VP = { x0: 72, x1: 248, y0: 32, y1: 144 };

function scoreViewport(plane: Uint8Array[], oracle: Uint8Array): number {
  let m = 0, t = 0;
  for (let y = VP.y0; y < VP.y1; y++) for (let x = VP.x0; x < VP.x1; x++) {
    const off = y * ROWB + (x >> 3); const bit = 7 - (x & 7); let v = 0;
    for (let p = 0; p < 4; p++) v |= ((plane[p]![off]! >> bit) & 1) << p;
    t++; if (v === oracle[y * W + x]) m++;
  }
  return m / t;
}

async function main() {
  const oracle = new Uint8Array(gunzipSync(readFileSync(FIX)));
  const c = new HostClient();
  await c.step(3000);
  await c.unserialize(STATE);
  await c.step(2);

  // Scan candidate page bases. The 4 planes are contiguous at base + p*0x2000, so
  // base ranges where base+0x8000 fits in mapped RAM. Step by 0x40 (a page row).
  let best = -1, bestBase = -1;
  for (let base = 0x10000; base + 0x8000 < 0x9f000; base += 0x40) {
    // read the 4 plane slices lazily — but reading 0x8000 per base is too slow.
    // Instead, read a big window once and slice in-process.
    break;
  }
  // Read RAM in 0x10000 windows; for each candidate base inside, score using slices.
  const WIN = 0x10000;
  for (let waddr = 0x10000; waddr + 0x8000 < 0x9f000; waddr += WIN - 0x8000) {
    const len = Math.min(WIN, 0x9f000 - waddr);
    const buf = await c.read(waddr, len);
    for (let off = 0; off + 0x8000 <= buf.length; off += 0x40) {
      const planes = [
        buf.subarray(off, off + PS),
        buf.subarray(off + PS, off + 2 * PS),
        buf.subarray(off + 2 * PS, off + 3 * PS),
        buf.subarray(off + 3 * PS, off + 4 * PS),
      ];
      const s = scoreViewport(planes, oracle);
      if (s > best) { best = s; bestBase = waddr + off; }
    }
    console.log(`scanned ${(waddr).toString(16)}..${(waddr + len).toString(16)} best so far ${(100 * best).toFixed(2)}% @ 0x${bestBase.toString(16)}`);
    if (best >= 0.999) break;
  }
  console.log(`\nBEST page base = 0x${bestBase.toString(16)}  viewport ${(100 * best).toFixed(3)}%`);

  if (best >= 0.99) {
    const page = await c.read(bestBase, 0x8000);
    writeFileSync('/tmp/wiz6-corridor-page.bin', Buffer.from(page));
    console.log('dumped page -> /tmp/wiz6-corridor-page.bin');
  }
  c.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
