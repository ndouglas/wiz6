/**
 * probe-newgame-screens.ts — slow, one-ENTER-at-a-time walk of the START NEW
 * GAME flow from MASTER OPTIONS, with a PNG + digest after each press. Resolves
 * the magicword/copy-protection screen and the black-vs-gate question.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

const GAME_STATE = 0x363a, FACING = 0x4f9a;
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
async function fld(c: HostClient) {
  const base = await c.anchor();
  const g = u16(await c.read(base + GAME_STATE, 2), 0);
  const pos = await c.read(base + FACING, 12);
  return { gs: g, facing: u16(pos, 0), gy: u16(pos, 8), gx: u16(pos, 10) };
}
function digest(rgba: Uint8Array) {
  const W = 320, H = 200; let vp = 0, strip = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * 4; const nb = (rgba[p]! | rgba[p + 1]! | rgba[p + 2]!) !== 0;
    if (y < 144) { if (nb) vp++; } else { if (nb) strip++; }
  }
  return { vp, strip };
}
async function snap(c: HostClient, tag: string) {
  await c.fb(`/tmp/wiz6-ng-${tag}.rgba`);
  const rgba = readFileSync(`/tmp/wiz6-ng-${tag}.rgba`);
  writeFileSync(`/tmp/wiz6-ng-${tag}.png`, encodePngRgba(320, 200, rgba));
  const d = digest(rgba); const f = await fld(c);
  console.log(`[${tag.padEnd(20)}] gs=${f.gs} gy=${f.gy} gx=${f.gx} | vp=${d.vp} strip=${d.strip}`);
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
    await snap(c, '00-on-startnewgame');
    await c.key('enter', 'tap'); await c.step(400);   // START NEW GAME
    await snap(c, '01-after-start');
    await c.key('enter', 'tap'); await c.step(400);   // press 2
    await snap(c, '02-after-press2');
    await c.key('enter', 'tap'); await c.step(60);    // press 3 (immediate)
    await snap(c, '03-after-press3-immediate');
    await c.step(40);  await snap(c, '03b-press3-plus40');
    await c.step(100); await snap(c, '03c-press3-plus140');
    await c.step(200); await snap(c, '03d-press3-plus340');
    await c.step(300); await snap(c, '03e-press3-plus640');
    await c.key('enter', 'tap'); await c.step(60);    // press 4 (immediate)
    await snap(c, '04-after-press4-immediate');
    await c.step(100); await snap(c, '04b-press4-plus100');
    await c.step(300); await snap(c, '04c-press4-plus400');
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
