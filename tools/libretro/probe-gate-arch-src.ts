/**
 * probe-gate-arch-src.ts — trace FUN_1c94 at the gate look-back to capture the
 * SOURCE image(s) it blits for the curved arch + portcullis leaf grid.
 *
 * Confirmed (probe-gate-arch.ts): FUN_1c94 (wall-replace) writes the gate-interior
 * leaf-grid bytes. This probe arms an instruction trace on the FUN_1c94 entry during
 * the gate recompose and dumps the entry register state of the first N hits — the
 * source pointer (DS:SI / the descriptor table the loop reads) identifies WHICH
 * atlas pieces produce the curve + leaf grid.
 *
 * Usage: pnpm tsx tools/libretro/probe-gate-arch-src.ts
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const GS = 0x363a, FACING = 0x4f9a, GYO = 0x4fa2, GXO = 0x4fa4, SPAN = 0x50ce;
const COMPOSE_PAGE = 0x41820, PS = 0x2000;
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
    if (p.gs !== 5) throw new Error(`encounter (gs=${p.gs})`);
    if (p.gy >= 121) break;
    await frEnter(c);
  }
  for (let i = 0; i < 30; i++) {
    await frEnter(c);
    const fb = await party(c, base);
    await c.key('left', 'tap'); await c.step(50);
    const fa = await party(c, base);
    if (fa.f !== fb.f) { await c.key('right', 'tap'); await c.step(50); return base; }
  }
  throw new Error('unlock failed');
}

async function main() {
  const c = new HostClient();
  try {
    const base = await driveToFreeRoam(c);
    for (let i = 0; i < 8; i++) {
      const s = await party(c, base);
      if (s.f === 2) break;
      await c.key('left', 'tap'); await c.step(45);
    }
    const s0 = await party(c, base);
    console.log('at gate:', JSON.stringify(s0));
    if (s0.f !== 2) { console.log('FAILED facing 2'); return; }
    await c.step(80);

    // First resolve the ega.drv base via the OR-cluster (one recompose).
    const writers = new Map<number, number>();
    await c.wwatchSet(COMPOSE_PAGE, COMPOSE_PAGE + 0x8000);
    await c.key('left', 'tap'); await c.step(8);
    for (let i = 0; i < 30; i++) { await c.step(6); for (const w of await c.wwatchDrain()) writers.set(w.cseip, (writers.get(w.cseip) ?? 0) + 1); }
    await c.key('right', 'tap'); await c.step(8);
    for (let i = 0; i < 20; i++) { await c.step(6); for (const w of await c.wwatchDrain()) writers.set(w.cseip, (writers.get(w.cseip) ?? 0) + 1); }
    await c.wwatchSet(0, 0);
    const ceset = new Set(writers.keys());
    let orBase = -1;
    for (const ce of ceset) {
      const b = ce - OR_PLANE_STORES[0]!;
      let sib = 0; for (const d of OR_PLANE_STORES.slice(1)) if (ceset.has(b + d)) sib++;
      if (sib >= 2) { orBase = b; break; }
    }
    if (orBase < 0) { console.log('no OR base'); return; }
    const fun1c94 = orBase + 0x1c94;
    console.log(`ega.drv base 0x${orBase.toString(16)}; FUN_1c94 entry 0x${fun1c94.toString(16)}`);

    // Trace FUN_1c94 entry over a fresh recompose; dump entry regs of first hits.
    await c.traceSet(fun1c94); await c.traceDrain();
    await c.key('left', 'tap'); await c.step(8);
    for (let i = 0; i < 25; i++) await c.step(6);
    await c.key('right', 'tap'); await c.step(8);
    for (let i = 0; i < 25; i++) await c.step(6);
    const recs = await c.traceDrain(); await c.traceOff();
    console.log(`FUN_1c94 entry hits: ${recs.length}`);
    for (let i = 0; i < Math.min(recs.length, 16); i++) {
      const r = recs[i]!;
      console.log(`  #${i} ds=0x${r.ds.toString(16)} si=0x${r.esi.toString(16)} di=0x${r.edi.toString(16)} cx=0x${r.ecx.toString(16)} bp=0x${r.ebp.toString(16)} ax=0x${r.eax.toString(16)} bx=0x${r.ebx.toString(16)} dx=0x${r.edx.toString(16)} stack=[${r.stack.map(w=>'0x'+w.toString(16)).join(',')}]`);
    }
  } finally {
    c.close();
  }
}
main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
