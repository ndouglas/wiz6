/**
 * capture-newgame-fixtures.ts — commit the FULL START-NEW-GAME entry sequence as
 * per-frame parity fixtures (.idx.gz + .png) under tools/parity/fixtures/engine/.
 *
 * Reproducible drive (FULL 6-member pinned-roster party):
 *   boot → title (enter) → MASTER OPTIONS
 *   → form 6 members: x6 [ ADD PARTY MEMBER (enter), pick first char (enter),
 *     re-anchor cursor (up x4) ]  (roster slots 0..5:
 *     THESUS / TEMPEST / LYSANDR / NOBAL / TREON / PENTAG;
 *     panel = left col THESUS/LYSANDR/TREON, right col TEMPEST/NOBAL/PENTAG)
 *   → cursor on REVIEW MEMBER; down x2 → START NEW GAME (enter)
 *   → MAGICWORD copy-protection prompt; 3x enter passes it (empty answer)
 *   → "ENTERING / BANE OF THE COSMIC FORGE" title → dungeon (game_state 5)
 *   → narration "APPROACHING THE GATE..." over the rendered dungeon view
 *   → enter dismisses; 3 forward walk steps (gy 118→121); HMMMM bump; free-roam
 *
 * Frames captured (named by sequence position):
 *   newgame-seq-00-master-options   — MASTER OPTIONS, 6-member party (pre-START)
 *   newgame-seq-01-magicword        — copy-protection prompt (over castle art)
 *   newgame-seq-02-entering-title   — "ENTERING BANE OF THE COSMIC FORGE"
 *   newgame-seq-03-narration        — "APPROACHING THE GATE..." over dungeon (gy=118)
 *   newgame-seq-04-walk-gy119       — first forward step
 *   newgame-seq-05-walk-gy120       — second forward step
 *   newgame-seq-06-walk-gy121-hmmm  — dead-end bump, "HMMMM..." (gy=121)
 *
 * THE CRUX (resolved): the narration renders over the LIVE dungeon view (the
 * green/colored portcullis inner gate is in the MAZE_VIEWPORT) — NOT a solid
 * black background. Single-frame tracing of the state flip shows the viewport is
 * never all-black at any point in the transition.
 *
 * NOTE on determinism: the dungeon view has a free-running torch/gate flicker
 * (palette 5↔8 at the gate center) and the bottom-right corner can carry the
 * composited mouse cursor — both are why we park the mouse off-screen and accept
 * that the VIEWPORT region is partial-fidelity. The MESSAGE-STRIP region
 * (y>=144) is the deterministic, gateable region for narration/HMMMM text.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';
import { COMPOSED_PALETTE, SCREEN_WIDTH, SCREEN_HEIGHT } from '../parity/decode-screen.js';
import { gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
const FIXTURES = resolve(process.cwd(), 'tools/parity/fixtures/engine');
const rgbToIdx = new Map<number, number>();
COMPOSED_PALETTE.forEach(([r, g, b], i) => rgbToIdx.set((r << 16) | (g << 8) | b, i));
function rgbaToIndices(rgba: Uint8Array): Uint8Array {
  const idx = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT);
  let miss = 0, firstMiss = -1;
  for (let p = 0; p < idx.length; p++) {
    const i = rgbToIdx.get((rgba[p * 4]! << 16) | (rgba[p * 4 + 1]! << 8) | rgba[p * 4 + 2]!);
    if (i === undefined) { miss++; if (firstMiss < 0) firstMiss = p; idx[p] = 0; } else idx[p] = i;
  }
  if (miss) console.warn(`  WARN ${miss} non-palette px (first @${firstMiss}, x=${firstMiss % 320} y=${Math.floor(firstMiss / 320)})`);
  return idx;
}
async function commit(c: HostClient, name: string) {
  // Park the mouse cursor off-screen so the composited cursor sprite doesn't
  // pollute the fixture (it otherwise lands at a random bottom-right spot).
  await c.mouse(-4000, -4000); await c.step(2);
  await c.mouse(-4000, -4000); await c.step(2);
  await c.mouse(-4000, -4000); await c.step(8);
  const tmp = `/tmp/wiz6-fix-${name}.rgba`;
  await c.fb(tmp);
  const rgba = readFileSync(tmp);
  const idx = rgbaToIndices(rgba);
  writeFileSync(resolve(FIXTURES, `${name}.idx.gz`), gzipSync(idx));
  const out = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT * 4);
  for (let p = 0; p < idx.length; p++) { const [r, g, b] = COMPOSED_PALETTE[idx[p]!]!; out[p * 4] = r; out[p * 4 + 1] = g; out[p * 4 + 2] = b; out[p * 4 + 3] = 255; }
  writeFileSync(resolve(FIXTURES, `${name}.png`), encodePngRgba(SCREEN_WIDTH, SCREEN_HEIGHT, out));
  console.log(`  committed ${name}.idx.gz + .png`);
}

async function main() {
  const c = new HostClient();
  try {
    await c.step(3000);
    await c.key('enter', 'tap'); await c.step(800);   // title → MASTER OPTIONS
    for (let i = 0; i < 6; i++) {
      await c.key('enter', 'tap'); await c.step(150);  // ADD PARTY MEMBER → picker
      await c.key('enter', 'tap'); await c.step(150);  // pick first available char
      await c.key('up', 'tap'); await c.key('up', 'tap'); await c.key('up', 'tap'); await c.key('up', 'tap'); await c.step(80);
    }
    await commit(c, 'newgame-seq-00-master-options');

    await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(120);  // → START NEW GAME
    await c.key('enter', 'tap'); await c.step(400);   // START NEW GAME → magicword
    await commit(c, 'newgame-seq-01-magicword');

    // Pass the magicword (empty ENTER x3 accepted in this env). The exact frame
    // timing of the pass + the transient ENTERING title is NON-DETERMINISTIC, so
    // capture by STATE, not by frame count:
    //   - seq-02 ENTERING title: poll for the strip "title band" (>15500
    //     non-black) while game_state is still 0xffff (pre-flip).
    //   - seq-03 narration: poll until game_state==5 (dungeon loaded), gy still
    //     118; let the narration text finish drawing, then commit.
    await c.key('enter', 'tap'); await c.step(150);   // magicword pass 1
    await c.key('enter', 'tap'); await c.step(150);   // magicword pass 2
    await c.key('enter', 'tap');                       // magicword pass 3 → loads dungeon

    let titled = false;
    for (let f = 0; f < 90; f++) {
      const g = u16(await c.read((await c.anchor()) + 0x363a, 2), 0);
      if (g === 5) break;  // flipped before we caught the title
      await c.fb('/tmp/wiz6-titlescan.rgba');
      const rgba = readFileSync('/tmp/wiz6-titlescan.rgba');
      let strip = 0; for (let y = 144; y < 200; y++) for (let x = 0; x < 320; x++) { const p = (y * 320 + x) * 4; if ((rgba[p]! | rgba[p + 1]! | rgba[p + 2]!) !== 0) strip++; }
      if (strip > 15500) { titled = true; break; }  // ENTERING title band (~16960)
      await c.step(1);
    }
    if (!titled) console.warn('  WARN seq-02 did not land on the ENTERING title band (it flashed past)');
    await commit(c, 'newgame-seq-02-entering-title');

    // Narration: wait for game_state==5 (dungeon), confirm gy==118, settle text.
    async function waitGs5(): Promise<void> {
      for (let f = 0; f < 200; f++) {
        if (u16(await c.read((await c.anchor()) + 0x363a, 2), 0) === 5) return;
        await c.step(2);
      }
    }
    async function gy(): Promise<number> { return u16(await c.read((await c.anchor()) + 0x4fa2, 2), 0); }
    await waitGs5();
    await c.step(60);  // narration text fully drawn
    console.log(`  narration frame: gy=${await gy()}`);
    await commit(c, 'newgame-seq-03-narration');

    // Walk: ENTER advances one cell each (gy 118→119→120→121). Capture by gy.
    const targets: Array<[number, string]> = [
      [119, 'newgame-seq-04-walk-gy119'],
      [120, 'newgame-seq-05-walk-gy120'],
      [121, 'newgame-seq-06-walk-gy121-hmmm'],
    ];
    for (const [tgt, name] of targets) {
      // Press ENTER until gy reaches the target (first ENTER dismisses the
      // narration text without moving; subsequent ENTERs step forward).
      for (let attempt = 0; attempt < 6 && (await gy()) < tgt; attempt++) {
        await c.key('enter', 'tap'); await c.step(300);
      }
      console.log(`  ${name}: gy=${await gy()}`);
      await commit(c, name);
    }
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
