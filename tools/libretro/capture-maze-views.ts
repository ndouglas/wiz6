/**
 * capture-maze-views.ts — Stage 1 of the dungeon-renderer RE: from the reached
 * free-roam corridor (driveToMaze), navigate to a SET of distinct (cell,facing)
 * views and capture each framebuffer + party position, on the PATCHED core. The
 * catalog + frames seed the placement-capture (Stage 2) + generation-law RE
 * (Stage 3). Held-input (down/step/up) is the reliable maze drive (matches
 * trace-maze.ts forceRedraw).
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

const FACING = 0x4f9a; // facing(0) z(+2) cellA(+4) cellB(+6) gy(+8) gx(+10)
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
async function party(c: HostClient) {
  const p = await c.read((await c.anchor()) + FACING, 12);
  return { facing: u16(p, 0), z: u16(p, 2), cellA: u16(p, 4), cellB: u16(p, 6), gy: u16(p, 8), gx: u16(p, 10) };
}
const held = async (c: HostClient, k: string) => { await c.key(k, 'down'); await c.step(20); await c.key(k, 'up'); await c.step(60); };

async function driveToMaze(c: HostClient) {
  await c.step(3000);
  await c.key('enter', 'tap'); await c.step(800);
  for (let i = 0; i < 3; i++) { await c.key('enter', 'tap'); await c.step(60); await c.key('enter', 'tap'); await c.step(60); for (let k = 0; k < 3; k++) await c.key('up', 'tap'); await c.step(60); }
  await c.key('down', 'tap'); await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(60);
  await c.key('enter', 'tap'); await c.step(200);
  await c.key('enter', 'tap'); await c.step(200);
  await c.key('enter', 'tap'); await c.step(400);
  for (let i = 0; i < 6; i++) { await c.key('enter', 'down'); await c.step(20); await c.key('enter', 'up'); await c.step(60); }
}

async function main() {
  const c = new HostClient();
  try {
    await driveToMaze(c);
    const catalog: Record<string, unknown> = {};
    const cap = async (name: string) => {
      const p = await party(c);
      await c.fb(`/tmp/mv-${name}.rgba`);
      writeFileSync(`/tmp/mv-${name}.png`, encodePngRgba(320, 200, readFileSync(`/tmp/mv-${name}.rgba`)));
      catalog[name] = p;
      console.log(`${name}: ${JSON.stringify(p)}`);
    };
    // The reached forward view, then turns (look around at the start cell), then
    // forward steps (corridor depth), then a turn-around (look back).
    await cap('00-start');
    await held(c, 'left'); await cap('01-left');          // face west (toward gx126 decorations)
    await held(c, 'left'); await cap('02-back');           // face south (look back to entrance)
    await held(c, 'left'); await cap('03-right');          // face east
    await held(c, 'left'); await cap('04-fwd0');           // back to start facing
    for (let i = 1; i <= 4; i++) { await held(c, 'up'); await cap(`05-fwd${i}`); }
    // Turn at the deepest reached cell to vary facing+walls.
    await held(c, 'left'); await cap('06-deep-left');
    await held(c, 'right'); await held(c, 'right'); await cap('07-deep-right');
    writeFileSync('/tmp/mv-catalog.json', JSON.stringify(catalog, null, 2));
    console.log(`\ncaptured ${Object.keys(catalog).length} views → /tmp/mv-*.png + /tmp/mv-catalog.json`);
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
