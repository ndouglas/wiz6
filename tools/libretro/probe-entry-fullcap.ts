/**
 * probe-entry-fullcap.ts — capture the FULL entry animation sequence densely:
 * the castle-door slide-apart (post-magicword transition) AND the forward walk
 * gy 117->121 with any gate-slide animations. Saves every 2nd frame labeled by
 * frame#/gs/gy for contact-sheet inspection. ENTER-drives the walk (jittery but
 * eventually reaches 121); the initial 117->118 is automatic.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

const GS = 0x363a, GYO = 0x4fa2;
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
async function gy(c: HostClient) { return u16(await c.read((await c.anchor()) + GYO, 2), 0); }
async function gsv(c: HostClient) { return u16(await c.read((await c.anchor()) + GS, 2), 0); }

async function main() {
  const c = new HostClient();
  try {
    await c.step(3000);
    await c.key('enter', 'tap'); await c.step(800);
    for (let i = 0; i < 6; i++) { await c.key('enter', 'tap'); await c.step(150); await c.key('enter', 'tap'); await c.step(150); for (let k = 0; k < 4; k++) await c.key('up', 'tap'); await c.step(80); }
    await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(120);
    await c.key('enter', 'tap'); await c.step(400);   // START NEW GAME → magicword
    await c.key('enter', 'tap'); await c.step(150);   // magicword 1
    await c.key('enter', 'tap'); await c.step(150);   // magicword 2
    await c.key('enter', 'tap');                       // magicword 3 → transition (DOOR SLIDE)

    let idx = 0, lastEnter = 0, frameNo = 0;
    const cap = async () => {
      const g = await gy(c), s = await gsv(c);
      const p = `/tmp/fc-${String(idx).padStart(3, '0')}-f${String(frameNo).padStart(4, '0')}-gs${s}-gy${g}`;
      await c.fb(`${p}.rgba`); writeFileSync(`${p}.png`, encodePngRgba(320, 200, readFileSync(`${p}.rgba`)));
      idx++; return { g, s };
    };
    // Dense-capture the whole transition + walk. Every 2nd frame. ENTER-drive the
    // walk once in the dungeon (gs=5) and short of gy=121.
    for (; frameNo < 1600 && idx < 360; frameNo++) {
      if (frameNo % 2 === 0) { const { g, s } = await cap(); if (s === 5 && g >= 121) break; }
      const s = await gsv(c);
      if (s === 5 && (await gy(c)) < 121 && frameNo - lastEnter >= 40) { await c.key('enter', 'tap'); lastEnter = frameNo; }
      await c.step(1);
    }
    console.log(`captured ${idx} frames; final gy=${await gy(c)} gs=${await gsv(c)}`);
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
