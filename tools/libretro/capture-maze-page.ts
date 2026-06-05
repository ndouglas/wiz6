/**
 * capture-maze-page.ts — capture a maze compose-page on the PATCHED trace core,
 * decode it (the page->screen decode is the complete renderer — re-confirmed
 * 100%/100% here), and emit a per-region inventory of the 176x112 viewport.
 *
 * Requires the PATCHED trace core (tools/libretro/build-core.sh) and a prior
 * `trace-maze.ts reach` to write /tmp/wiz6-maze-clean.state.
 *
 * Drive: unserialize CLEAN_STATE -> 2 'right' taps to attempt a 180deg flip to
 * the lookback view. NOTE: the libretro harness has no reliable turn key on the
 * maze redraw (see docs/re/findings/wmaze-texture-rasterizer.json), so the
 * 'right' taps may NOT change facing — the captured frame is then the facing-0
 * corridor-at-gate view (the green portcullis straight ahead), which contains
 * the SAME element set as the lookback (ceiling/floor/side-walls + central
 * portcullis window). The decode + region inventory are valid either way.
 *
 * Capture: trace the plane-0 store (lin 0x6c219 in the clean layout; the
 * page->VRAM rep-movsb is offset-preserving). Capture all 4 planes near the LAST
 * store of the redraw, uniform-decode, majority-vote palette from the same-frame
 * fb. Then dump a per-region index histogram + window extent.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const CLEAN_STATE = '/tmp/wiz6-maze-clean.state';
const PAGE = 0x41820, PS = 0x2000, ROWB = 40, W = 320;
const STORE = 0x6c219; // plane-0 store lin (clean layout)
const VP = { x0: 72, x1: 248, y0: 32, y1: 144 };

async function turnRedraw(c: HostClient) {
  await c.key('right', 'tap'); await c.step(40);
  await c.key('right', 'tap'); await c.step(40);
}

async function main() {
  if (!existsSync(CLEAN_STATE)) throw new Error('run `trace-maze.ts reach` first');
  const c = new HostClient();
  await c.step(3000);

  // count plane-0 stores over the lookback turn redraw
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(STORE); await c.traceDrain();
  await turnRedraw(c);
  const n = (await c.traceDrain()).length; await c.traceOff();
  console.log(`plane-0 store count (lookback redraw) = ${n}`);
  if (n === 0) { console.log('NO stores at 0x6c219 for the turn redraw — store lin shifted; aborting'); c.close(); return; }

  // The turn-redraw store count varies a few counts run-to-run; capturing at the
  // exact (n-1)-th hit can miss if a given run logs fewer. Use a skip a small
  // margin below the observed count — the page is fully composed well before the
  // final stores (the tail stores are stable chrome rows).
  const skip = Math.max(0, n - 8);
  const full = new Uint8Array(0x8000);
  for (let p = 0; p < 4; p++) {
    let part: Uint8Array | null = null;
    for (let attempt = 0; attempt < 3 && (!part || part.length < PS); attempt++) {
      await c.unserialize(CLEAN_STATE); await c.step(2);
      await c.traceSet(STORE);
      await c.captureSet(PAGE + p * PS, PS, skip);
      await turnRedraw(c);
      part = await c.captureGet(); await c.traceOff();
    }
    if (!part || part.length < PS) throw new Error(`plane ${p} short after retries (skip ${skip}, n ${n})`);
    full.set(part.subarray(0, PS), p * PS);
  }
  writeFileSync('/tmp/wiz6-lookback-page.bin', Buffer.from(full));

  // same-frame fb
  await c.unserialize(CLEAN_STATE); await c.step(2); await turnRedraw(c);
  await c.fb('/tmp/wiz6-lookback-fb.fb');
  const fb = new Uint8Array(readFileSync('/tmp/wiz6-lookback-fb.fb'));
  const facing = (await c.read(await c.anchor() + 0x4f9a, 2));
  console.log('facing after right x2 =', facing[0]! | (facing[1]! << 8), '(want 2)');

  const idxAt = (x: number, y: number) => {
    const o = y * ROWB + (x >> 3); const bit = 7 - (x & 7); let v = 0;
    for (let p = 0; p < 4; p++) v |= ((full[o + p * PS]! >> bit) & 1) << p;
    return v;
  };
  // majority-vote palette
  const votes = Array.from({ length: 16 }, () => new Map<number, number>());
  for (let y = 0; y < 200; y++) for (let x = 0; x < W; x++) {
    const i = idxAt(x, y); const o = (y * W + x) * 4;
    const k = (fb[o]! << 16) | (fb[o + 1]! << 8) | fb[o + 2]!;
    votes[i]!.set(k, (votes[i]!.get(k) ?? 0) + 1);
  }
  const pal = votes.map((m) => { let b = 0, bc = -1; for (const [k, v] of m) if (v > bc) { bc = v; b = k; } return [b >> 16 & 255, b >> 8 & 255, b & 255]; });
  const mr = (x0: number, x1: number, y0: number, y1: number) => {
    let nn = 0, mm = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = idxAt(x, y); const o = (y * W + x) * 4; nn++;
      if (pal[i]![0] === fb[o] && pal[i]![1] === fb[o + 1] && pal[i]![2] === fb[o + 2]) mm++;
    }
    return (100 * mm / nn).toFixed(2);
  };
  console.log(`decode VIEWPORT match = ${mr(VP.x0, VP.x1, VP.y0, VP.y1)}%  CHROME = ${mr(0, 320, 144, 200)}%`);

  // ── per-region inventory ──
  const hist = (x0: number, x1: number, y0: number, y1: number) => {
    const h: Record<number, number> = {};
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = idxAt(x, y); h[i] = (h[i] ?? 0) + 1; }
    return h;
  };
  console.log('\n=== LOOKBACK VIEWPORT REGION MAP (page-decoded indices) ===');
  console.log('ceiling band  y32..52  :', JSON.stringify(hist(VP.x0, VP.x1, 32, 52)));
  console.log('floor band    y112..144:', JSON.stringify(hist(VP.x0, VP.x1, 112, 144)));
  console.log('left wall     x72..115 :', JSON.stringify(hist(72, 116, 52, 112)));
  console.log('right wall    x205..248:', JSON.stringify(hist(204, 248, 52, 112)));
  console.log('center        x116..204:', JSON.stringify(hist(116, 204, 52, 112)));
  console.log('full viewport          :', JSON.stringify(hist(VP.x0, VP.x1, VP.y0, VP.y1)));

  // colored (window/portcullis) pixel extent: any index that's a "bright" accent
  const ACCENT = new Set([2, 4, 5, 6, 10, 12, 13, 14]);
  let minx = 999, maxx = -1, miny = 999, maxy = -1, cnt = 0;
  for (let y = VP.y0; y < VP.y1; y++) for (let x = VP.x0; x < VP.x1; x++) {
    if (ACCENT.has(idxAt(x, y))) { cnt++; minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
  }
  console.log(`\naccent/window px = ${cnt}, extent x[${minx}..${maxx}] y[${miny}..${maxy}]`);
  c.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
