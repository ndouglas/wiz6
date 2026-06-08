/**
 * probe-gate-autowalk.ts — DEFINITIVE capture of the automatic entry walk.
 *
 * After the 3 magicword ENTERs, take NO further input and fine-sample EVERY
 * frame: log every change in (game_state, gy, gx, facing, door_phase) and dump a
 * PNG on every door_phase != 0 frame (and every gy change). This reveals the
 * engine-controlled walk title→narration→auto-walk→GATE ANIMATION→dead-end with
 * exact per-frame timing, and proves whether the gate lifts (door_phase 0→1→2→0)
 * without any player input.
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
  const p = `/tmp/wiz6-aw-${tag}.rgba`; await c.fb(p);
  writeFileSync(`/tmp/wiz6-aw-${tag}.png`, encodePngRgba(320, 200, readFileSync(p)));
}

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
    await c.key('enter', 'tap');                       // magicword 3 → dungeon loads

    // Wait for the dungeon + narration to settle at gy=118 (no input).
    for (let f = 0; f < 300; f++) { if ((await snap(c)).gs === 5) break; await c.step(2); }
    await c.step(60);
    console.log('NARRATION settled:', JSON.stringify(await snap(c)));

    // Now drive the walk with capture-newgame cadence: ENTER, then STEP-then-READ
    // one frame at a time (so the tap flushes), sampling door_phase. The gate
    // animation (door_phase 0→1→2→0) must run during one of these ENTER windows.
    let dumps = 0;
    for (let e = 1; e <= 40; e++) {
      const before = await snap(c);
      await c.key('enter', 'tap');
      let prevd = -1, saw = false;
      for (let f = 0; f < 120; f++) {
        await c.step(1);
        const s = await snap(c);
        if (s.door !== prevd || (f === 0)) {
          console.log(`  ENTER#${e} f${String(f).padStart(3)}: gs=${s.gs} gy=${s.gy} gx=${s.gx} door=${s.door}`);
          if (s.door !== 0 && dumps < 40) { saw = true; await dump(c, `e${e}-f${String(f).padStart(3, '0')}-gy${s.gy}-ph${s.door}`); dumps++; }
          prevd = s.door;
        }
      }
      const after = await snap(c);
      console.log(`ENTER#${e}: ${after.gy !== before.gy ? 'MOVED' : 'no-move'} gy ${before.gy}->${after.gy}${saw ? '  <== GATE ANIM (door_phase nonzero!)' : ''}`);
      await dump(c, `e${e}-settled-gy${after.gy}`);
      if (after.gy >= 121) break;
    }
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
