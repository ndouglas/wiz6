/**
 * probe-gate-livepoke.ts — poke door_phase in the LIVE running game (which
 * redraws every frame — torch flicker proves it) at each approach position, to
 * see if the gate recess renders the lift. Decides whether the lift frames are
 * capturable by poke (cheap) or only render inside the move-step (needs rebuild).
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

const DOOR = 0x363e, GS = 0x363a, GYO = 0x4fa2;
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
async function gy(c: HostClient) { return u16(await c.read((await c.anchor()) + GYO, 2), 0); }
async function gsv(c: HostClient) { return u16(await c.read((await c.anchor()) + GS, 2), 0); }
function vpHash(rgba: Uint8Array) { let s = 0; for (let y = 32; y < 144; y++) for (let x = 72; x < 248; x++) { const p = (y * 320 + x) * 4; s = (s + (rgba[p]! + rgba[p + 1]! * 3 + rgba[p + 2]! * 7) * (x * 200 + y)) >>> 0; } return s; }

async function pokeHere(c: HostClient, label: string) {
  const base = await c.anchor();
  for (const ph of [0, 1, 2, 4]) {
    await c.write(base + DOOR, [ph, 0]);
    await c.step(1);
    const rb = u16(await c.read(base + DOOR, 2), 0);
    const p = `/tmp/wiz6-lp-${label}-ph${ph}.rgba`; await c.fb(p);
    const rgba = readFileSync(p);
    console.log(`  ${label} phase=${ph} (rb=${rb}) vpHash=${vpHash(rgba)}`);
    writeFileSync(`/tmp/wiz6-lp-${label}-ph${ph}.png`, encodePngRgba(320, 200, rgba));
  }
}

async function main() {
  const c = new HostClient();
  try {
    await c.step(3000);
    await c.key('enter', 'tap'); await c.step(800);
    for (let i = 0; i < 6; i++) { await c.key('enter', 'tap'); await c.step(150); await c.key('enter', 'tap'); await c.step(150); for (let k = 0; k < 4; k++) await c.key('up', 'tap'); await c.step(80); }
    await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(120);
    await c.key('enter', 'tap'); await c.step(400);
    await c.key('enter', 'tap'); await c.step(150);
    await c.key('enter', 'tap'); await c.step(150);
    await c.key('enter', 'tap');
    for (let f = 0; f < 300; f++) { if (await gsv(c) === 5) break; await c.step(2); }
    await c.step(60);
    console.log('narration gy=', await gy(c));

    // Poke at gy=118 (narration), then walk to 119, 120 and poke at each.
    await pokeHere(c, 'gy118');
    for (const tgt of [119, 120]) {
      for (let e = 0; e < 30 && (await gy(c)) < tgt; e++) { await c.key('enter', 'tap'); await c.step(40); }
      console.log(`reached gy=${await gy(c)} (target ${tgt})`);
      await pokeHere(c, `gy${tgt}`);
    }
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
