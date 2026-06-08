/**
 * probe-gate-wwatch2.ts — DEFINITIVE: arm the patched-core write-watch on
 * door_phase (0x363e) across the ENTIRE scripted entry and report every write
 * (cs:ip, val). The gate animation (0x1446) WRITES door_phase=1,2,0 regardless
 * of whether the inter-phase delays are skipped or frame-collapsed — so if it
 * executes at all during the entry, wwatch catches the nonzero writes and their
 * code site. If we see no nonzero writes, the dosbox-pure (empty-magicword)
 * entry genuinely does NOT run the gate-open animation.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const GS = 0x363a, DOOR = 0x363e, GYO = 0x4fa2;
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
async function gy(c: HostClient) { return u16(await c.read((await c.anchor()) + GYO, 2), 0); }
async function gs(c: HostClient) { return u16(await c.read((await c.anchor()) + GS, 2), 0); }

async function drain(c: HostClient, tag: string) {
  const log = await c.wwatchDrain();
  if (log.length) {
    console.log(`  [${tag}] ${log.length} writes to door_phase:`);
    for (const w of log) console.log(`     cs:ip=${w.cseip.toString(16)} val=${w.val & 0xffff}`);
    const nz = log.filter((w) => (w.val & 0xffff) !== 0);
    if (nz.length) console.log(`     *** NONZERO door_phase writes → GATE ANIMATION RAN (${nz.map(w => w.val & 0xffff).join(',')}) ***`);
  }
}

async function main() {
  const c = new HostClient();
  try {
    await c.step(3000);
    await c.key('enter', 'tap'); await c.step(800);
    for (let i = 0; i < 6; i++) { await c.key('enter', 'tap'); await c.step(150); await c.key('enter', 'tap'); await c.step(150); for (let k = 0; k < 4; k++) await c.key('up', 'tap'); await c.step(80); }
    await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(120);

    const base = await c.anchor();
    await c.wwatchSet(base + DOOR, base + DOOR + 2);
    console.log(`wwatch armed on door_phase @ ${(base + DOOR).toString(16)}`);

    await c.key('enter', 'tap'); await c.step(400); await drain(c, 'START NEW GAME→magicword');
    await c.key('enter', 'tap'); await c.step(150); await drain(c, 'magicword 1');
    await c.key('enter', 'tap'); await c.step(150); await drain(c, 'magicword 2');
    await c.key('enter', 'tap');                                              // magicword 3 → dungeon
    for (let f = 0; f < 300; f++) { if (await gs(c) === 5) break; await c.step(2); }
    await c.step(80); await drain(c, 'dungeon-load→narration');
    console.log('narration gy=', await gy(c));

    // Walk to gy=121, draining after each ENTER.
    for (let e = 1; e <= 40 && (await gy(c)) < 121; e++) {
      await c.key('enter', 'tap'); await c.step(50);
      await drain(c, `walk ENTER#${e} gy=${await gy(c)}`);
    }
    console.log('final gy=', await gy(c));
    // A few more enters at the entrance (the "hmm" / next gate).
    for (let e = 1; e <= 10; e++) { await c.key('enter', 'tap'); await c.step(50); await drain(c, `post-121 ENTER#${e} gy=${await gy(c)}`); }
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
