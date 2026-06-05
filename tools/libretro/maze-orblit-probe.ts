/**
 * maze-orblit-probe.ts — crack the floor/ceiling/window OR-blit (ega.drv dispatch
 * entry 15 = FUN_0a93, relocated base 0x6ba10 -> entry lin 0x6c4a3, plane-0
 * OR-store at 0x6c541).
 *
 * The function walks a PLACEMENT table (cs:[0x190], 5-byte recs) -> IMAGE-descriptor
 * table (cs:[0x18e], 5-byte recs) -> 4-plane planar source sub-image, OR-merged
 * into the compose page. We capture the ACTUAL per-store register state (ds=source
 * seg, es=page seg, si, di, cx) at each plane-0 OR-store loop entry, plus the source
 * segments and the final compose page (the 100% oracle).
 *
 * Strategy: trace the plane-0 OR-store loop top (file 0xb2d = lin base+0xb2d).
 * Each store-loop iteration logs ds/es/si/di/cx. We reconstruct per-call groups
 * by di resets. Then capture each unique source seg + the oracle page.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const CLEAN_STATE = '/tmp/wiz6-maze-clean.state';
const PAGE = 0x41820, PS = 0x2000;
const BASE = 0x6ba10;          // wall-compositor / OR-blit reloc base
const ENTRY = BASE + 0xa93;    // 0x6c4a3
const ORLOOP = BASE + 0xb2d;   // plane-0 OR lodsb;or;stosb loop top
const VSTORE = 0x6c219;        // page->VRAM plane-0 store (oracle capture)
const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);

async function forceRedraw(c: HostClient) {
  await c.key('enter', 'down'); await c.step(20);
  await c.key('enter', 'up'); await c.step(60);
}

async function main() {
  if (!existsSync(CLEAN_STATE)) throw new Error('run `trace-maze.ts reach` first');
  const c = new HostClient();
  await c.step(3000);

  // 1) Trace the OR-blit ENTRY: capture each call's bp-frame ([bp+0xc]=placementIdx,
  //    [bp+0xe]=orFlag, [bp+0x10]=secondIdx) and ds/es.
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(ENTRY); await c.traceDrain();
  await forceRedraw(c);
  const entryRecs = await c.traceDrain(); await c.traceOff();
  console.log(`OR-blit entry 0x${ENTRY.toString(16)}: ${entryRecs.length} hits`);

  // 2) Trace the plane-0 OR-store loop: ds=source seg, es=page seg, si, di, cx.
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(ORLOOP); await c.traceDrain();
  await forceRedraw(c);
  const storeRecs = await c.traceDrain(); await c.traceOff();
  console.log(`OR-blit plane-0 store loop 0x${ORLOOP.toString(16)}: ${storeRecs.length} hits`);
  const stores = storeRecs.map((r) => ({
    ds: r.ds, es: r.es, si: r.esi & 0xffff, di: r.edi & 0xffff, cx: r.ecx & 0xffff,
  }));
  writeFileSync('/tmp/wiz6-orblit-stores.json', JSON.stringify(stores));
  // di range + seg distribution
  const dsSet = new Map<number, number>();
  let minDi = 1e9, maxDi = -1;
  for (const s of stores) { dsSet.set(s.ds, (dsSet.get(s.ds) ?? 0) + 1); minDi = Math.min(minDi, s.di); maxDi = Math.max(maxDi, s.di); }
  console.log('source ds segs at store loop:', [...dsSet.entries()].map(([k, v]) => `0x${k.toString(16)}:${v}`).join(' '));
  console.log(`store di range 0x${minDi.toString(16)}..0x${maxDi.toString(16)} (screen y ${Math.floor(minDi / 40)}..${Math.floor(maxDi / 40)})`);
  console.log('first 8 stores:', stores.slice(0, 8).map((s) => `ds${s.ds.toString(16)} si0x${s.si.toString(16)} di0x${s.di.toString(16)} cx${s.cx}`).join('  '));

  // 3) Dump every unique source seg (full 64K segment span captured in 0x8000 chunks).
  for (const seg of dsSet.keys()) {
    const buf = new Uint8Array(0x10000);
    for (let off = 0; off < 0x10000; off += 0x8000) {
      const part = await c.read((seg << 4) + off, 0x8000);
      buf.set(part.subarray(0, 0x8000), off);
    }
    writeFileSync(`/tmp/wiz6-orblit-src-${seg.toString(16)}.bin`, Buffer.from(buf));
    console.log(`dumped source seg 0x${seg.toString(16)} (64K) -> /tmp/wiz6-orblit-src-${seg.toString(16)}.bin`);
  }

  // 4) Read the cs:[...] table-base words from the relocated code segment. The
  //    relocated CS = BASE>>4 = 0x6ba1; cs:[N] lives at lin BASE + N.
  const tbl = await c.read(BASE + 0x140, 0x60);
  const seg149 = u16(tbl, 0x149 - 0x140);
  const seg14d = u16(tbl, 0x14d - 0x140);
  const off18e = u16(tbl, 0x18e - 0x140);
  const off190 = u16(tbl, 0x190 - 0x140);
  console.log(`\ncs:[0x149]=0x${seg149.toString(16)} (placement-walk ds) cs:[0x14d]=0x${seg14d.toString(16)} (page es)`);
  console.log(`cs:[0x18e]=0x${off18e.toString(16)} (image-desc tbl off) cs:[0x190]=0x${off190.toString(16)} (placement tbl off)`);

  // Tables live in ds=cs:[0x149]. Dump both.
  let descTbl: Uint8Array | null = null, placeTbl: Uint8Array | null = null;
  try {
    descTbl = await c.read((seg149 << 4) + off18e, 0x800);
    placeTbl = await c.read((seg149 << 4) + off190, 0x800);
    writeFileSync('/tmp/wiz6-orblit-desctbl.bin', Buffer.from(descTbl));
    writeFileSync('/tmp/wiz6-orblit-placetbl.bin', Buffer.from(placeTbl));
    console.log('image-desc table (5-byte recs) first 12:');
    for (let i = 0; i < 12; i++) {
      const o = i * 5;
      console.log(`  imgdesc[${i}] segDelta=0x${u16(descTbl, o).toString(16)} srcOff=0x${u16(descTbl, o + 2).toString(16)} w=${descTbl[o + 4]}`);
    }
  } catch (e) { console.log('table read failed:', (e as Error).message, '(seg149 may not be mapped; rely on store trace)'); }

  // Per-call frames (placement idx + flags) — needed to map placementIdx->image.
  const callFrames: Array<{ ds: number; es: number; placementIdx: number; orFlag: number; secondIdx: number }> = [];
  for (let k = 0; k < entryRecs.length; k++) {
    const r = entryRecs[k]!;
    const ssbase = r.ss << 4; const bp = (r.esp & 0xffff) - 2;
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.traceSet(ENTRY); await c.captureSet(ssbase + bp, 0x20, k);
    await forceRedraw(c);
    const win = await c.captureGet(); await c.traceOff();
    if (!win) continue;
    callFrames.push({ ds: r.ds, es: r.es, placementIdx: u16(win, 0xc), orFlag: u16(win, 0xe), secondIdx: u16(win, 0x10) });
  }

  // 5) Oracle page (final composed, via page->VRAM plane-0 store, last hit).
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(VSTORE); await c.traceDrain(); await forceRedraw(c);
  const nV = (await c.traceDrain()).length; await c.traceOff();
  const page = new Uint8Array(0x8000);
  for (let p = 0; p < 4; p++) {
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.traceSet(VSTORE); await c.captureSet(PAGE + p * PS, PS, nV - 1);
    await forceRedraw(c);
    const part = (await c.captureGet())!; await c.traceOff();
    page.set(part.subarray(0, PS), p * PS);
  }
  writeFileSync('/tmp/wiz6-orblit-page.bin', Buffer.from(page));
  await c.unserialize(CLEAN_STATE); await c.step(2); await forceRedraw(c);
  await c.fb('/tmp/wiz6-orblit-fb.fb');
  console.log(`\noracle page -> /tmp/wiz6-orblit-page.bin (${nV} vram plane0 stores); fb -> /tmp/wiz6-orblit-fb.fb`);

  writeFileSync('/tmp/wiz6-orblit-meta.json', JSON.stringify({
    BASE, ENTRY, ORLOOP, seg149, seg14d, off18e, off190,
    srcSegs: [...dsSet.keys()], storeCount: stores.length, nV,
    callFrames,
  }, null, 2));
  console.log('meta -> /tmp/wiz6-orblit-meta.json');
  c.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
