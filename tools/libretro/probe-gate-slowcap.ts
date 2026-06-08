/**
 * probe-gate-slowcap.ts — capture the gate-open lift frames by SLOWING the
 * emulated CPU so the game's CRT-calibrated busy-wait delays (CS:0x1fe2/0x1fe4)
 * span multiple retro_run frames instead of collapsing into one.
 *
 * Drive at normal speed to gy=120 (one cell before the gate-crossing step),
 * drop dosbox_pure_cycles low, then trigger the 120->121 step and fine-sample
 * door_phase(0x363e) every frame, dumping a PNG on each new phase value.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

const GS = 0x363a, DOOR = 0x363e, GYO = 0x4fa2;
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
async function gy(c: HostClient) { return u16(await c.read((await c.anchor()) + GYO, 2), 0); }
async function gsv(c: HostClient) { return u16(await c.read((await c.anchor()) + GS, 2), 0); }
async function door(c: HostClient) { return u16(await c.read((await c.anchor()) + DOOR, 2), 0); }

const CY = process.argv[2] ?? '315';

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

    // Walk to gy=120 at normal speed.
    for (let e = 0; e < 40 && (await gy(c)) < 120; e++) { await c.key('enter', 'tap'); await c.step(40); }
    console.log(`at gy=${await gy(c)} before slowdown`);

    // Slow the CPU so the gate-open busy-waits span many frames.
    await c.cycles(CY); await c.step(10);
    console.log(`cycles set to ${CY}`);

    // Trigger the gate-crossing step with a SINGLE ENTER tap, then observe quietly
    // (no further input — a buffered ENTER would make the animation's delay-poll
    // skip the delays and re-collapse it). Retry only if the step wasn't accepted.
    let dumps = 0;
    let captured = false;
    for (let attempt = 1; attempt <= 30 && !captured && (await gy(c)) < 121; attempt++) {
      await c.key('enter', 'tap');                 // one clean tap
      let prevd = -1, prevGy = await gy(c);
      for (let f = 0; f < 300; f++) {              // quiet observation window
        const d = await door(c), g = await gy(c);
        if (d !== prevd || g !== prevGy) {
          console.log(`attempt${attempt} f${String(f).padStart(3)}: gy=${g} door=${d}`);
          if (d !== 0 && dumps < 30) {
            const p = `/tmp/wiz6-slow-a${attempt}-f${String(f).padStart(3, '0')}-gy${g}-ph${d}`;
            await c.fb(`${p}.rgba`);
            writeFileSync(`${p}.png`, encodePngRgba(320, 200, readFileSync(`${p}.rgba`)));
            dumps++; captured = true;
          }
          prevd = d; prevGy = g;
        }
        if (g >= 121) break;
        await c.step(1);
      }
    }
    console.log(`done: gy=${await gy(c)} door=${await door(c)} dumps=${dumps} ${captured ? 'CAPTURED LIFT FRAMES' : 'NO LIFT SEEN'}`);
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
