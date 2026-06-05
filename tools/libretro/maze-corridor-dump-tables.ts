/**
 * maze-corridor-dump-tables.ts — dump the FULL placement + image-descriptor tables
 * from the resident OR-blit copy (base 0x6a1b0) on the nightly core + committed
 * maze-corridor.state, plus the placement-walk source segment (cs:[0x149]). Then
 * REPLAY the OR-blit walk offline (composeBackground) using the source seg as the
 * work buffer, and compare the resulting page's viewport vs the committed oracle.
 *
 * This tests whether the SETTLED state retains a usable placement table + source
 * work buffer (the deterministic, no-trace route).
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
const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);

async function main() {
  const oracle = new Uint8Array(gunzipSync(readFileSync(FIX)));
  const c = new HostClient();
  await c.step(3000);
  await c.unserialize(STATE);
  await c.step(2);

  const sigPhys = await c.find('ac260a05aa');
  const relocBase = sigPhys - 0xb2d;
  const tbl = await c.read(relocBase + 0x140, 0x60);
  const seg149 = u16(tbl, 0x149 - 0x140);
  const seg14d = u16(tbl, 0x14d - 0x140);
  const off18e = u16(tbl, 0x18e - 0x140);
  const off190 = u16(tbl, 0x190 - 0x140);
  console.log(`base=0x${relocBase.toString(16)} cs149=0x${seg149.toString(16)} cs14d=0x${seg14d.toString(16)} off18e=0x${off18e.toString(16)} off190=0x${off190.toString(16)}`);

  const dsBase = seg149 << 4;
  const place = await c.read(dsBase + off190, 5 * 400);
  const desc = await c.read(dsBase + off18e, 5 * 256);
  writeFileSync('/tmp/wiz6-corridor-place.bin', Buffer.from(place));
  writeFileSync('/tmp/wiz6-corridor-desc.bin', Buffer.from(desc));

  // List populated placement records (count>0).
  const placements: Array<{ idx: number; img: number; destX: number; destRow: number; bias: number; count: number }> = [];
  for (let i = 0; i < 400; i++) {
    const o = i * 5;
    const count = place[o + 4]!;
    if (count > 0) placements.push({ idx: i, img: place[o]!, destX: place[o + 1]!, destRow: place[o + 2]!, bias: place[o + 3]!, count });
  }
  console.log(`populated placement records: ${placements.length}`);
  for (const p of placements.slice(0, 40)) {
    const o = p.img * 5;
    console.log(`  place[${p.idx}] img=${p.img} dX=${p.destX} dR=${p.destRow} bias=${p.bias} cx=${p.count}  ->imgdesc{segDelta=0x${u16(desc, o).toString(16)} srcOff=0x${u16(desc, o + 2).toString(16)} w=${desc[o + 3]} h=${desc[o + 4]}}`);
  }

  // Read all source segs referenced (seg149 + segDelta) — full 64K each.
  const segs = new Set<number>();
  for (const p of placements) segs.add((seg149 + u16(desc, p.img * 5)) & 0xffff);
  console.log('source segs:', [...segs].map((s) => '0x' + s.toString(16)).join(' '));
  const segBuf = new Map<number, Uint8Array>();
  for (const seg of segs) {
    const b = new Uint8Array(0x10000);
    for (let off = 0; off < 0x10000; off += 0x8000) {
      const part = await c.read((seg << 4) + off, Math.min(0x8000, 0x10000 - off));
      b.set(part, off);
    }
    segBuf.set(seg, b);
  }

  // REPLAY the OR-blit walk offline. ds = seg149 + segDelta (the actual segment).
  const page = new Uint8Array(4 * PS);
  for (const p of placements) {
    const o = p.img * 5;
    const segDelta = u16(desc, o);
    const srcOff = u16(desc, o + 2);
    const w = desc[o + 3]!;
    const h = desc[o + 4]!;
    const planeStride = w * h;
    const src = segBuf.get((seg149 + segDelta) & 0xffff)!;
    const di = p.destX + p.bias + ROWB * p.destRow;
    const si = srcOff + p.bias;
    for (let row = 0; row < h; row++) {
      for (let pl = 0; pl < 4; pl++) {
        const sBase = si + row * w + pl * planeStride;
        const dBase = di + row * ROWB + pl * PS;
        for (let b = 0; b < p.count; b++) page[dBase + b]! |= src[sBase + b]!;
      }
    }
  }
  writeFileSync('/tmp/wiz6-corridor-replay-page.bin', Buffer.from(page));

  // decode replay viewport -> COMPOSED-space idx, compare vs oracle viewport.
  const idxAt = (x: number, y: number) => {
    const off = y * ROWB + (x >> 3); const bit = 7 - (x & 7); let v = 0;
    for (let pl = 0; pl < 4; pl++) v |= ((page[off + pl * PS]! >> bit) & 1) << pl;
    return v;
  };
  let match = 0, tot = 0;
  const diffs: string[] = [];
  for (let y = VP.y0; y < VP.y1; y++) for (let x = VP.x0; x < VP.x1; x++) {
    tot++; const v = idxAt(x, y); const ov = oracle[y * W + x]!;
    if (v === ov) match++; else if (diffs.length < 30) diffs.push(`(${x},${y}) got${v} want${ov}`);
  }
  console.log(`\nREPLAY page viewport vs oracle: ${match}/${tot} = ${(100 * match / tot).toFixed(3)}%`);
  if (diffs.length) console.log('first diffs:', diffs.join('  '));
  // hist of replay
  const h: Record<number, number> = {};
  for (let y = VP.y0; y < VP.y1; y++) for (let x = VP.x0; x < VP.x1; x++) { const v = idxAt(x, y); h[v] = (h[v] ?? 0) + 1; }
  console.log('replay viewport idx hist:', JSON.stringify(h));
  c.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
