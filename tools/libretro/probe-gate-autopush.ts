/**
 * probe-gate-autopush.ts — drive the entry the way the engine intends: reach the
 * 'APPROACHING THE GATE' narration (gy=118), press ENTER exactly ONCE, then take
 * NO further input and watch the party auto-push forward while door_phase(0x363e)
 * animates the sliding gates. Earlier drives MASHED ENTER, and the gate
 * animation's delay loop skips on a buffered ENTER (0x0d) — so mashing skipped
 * every gate animation. This tests that hypothesis.
 *
 * Optional arg: cycles value (e.g. 2750) to slow the CPU so the slide frames span
 * multiple retro_runs for capture. Default: no slowdown (just detect door_phase).
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

const GS = 0x363a, DOOR = 0x363e, FACING = 0x4f9a, GYO = 0x4fa2;
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
async function snap(c: HostClient) {
  const base = await c.anchor();
  const a = await c.read(base + GS, 8);
  const pos = await c.read(base + FACING, 12);
  return { gs: u16(a, 0), door: u16(a, DOOR - GS), facing: u16(pos, 0), gy: u16(pos, 8), gx: u16(pos, 10) };
}
async function dump(c: HostClient, tag: string) {
  const p = `/tmp/wiz6-push-${tag}.rgba`; await c.fb(p);
  writeFileSync(`/tmp/wiz6-push-${tag}.png`, encodePngRgba(320, 200, readFileSync(p)));
}
const CY = process.argv[2];

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
    await c.key('enter', 'tap');                       // magicword 3 → dungeon
    for (let f = 0; f < 300; f++) { if ((await snap(c)).gs === 5) break; await c.step(2); }
    await c.step(80);
    console.log('at narration:', JSON.stringify(await snap(c)));

    if (CY) { await c.cycles(CY); await c.step(10); console.log(`cycles=${CY}`); }

    // ONE ENTER to dismiss APPROACHING, then NO further input.
    await c.key('enter', 'tap');
    console.log('-- pressed ENTER once; observing auto-push with NO further input --');
    let prev = '', dumps = 0;
    for (let f = 0; f < 1500; f++) {
      const s = await snap(c);
      const sig = `${s.gy}|${s.door}`;
      if (sig !== prev) {
        console.log(`f${String(f).padStart(4)}: gy=${s.gy} gx=${s.gx} facing=${s.facing} door=${s.door}`);
        if (s.door !== 0 && dumps < 30) { await dump(c, `f${String(f).padStart(4, '0')}-gy${s.gy}-ph${s.door}`); dumps++; }
        prev = sig;
      }
      await c.step(1);
    }
    console.log(`done: ${JSON.stringify(await snap(c))} doorDumps=${dumps} ${dumps ? '*** GATE ANIM SEEN ***' : 'no door_phase'}`);
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
