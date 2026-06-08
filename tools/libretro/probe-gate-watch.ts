/**
 * probe-gate-watch.ts — DECISIVE: does the gate-open animation (wmaze 0x1446)
 * execute during the scripted entry walk, or does the walk just bump a closed
 * gate? Arm a memory-write watch on door_phase (0x363e) and drain it across the
 * walk steps. If we see writes val=1 then val=2 (then val=0), the gate animation
 * fires and is merely collapsed within a single libretro retro_run (fast-emu);
 * if no nonzero writes ever appear, the entry does NOT open a gate here.
 *
 * Requires the PATCHED core (wwset). If it errors, the committed core is the
 * unpatched nightly and we fall back to the trace/poke evidence.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const GS = 0x363a, DOOR = 0x363e, FACING = 0x4f9a, GYO = 0x4fa2;
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
async function gy(c: HostClient) { return u16(await c.read((await c.anchor()) + GYO, 2), 0); }
async function gs(c: HostClient) { return u16(await c.read((await c.anchor()) + GS, 2), 0); }

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
    for (let f = 0; f < 300; f++) { if (await gs(c) === 5) break; await c.step(2); }
    await c.step(60);
    console.log('narration gy=', await gy(c));

    const base = await c.anchor();
    // Try to arm the write-watch on door_phase (2 bytes).
    let watchOk = true;
    try { await c.wwatchSet(base + DOOR, base + DOOR + 2); }
    catch (e) { watchOk = false; console.warn('wwatch unsupported (unpatched core):', String(e)); }

    // ENTER-walk to gy>=121, draining the watch after each accepted step.
    let lastGy = await gy(c);
    for (let e = 1; e <= 40 && lastGy < 121; e++) {
      await c.key('enter', 'tap'); await c.step(40);
      const ng = await gy(c);
      if (watchOk) {
        const log = await c.wwatchDrain();
        const nz = log.filter((w) => (w.val & 0xffff) !== 0);
        if (log.length) {
          console.log(`ENTER#${e} gy ${lastGy}->${ng}: ${log.length} writes to door_phase`);
          for (const w of log) console.log(`    cs:ip=${w.cseip.toString(16)} addr=${w.addr.toString(16)} val=${w.val & 0xffff}`);
          if (nz.length) console.log(`    *** NONZERO door_phase writes → GATE ANIMATION FIRES (vals: ${nz.map((w) => w.val & 0xffff).join(',')}) ***`);
        }
      }
      if (ng !== lastGy) console.log(`  (moved ${lastGy}->${ng})`);
      lastGy = ng;
    }
    console.log('final gy=', lastGy);
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
