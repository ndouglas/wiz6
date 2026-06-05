/**
 * maze-corridor-tables.ts — probe the NIGHTLY core (committed maze-corridor.state)
 * for the OR-blit placement (cs:[0x190]) + image-descriptor (cs:[0x18e]) tables and
 * the placement-walk source segment, WITHOUT tracing (the nightly core has no
 * trace/capture). We locate the relocated ega.drv copy by byte-signature search.
 *
 * Usage: pnpm tsx tools/libretro/maze-corridor-tables.ts
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const STATE = resolve('tools/libretro/states/maze-corridor.state');
// The OR-store plane-0 inner loop body: `lodsb; or al,es:[di]; stosb` = AC 26 0A 05 AA
const OR_SIG = 'ac260a05aa';
const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);

async function main() {
  const c = new HostClient();
  await c.step(3000);
  await c.unserialize(STATE);
  await c.step(2);

  const base = await c.anchor(); // DGROUP phys
  const gs = u16(await c.read(base + 0x363a, 2), 0);
  const facing = u16(await c.read(base + 0x4f9a, 2), 0);
  const gx = u16(await c.read(base + 0x4fa4, 2), 0);
  const gy = u16(await c.read(base + 0x4fa2, 2), 0);
  console.log(`DGROUP base=0x${base.toString(16)} game_state=${gs} facing=${facing} gx=${gx} gy=${gy}`);

  // Find the OR-store body byte-signature in RAM. file offset of that body is 0xb31
  // (the plane-0 store start). The lodsb-or-stosb is at file 0xb2d. The signature
  // AC 26 0A 05 AA is at file 0xb2d. So reloc base = phys(sig) - 0xb2d.
  const sigPhys = await c.find(OR_SIG);
  console.log(`OR-store signature ${OR_SIG} @ phys 0x${sigPhys.toString(16)}`);
  if (sigPhys < 0) { console.log('NOT FOUND — the OR-blit code is not resident in this state'); c.close(); return; }
  const relocBase = sigPhys - 0xb2d;
  console.log(`derived ega.drv reloc base = 0x${relocBase.toString(16)} (entry15 = +0xa93 = 0x${(relocBase + 0xa93).toString(16)})`);

  // cs:[N] lives at lin relocBase + N (CS = relocBase>>4 in a clean alignment).
  // But relocBase need not be 16-aligned; cs:[0x149] etc. are *code-segment*
  // relative. Read the table-base words from relocBase + N.
  const tbl = await c.read(relocBase + 0x140, 0x60);
  const seg149 = u16(tbl, 0x149 - 0x140);
  const seg14d = u16(tbl, 0x14d - 0x140);
  const off18e = u16(tbl, 0x18e - 0x140);
  const off190 = u16(tbl, 0x190 - 0x140);
  console.log(`cs:[0x149]=0x${seg149.toString(16)} (src ds) cs:[0x14d]=0x${seg14d.toString(16)} (page es)`);
  console.log(`cs:[0x18e]=0x${off18e.toString(16)} (imgdesc off) cs:[0x190]=0x${off190.toString(16)} (placement off)`);

  // Tables live in ds = cs:[0x149]. Dump both (large).
  const dsBase = seg149 << 4;
  const descTbl = await c.read(dsBase + off18e, 0x800);
  const placeTbl = await c.read(dsBase + off190, 0x800);
  writeFileSync('/tmp/wiz6-corridor-desctbl.bin', Buffer.from(descTbl));
  writeFileSync('/tmp/wiz6-corridor-placetbl.bin', Buffer.from(placeTbl));
  console.log('\nimage-desc table (5-byte recs) first 16:');
  for (let i = 0; i < 16; i++) {
    const o = i * 5;
    console.log(`  imgdesc[${i}] segDelta=0x${u16(descTbl, o).toString(16)} srcOff=0x${u16(descTbl, o + 2).toString(16)} w=${descTbl[o + 4]}`);
  }
  console.log('\nplacement table (5-byte recs) first 24:');
  for (let i = 0; i < 24; i++) {
    const o = i * 5;
    console.log(`  place[${i}] img=${placeTbl[o]} destX=${placeTbl[o + 1]} destRow=${placeTbl[o + 2]} bias=${placeTbl[o + 3]} count=${placeTbl[o + 4]}`);
  }

  // Dump the placement-walk source seg (ds=cs:[0x149]) - the work buffer (settled).
  const srcSeg = await c.read(dsBase, 0x10000);
  writeFileSync('/tmp/wiz6-corridor-srcseg.bin', Buffer.from(srcSeg));
  console.log(`\ndumped src seg 0x${seg149.toString(16)} (64K) -> /tmp/wiz6-corridor-srcseg.bin`);

  writeFileSync('/tmp/wiz6-corridor-tables-meta.json', JSON.stringify({
    base, gs, facing, gx, gy, sigPhys, relocBase, seg149, seg14d, off18e, off190,
  }, null, 2));
  c.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
