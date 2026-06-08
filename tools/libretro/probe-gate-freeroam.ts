/**
 * probe-gate-freeroam.ts — confirm the gate-open animation (0x1446) fires on a
 * NORMAL free-roam forward-move into the door at cell (127,120) north (orient2=0),
 * crossed facing north (0) — the entry direction. The scripted entry forces the
 * party through without animating; free-roam movement should animate it.
 *
 * After the entry reaches free-roam (gy=121, facing 0): turn 180, step south to
 * gy=120 (cross the door from behind — no anim), turn 180 back to north, slow the
 * CPU, then 'up' to cross the door facing north and fine-sample door_phase.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

const FACING = 0x4f9a, GYO = 0x4fa2, DOOR = 0x363e, GS = 0x363a;
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
async function st(c: HostClient) {
  const base = await c.anchor();
  return { facing: u16(await c.read(base + FACING, 2), 0), gy: u16(await c.read(base + GYO, 2), 0), door: u16(await c.read(base + DOOR, 2), 0), gs: u16(await c.read(base + GS, 2), 0) };
}
const CY = process.argv[2] ?? '315';

async function main() {
  const c = new HostClient();
  try {
    // Reach free-roam (entry end, gy=121).
    await c.step(3000);
    await c.key('enter', 'tap'); await c.step(800);
    for (let i = 0; i < 6; i++) { await c.key('enter', 'tap'); await c.step(150); await c.key('enter', 'tap'); await c.step(150); for (let k = 0; k < 4; k++) await c.key('up', 'tap'); await c.step(80); }
    await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(120);
    await c.key('enter', 'tap'); await c.step(400);
    await c.key('enter', 'tap'); await c.step(150);
    await c.key('enter', 'tap'); await c.step(150);
    await c.key('enter', 'tap');
    for (let f = 0; f < 300; f++) { if ((await st(c)).gs === 5) break; await c.step(2); }
    await c.step(60);
    // Advance through the scripted walk to free-roam (gy=121).
    for (let e = 0; e < 50 && (await st(c)).gy < 121; e++) { await c.key('enter', 'tap'); await c.step(40); }
    console.log('reached gy=121:', JSON.stringify(await st(c)));
    // Dismiss the entrance-chamber / HMMMM narration so free-roam input goes live.
    for (let i = 0; i < 6; i++) { await c.key('enter', 'tap'); await c.step(60); }
    // Verify input liveness: a turn must change facing.
    const f0 = (await st(c)).facing;
    await c.key('right', 'tap'); await c.step(80);
    const f1 = (await st(c)).facing;
    console.log(`input liveness: facing ${f0}->${f1} ${f1 !== f0 ? 'LIVE' : 'DEAD'}`);

    // Robust tap-and-wait helpers (free-roam input is timer-gated/jittery).
    const turnTo = async (want: number) => {
      for (let t = 0; t < 40 && (await st(c)).facing !== want; t++) { await c.key('right', 'tap'); await c.step(60); }
    };
    const stepToGy = async (want: number) => {
      for (let t = 0; t < 30 && (await st(c)).gy !== want; t++) { await c.key('up', 'tap'); await c.step(60); }
    };

    await turnTo(2);                       // face south (toward lower gy)
    console.log('facing south:', JSON.stringify(await st(c)));
    await stepToGy(120);                   // forward to gy=120 (crosses door from behind, no anim)
    console.log('at gy=120:', JSON.stringify(await st(c)));
    await turnTo(0);                       // face north again
    console.log('facing north @120:', JSON.stringify(await st(c)));

    // Slow CPU, then forward ('up') across the door facing north — fine-sample.
    await c.cycles(CY); await c.step(10);
    let dumps = 0, captured = false;
    for (let attempt = 1; attempt <= 25 && !captured && (await st(c)).gy <= 120; attempt++) {
      await c.key('up', 'tap');
      let prev = '';
      for (let f = 0; f < 300; f++) {
        const s = await st(c); const sig = `${s.gy}|${s.door}`;
        if (sig !== prev) {
          console.log(`a${attempt} f${String(f).padStart(3)}: gy=${s.gy} facing=${s.facing} door=${s.door}`);
          if (s.door !== 0 && dumps < 30) {
            const p = `/tmp/wiz6-fr-a${attempt}-f${String(f).padStart(3, '0')}-gy${s.gy}-ph${s.door}`;
            await c.fb(`${p}.rgba`);
            writeFileSync(`${p}.png`, encodePngRgba(320, 200, readFileSync(`${p}.rgba`)));
            dumps++; captured = true;
          }
          prev = sig;
        }
        if ((await st(c)).gy > 120) break;
        await c.step(1);
      }
    }
    console.log(`done: ${JSON.stringify(await st(c))} dumps=${dumps} ${captured ? 'GATE LIFT CAPTURED' : 'no lift'}`);
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
