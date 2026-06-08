/**
 * probe-walk-to-gate.ts — reliably drive the entry walk to gy=121 using the
 * proven tap+step40 cadence (minimal reads between taps), wwatch door_phase, and
 * dump a frame at each gy change + densely around the gy 119->120->121 gate
 * crossing. Answers: does the distant corridor gate open (door_phase fires) when
 * the party reaches it?
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

const GS = 0x363a, DOOR = 0x363e, GYO = 0x4fa2;
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
async function gy(c: HostClient) { return u16(await c.read((await c.anchor()) + GYO, 2), 0); }
async function gsv(c: HostClient) { return u16(await c.read((await c.anchor()) + GS, 2), 0); }
async function dump(c: HostClient, t: string) { const p = `/tmp/wg-${t}.rgba`; await c.fb(p); writeFileSync(`/tmp/wg-${t}.png`, encodePngRgba(320, 200, readFileSync(p))); }

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
    const base = await c.anchor();
    await c.wwatchSet(base + DOOR, base + DOOR + 2);
    let lastGy = await gy(c);
    console.log(`narration gy=${lastGy}`);
    await dump(c, `gy${lastGy}`);

    // Proven cadence: tap enter, step 40 (no reads between), then check gy once.
    for (let e = 1; e <= 50; e++) {
      await c.key('enter', 'tap');
      // step in 4 chunks of 10, capturing a frame each chunk ONLY when we're near
      // the gate (gy>=119) so we catch the slide; otherwise just step.
      const near = lastGy >= 119;
      for (let s = 0; s < 4; s++) {
        await c.step(10);
        if (near) { const g = await gy(c); const d = u16(await c.read(base + DOOR, 2), 0); await dump(c, `e${e}s${s}-gy${g}-ph${d}`); }
      }
      const g = await gy(c);
      const log = await c.wwatchDrain();
      const dp = log.map(w => w.val & 0xffff).filter(v => v !== 0);
      if (g !== lastGy || dp.length) console.log(`ENTER#${e}: gy ${lastGy}->${g}${dp.length ? `  door_phase writes: ${dp.join(',')}` : ''}`);
      if (g !== lastGy) await dump(c, `gy${g}`);
      lastGy = g;
      if (g >= 121) { console.log('reached gy=121'); for (let s = 0; s < 30; s++) { await c.step(2); await dump(c, `final-s${s}-gy${await gy(c)}-ph${u16(await c.read(base + DOOR, 2), 0)}`); } break; }
    }
    console.log(`done gy=${await gy(c)}`);
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
