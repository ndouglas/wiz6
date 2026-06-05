/**
 * freeze-newgame-states.ts — freeze a COMMITTED serialize-state per TRUE distinct
 * START-NEW-GAME entry frame, then capture the full-screen 320x200 fixture FROM
 * that frozen state at the EXACT phase build-state.ts re-mints it (unserialize ->
 * step(remintStep) -> fb). Makes every scripted frame deterministically
 * re-mintable byte-exact, the same mechanism the MASTER OPTIONS / maze-corridor
 * fixtures use.
 *
 * TRUE distinct-frame sequence (verified 2026-06-05 by ENTER-by-ENTER live drive,
 * byte-classified bottom strip y144-199 + viewport diff + msg.json IDs):
 *   02 ENTERING title  — over the MAGICWORD prompt (gs=0xffff, gy=0, party not yet
 *                        placed); BLUE text (idx 1) "ENTERING / BANE OF THE COSMIC
 *                        FORGE" on the GRAY widget. NOT part of the dungeon; shown
 *                        while the copy-protection prompt is up.
 *   03 narration       — gy=118 gs=5; 3-line YELLOW (idx 5) "APPROACHING THE GATE
 *                        WITH CONFIDENCE, / YOU KNOW IF THINGS GET TOO HAIRY YOU /
 *                        CAN ALWAYS TURN AND RUN BACK OUT..." (msg 1313/1314/1315)
 *                        on a CLEAN BLACK strip. Auto-drawn on dungeon load.
 *   04 walk-gy119      — gy=119 gs=5; plain forward step, CLEAN BLACK strip (no text).
 *   05 walk-gy120 (LEGACY NAME) — gy=120 gs=5; TRUE content is "HMMMM..." (msg
 *                        1316) on the black strip, inner-gate viewport — a bump,
 *                        not a plain walk (the filename is kept for consumers).
 *   06 walk-gy121-hmmm — gy=121 gs=5; "HMMMM..." on the black strip, dead-end
 *                        stone-wall viewport (party reached the wall).
 *   07 entrance-chamber-gy121 — gy=121 gs=5; 3-line YELLOW "YOU ARE IN THE ENTRANCE
 *                        CHAMBER OF THE / CASTLE. IT APPEARS TO BE EMPTY, AND A /
 *                        HEAVY COAT OF DUST COVERS THE FLOOR." (msg 1317/1318/1319),
 *                        SAME viewport as 06.
 *
 * CRITICAL phase rule (root cause of the prior mis-phased fixtures):
 *   The bottom MESSAGE-WINDOW TEXT is NOT in the serialized framebuffer. After
 *   unserialize the engine RE-RUNS the message draw ~30 frames later. The prior
 *   pass captured + re-minted at step(5) — BEFORE the redraw — so the narration /
 *   ENTRANCE fixtures were BLANK black strips that "matched" at 100% only because
 *   --check also rendered the blank step(5). We capture AND re-mint at REMINT_STEP
 *   (>= text-draw + on a stable flicker phase); state-catalog sets recipe.remintStep
 *   to the same value so build-state.ts --check diffs 0.
 *
 * Determinism handling:
 *   - the MAGICWORD empty-pass is NON-DETERMINISTIC by tap-cadence (sometimes the
 *     box sticks), so we loop ENTER + settle until game_state flips to 5.
 *   - each frame is landed STATE-DRIVEN (game_state @ 0x363a + party gy @ 0x4fa2 +
 *     strip-has-text), never by a fixed step count.
 *   - the MAZE_VIEWPORT has a free-running torch/gate flicker, so a LIVE re-drive
 *     can't reproduce a frame byte-exact; the COMMITTED serialize-state does
 *     (unserialize -> step(REMINT_STEP) is deterministic across runs — verified).
 *
 * Outputs per frame:
 *   test-fixtures/states/<name>.state.gz          (committed pinned source)
 *   tools/parity/fixtures/engine/<name>.idx.gz    (test ground truth, has the text)
 *   tools/parity/fixtures/engine/<name>.png
 *
 * Verify reproducibility: pnpm tsx tools/libretro/build-state.ts <recipe> --check
 */
import { LiveSession } from '../../packages/mcp/src/live/live-session.js';
import { ALL_STRUCTS, buildStructRegistry } from '../../packages/data/src/index.js';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';
import { COMPOSED_PALETTE, SCREEN_WIDTH, SCREEN_HEIGHT } from '../parity/decode-screen.js';
import { gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const REPO = process.cwd();
const FIXTURES = resolve(REPO, 'tools/parity/fixtures/engine');
const COMMITTED_STATES = resolve(REPO, 'test-fixtures/states');
const TMP = '/tmp/wiz6-freeze';
mkdirSync(TMP, { recursive: true });
mkdirSync(COMMITTED_STATES, { recursive: true });

const STRUCTS = buildStructRegistry(ALL_STRUCTS);
const GAME_STATE = 0x363a;
const PARTY_GY = 0x4fa2;

// Render-settle after unserialize for the COMMITTED-STATE re-mint (must match the
// recipe.remintStep in state-catalog.ts). >= the message-text redraw (~30 frames)
// and on a flicker phase that is byte-stable across runs (verified: step(60) =
// 0-diff across 3 runs; the torch flicker oscillates with period ~ a few frames,
// so 60 lands on the same phase build-state's re-mint does).
const REMINT_STEP = 60;

function u16(b: Uint8Array, o = 0) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }

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

async function gameState(s: LiveSession): Promise<number> { return u16(await s.read(GAME_STATE, 2)); }
async function gy(s: LiveSession): Promise<number> { return u16(await s.read(PARTY_GY, 2)); }

/** Count strip (y144-199) palette-idx-5 (yellow text) pixels in the last screenshot. */
function stripYellow(rgba: Buffer): number {
  let n = 0;
  for (let y = 144; y < 200; y++) for (let x = 0; x < 320; x++) {
    const p = (y * 320 + x) * 4;
    if ((rgbToIdx.get((rgba[p]! << 16) | (rgba[p + 1]! << 8) | rgba[p + 2]!) ?? -1) === 5) n++;
  }
  return n;
}

/** Freeze a committed serialize-state + capture the fixture at the re-mint phase
 *  (serialize FIRST, then step(REMINT_STEP), then fb — the same path build-state.ts
 *  --check uses). Returns the strip-yellow count for the verification print. */
async function freeze(s: LiveSession, name: string): Promise<number> {
  const statePath = join(TMP, `${name}.state`);
  await s.serialize(statePath);
  writeFileSync(join(COMMITTED_STATES, `${name}.state.gz`), gzipSync(readFileSync(statePath)));
  // Re-render from the frozen state at the re-mint phase (do NOT use the live
  // running machine — it may be at a different flicker phase than a fresh
  // unserialize, which is what --check renders).
  await s.unserialize(statePath);
  await s.step(REMINT_STEP);
  const tmp = join(TMP, `${name}.rgba`);
  await s.screenshot(tmp);
  const rgba = readFileSync(tmp);
  const idx = rgbaToIndices(new Uint8Array(rgba));
  writeFileSync(join(FIXTURES, `${name}.idx.gz`), gzipSync(idx));
  const out = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT * 4);
  for (let p = 0; p < idx.length; p++) { const [r, g, b] = COMPOSED_PALETTE[idx[p]!]!; out[p * 4] = r; out[p * 4 + 1] = g; out[p * 4 + 2] = b; out[p * 4 + 3] = 255; }
  writeFileSync(join(FIXTURES, `${name}.png`), encodePngRgba(SCREEN_WIDTH, SCREEN_HEIGHT, out));
  const yellow = stripYellow(rgba);
  console.log(`  froze ${name}: gs=0x${(await gameState(s)).toString(16)} gy=${await gy(s)} strip-idx5=${yellow}`);
  // Restore the live machine to the frozen state so the caller can keep driving.
  await s.unserialize(statePath);
  return yellow;
}

async function main() {
  const s = new LiveSession(STRUCTS);
  try {
    await s.launch(3000);
    await s.key('enter', 'tap'); await s.step(800);   // title -> MASTER OPTIONS
    for (let i = 0; i < 6; i++) {
      await s.key('enter', 'tap'); await s.step(150);  // ADD PARTY MEMBER -> picker
      await s.key('enter', 'tap'); await s.step(150);  // pick first available char
      for (let u = 0; u < 4; u++) await s.key('up', 'tap');
      await s.step(80);
    }
    await s.key('down', 'tap'); await s.key('down', 'tap'); await s.step(120);  // -> START NEW GAME
    await s.key('enter', 'tap'); await s.step(600);    // START NEW GAME -> MAGICWORD prompt

    // FRAME 02: the ENTERING / BANE OF THE COSMIC FORGE title-card on the GRAY
    // widget, shown OVER the magicword prompt (gs still 0xffff, party gy=0). The
    // prompt is up now (we just settled 600 frames on it) — capture it here. The
    // gray-widget title text is in the serialized framebuffer (no message-window
    // redraw needed), so step(5) suffices — but we re-mint at REMINT_STEP for
    // uniformity and verify the strip below.
    await freeze(s, 'newgame-seq-02-entering-title');

    // Pass the MAGICWORD copy-protection (empty answer accepted in this env). The
    // empty-pass is NON-DETERMINISTIC frame-wise: loop ENTER + settle until gs->5.
    let passed = false;
    for (let attempt = 0; attempt < 16; attempt++) {
      await s.key('enter', 'tap'); await s.step(250);
      if (await gameState(s) === 5) { passed = true; break; }
    }
    if (!passed) throw new Error('MAGICWORD never passed (gs stuck at 0xffff) — re-run');

    // FRAME 03: narration at gy=118 (game_state 5), auto-drawn on dungeon load.
    // gs is already 5; settle so the 3-line text is fully drawn + stable.
    for (let f = 0; f < 100 && (await gy(s)) !== 118; f++) await s.step(3);
    await s.step(120);                                 // narration text fully drawn + stable
    const n03 = await freeze(s, 'newgame-seq-03-narration');
    if (n03 < 1500) throw new Error(`frame 03 narration MISSING text (strip-idx5=${n03}) — re-run`);

    // FRAMES 04..07: ENTER advances forward. First ENTER dismisses the narration
    // text without moving; subsequent ENTERs step gy 118->119->120->121. At the
    // wall the "HMMMM..." bump shows (gy120 then gy121 with different viewports),
    // then a further ENTER raises the ENTRANCE CHAMBER narration at gy=121.
    // Each target is landed STATE-DRIVEN (gy + strip-has-text), not a fixed count.

    // 04 walk-gy119: plain forward step (CLEAN BLACK strip, no text). Step until
    // gy=119 with an EMPTY strip.
    for (let attempt = 0; attempt < 8; attempt++) {
      if ((await gy(s)) === 119) {
        await s.screenshot(join(TMP, 'chk.rgba'));
        if (stripYellow(readFileSync(join(TMP, 'chk.rgba'))) === 0) break;
      }
      await s.key('enter', 'tap'); await s.step(300);
    }
    const n04 = await freeze(s, 'newgame-seq-04-walk-gy119');
    if (n04 !== 0) throw new Error(`frame 04 walk-gy119 should have EMPTY strip (got idx5=${n04}) — re-run`);

    // 05 bump-gy120-hmmm: step to gy=120 with HMMMM text present.
    for (let attempt = 0; attempt < 8; attempt++) {
      if ((await gy(s)) === 120) {
        await s.screenshot(join(TMP, 'chk.rgba'));
        if (stripYellow(readFileSync(join(TMP, 'chk.rgba'))) > 50) break;
      }
      await s.key('enter', 'tap'); await s.step(300);
    }
    const n05 = await freeze(s, 'newgame-seq-05-walk-gy120');
    if (n05 < 50 || n05 > 1000) throw new Error(`frame 05 should be HMMMM (~161 idx5; got ${n05}) — re-run`);

    // 06 deadend-gy121-hmmm: step to gy=121 with HMMMM still present (dead-end wall).
    for (let attempt = 0; attempt < 8; attempt++) {
      if ((await gy(s)) === 121) {
        await s.screenshot(join(TMP, 'chk.rgba'));
        const y = stripYellow(readFileSync(join(TMP, 'chk.rgba')));
        if (y > 50 && y < 1000) break;  // HMMMM, not yet the ENTRANCE narration
      }
      await s.key('enter', 'tap'); await s.step(300);
    }
    const n06 = await freeze(s, 'newgame-seq-06-walk-gy121-hmmm');
    if (n06 < 50 || n06 > 1000) throw new Error(`frame 06 should be HMMMM at gy121 (~161 idx5; got ${n06}) — re-run`);

    // 07 entrance-chamber-gy121: one more ENTER raises the 3-line ENTRANCE narration
    // (same gy=121 viewport). Step until the strip has the full 3-line text (>1500 idx5).
    for (let attempt = 0; attempt < 8; attempt++) {
      await s.screenshot(join(TMP, 'chk.rgba'));
      if (stripYellow(readFileSync(join(TMP, 'chk.rgba'))) > 1500) break;
      await s.key('enter', 'tap'); await s.step(300);
    }
    const n07 = await freeze(s, 'newgame-seq-07-entrance-chamber-gy121');
    if (n07 < 1500) throw new Error(`frame 07 ENTRANCE CHAMBER MISSING text (strip-idx5=${n07}) — re-run`);

    console.log('\nALL FRAMES FROZEN. Verify byte-exact re-mint:');
    for (const n of ['02-entering-title', '03-narration', '04-walk-gy119', '05-walk-gy120', '06-walk-gy121-hmmm', '07-entrance-chamber-gy121'])
      console.log(`  pnpm tsx tools/libretro/build-state.ts newgame-seq-${n} --check`);
  } finally { s.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
