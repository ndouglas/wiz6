/**
 * probe-flip-frames.ts — capture the gs 65535→5 flip (3rd ENTER on magicword)
 * at SINGLE-frame resolution, hunting for a transient black/fade frame and the
 * exact frame the narration text appears.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

const GAME_STATE = 0x363a;
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
async function gs(c: HostClient) { return u16(await c.read((await c.anchor()) + GAME_STATE, 2), 0); }
function digest(rgba: Uint8Array) {
  // viewport rect (the dungeon 3D view): roughly x 64..216, y 16..143.
  let vpBlack = 0, vpNonblack = 0, stripNonblack = 0, fullBlack = 0;
  for (let y = 0; y < 200; y++) for (let x = 0; x < 320; x++) {
    const p = (y * 320 + x) * 4; const nb = (rgba[p]! | rgba[p + 1]! | rgba[p + 2]!) !== 0;
    if (!nb) fullBlack++;
    if (x >= 64 && x < 216 && y >= 16 && y < 144) { if (nb) vpNonblack++; else vpBlack++; }
    if (y >= 144) { if (nb) stripNonblack++; }
  }
  return { vpBlack, vpNonblack, stripNonblack, fullBlack };
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
    await c.key('enter', 'tap'); await c.step(400);   // START NEW GAME → magicword
    await c.key('enter', 'tap'); await c.step(250);   // ENTER#1
    await c.key('enter', 'tap'); await c.step(250);   // ENTER#2 (now on the pre-flip dungeon-preview)
    console.log('pre-3rd-enter gs=', await gs(c));
    await c.key('enter', 'tap');                      // ENTER#3 → flips to gs=5
    for (let f = 0; f <= 60; f++) {
      await c.fb(`/tmp/wiz6-fl-f${String(f).padStart(2, '0')}.rgba`);
      const rgba = readFileSync(`/tmp/wiz6-fl-f${String(f).padStart(2, '0')}.rgba`);
      const d = digest(rgba); const g = await gs(c);
      console.log(`f${String(f).padStart(2, '0')} gs=${g} fullBlack=${d.fullBlack} vp[nb=${d.vpNonblack} bk=${d.vpBlack}] strip_nb=${d.stripNonblack}`);
      writeFileSync(`/tmp/wiz6-fl-f${String(f).padStart(2, '0')}.png`, encodePngRgba(320, 200, rgba));
      await c.step(1);
    }
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
