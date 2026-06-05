/**
 * validate-floor-ceiling.ts — capture the maze floor/ceiling/window OR-blit walk
 * live (ega.drv entry 15 = FUN_0a93, reloc base 0x6ba10) and validate the offline
 * decoder (tools/parity/decode-floor-ceiling.ts composeBackground) reproduces the
 * engine's background page BYTE-EXACT.
 *
 * Requires the PATCHED trace core (tools/libretro/build-core.sh) + a prior
 * `trace-maze.ts reach` (writes /tmp/wiz6-maze-clean.state). After RE, restore the
 * nightly core with fetch-core.sh.
 *
 * WALK SUMMARY (asm-confirmed): per PLACEMENT record the engine OR-merges one
 * 4-plane planar sub-image into the page: cx bytes/row, w-byte src row stride,
 * planeStride=w*h plane jump, 0x28 dest row stride, 0x2000 dest plane stride. The
 * source segment is a PER-GROUP WORK BUFFER (re-decoded per image via the .pic RLE
 * decoder), so it must be snapshotted at each image's first store, not settled.
 *
 * We isolate ONE recompose pass (the held-ENTER move runs the OR-blit ~3x), capture
 * each image's (w, planeStride, cx, si, di, ds) + its per-group source snapshot +
 * the background-only page at the pass's last OR store, then replay via the offline
 * decoder and compare byte-exact over the OR-written viewport bytes.
 *
 * RESULT (corridor-at-gate view, ceiling+floor+central portcullis window):
 *   99.93% byte-exact (4458/4461 OR-written viewport bytes; 3 residual px =
 *   per-group source-snapshot timing).
 */
import { writeFileSync, existsSync } from 'node:fs';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { composeBackground, type PlacedImage } from '../parity/decode-floor-ceiling.js';

const CLEAN_STATE = '/tmp/wiz6-maze-clean.state';
const BASE = 0x6ba10;
const PT = BASE + 0xb2c;       // OR-blit per-row inner-loop entry (cx,si,di,ds,bp ready)
const OR_P0 = BASE + 0xb2d;    // OR-blit plane-0 byte store (count = sum of cx)
const PS = 0x2000, ROWB = 40, W = 320;
const VP = { x0: 72, x1: 248, y0: 32, y1: 144 };
const NCH = 14, CH = 4;
const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);

async function recompose(c: HostClient, drainEach?: (frame: number) => Promise<void>) {
  await c.key('enter', 'down');
  for (let i = 0; i < NCH; i++) { await c.step(CH); if (drainEach) await drainEach(i); if (i === 10) await c.key('enter', 'up'); }
  await c.key('enter', 'up');
}

interface RowRec { ds: number; si: number; di: number; cx: number; bp: number; ss: number; }

async function main() {
  if (!existsSync(CLEAN_STATE)) throw new Error('run `trace-maze.ts reach` first');
  const c = new HostClient();
  await c.step(3000);

  // 1) capture the per-row walk over the recompose.
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(PT); await c.traceDrain();
  const rows: RowRec[] = [];
  await recompose(c, async () => {
    const recs = await c.traceDrain();
    for (const r of recs) rows.push({ ds: r.ds, si: r.esi & 0xffff, di: r.edi & 0xffff, cx: r.ecx & 0xffff, bp: r.ebp & 0xffff, ss: r.ss });
  });
  await c.traceOff();

  // isolate pass 1 (first recompose): rows up to the first repeat of row 0.
  const fd = rows[0]!.di, fs = rows[0]!.ds;
  let end = rows.length;
  for (let i = 1; i < rows.length; i++) if (rows[i]!.di === fd && rows[i]!.ds === fs) { end = i; break; }
  const pass1 = rows.slice(0, end);
  console.log(`captured ${rows.length} OR rows; pass1 = ${pass1.length} rows`);

  // group into images (contiguous di+=0x28, same ds, si advancing).
  interface Img { ds: number; rows: RowRec[]; startIdx: number; w: number; planeStride: number; }
  const imgs: Img[] = []; let cur: Img | null = null;
  for (let k = 0; k < pass1.length; k++) {
    const r = pass1[k]!; const prev = cur && cur.rows.length ? cur.rows[cur.rows.length - 1]! : null;
    const contig = cur && prev && r.ds === cur.ds && (r.di - prev.di) === ROWB && (r.si - prev.si) > 0;
    if (!contig) { if (cur) imgs.push(cur); cur = { ds: r.ds, rows: [r], startIdx: k, w: 0, planeStride: 0 }; }
    else cur!.rows.push(r);
  }
  if (cur) imgs.push(cur);
  console.log(`pass1 grouped into ${imgs.length} placed images`);

  // 2) capture w ([bp-6]) + planeStride ([bp-2]) per image (its first store).
  for (const im of imgs) {
    const r = im.rows[0]!;
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.traceSet(PT); await c.captureSet((r.ss << 4) + ((r.bp - 8) & 0xffff), 0x10, im.startIdx);
    await recompose(c); const win = await c.captureGet(); await c.traceOff();
    im.w = u16(win!, 2); im.planeStride = u16(win!, 6);
  }

  // 3) per-group source snapshot (the work buffer at each image's FIRST store).
  const snaps = new Map<number, Uint8Array>();
  for (let gi = 0; gi < imgs.length; gi++) {
    const im = imgs[gi]!;
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.traceSet(PT); await c.captureSet(im.ds << 4, 0x4000, im.startIdx);
    await recompose(c); snaps.set(gi, (await c.captureGet())!); await c.traceOff();
  }

  // 4) background-only page = page at the LAST OR plane-0 byte store of pass1.
  const orStoresPass1 = pass1.reduce((a, r) => a + r.cx, 0);
  const bg = new Uint8Array(0x8000);
  for (let p = 0; p < 4; p++) {
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.traceSet(OR_P0); await c.captureSet(0x41820 + p * PS, PS, orStoresPass1 - 1);
    await recompose(c); bg.set((await c.captureGet())!.subarray(0, PS), p * PS); await c.traceOff();
  }
  c.close();

  // 5) build the PlacedImage list and replay via the OFFLINE DECODER.
  const placed: PlacedImage[] = [];
  for (let gi = 0; gi < imgs.length; gi++) {
    const im = imgs[gi]!; const src = snaps.get(gi)!;
    if (!src || src.length < 0x4000) continue;
    placed.push({ src, si: im.rows[0]!.si, di: im.rows[0]!.di, cx: im.rows[0]!.cx, w: im.w, h: im.rows.length, planeStride: im.planeStride });
  }
  const replay = new Uint8Array(0x8000);
  composeBackground(replay, placed);

  // Commit a self-contained asset fixture: per-image placement metadata + the
  // (sliced) per-group source snapshots + the bg oracle. This lets the offline
  // decoder be validated deterministically WITHOUT the emulator (the live capture
  // has run-to-run timing variance in which recompose pass it snapshots).
  const FIXDIR = process.argv[2] ?? '/tmp/wiz6-orblit-fixture';
  const { mkdirSync } = await import('node:fs');
  mkdirSync(FIXDIR, { recursive: true });
  const fixImages = placed.map((p, gi) => {
    // slice the source to the bytes this image reads: si .. si+3*planeStride+ (h-1)*w + cx
    const need = p.si + 3 * p.planeStride + (p.h - 1) * p.w + p.cx;
    const slice = p.src.subarray(0, Math.min(p.src.length, Math.max(need, p.si + 4 * p.planeStride)));
    writeFileSync(`${FIXDIR}/src-${gi}.bin`, Buffer.from(slice));
    return { gi, si: p.si, di: p.di, cx: p.cx, w: p.w, h: p.h, planeStride: p.planeStride, srcLen: slice.length };
  });
  writeFileSync(`${FIXDIR}/placed.json`, JSON.stringify(fixImages, null, 2));
  writeFileSync(`${FIXDIR}/bg.bin`, Buffer.from(bg));
  writeFileSync('/tmp/wiz6-orblit-bg.bin', Buffer.from(bg));
  writeFileSync('/tmp/wiz6-orblit-replay.bin', Buffer.from(replay));
  console.log(`fixture -> ${FIXDIR} (${fixImages.length} images + bg.bin)`);

  // 6) byte-exact vs background-only over OR-written viewport bytes.
  const inVp = (o: number) => { const w = o % PS; const y = (w / ROWB) | 0; const xb = w % ROWB; return y >= VP.y0 && y < VP.y1 && xb >= (VP.x0 >> 3) && xb <= ((VP.x1 - 1) >> 3); };
  let tot = 0, bad = 0; const diffs: string[] = [];
  for (let o = 0; o < 0x8000; o++) {
    if (!inVp(o) || replay[o] === 0) continue;
    tot++;
    if (replay[o] !== bg[o]) { bad++; if (diffs.length < 24) { const w = o % PS; diffs.push(`p${(o / PS) | 0}(${(w % ROWB) * 8},${(w / ROWB) | 0})`); } }
  }
  console.log(`\nOFFLINE DECODER vs engine background page (OR-written viewport bytes):`);
  console.log(`  ${tot - bad}/${tot} = ${(100 * (tot - bad) / tot).toFixed(3)}% byte-exact (${bad} diff)`);
  if (diffs.length) console.log('  diffs:', diffs.join(' '));
}
main().catch((e) => { console.error(e); process.exit(1); });
