/**
 * probe-magicword-flag.ts — test whether the copy-protection-passed flag 0x4fc0
 * gates the ANIMATED entry. At MASTER OPTIONS (party formed), poke [0x4fc0]=1
 * BEFORE START NEW GAME, then drive START NEW GAME and observe: (a) is the
 * magicword prompt skipped? (b) does the entry now animate — door_phase(0x363e)
 * written during the walk (wwatch)? Compare against a control run (flag left 0).
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

const GS = 0x363a, DOOR = 0x363e, FLAG = 0x4fc0, GYO = 0x4fa2;
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
async function gs(c: HostClient) { return u16(await c.read((await c.anchor()) + GS, 2), 0); }
async function gy(c: HostClient) { return u16(await c.read((await c.anchor()) + GYO, 2), 0); }
async function dump(c: HostClient, t: string) { const p = `/tmp/wiz6-mwflag-${t}.rgba`; await c.fb(p); writeFileSync(`/tmp/wiz6-mwflag-${t}.png`, encodePngRgba(320, 200, readFileSync(p))); }

async function drain(c: HostClient, tag: string) {
  const log = await c.wwatchDrain();
  const nz = log.filter((w) => (w.val & 0xffff) !== 0 && (w.val & 0xffff) < 16);
  if (log.length) console.log(`  [${tag}] ${log.length} door_phase writes; small-nonzero(gate-anim-like): ${nz.map(w => w.val & 0xffff).join(',') || 'none'}`);
}

async function main() {
  const setFlag = process.argv[2] === 'set';
  const c = new HostClient();
  try {
    await c.step(3000);
    await c.key('enter', 'tap'); await c.step(800);
    for (let i = 0; i < 6; i++) { await c.key('enter', 'tap'); await c.step(150); await c.key('enter', 'tap'); await c.step(150); for (let k = 0; k < 4; k++) await c.key('up', 'tap'); await c.step(80); }
    await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(120);   // cursor → START NEW GAME
    const base = await c.anchor();
    console.log(`flag 0x4fc0 before = ${u16(await c.read(base + FLAG, 2), 0)}`);
    if (setFlag) { await c.write(base + FLAG, [1, 0]); console.log('POKED [0x4fc0]=1'); }

    await c.wwatchSet(base + DOOR, base + DOOR + 2);
    await c.key('enter', 'tap'); await c.step(60);
    // Is the magicword prompt up, or did we go straight to the dungeon transition?
    await dump(c, setFlag ? 'set-after-startnewgame' : 'ctrl-after-startnewgame');
    console.log(`after START NEW GAME: gs=${await gs(c)}`);
    await drain(c, 'start-new-game');

    // Press ENTER a few times (passes magicword if present; harmless otherwise),
    // wait for dungeon, then observe the entry with NO mashing, wwatching door_phase.
    for (let i = 0; i < 3; i++) { await c.key('enter', 'tap'); await c.step(120); await drain(c, `enter${i}`); }
    for (let f = 0; f < 400; f++) { if (await gs(c) === 5) break; await c.step(2); }
    await c.step(80);
    console.log(`dungeon: gs=${await gs(c)} gy=${await gy(c)}`);
    await dump(c, setFlag ? 'set-dungeon' : 'ctrl-dungeon');
    await drain(c, 'dungeon-load');

    // Observe the entry: NO input first (auto-push?), then one ENTER, watching door_phase.
    let prev = '';
    for (let f = 0; f < 500; f++) { const g = await gy(c); if (`${g}` !== prev) { console.log(`  no-input f${f}: gy=${g}`); prev = `${g}`; } await c.step(1); }
    await drain(c, 'no-input-window');
    await c.key('enter', 'tap'); await c.step(200); await drain(c, 'after-1-enter');
    console.log(`final gy=${await gy(c)}`);
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
