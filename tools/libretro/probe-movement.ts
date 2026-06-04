/**
 * probe-movement.ts — exploratory: confirm dungeon movement keys + sequences.
 */
import { resolve } from 'node:path';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const STATE = resolve(process.argv[2] ?? 'tools/libretro/states/maze-corridor.state');

const F = { game_state: 0x363a, facing: 0x4f9a, x: 0x4f9e, z_or_y: 0x4fa0, gy: 0x4fa2, gx: 0x4fa4 } as const;

async function u16(c: HostClient, base: number, off: number): Promise<number> {
  const b = await c.read(base + off, 2); return b[0]! | (b[1]! << 8);
}
interface Snap { gs: number; facing: number; x: number; zy: number; gx: number; gy: number; }
async function snap(c: HostClient, base: number): Promise<Snap> {
  return {
    gs: await u16(c, base, F.game_state), facing: await u16(c, base, F.facing),
    x: await u16(c, base, F.x), zy: await u16(c, base, F.z_or_y),
    gx: await u16(c, base, F.gx), gy: await u16(c, base, F.gy),
  };
}
const fmt = (s: Snap) => `facing=${s.facing} x=${s.x} zy=${s.zy} gx=${s.gx} gy=${s.gy}`;

async function restore(c: HostClient): Promise<number> {
  await c.unserialize(STATE); await c.step(2); return c.anchor();
}
const tap = (c: HostClient, k: string, settle = 40) => async () => { await c.key(k, 'tap'); await c.step(settle); };

async function main() {
  const c = new HostClient();
  try {
    await c.step(3000);
    const base = await restore(c);
    console.log(`base=0x${base.toString(16)}  START: ${fmt(await snap(c, base))}`);

    // 1. Full facing cycle via left, then via right.
    console.log('\n--- 4x LEFT (expect facing 0->3->2->1->0) ---');
    await restore(c);
    for (let i = 0; i < 5; i++) { console.log(`  ${fmt(await snap(c, base))}`); await tap(c, 'left')(); }
    console.log('\n--- 4x RIGHT (expect facing 0->1->2->3->0) ---');
    await restore(c);
    for (let i = 0; i < 5; i++) { console.log(`  ${fmt(await snap(c, base))}`); await tap(c, 'right')(); }

    // 2. Forward then back (turn around first so back isn't wall-blocked).
    console.log('\n--- forward x3 then back x3 (facing 0) ---');
    await restore(c);
    console.log(`  start  ${fmt(await snap(c, base))}`);
    for (let i = 0; i < 3; i++) { await tap(c, 'up')(); console.log(`  fwd${i+1}  ${fmt(await snap(c, base))}`); }
    for (let i = 0; i < 3; i++) { await tap(c, 'down')(); console.log(`  back${i+1} ${fmt(await snap(c, base))}`); }

    // 3. Turn 180 (right x2) then step forward — confirms movement after a turn.
    console.log('\n--- right x2 (180), then up x2 ---');
    await restore(c);
    console.log(`  start  ${fmt(await snap(c, base))}`);
    await tap(c, 'right')(); await tap(c, 'right')();
    console.log(`  180    ${fmt(await snap(c, base))}`);
    for (let i = 0; i < 2; i++) { await tap(c, 'up')(); console.log(`  fwd${i+1}  ${fmt(await snap(c, base))}`); }

    // 4. Why did `down` do nothing from start? Check the cell behind.
    console.log('\n--- down from start (single) ---');
    await restore(c);
    console.log(`  before ${fmt(await snap(c, base))}`);
    await tap(c, 'down')();
    console.log(`  after  ${fmt(await snap(c, base))}  (NO CHANGE = wall behind)`);
  } finally {
    c.close();
  }
}
main();
