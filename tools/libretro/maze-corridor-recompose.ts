/**
 * maze-corridor-recompose.ts — on the NIGHTLY core + committed maze-corridor.state,
 * trigger a recompose (held-enter forward attempt) and poll the placement table at
 * the resident OR-blit copy after each small step, to see if cs:[0x190] becomes
 * populated (the table is written during the OR-blit walk). The resident copy base
 * is found via the OR-store sig (plane-0 loop = first sig hit, base = sig - 0xb2d).
 */
import { resolve } from 'node:path';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const STATE = resolve('tools/libretro/states/maze-corridor.state');
const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);

async function readTables(c: HostClient, relocBase: number) {
  const tbl = await c.read(relocBase + 0x140, 0x60);
  const seg149 = u16(tbl, 0x149 - 0x140);
  const off18e = u16(tbl, 0x18e - 0x140);
  const off190 = u16(tbl, 0x190 - 0x140);
  let nonzero = 0;
  try {
    const place = await c.read((seg149 << 4) + off190, 5 * 200);
    for (let i = 0; i < 200; i++) if (place[i * 5 + 4]) nonzero++;
  } catch { /* unmapped */ }
  return { seg149, off18e, off190, nonzero };
}

async function main() {
  const c = new HostClient();
  await c.step(3000);
  await c.unserialize(STATE);
  await c.step(2);

  const sigPhys = await c.find('ac260a05aa');
  const relocBase = sigPhys - 0xb2d;
  console.log(`reloc base 0x${relocBase.toString(16)}`);
  console.log('settled tables:', await readTables(c, relocBase));

  // Trigger a recompose by holding enter (forward) and poll the tables every step.
  await c.key('enter', 'down');
  for (let i = 0; i < 30; i++) {
    await c.step(2);
    const t = await readTables(c, relocBase);
    if (t.nonzero > 0) { console.log(`step ${i}: POPULATED`, t); break; }
    if (i % 5 === 0) console.log(`step ${i}:`, t);
  }
  await c.key('enter', 'up');
  console.log('after release:', await readTables(c, relocBase));
  c.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
