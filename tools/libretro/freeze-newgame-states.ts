/**
 * freeze-newgame-states.ts — freeze a COMMITTED serialize-state per scripted
 * START-NEW-GAME entry frame (02..06) at a fixed animation phase, then capture
 * the full-screen 320x200 fixture FROM that frozen state. Makes every scripted
 * frame deterministically re-mintable byte-exact (unserialize -> step(5) -> fb),
 * the same mechanism the MASTER OPTIONS / maze-corridor fixtures use.
 *
 * Reproducible drive (FULL 6-member pinned-roster party THESUS/TEMPEST/LYSANDR/
 * NOBAL/TREON/PENTAG, test-fixtures/original/pcfile.dbs slots 0..5):
 *   boot 3000 -> title (enter) -> MASTER OPTIONS
 *   -> form 6 members [x6: enter(ADD), enter(pick first), up x4 (re-anchor)]
 *   -> down x2 -> START NEW GAME (enter)
 *   -> MAGICWORD prompt; enter x3 (empty pass; magicword SKIPPED in the port)
 *   -> "ENTERING / BANE OF THE COSMIC FORGE" title-card (frame 02; game_state
 *      still 0xffff; caught by title-band scan)
 *   -> dungeon loads (game_state 5); narration "APPROACHING THE GATE..."
 *      at gy=118 (frame 03)
 *   -> ENTER dismisses; 3 forward walk steps gy 119/120/121 (frames 04/05/06);
 *      "HMMMM..." front-wall bump at gy=121 (frame 06)
 *
 * Determinism handling (per maze-newgame-sequence-frames.json caveats):
 *   - the magicword empty-pass + the ENTERING title flash are NON-DETERMINISTIC
 *     by tap-cadence, so each frame is landed STATE-DRIVEN (poll game_state at
 *     DGROUP 0x363a + party gy at 0x4fa2), never by fixed step counts.
 *   - the MAZE_VIEWPORT has a free-running torch/gate flicker, so a LIVE re-drive
 *     can't reproduce a frame byte-exact; the COMMITTED serialize-state does.
 *
 * Outputs per frame (NN in 02..06):
 *   test-fixtures/states/newgame-seq-NN-*.state.gz          (committed pinned source)
 *   tools/parity/fixtures/engine/newgame-seq-NN-*.idx.gz    (test ground truth)
 *   tools/parity/fixtures/engine/newgame-seq-NN-*.png
 *
 * After running, verify reproducibility via the matching state-catalog recipes:
 *   pnpm tsx tools/libretro/build-state.ts <recipe> --check   (0-diff gate)
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

async function gameState(s: LiveSession): Promise<number> {
  return u16(await s.read(GAME_STATE, 2));
}
async function gy(s: LiveSession): Promise<number> {
  return u16(await s.read(PARTY_GY, 2));
}

/** Freeze a committed serialize-state + capture the fixture (idx.gz + png).
 *  CRITICAL: the committed-state re-mint path (build-state.ts --check) renders
 *  via unserialize -> step(5) -> fb. To make the committed FIXTURE byte-match
 *  that re-mint, we must capture the fixture at the SAME phase: serialize FIRST,
 *  then step(5), then screenshot. (The viewport has a free-running torch/gate
 *  flicker, so capturing pre-step(5) drifts vs the re-mint by 5 frames.) */
async function freeze(s: LiveSession, name: string): Promise<void> {
  const statePath = join(TMP, `${name}.state`);
  await s.serialize(statePath);
  writeFileSync(join(COMMITTED_STATES, `${name}.state.gz`), gzipSync(readFileSync(statePath)));
  await s.step(5); // match build-state.ts committed-state re-mint phase
  const tmp = join(TMP, `${name}.rgba`);
  await s.screenshot(tmp);
  const rgba = new Uint8Array(readFileSync(tmp));
  const idx = rgbaToIndices(rgba);
  writeFileSync(join(FIXTURES, `${name}.idx.gz`), gzipSync(idx));
  const out = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT * 4);
  for (let p = 0; p < idx.length; p++) { const [r, g, b] = COMPOSED_PALETTE[idx[p]!]!; out[p * 4] = r; out[p * 4 + 1] = g; out[p * 4 + 2] = b; out[p * 4 + 3] = 255; }
  writeFileSync(join(FIXTURES, `${name}.png`), encodePngRgba(SCREEN_WIDTH, SCREEN_HEIGHT, out));
  console.log(`  froze ${name}: state.gz + idx.gz + png (gs=${await gameState(s)} gy=${await gy(s)})`);
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
    await s.key('enter', 'tap'); await s.step(600);    // START NEW GAME -> magicword (LONG settle)

    // Pass the MAGICWORD copy-protection (empty answer accepted in this env). The
    // empty-pass needs a LONG settle (~300 frames) per ENTER to actually process;
    // tighter cadences leave the box stuck (genuinely non-deterministic frame-wise).
    await s.key('enter', 'tap'); await s.step(300);    // magicword pass 0
    await s.key('enter', 'tap');                        // magicword pass 1 -> ENTERING title -> dungeon

    // FRAME 02: the "ENTERING / BANE OF THE COSMIC FORGE" title-card on the GRAY
    // bottom widget (NOT a black strip) with BLUE text (palette idx 1), game_state
    // still 0xffff. It is transient (~8 frames) between the magicword clear and the
    // dungeon flip. The transition advances on a cadence that needs chunk-stepping
    // (step 3) to land a screenshot inside the window — a step(1)+screenshot loop
    // interferes with the magicword-clear processing and never reaches the title.
    // The title is a STABLE plateau (waits for the engine's auto-advance) so it
    // survives unserialize -> step(5) byte-exact.
    function titleBand(rgba: Buffer): { blue: number; gray: number } {
      let blue = 0, gray = 0;
      const [br, bg, bb] = COMPOSED_PALETTE[1]!;
      const [gr, gg, gb] = COMPOSED_PALETTE[8]!;
      for (let y = 144; y < 200; y++) for (let x = 0; x < 320; x++) {
        const p = (y * 320 + x) * 4;
        if (rgba[p] === br && rgba[p + 1] === bg && rgba[p + 2] === bb) blue++;
        else if (rgba[p] === gr && rgba[p + 1] === gg && rgba[p + 2] === gb) gray++;
      }
      return { blue, gray };
    }
    let titled = false;
    for (let i = 0; i < 80; i++) {
      const gs = await gameState(s);
      const cand = join(TMP, 'title-cand.state');
      await s.serialize(cand);
      await s.screenshot(join(TMP, 'scan.rgba'));
      const { blue, gray } = titleBand(readFileSync(join(TMP, 'scan.rgba')));
      if (gs !== 5 && blue > 30 && gray > 3000) {
        // Commit the caught title state, render the fixture at the re-mint phase.
        writeFileSync(join(COMMITTED_STATES, 'newgame-seq-02-entering-title.state.gz'), gzipSync(readFileSync(cand)));
        await s.unserialize(cand); await s.step(5);
        const tmp = join(TMP, 'newgame-seq-02-entering-title.rgba');
        await s.screenshot(tmp);
        const idx = rgbaToIndices(new Uint8Array(readFileSync(tmp)));
        writeFileSync(join(FIXTURES, 'newgame-seq-02-entering-title.idx.gz'), gzipSync(idx));
        const out = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT * 4);
        for (let p = 0; p < idx.length; p++) { const [r, g, b] = COMPOSED_PALETTE[idx[p]!]!; out[p * 4] = r; out[p * 4 + 1] = g; out[p * 4 + 2] = b; out[p * 4 + 3] = 255; }
        writeFileSync(join(FIXTURES, 'newgame-seq-02-entering-title.png'), encodePngRgba(SCREEN_WIDTH, SCREEN_HEIGHT, out));
        console.log(`  froze newgame-seq-02-entering-title: state.gz + idx.gz + png (gs=ffff blue=${blue} gray=${gray})`);
        await s.unserialize(cand);  // resume from title frame for the narration drive
        titled = true;
        break;
      }
      if (gs === 5) break;
      await s.step(3);  // chunk-step (load-bearing: catches the transient title window)
    }
    if (!titled) console.warn('  WARN frame 02 ENTERING title not caught (re-run; it is a ~8-frame window)');

    // FRAME 03: narration at gy=118 (game_state 5). Wait for the flip, settle text.
    for (let f = 0; f < 200; f++) { if (await gameState(s) === 5) break; await s.step(2); }
    await s.step(60);                                   // narration text fully drawn
    await freeze(s, 'newgame-seq-03-narration');

    // FRAMES 04/05/06: ENTER advances one cell each (gy 118->119->120->121).
    // First ENTER dismisses the narration text without moving.
    const targets: Array<[number, string]> = [
      [119, 'newgame-seq-04-walk-gy119'],
      [120, 'newgame-seq-05-walk-gy120'],
      [121, 'newgame-seq-06-walk-gy121-hmmm'],
    ];
    for (const [tgt, name] of targets) {
      for (let attempt = 0; attempt < 6 && (await gy(s)) < tgt; attempt++) {
        await s.key('enter', 'tap'); await s.step(300);
      }
      await freeze(s, name);
    }
  } finally { s.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
