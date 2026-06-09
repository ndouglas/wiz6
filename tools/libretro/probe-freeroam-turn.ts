/**
 * probe-freeroam-turn.ts — confirm full free-roam navigation after the unlock.
 *
 * UNLOCK (discovered): cold-boot to dungeon -> ENTER-walk to gy=121 -> keep
 * pressing ENTER (the scripted-walker/HMMMM-bump modal drains after ~5-6 more
 * ENTERs) -> free-roam control activates: LEFT/RIGHT turn (-/+1 mod 4), UP steps
 * forward when the cell ahead is open. This probe drives the unlock then exercises
 * a full turn cycle + a forward step to confirm reliable free-roam navigation.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const O = { gs: 0x363a, f: 0x4f9a, gy: 0x4fa2, gx: 0x4fa4, span: 0x50ce };
const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);

async function main() {
  const c = new HostClient();
  let base = 0;
  const rd = async (off: number) => u16(await c.read(base + off, 2), 0);
  const party = async () => ({ gs: await rd(O.gs), f: await rd(O.f), gx: await rd(O.gx), gy: await rd(O.gy), span: await rd(O.span) });
  const fmt = (p: any) => `f=${p.f} gx=${p.gx} gy=${p.gy} span=${p.span}`;
  const enter = async () => { await c.key('enter', 'down'); await c.step(24); await c.key('enter', 'up'); await c.step(70); };
  const testTurnLeft = async (): Promise<boolean> => {
    const b = await rd(O.f); await c.key('left', 'tap'); await c.step(50); return (await rd(O.f)) !== b;
  };

  try {
    await c.step(3000);
    await c.key('enter', 'tap'); await c.step(800);
    for (let i = 0; i < 3; i++) {
      await c.key('enter', 'tap'); await c.step(60);
      await c.key('enter', 'tap'); await c.step(60);
      await c.key('up', 'tap'); await c.key('up', 'tap'); await c.key('up', 'tap'); await c.step(60);
    }
    await c.key('down', 'tap'); await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(60);
    await c.key('enter', 'tap'); await c.step(200);
    await c.key('enter', 'tap'); await c.step(200);
    await c.key('enter', 'tap'); await c.step(400);
    base = await c.anchor();

    // mode B: ENTER-walk to gy>=121
    for (let i = 0; i < 25; i++) {
      const b = await party();
      if (b.gs !== 5 || b.gy >= 121) break;
      await enter();
    }
    console.log(`reached free-roam frame: ${fmt(await party())}`);

    // unlock: drain the scripted walker with ENTERs until a LEFT turn takes. The
    // testTurnLeft itself turns the party (f0->f3) when it unlocks, so we then
    // turn back right to f0 to leave a clean facing-0 frame.
    let unlocked = false;
    for (let i = 0; i < 12; i++) {
      await enter();
      if (await testTurnLeft()) { unlocked = true; console.log(`UNLOCKED after ${i + 1} drain-ENTERs (LEFT took: ${fmt(await party())})`); break; }
    }
    if (!unlocked) { console.log('FAILED to unlock'); return; }
    // turn back to f0
    await c.key('right', 'tap'); await c.step(50);
    console.log(`back to f0: ${fmt(await party())}`);

    // Full turn cycle: left x4 should cycle 0->3->2->1->0; right x4 the reverse.
    console.log('\n--- LEFT x4 (expect 0->3->2->1->0) ---');
    for (let i = 0; i < 4; i++) { const b = await rd(O.f); await c.key('left', 'tap'); await c.step(50); console.log(`  f ${b}->${await rd(O.f)}`); }
    console.log('--- RIGHT x4 (expect 0->1->2->3->0) ---');
    for (let i = 0; i < 4; i++) { const b = await rd(O.f); await c.key('right', 'tap'); await c.step(50); console.log(`  f ${b}->${await rd(O.f)}`); }

    // Forward: from f0 (facing +gy), the front is a wall at gy121 (bump), so up is
    // a no-op; turn right (f1, facing +gx) and try forward into the open corridor.
    console.log('\n--- forward probes ---');
    let b = await party(); await c.key('up', 'tap'); await c.step(50);
    console.log(`  up @f0: ${fmt(b)} -> ${fmt(await party())}`);
    await c.key('left', 'tap'); await c.step(50); // f0->f3 (facing -gx)
    b = await party(); await c.key('up', 'tap'); await c.step(50);
    console.log(`  up @f3: ${fmt(b)} -> ${fmt(await party())}`);
    await c.key('right', 'tap'); await c.step(50); await c.key('right', 'tap'); await c.step(50); // f3->f0->f1
    b = await party(); await c.key('up', 'tap'); await c.step(50);
    console.log(`  up @f1: ${fmt(b)} -> ${fmt(await party())}`);

    console.log('\nFREE-ROAM NAVIGATION CONFIRMED.');
  } finally {
    c.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
