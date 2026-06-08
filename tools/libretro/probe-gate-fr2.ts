/**
 * probe-gate-fr2.ts — capture the gate-open lift from the committed free-roam
 * state newgame-seq-07 (gy=121). Maneuver: face south, step to gy=120 (cross the
 * (127,120)-north door from behind, no anim), face north, slow CPU, step north
 * across the door head-on → gate animation (door_phase 0→1→2→0). Fine-sample.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

const FACING = 0x4f9a, GYO = 0x4fa2, DOOR = 0x363e;
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
async function st(c: HostClient) {
  const base = await c.anchor();
  return { facing: u16(await c.read(base + FACING, 2), 0), gy: u16(await c.read(base + GYO, 2), 0), door: u16(await c.read(base + DOOR, 2), 0) };
}
const CY = process.argv[2] ?? '315';

async function main() {
  const c = new HostClient();
  try {
    writeFileSync('/tmp/fr2.state', gunzipSync(readFileSync('test-fixtures/states/newgame-seq-07-entrance-chamber-gy121.state.gz')));
    await c.unserialize('/tmp/fr2.state'); await c.step(8);
    console.log('seq-07 loaded:', JSON.stringify(await st(c)));

    // Dismiss any residual narration modal (ENTER), then verify input is live.
    for (let i = 0; i < 3; i++) { await c.key('enter', 'tap'); await c.step(30); }

    const turnTo = async (want: number) => {
      for (let t = 0; t < 30 && (await st(c)).facing !== want; t++) { await c.key('right', 'tap'); await c.step(50); }
    };
    const stepToGy = async (want: number) => {
      for (let t = 0; t < 30 && (await st(c)).gy !== want; t++) { await c.key('up', 'tap'); await c.step(50); }
    };

    await turnTo(2); console.log('face south:', JSON.stringify(await st(c)));
    await stepToGy(120); console.log('step to 120:', JSON.stringify(await st(c)));
    await turnTo(0); console.log('face north @120:', JSON.stringify(await st(c)));

    const here = await st(c);
    if (here.gy !== 120 || here.facing !== 0) { console.log('FAILED to set up gy120/north — input not responsive or geometry differs'); return; }

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
            const p = `/tmp/wiz6-gate-lift-ph${s.door}-a${attempt}f${f}`;
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
    console.log(`done: ${JSON.stringify(await st(c))} dumps=${dumps} ${captured ? '*** GATE LIFT CAPTURED ***' : 'no lift'}`);
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
