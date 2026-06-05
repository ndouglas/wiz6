/**
 * maze-corridor-find-tables.ts — find the RELOCATED OR-blit code copy by its
 * cs:[0x14d] fingerprint. We know the page segment is 0x3ffc (page base 0x3ffc0).
 * The relocated copy stores cs:[0x14d]=0x3ffc. Scan RAM for the OR-store sig AND
 * verify the copy whose [base+0x14d] word == 0x3ffc; that copy's cs:[0x149]/[0x18e]/
 * [0x190] are the REAL table pointers. Dump + replay.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const STATE = resolve('tools/libretro/states/maze-corridor.state');
const PAGE_SEG = 0x3ffc; // page base 0x3ffc0 (found)
const SIG = [0xac, 0x26, 0x0a, 0x05, 0xaa];
const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);

async function main() {
  const c = new HostClient();
  await c.step(3000);
  await c.unserialize(STATE);
  await c.step(2);

  // collect all sig hits
  const hits: number[] = [];
  const WIN = 0x8000;
  for (let addr = 0x10000; addr < 0x9f000; addr += WIN - SIG.length) {
    const len = Math.min(WIN, 0x9f000 - addr);
    const buf = await c.read(addr, len);
    for (let i = 0; i + SIG.length <= buf.length; i++) {
      let ok = true;
      for (let k = 0; k < SIG.length; k++) if (buf[i + k] !== SIG[k]) { ok = false; break; }
      if (ok) hits.push(addr + i);
    }
  }
  // For each plausible base (sig - plane-loop offset), check cs:[0x14d]==PAGE_SEG.
  const planeOffs = [0xb2d, 0xb41, 0xb58, 0xb71];
  const bases = new Set<number>();
  for (const h of hits) for (const po of planeOffs) bases.add(h - po);
  console.log(`candidate bases: ${[...bases].map((b) => '0x' + b.toString(16)).join(' ')}`);
  let found = -1;
  for (const base of bases) {
    let w14d = 0;
    try { w14d = u16(await c.read(base + 0x14d, 2), 0); } catch { continue; }
    console.log(`base 0x${base.toString(16)} cs:[0x14d]=0x${w14d.toString(16)}${w14d === PAGE_SEG ? '  <== PAGE SEG MATCH' : ''}`);
    if (w14d === PAGE_SEG) found = base;
  }
  if (found < 0) {
    // Also scan RAM directly for the word 0x3ffc preceded by code that looks like the
    // table-base region — fallback: scan for any addr where [addr]=0x3ffc and
    // [addr-4]=src-seg and [addr+0x41]/[addr+0x43] are sane table offsets.
    console.log('\nNo sig-copy has cs:[0x14d]==page seg. The relocated copy may store');
    console.log('the page seg via a different mechanism (es set by caller, not cs:[0x14d]).');
    c.close();
    return;
  }
  const base = found;
  const seg149 = u16(await c.read(base + 0x149, 2), 0);
  const off18e = u16(await c.read(base + 0x18e, 2), 0);
  const off190 = u16(await c.read(base + 0x190, 2), 0);
  console.log(`\nREAL copy base=0x${base.toString(16)} cs149=0x${seg149.toString(16)} off18e=0x${off18e.toString(16)} off190=0x${off190.toString(16)}`);
  const dsBase = seg149 << 4;
  const place = await c.read(dsBase + off190, 5 * 400);
  const desc = await c.read(dsBase + off18e, 5 * 256);
  writeFileSync('/tmp/wiz6-corridor-place-real.bin', Buffer.from(place));
  writeFileSync('/tmp/wiz6-corridor-desc-real.bin', Buffer.from(desc));
  let n = 0;
  for (let i = 0; i < 400; i++) if (place[i * 5 + 4]) n++;
  console.log(`populated placement records: ${n}`);
  for (let i = 0; i < 30; i++) {
    const o = i * 5; if (!place[o + 4]) continue;
    const io = place[o]! * 5;
    console.log(`  place[${i}] img=${place[o]} dX=${place[o + 1]} dR=${place[o + 2]} bias=${place[o + 3]} cx=${place[o + 4]} -> {segDelta=0x${u16(desc, io).toString(16)} srcOff=0x${u16(desc, io + 2).toString(16)} w=${desc[io + 3]} h=${desc[io + 4]}}`);
  }
  c.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
