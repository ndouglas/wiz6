/**
 * probe-gate-cracked.ts — test the TRUE-SUCCESS entry path. Patch wbase.ovr so
 * the magicword ALWAYS succeeds (je->jmp at 0x1192, replicating the user's crack),
 * run a session on the patched image, and drive the entry the way the engine
 * intends (no ENTER mashing). Observe: (a) does the party AUTO-PUSH forward
 * without per-step input? (b) does door_phase(0x363e) animate the gates (wwatch)?
 * (c) capture frames. Compares the success path against the uncracked lenient path.
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
async function dump(c: HostClient, t: string) { const p = `/tmp/wiz6-crk-${t}.rgba`; await c.fb(p); writeFileSync(`/tmp/wiz6-crk-${t}.png`, encodePngRgba(320, 200, readFileSync(p))); }
async function drain(c: HostClient, tag: string) {
  const log = await c.wwatchDrain();
  if (log.length) { const vals = log.map(w => w.val & 0xffff); console.log(`  [${tag}] door_phase writes: ${vals.join(',')}`); }
}

async function main() {
  // Build a cracked copy of the pinned image.
  const dir = mkdtempSync(join(tmpdir(), 'wiz6-cracked-'));
  cpSync('test-fixtures/original', dir, { recursive: true });
  const ovr = join(dir, 'wbase.ovr');
  const buf = readFileSync(ovr);
  console.log(`patching wbase.ovr 0x1192: ${buf[0x1192]!.toString(16)} -> eb (je->jmp, always-success)`);
  buf[0x1192] = 0xeb; writeFileSync(ovr, buf);

  const c = new HostClient({ source: dir });
  try {
    const CY = process.argv[2];
    await c.step(3000);
    await c.key('enter', 'tap'); await c.step(800);
    for (let i = 0; i < 6; i++) { await c.key('enter', 'tap'); await c.step(150); await c.key('enter', 'tap'); await c.step(150); for (let k = 0; k < 4; k++) await c.key('up', 'tap'); await c.step(80); }
    await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(120);
    const base = await c.anchor();
    await c.wwatchSet(base + DOOR, base + DOOR + 2);

    await c.key('enter', 'tap'); await c.step(120);  // START NEW GAME → magicword prompt
    console.log('at magicword:', JSON.stringify(await snap(c)));
    await dump(c, 'magicword-prompt');
    await c.key('enter', 'tap'); await c.step(120);  // submit empty → CRACKED success
    console.log('after submit:', JSON.stringify(await snap(c)));
    await dump(c, 'after-submit'); await drain(c, 'submit');

    if (CY) { await c.cycles(CY); await c.step(10); console.log(`cycles=${CY}`); }

    // Observe with MINIMAL input: wait for the dungeon, then watch auto-push.
    let prev = '', dumps = 0;
    for (let f = 0; f < 1400; f++) {
      const s = await snap(c);
      const sig = `${s.gs}|${s.gy}|${s.door}`;
      if (sig !== prev) {
        console.log(`f${String(f).padStart(4)}: gs=${s.gs} gy=${s.gy} gx=${s.gx} door=${s.door}`);
        if ((s.door !== 0 || prev.split('|')[1] !== String(s.gy)) && dumps < 40) { await dump(c, `f${String(f).padStart(4, '0')}-gy${s.gy}-ph${s.door}`); dumps++; }
        prev = sig;
        await drain(c, `f${f}`);
      }
      // The ONE scripted ENTER at APPROACHING: if parked at gy=118 a while, press once.
      if (f === 700 && s.gy === 118) { console.log('-- single ENTER at APPROACHING --'); await c.key('enter', 'tap'); }
      await c.step(1);
    }
    console.log(`done: ${JSON.stringify(await snap(c))} dumps=${dumps}`);
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
