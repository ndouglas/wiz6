/**
 * discover-entrance.ts — drive a fresh boot through START NEW GAME and read
 * the party's starting position (gx, gy, z, facing) once the dungeon is live.
 *
 * DGROUP party fields (from maze-harness-movement.json + wmaze-3d-view.json):
 *   0x4f9a  facing (0..3)
 *   0x4f9c  z (level/region slot — overwritten by resolver)
 *   0x4f9e  cellA (y, the ×8 axis)
 *   0x4fa0  cellB (x, the ×1 axis)
 *   0x4fa2  gy (global y / cached)
 *   0x4fa4  gx (global x / cached)
 *   0x363a  game_state
 *   0x363c  current zone
 *
 * Usage: pnpm tsx tools/libretro/discover-entrance.ts
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const DGROUP_GAME_STATE = 0x363a;
const DGROUP_ZONE       = 0x363c;
const DGROUP_FACING     = 0x4f9a;
const DGROUP_Z          = 0x4f9c;
const DGROUP_CELL_A     = 0x4f9e;  // y (×8 axis)
const DGROUP_CELL_B     = 0x4fa0;  // x (×1 axis)
const DGROUP_GY         = 0x4fa2;
const DGROUP_GX         = 0x4fa4;

function u16(bytes: Uint8Array, off: number): number {
  return (bytes[off] ?? 0) | ((bytes[off + 1] ?? 0) << 8);
}

async function readPartyFields(c: HostClient): Promise<{
  game_state: number; zone: number;
  facing: number; z: number; cellA: number; cellB: number; gx: number; gy: number;
}> {
  const base = await c.anchor();
  // Read 14 bytes from facing (0x4f9a) through gx (0x4fa4), plus game_state + zone
  const pos = await c.read(base + DGROUP_FACING, 12);  // 0x4f9a..0x4fa5
  const gs  = await c.read(base + DGROUP_GAME_STATE, 4); // 0x363a..0x363d
  return {
    game_state: u16(gs, 0),
    zone:       u16(gs, 2),
    facing:     u16(pos, 0),   // 0x4f9a
    z:          u16(pos, 2),   // 0x4f9c
    cellA:      u16(pos, 4),   // 0x4f9e
    cellB:      u16(pos, 6),   // 0x4fa0
    gy:         u16(pos, 8),   // 0x4fa2
    gx:         u16(pos, 10),  // 0x4fa4
  };
}

async function main() {
  const c = new HostClient();
  try {
    console.log('Booting (3000 frames)…');
    await c.step(3000);

    console.log('Title → MASTER OPTIONS (tap Enter)…');
    await c.key('enter', 'tap'); await c.step(800);

    // Build a 3-member party (take first PCFILE char each time)
    for (let i = 0; i < 3; i++) {
      await c.key('enter', 'tap'); await c.step(60); // ADD PARTY MEMBER
      await c.key('enter', 'tap'); await c.step(60); // pick first char
      // Re-anchor cursor back at ADD PARTY MEMBER (3× up)
      await c.key('up', 'tap'); await c.key('up', 'tap'); await c.key('up', 'tap');
      await c.step(60);
      console.log(`  Added member ${i + 1}`);
    }

    // Navigate from ADD PARTY MEMBER to START NEW GAME (3× down in column-major grid)
    await c.key('down', 'tap'); await c.key('down', 'tap'); await c.key('down', 'tap');
    await c.step(60);
    console.log('Selecting START NEW GAME…');
    await c.key('enter', 'tap'); await c.step(300); // START NEW GAME

    console.log('Scenario pick (enter)…');
    await c.key('enter', 'tap'); await c.step(300); // scenario pick

    console.log('Entering dungeon (enter)…');
    await c.key('enter', 'tap'); await c.step(600); // → dungeon (game_state 5)

    // At this point we may be in the scripted-intro narration (modal enter-to-dismiss).
    // Dismiss any pending narration frames with up to 10 enter taps, settling between.
    console.log('Dismissing entry narration (up to 10 enter taps)…');
    for (let i = 0; i < 10; i++) {
      await c.key('enter', 'down'); await c.step(20);
      await c.key('enter', 'up');   await c.step(80);
    }
    // Extra settle
    await c.step(200);

    const fields = await readPartyFields(c);
    console.log('\n=== Party position at first controllable dungeon frame ===');
    console.log(`  game_state : ${fields.game_state} (expect 5 = wmaze)`);
    console.log(`  zone       : ${fields.zone}`);
    console.log(`  gx         : ${fields.gx}`);
    console.log(`  gy         : ${fields.gy}`);
    console.log(`  z          : ${fields.z}`);
    console.log(`  facing     : ${fields.facing}`);
    console.log(`  cellA(0x4f9e): ${fields.cellA}`);
    console.log(`  cellB(0x4fa0): ${fields.cellB}`);
    console.log('\n=== ENTRANCE (for extracted/maze/level-0.json) ===');
    console.log(JSON.stringify({ gx: fields.gx, gy: fields.gy, z: fields.z, facing: fields.facing }, null, 2));

  } finally {
    await c.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
