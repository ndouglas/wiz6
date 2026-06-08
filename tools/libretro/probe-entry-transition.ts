/**
 * probe-entry-transition.ts — single-frame-resolution capture of the transition
 * from the magicword prompt into the dungeon, hunting for any solid-black or
 * fade frame between the castle/magicword screen and the rendered dungeon view.
 *
 * Reaches the magicword prompt (START NEW GAME + 1 enter), then presses ENTER
 * to pass it and steps ONE frame at a time, digesting each frame's black-ness.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

const GAME_STATE = 0x363a;
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
async function gs(c: HostClient) { return u16(await c.read((await c.anchor()) + GAME_STATE, 2), 0); }
function blackness(rgba: Uint8Array) {
  // Fraction of the FULL frame that is pure black, plus a coarse hue summary.
  let black = 0, gray = 0, color = 0;
  for (let p = 0; p < 320 * 200; p++) {
    const r = rgba[p * 4]!, g = rgba[p * 4 + 1]!, b = rgba[p * 4 + 2]!;
    if ((r | g | b) === 0) black++;
    else if (Math.abs(r - g) < 16 && Math.abs(g - b) < 16) gray++;
    else color++;
  }
  return { black, gray, color };
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
    await c.key('enter', 'tap'); await c.step(400);   // START NEW GAME → magicword prompt
    console.log('at magicword, gs=', await gs(c));

    // Pass the magicword (empty ENTER) and step 1 frame at a time for ~200 frames,
    // logging blackness + gs. Capture PNGs at notable transitions.
    await c.key('enter', 'tap');
    let prevSig = '';
    for (let f = 0; f <= 200; f++) {
      const path = `/tmp/wiz6-tr-f${String(f).padStart(3, '0')}.rgba`;
      await c.fb(path);
      const rgba = readFileSync(path);
      const bl = blackness(rgba);
      const g = await gs(c);
      const sig = `${g}|${Math.round(bl.black / 500)}|${Math.round(bl.color / 500)}`;
      if (sig !== prevSig || f % 25 === 0) {
        console.log(`f${String(f).padStart(3, '0')} gs=${g} black=${bl.black} gray=${bl.gray} color=${bl.color}`);
        writeFileSync(`/tmp/wiz6-tr-f${String(f).padStart(3, '0')}.png`, encodePngRgba(320, 200, rgba));
        prevSig = sig;
      }
      await c.step(1);
    }
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
