/**
 * probe-maze-poke.ts — test arbitrary-view capture by POKING the party position
 * (DGROUP facing 0x4f9a / z 0x4f9c / cellA 0x4f9e / cellB 0x4fa0 / gy 0x4fa2 /
 * gx 0x4fa4) + stepping (the maze rebuilds every frame from these). Region 0 of
 * level-0: gxBase=120, gyBase=116 → cellB = gx-120 (×1 axis), cellA = gy-116 (×8).
 * If pokes STICK + render the target view, this gives any (cell,facing) without
 * the (unreliable) scripted-entry navigation.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

const FACING = 0x4f9a, Z = 0x4f9c, CELLA = 0x4f9e, CELLB = 0x4fa0, GY = 0x4fa2, GX = 0x4fa4;
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
const w16 = async (c: HostClient, base: number, off: number, v: number) => c.write(base + off, [v & 0xff, (v >> 8) & 0xff]);
async function readParty(c: HostClient) {
  const p = await c.read((await c.anchor()) + FACING, 12);
  return { facing: u16(p, 0), z: u16(p, 2), cellA: u16(p, 4), cellB: u16(p, 6), gy: u16(p, 8), gx: u16(p, 10) };
}

async function driveToMaze(c: HostClient) {
  await c.step(3000);
  await c.key('enter', 'tap'); await c.step(800);
  for (let i = 0; i < 3; i++) { await c.key('enter', 'tap'); await c.step(60); await c.key('enter', 'tap'); await c.step(60); for (let k = 0; k < 3; k++) await c.key('up', 'tap'); await c.step(60); }
  await c.key('down', 'tap'); await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(60);
  await c.key('enter', 'tap'); await c.step(200); await c.key('enter', 'tap'); await c.step(200); await c.key('enter', 'tap'); await c.step(400);
  for (let i = 0; i < 8; i++) { await c.key('enter', 'down'); await c.step(20); await c.key('enter', 'up'); await c.step(60); }
}

async function pokeCap(c: HostClient, name: string, gx: number, gy: number, facing: number, z = 0) {
  const base = await c.anchor();
  await w16(c, base, FACING, facing); await w16(c, base, Z, z);
  await w16(c, base, CELLA, gy - 116); await w16(c, base, CELLB, gx - 120);
  await w16(c, base, GY, gy); await w16(c, base, GX, gx);
  await c.step(4); // let the maze rebuild from the poked party
  const after = await readParty(c);
  await c.fb(`/tmp/pk-${name}.rgba`);
  writeFileSync(`/tmp/pk-${name}.png`, encodePngRgba(320, 200, readFileSync(`/tmp/pk-${name}.rgba`)));
  const stuck = after.gx === gx && after.gy === gy && after.facing === facing;
  console.log(`${name}: poked gx${gx} gy${gy} f${facing} → readback ${JSON.stringify(after)} ${stuck ? 'STUCK✓' : 'SNAPPED-BACK✗'}`);
}

async function main() {
  const c = new HostClient();
  try {
    await driveToMaze(c);
    console.log('reached:', JSON.stringify(await readParty(c)));
    // Head-on views (party at gy−1 facing N=0) of each distinct region-0 special4
    // decoration code, to identify the fountain. Plus a plain corridor baseline.
    await pokeCap(c, 'plain-corridor', 127, 117, 0);    // no special4 ahead (baseline)
    await pokeCap(c, 'sp7-at126gy118', 126, 117, 0);    // special4=7 ahead (gx126,gy118)
    await pokeCap(c, 'sp9-at125gy119', 125, 118, 0);    // special4=9 ahead (gx125,gy119)
    await pokeCap(c, 'sp1-at125gy118', 125, 117, 0);    // special4=1 ahead (gx125,gy118)
    await pokeCap(c, 'sp3-at124gy122', 124, 121, 0);    // special4=3 ahead (gx124,gy122)
    await pokeCap(c, 'sp7-on126gy120', 126, 120, 0);    // standing IN a special4=7 cell
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
