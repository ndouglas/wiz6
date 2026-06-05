/**
 * maze-corridor-page.ts — on the NIGHTLY core + committed maze-corridor.state,
 * locate the compose-page segment (es=cs:[0x14d]) and decode it vs the committed
 * maze-corridor.idx.gz viewport. Determines whether the SETTLED state's page
 * holds the full composed frame (background + walls).
 *
 * The page->VRAM blit is offset-preserving, so the page IS the screen. We try a
 * range of candidate page bases (the heap is per-run) by decoding each and
 * matching the viewport vs the committed oracle (COMPOSED_PALETTE space).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { COMPOSED_PALETTE } from '../parity/decode-screen.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE = resolve('tools/libretro/states/maze-corridor.state');
const FIX = join(HERE, '..', 'parity', 'fixtures', 'engine', 'maze-corridor.idx.gz');
const W = 320;
const VP = { x0: 72, x1: 248, y0: 32, y1: 144 };

async function main() {
  const oracle = new Uint8Array(gunzipSync(readFileSync(FIX))); // 320*200 idx (COMPOSED space)
  console.log('oracle len', oracle.length, '(full screen 320*200=', 320 * 200, ')');

  const c = new HostClient();
  await c.step(3000);
  await c.unserialize(STATE);
  await c.step(2);

  // Read es=cs:[0x14d] from the resident copy (base 0x6a1b0 gave cs14d=0x3ddd = raw,
  // not relocated). Instead, find the page seg empirically: scan candidate bases.
  // The page is a 0x8000 region; decode candidates and match viewport vs oracle.
  // Candidate page bases: search 0x10000..0x90000 step 0x1000 — too slow via read.
  // Faster: the committed render is reproduced by `fb` directly. Use fb as truth and
  // ALSO locate the page by reading large windows and scoring.
  await c.fb('/tmp/wiz6-corridor-live.fb');
  const fb = new Uint8Array(readFileSync('/tmp/wiz6-corridor-live.fb'));
  // Build live idx from fb by inverse COMPOSED_PALETTE.
  const rgb2idx = new Map<number, number>();
  COMPOSED_PALETTE.forEach(([r, g, b], i) => { if (!rgb2idx.has((r << 16) | (g << 8) | b)) rgb2idx.set((r << 16) | (g << 8) | b, i); });
  const liveFull = new Uint8Array(W * 200);
  let unmapped = 0;
  for (let y = 0; y < 200; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    const k = (fb[o]! << 16) | (fb[o + 1]! << 8) | fb[o + 2]!;
    const i = rgb2idx.get(k);
    if (i === undefined) unmapped++;
    liveFull[y * W + x] = i ?? 255;
  }
  // full-screen match
  let matchAll = 0;
  for (let i = 0; i < oracle.length; i++) if (liveFull[i] === oracle[i]) matchAll++;
  console.log(`LIVE fb vs oracle FULL screen: ${matchAll}/${oracle.length} = ${(100 * matchAll / oracle.length).toFixed(3)}%  (unmapped px=${unmapped})`);
  // viewport-only match
  let matchVp = 0, totVp = 0;
  for (let y = VP.y0; y < VP.y1; y++) for (let x = VP.x0; x < VP.x1; x++) {
    totVp++; if (liveFull[y * W + x] === oracle[y * W + x]) matchVp++;
  }
  console.log(`LIVE fb vs oracle VIEWPORT (x72..247 y32..143): ${matchVp}/${totVp} = ${(100 * matchVp / totVp).toFixed(3)}%`);
  // viewport hist
  const h: Record<number, number> = {};
  for (let y = VP.y0; y < VP.y1; y++) for (let x = VP.x0; x < VP.x1; x++) { const v = liveFull[y * W + x]!; h[v] = (h[v] ?? 0) + 1; }
  console.log('live viewport idx hist:', JSON.stringify(h));
  const ho: Record<number, number> = {};
  for (let y = VP.y0; y < VP.y1; y++) for (let x = VP.x0; x < VP.x1; x++) { const v = oracle[y * W + x]!; ho[v] = (ho[v] ?? 0) + 1; }
  console.log('oracle viewport idx hist:', JSON.stringify(ho));
  writeFileSync('/tmp/wiz6-corridor-livefull.bin', Buffer.from(liveFull));
  c.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
