/**
 * probe-gate-arch.ts — RULE FUN_1c94 IN/OUT for the entrance-gate ORNATE-ARCH /
 * PORTCULLIS-LEAF interior (the ~11% the FUN_0a93 OR call-list does NOT reproduce).
 *
 * Background (offline diagnosis): the gate look-back (gx127 gy121 f2) FUN_0a93 OR
 * call-list is byte-identical to ours (34 OR / 0 masked). Self-composing JUST that
 * OR list draws the ornate STONE-ARCH FRAME correctly (curved top) but leaves the
 * recess INTERIOR black; the engine fills the recess with a regular PORTCULLIS LEAF
 * GRID (gold/red lattice). That leaf grid is NOT in the FUN_0a93 trace. This probe
 * write-watches the off-screen compose page (0x41820) during a gate recompose and
 * buckets each write by cseip + by whether the byte lands in the GATE-INTERIOR page
 * region (the leaf grid) vs the frame/background. Mapping the interior cseips back to
 * a routine (FUN_0a93 OR-blit cluster vs FUN_1c94 wall-replace vs a decoration path)
 * answers: what draws the leaf grid?
 *
 * Drive: COLD-BOOT + free-roam UNLOCK (the patched core cannot unserialize the
 * committed states — err unser). Then turn to facing 2 (look back at the gate).
 *
 * Usage: pnpm tsx tools/libretro/probe-gate-arch.ts
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const GS = 0x363a, FACING = 0x4f9a, GYO = 0x4fa2, GXO = 0x4fa4, SPAN = 0x50ce;
const COMPOSE_PAGE = 0x41820, PS = 0x2000, ROWB = 40;
const OR_PLANE_STORES = [0xb31, 0xb45, 0xb5c, 0xb75];

function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
async function party(c: HostClient, base: number) {
  const rd = async (off: number) => u16(await c.read(base + off, 2), 0);
  return { gs: await rd(GS), f: await rd(FACING), gx: await rd(GXO), gy: await rd(GYO), sp: await rd(SPAN) };
}
async function frEnter(c: HostClient) {
  await c.key('enter', 'down'); await c.step(24); await c.key('enter', 'up'); await c.step(70);
}
async function driveToFreeRoam(c: HostClient): Promise<number> {
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
  const base = await c.anchor();
  for (let i = 0; i < 25; i++) {
    const p = await party(c, base);
    if (p.gs !== 5) throw new Error(`encounter/menu (gs=${p.gs}) during entry walk`);
    if (p.gy >= 121) break;
    await frEnter(c);
  }
  for (let i = 0; i < 30; i++) {
    await frEnter(c);
    const fb = await party(c, base);
    await c.key('left', 'tap'); await c.step(50);
    const fa = await party(c, base);
    if (fa.f !== fb.f) {
      await c.key('right', 'tap'); await c.step(50); // back to facing 0
      return base;
    }
  }
  throw new Error('free-roam unlock failed after 30 drain-ENTERs');
}

// The gate-INTERIOR (leaf grid) screen rect, from the offline ASCII diff. The frame
// is OUTSIDE this; the interior is the recessed portcullis lattice.
const INT_X0 = 138, INT_X1 = 186, INT_Y0 = 54, INT_Y1 = 130;
const interiorBytes = new Set<number>();
for (let y = INT_Y0; y <= INT_Y1; y++)
  for (let x = INT_X0; x <= INT_X1; x++)
    for (let p = 0; p < 4; p++)
      interiorBytes.add(COMPOSE_PAGE + p * PS + y * ROWB + (x >> 3));

async function main() {
  const c = new HostClient();
  try {
    const base = await driveToFreeRoam(c);
    console.log('free-roam unlocked:', JSON.stringify(await party(c, base)));

    // Turn to facing 2. LEFT cycles 0->3->2->1->0, so from f0: LEFT,LEFT -> f2.
    for (let i = 0; i < 8; i++) {
      const s = await party(c, base);
      if (s.f === 2) break;
      await c.key('left', 'tap'); await c.step(45);
    }
    let s = await party(c, base);
    console.log('after turn:', JSON.stringify(s));
    if (s.f !== 2) { console.log('FAILED to reach facing 2'); return; }
    await c.step(80);

    // Write-watch the compose page over an in-place recompose (LEFT then RIGHT back).
    const writers = new Map<number, { total: number; interior: number }>();
    await c.wwatchSet(COMPOSE_PAGE, COMPOSE_PAGE + 0x8000);
    const drain = async () => {
      for (const w of await c.wwatchDrain()) {
        const e = writers.get(w.cseip) ?? { total: 0, interior: 0 };
        e.total++;
        if (interiorBytes.has(w.addr)) e.interior++;
        writers.set(w.cseip, e);
      }
    };
    await c.key('left', 'tap'); await c.step(8);
    for (let i = 0; i < 30; i++) { await c.step(6); await drain(); }
    await c.key('right', 'tap'); await c.step(8);
    for (let i = 0; i < 30; i++) { await c.step(6); await drain(); }
    await c.wwatchSet(0, 0);

    s = await party(c, base);
    console.log('after recompose:', JSON.stringify(s));

    // Recover the OR-blit base (the FUN_0a93 plane-store cluster) to label cseips.
    const ceset = new Set(writers.keys());
    let orBase = -1;
    for (const ce of ceset) {
      const b = ce - OR_PLANE_STORES[0]!;
      let sib = 0;
      for (const d of OR_PLANE_STORES.slice(1)) if (ceset.has(b + d)) sib++;
      if (sib >= 2) { orBase = b; break; }
    }
    console.log(`OR-blit base = ${orBase >= 0 ? '0x' + orBase.toString(16) : 'NOT FOUND'}`);
    if (orBase >= 0) {
      console.log(`  FUN_0a93 OR-blit entry = 0x${(orBase + 0xa93).toString(16)}, plane stores @ ${OR_PLANE_STORES.map(d => '0x' + (orBase + d).toString(16)).join(',')}`);
      console.log(`  FUN_1c94 wall-replace entry = 0x${(orBase + 0x1c94).toString(16)}`);
    }
    const label = (ce: number): string => {
      if (orBase < 0) return `cs:0x${ce.toString(16)}`;
      const off = ce - orBase;
      if (off >= 0xa93 && off <= 0xc20) return 'FUN_0a93(OR)';
      if (off >= 0x1c94 && off <= 0x2100) return 'FUN_1c94(wall-replace)';
      return `egadrv+0x${off.toString(16)}`;
    };

    console.log('\n=== compose-page writers, sorted by INTERIOR writes (leaf-grid bytes) ===');
    const sorted = [...writers.entries()].sort((a, b) => b[1].interior - a[1].interior);
    for (const [ce, cnt] of sorted.slice(0, 25))
      console.log(`  cseip 0x${ce.toString(16)}  total=${cnt.total}  INTERIOR=${cnt.interior}  [${label(ce)}]`);
    const totalInterior = [...writers.values()].reduce((a, e) => a + e.interior, 0);
    console.log(`\nTOTAL interior (leaf-grid) writes: ${totalInterior}`);
    const byRoutine = new Map<string, number>();
    for (const [ce, cnt] of writers) byRoutine.set(label(ce), (byRoutine.get(label(ce)) ?? 0) + cnt.interior);
    console.log('interior writes by routine:');
    for (const [r, n] of [...byRoutine.entries()].sort((a, b) => b[1] - a[1])) if (n > 0) console.log(`  ${r}: ${n}`);
  } finally {
    c.close();
  }
}
main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
