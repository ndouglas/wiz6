/**
 * probe-entry-observe.ts — RE re-observation (Phase 1) of the CRACKED success-path
 * entry with MINIMAL input. Maps: does the forward motion auto-push? how many
 * gates, where, which animate? where does the entry end (free-roam)? Earlier
 * observations were contaminated by ENTER-mashing + the uncracked lenient path
 * (which truncates at gy=121). The user (cracked/success) sees TWO animated gates
 * + auto-pushed motion + HMMM between gates.
 *
 * Strategy: drive to the dungeon (cracked magicword = 1 submit ENTER), then loop
 * observing every frame; press ONE ENTER only when gy has been STALLED a while
 * (a text beat). Log every gy change + the frames since the last input (auto-push
 * shows gy advancing with NO recent input). Capture a frame on each gy change +
 * a few during transitions. At the end, try arrows to detect free-roam.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { readFileSync, writeFileSync, cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

const GS = 0x363a, DOOR = 0x363e, FACING = 0x4f9a, GYO = 0x4fa2;
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
async function snap(c: HostClient) {
  const base = await c.anchor();
  const a = await c.read(base + GS, 8); const pos = await c.read(base + FACING, 12);
  return { gs: u16(a, 0), door: u16(a, DOOR - GS), facing: u16(pos, 0), gy: u16(pos, 8), gx: u16(pos, 10) };
}
async function dump(c: HostClient, tag: string) { const p = `/tmp/obs-${tag}.rgba`; await c.fb(p); writeFileSync(`/tmp/obs-${tag}.png`, encodePngRgba(320, 200, readFileSync(p))); }

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'wiz6-cracked-'));
  cpSync('test-fixtures/original', dir, { recursive: true });
  const ovr = join(dir, 'wbase.ovr'); const b = readFileSync(ovr); b[0x1192] = 0xeb; writeFileSync(ovr, b);

  const c = new HostClient({ source: dir });
  try {
    await c.step(3000);
    await c.key('enter', 'tap'); await c.step(800);
    for (let i = 0; i < 6; i++) { await c.key('enter', 'tap'); await c.step(150); await c.key('enter', 'tap'); await c.step(150); for (let k = 0; k < 4; k++) await c.key('up', 'tap'); await c.step(80); }
    await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(120);
    await c.key('enter', 'tap'); await c.step(120);   // START NEW GAME → magicword
    await c.key('enter', 'tap');                       // submit → cracked success
    for (let f = 0; f < 300; f++) { if ((await snap(c)).gs === 5) break; await c.step(2); }

    console.log('-- observing (minimal input; ENTER only when stalled) --');
    let lastGy = (await snap(c)).gy, lastGx = (await snap(c)).gx;
    let framesSinceInput = 0, framesSinceGyChange = 0, enters = 0, dumps = 0;
    let prevDoor = -1;
    await dump(c, `start-gy${lastGy}`);
    for (let f = 0; f < 5000; f++) {
      const s = await snap(c);
      if (s.gy !== lastGy || s.gx !== lastGx) {
        console.log(`f${String(f).padStart(4)}: MOVED gy ${lastGy}->${s.gy} gx ${lastGx}->${s.gx} facing=${s.facing} (framesSinceInput=${framesSinceInput}) ${framesSinceInput > 30 ? '<<< AUTO-PUSH (no recent input)' : '(after input)'}`);
        if (dumps < 50) { await dump(c, `f${String(f).padStart(4, '0')}-gy${s.gy}-gx${s.gx}`); dumps++; }
        lastGy = s.gy; lastGx = s.gx; framesSinceGyChange = 0;
      } else framesSinceGyChange++;
      if (s.door !== prevDoor) { console.log(`f${String(f).padStart(4)}: door_phase=${s.door}`); prevDoor = s.door; }
      // Stalled at a text beat → press ONE enter.
      if (framesSinceGyChange > 0 && framesSinceGyChange % 120 === 0 && enters < 40) {
        await c.key('enter', 'tap'); enters++; framesSinceInput = 0;
        console.log(`f${String(f).padStart(4)}: pressed ENTER #${enters} (stalled at gy=${s.gy})`);
      } else framesSinceInput++;
      await c.step(1);
    }
    const end = await snap(c);
    console.log(`\nend: ${JSON.stringify(end)} (enters used=${enters})`);
    // Free-roam check: try a turn.
    await c.key('left', 'tap'); await c.step(60);
    const afterTurn = await snap(c);
    console.log(`after LEFT: facing ${end.facing}->${afterTurn.facing} ${afterTurn.facing !== end.facing ? 'TURNED (free-roam)' : 'no-turn (still scripted)'}`);
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
