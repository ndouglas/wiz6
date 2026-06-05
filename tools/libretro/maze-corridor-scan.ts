/**
 * maze-corridor-scan.ts — scan ALL of guest RAM for every copy of the OR-blit
 * code (sig AC 26 0A 05 AA @ file 0xb2d) and, for each, read its cs:[0x149]/[0x14d]/
 * [0x18e]/[0x190] table words + a sample of the placement table, to find the
 * RELOCATED runtime copy whose tables are populated (non-zero placement records).
 */
import { resolve } from 'node:path';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const STATE = resolve('tools/libretro/states/maze-corridor.state');
const SIG = [0xac, 0x26, 0x0a, 0x05, 0xaa];
const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);

async function main() {
  const c = new HostClient();
  await c.step(3000);
  await c.unserialize(STATE);
  await c.step(2);

  // Scan RAM 0x10000..0x100000 in windows, find all sig occurrences.
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
  console.log(`found ${hits.length} OR-store sig copies:`, hits.map((h) => '0x' + h.toString(16)).join(' '));

  for (const sigPhys of hits) {
    const relocBase = sigPhys - 0xb2d;
    const tbl = await c.read(relocBase + 0x140, 0x60);
    const seg149 = u16(tbl, 0x149 - 0x140);
    const seg14d = u16(tbl, 0x14d - 0x140);
    const off18e = u16(tbl, 0x18e - 0x140);
    const off190 = u16(tbl, 0x190 - 0x140);
    // Read a few placement records from this copy's table.
    let nonzero = 0, sample = '';
    try {
      const place = await c.read((seg149 << 4) + off190, 200);
      for (let i = 0; i < 40; i++) {
        const o = i * 5;
        if (place[o + 4]) nonzero++;
        if (i < 6) sample += `[img${place[o]} dX${place[o + 1]} dR${place[o + 2]} b${place[o + 3]} c${place[o + 4]}]`;
      }
    } catch { sample = '(unmapped)'; }
    console.log(`base=0x${relocBase.toString(16)} cs149=0x${seg149.toString(16)} cs14d=0x${seg14d.toString(16)} off18e=0x${off18e.toString(16)} off190=0x${off190.toString(16)} nonzeroPlace=${nonzero} ${sample}`);
  }
  c.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
