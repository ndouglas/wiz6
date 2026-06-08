/**
 * probe-second-narration.ts — after dismissing the "APPROACHING THE GATE"
 * narration, drive the scripted walk fully and watch for a SECOND narration
 * block (msg 10030-10035 "ENTRANCE CHAMBER") and whether ANY narration ever
 * renders over a solid-black background (the user's report).
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

const GAME_STATE = 0x363a, FACING = 0x4f9a;
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
async function fld(c: HostClient) {
  const base = await c.anchor();
  const pos = await c.read(base + FACING, 12);
  return { gs: u16(await c.read(base + GAME_STATE, 2), 0), facing: u16(pos, 0), gy: u16(pos, 8), gx: u16(pos, 10) };
}
function vpBlack(rgba: Uint8Array) {
  // Is the whole viewport rect (x64..216 y16..143) solid black?
  let nb = 0;
  for (let y = 16; y < 144; y++) for (let x = 64; x < 216; x++) {
    const p = (y * 320 + x) * 4; if ((rgba[p]! | rgba[p + 1]! | rgba[p + 2]!) !== 0) nb++;
  }
  return nb;
}
async function snap(c: HostClient, tag: string) {
  await c.fb(`/tmp/wiz6-sn-${tag}.rgba`);
  const rgba = readFileSync(`/tmp/wiz6-sn-${tag}.rgba`);
  writeFileSync(`/tmp/wiz6-sn-${tag}.png`, encodePngRgba(320, 200, rgba));
  const f = await fld(c);
  console.log(`[${tag.padEnd(14)}] gs=${f.gs} gy=${f.gy} facing=${f.facing} | vpNonblack=${vpBlack(rgba)}`);
}

async function main() {
  const c = new HostClient();
  try {
    await c.step(3000);
    await c.key('enter', 'tap'); await c.step(800);
    for (let i = 0; i < 6; i++) {
      await c.key('enter', 'tap'); await c.step(150);
      await c.key('enter', 'tap'); await c.step(150);
      await c.key('up', 'tap'); await c.key('up', 'tap'); await c.key('up', 'tap'); await c.key('up', 'tap'); await c.step(80);
    }
    await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(120);
    await c.key('enter', 'tap'); await c.step(400);   // START NEW GAME
    await c.key('enter', 'tap'); await c.step(250);   // magicword 1
    await c.key('enter', 'tap'); await c.step(250);   // magicword 2
    await c.key('enter', 'tap'); await c.step(300);   // magicword 3 → gs=5 + narration
    await snap(c, 'narration1');
    // Dismiss + walk: ENTER per step, snap each.
    for (let i = 1; i <= 10; i++) {
      await c.key('enter', 'tap'); await c.step(300);
      await snap(c, `walk${String(i).padStart(2, '0')}`);
    }
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
