/**
 * probe-tile-atlas.ts — resolve the per-tile descriptor-table + atlas segments
 * via the resident ega.drv FUN_1c94 selection (cs:[0x169] + cs:[0x17a+2*tile]),
 * for #079 tile-0/1 atlas extraction.
 *
 * The PATCHED tracing core cannot unserialize the committed states (err unser),
 * so we DRIVE A FRESH BOOT to the corridor (driveToMaze), trace FUN_1c94 (the
 * relocated compositor entry), read cs from a hit, then resolve cs:[0x169]
 * (atlas base seg) + cs:[0x17a+2*tile] (per-tile desc-table pointer) for ALL 8
 * tile slots and dump each segment (0x4000 bytes) for offline decode + validation.
 *
 * Usage: pnpm tsx tools/libretro/probe-tile-atlas.ts [outdir]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const OUTDIR = process.argv[2] ?? '/tmp/tile-atlas';

const RENDER_SIG = '558bec83c4f056a1a44f8946fea1a24f';
const SIG_OFFSET = 0x4ad7;
const FWD = 'enter';

function u16(b: Uint8Array, o: number): number { return (b[o]! | (b[o + 1]! << 8)) & 0xffff; }

async function driveToMaze(c: HostClient): Promise<void> {
  await c.step(3000);
  await c.key('enter', 'tap'); await c.step(800);
  for (let i = 0; i < 3; i++) {
    await c.key('enter', 'tap'); await c.step(60);
    await c.key('enter', 'tap'); await c.step(60);
    await c.key('up', 'tap'); await c.key('up', 'tap'); await c.key('up', 'tap');
    await c.step(60);
  }
  await c.key('down', 'tap'); await c.key('down', 'tap'); await c.key('down', 'tap');
  await c.step(60);
  await c.key('enter', 'tap'); await c.step(200);
  await c.key('enter', 'tap'); await c.step(200);
  await c.key('enter', 'tap'); await c.step(400);
  for (let i = 0; i < 6; i++) {
    await c.key('enter', 'down'); await c.step(20);
    await c.key('enter', 'up'); await c.step(60);
  }
}

async function forceRedraw(c: HostClient): Promise<void> {
  await c.key(FWD, 'down'); await c.step(20);
  await c.key(FWD, 'up'); await c.step(60);
}

async function main(): Promise<void> {
  mkdirSync(OUTDIR, { recursive: true });
  const c = new HostClient();
  try {
    console.log('driving to maze (fresh boot)…');
    await driveToMaze(c);
    const sigPhys = await c.find(RENDER_SIG);
    if (sigPhys < 0) throw new Error('render sig not found — not in maze view');
    const ovl = sigPhys - SIG_OFFSET;
    console.log(`OVL base = 0x${ovl.toString(16)}`);

    // Locate the relocated FUN_1c94 entry (heap-dependent; documented value
    // 0x6d6a4). Probe a small candidate set per 0x1000-aligned relocated base.
    let entryRecs: Awaited<ReturnType<HostClient['traceDrain']>> = [];
    let ENTRY = 0;
    for (const cand of [0x6d6a4, 0x6c6a4, 0x6e6a4, 0x6b6a4, 0x6f6a4, 0x6a6a4]) {
      await c.traceSet(cand); await c.traceDrain();
      await forceRedraw(c);
      const recs = await c.traceDrain(); await c.traceOff();
      if (recs.length > 0) { entryRecs = recs; ENTRY = cand; break; }
    }
    if (ENTRY === 0) throw new Error('FUN_1c94 entry not found at candidates');
    console.log(`FUN_1c94 entry = 0x${ENTRY.toString(16)}  hits=${entryRecs.length}`);

    const cs = entryRecs[0]!.cs;
    console.log(`cs = 0x${cs.toString(16)} (cs<<4 = 0x${(cs << 4).toString(16)})`);

    // cs:[0x169]/cs:[0x17a] are VOLATILE in the transient copy: capture them
    // DURING the first FUN_1c94 hit (capture-on-breakpoint at the entry), not at
    // idle. Capture a window of the cs segment covering 0x169..0x18a.
    await c.traceSet(ENTRY); await c.captureSet((cs << 4) + 0x160, 0x40, 0);
    await forceRedraw(c);
    const csWin = (await c.captureGet())!; await c.traceOff();
    const atlasBaseSeg = u16(csWin, 0x169 - 0x160);
    console.log(`cs:[0x169] atlas base seg = 0x${atlasBaseSeg.toString(16)} (captured at hit)`);
    const tileSegs: number[] = [];
    for (let t = 0; t < 8; t++) {
      const ptr = u16(csWin, 0x17a - 0x160 + 2 * t);
      const seg = (atlasBaseSeg + ptr) & 0xffff;
      tileSegs[t] = seg;
      console.log(`  tile ${t}: cs:[0x17a+${2 * t}]=0x${ptr.toString(16)} -> descSeg 0x${seg.toString(16)} (lin 0x${(seg << 4).toString(16)})`);
    }

    // Cross-check: capture the resolved ds (after mov ds,bx) per call + tile arg.
    const AFTER_DS = ENTRY + (0x1cc9 - 0x1c94);
    await c.traceSet(AFTER_DS); await c.traceDrain();
    await forceRedraw(c);
    const dsRecs = await c.traceDrain(); await c.traceOff();
    const dsSegs = dsRecs.map((r) => r.ds);
    console.log(`resolved ds per call: ${dsSegs.map((s) => '0x' + s.toString(16)).join(' ')}`);

    // Dump each tile segment, CAPTURED ON BREAKPOINT during the first FUN_1c94
    // hit (the descriptor table + atlas are valid in 0x514e only at that moment;
    // an idle read returns stale/overwritten bytes — the documented staleness).
    const dumpSegAtHit = async (seg: number, label: string) => {
      if (seg === 0) return;
      await c.traceSet(ENTRY); await c.captureSet(seg << 4, 0x4000, 0);
      await forceRedraw(c);
      let buf: Uint8Array | null = null;
      try { buf = await c.captureGet(); } catch { buf = null; }
      await c.traceOff();
      if (!buf) { console.log(`  ${label} seg 0x${seg.toString(16)}: capture failed`); return; }
      const path = `${OUTDIR}/${label}-seg${seg.toString(16)}.bin`;
      writeFileSync(path, Buffer.from(buf));
      const d: string[] = [];
      for (let p = 1; p <= 8; p++) {
        const o = (p - 1) * 0x18;
        d.push(`p${p}:src=0x${u16(buf, o).toString(16)},w=${buf[o + 2]},h=${buf[o + 3]}`);
      }
      console.log(`  ${label} seg 0x${seg.toString(16)}: ${d.join(' ')}`);
    };
    for (let t = 0; t < 8; t++) await dumpSegAtHit(tileSegs[t]!, `tile${t}`);
    writeFileSync(`${OUTDIR}/meta.json`, JSON.stringify({ ovl, cs, atlasBaseSeg, tileSegs, dsSegs }, null, 2));
    console.log(`artifacts in ${OUTDIR}`);
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
