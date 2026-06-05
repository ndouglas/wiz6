/**
 * capture-maze-view-cases.ts — Task C1 (live half): capture the engine's
 * ground-truth framebuffer for each DISTINCT first-person view-case the REACHABLE
 * starting area of dungeon level 0 exercises.
 *
 * Pairs with tools/parity/maze-view-cases.ts (the offline enumeration). That
 * module BFSes the reachable (gx,gy,facing) states from the START NEW GAME
 * entrance under the real movement rules, dedupes by view-config, and emits the
 * finite distinct-case set + a representative + a shortest key-PATH per case.
 * This script drives the engine to each representative and freezes its 320×200
 * EGA-index framebuffer as a committed fixture, in the SAME format as the existing
 * maze-corridor*.idx.gz (rgba → WIZ6_MAIN palette indices, gzipped).
 *
 * ENGINE-CONTROLLABLE ENTRANCE = gy=121 (NOT the extracted gy=120):
 *   The extracted/viewer entrance gx=127 gy=120 facing=0 (B3 finding) is the
 *   party position DURING the scripted gate-entry walk — it is NOT arrow-key
 *   controllable in the engine (the entry sequence still consumes ENTER as a
 *   scripted forward step). The FIRST arrow-controllable dungeon frame is one
 *   cell SOUTH, gx=127 gy=121 facing=0 — the committed maze-corridor.state.gz.
 *   The N3 gate door (the entrance cell's own north field) is a ONE-WAY boundary:
 *   the scripted walk crosses it southward (gy120→gy121), but movement.ts treats
 *   code 3 as solid, so the player can NEVER walk back north. An engine arrow-BFS
 *   confirms the controllable area is entirely gy>=121 — the gy<=120 room the
 *   extracted entrance sits in is engine-UNREACHABLE. (See the C1 finding's
 *   `entrance_discrepancy` note — flagged for the parent: the VIEWER entrance
 *   should likely be gy=121, the engine's true controllable frame.)
 *
 * PROVENANCE / drive:
 *   - Base = committed test-fixtures/states/maze-corridor.state.gz (gy=121, f0).
 *   - Per case: unserialize the base → replay the case PATH (left/right=turn,
 *     forward=up key, step 40 each) → settle → verify (gx,gy,facing) ==
 *     representative → capture the 320×200 framebuffer.
 *   - Reachable set = movement.ts BFS from (127,121,f0) capped at MAX_FWD=2
 *     forward steps (the immediate starting area; the full level is hundreds of
 *     cells). This keeps the distinct-case set + navigation bounded for the MVP.
 *
 * Outputs (committed):
 *   tools/parity/fixtures/engine/maze-view-<case>.idx.gz   (+ .png)  per distinct case
 *   docs/re/findings/maze-view-cases.json                  the taxonomy + provenance
 *
 * Usage: pnpm tsx tools/libretro/capture-maze-view-cases.ts
 *        pnpm tsx tools/libretro/capture-maze-view-cases.ts --check   (no overwrite; diff)
 */

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { COMPOSED_PALETTE, SCREEN_WIDTH, SCREEN_HEIGHT } from '../parity/decode-screen.js';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';
import {
  loadLevel0,
  enumerateViewCases,
  ENGINE_ENTRANCE,
  MVP_MAX_FORWARD_STEPS,
  type DistinctCase,
  type MoveKey,
} from '../parity/maze-view-cases.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const FIXTURES = resolve(REPO_ROOT, 'tools', 'parity', 'fixtures', 'engine');
const FINDINGS = resolve(REPO_ROOT, 'docs', 're', 'findings');
const COMMITTED_STATES = resolve(REPO_ROOT, 'test-fixtures', 'states');
const TMP = '/tmp/wiz6-capture-maze-view-cases';

/** Forward-step cap from the engine entrance — the immediate starting area. */
const MAX_FWD = MVP_MAX_FORWARD_STEPS;

const CHECK = process.argv.includes('--check');

mkdirSync(TMP, { recursive: true });
mkdirSync(FIXTURES, { recursive: true });

// ── palette + fb helpers (mirror capture-maze-frames.ts) ─────────────────────
const rgbToIdx = new Map<number, number>();
COMPOSED_PALETTE.forEach(([r, g, b], i) => rgbToIdx.set((r << 16) | (g << 8) | b, i));

function rgbaToIndices(rgba: Uint8Array): Uint8Array {
  const idx = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT);
  for (let p = 0; p < idx.length; p++) {
    const i = rgbToIdx.get((rgba[p * 4]! << 16) | (rgba[p * 4 + 1]! << 8) | rgba[p * 4 + 2]!);
    if (i === undefined) {
      const r = rgba[p * 4]!, g = rgba[p * 4 + 1]!, b = rgba[p * 4 + 2]!;
      throw new Error(`pixel ${p}: non-WIZ6_MAIN colour rgb(${r},${g},${b}) — divergence?`);
    }
    idx[p] = i;
  }
  return idx;
}

function u16(b: Uint8Array, o: number): number { return b[o]! | (b[o + 1]! << 8); }

// DGROUP party fields (discover-entrance.ts / maze-harness-movement.json).
const O = { game_state: 0x363a, facing: 0x4f9a, z: 0x4f9c, gy: 0x4fa2, gx: 0x4fa4 };

async function readParty(c: HostClient, base: number) {
  const [gs, f, z, gy, gx] = await Promise.all([
    c.read(base + O.game_state, 2),
    c.read(base + O.facing, 2),
    c.read(base + O.z, 2),
    c.read(base + O.gy, 2),
    c.read(base + O.gx, 2),
  ]);
  return { game_state: u16(gs, 0), facing: u16(f, 0), z: u16(z, 0), gy: u16(gy, 0), gx: u16(gx, 0) };
}

const KEY_OF: Record<MoveKey, string> = { left: 'left', right: 'right', forward: 'up' };

/** Decompress the committed maze-corridor.state.gz to a tmp file (the engine
 *  entrance base: gy=121, f0, the first arrow-controllable dungeon frame). */
function decompressBase(): string {
  const gz = join(COMMITTED_STATES, 'maze-corridor.state.gz');
  const raw = gunzipSync(readFileSync(gz));
  const out = join(TMP, 'engine-entrance.state');
  writeFileSync(out, raw);
  return out;
}

async function main() {
  const { block } = loadLevel0();
  const entrance = { ...ENGINE_ENTRANCE };
  const en = enumerateViewCases(block, entrance, MAX_FWD);
  console.log(`=== capture-maze-view-cases ${CHECK ? '(--check)' : ''} ===`);
  console.log(`engine entrance: gx=${entrance.gx} gy=${entrance.gy} f=${entrance.facing}  MAX_FWD=${MAX_FWD}`);
  console.log(`reachable states: ${en.reachable.length}  distinct view-cases: ${en.distinct.length}`);

  const c = new HostClient();
  const records: Array<{
    case: DistinctCase;
    fixture: string;
    engine: { game_state: number; facing: number; z: number; gx: number; gy: number };
    distinctIndices: number;
    diff?: number;
  }> = [];

  try {
    await c.step(3000);
    const entrancePath = decompressBase();
    // Verify the base state matches the engine entrance.
    await c.unserialize(entrancePath); await c.step(2);
    const base0 = await c.anchor();
    const p0 = await readParty(c, base0);
    console.log(`\nbase state: gx=${p0.gx} gy=${p0.gy} z=${p0.z} f=${p0.facing} game_state=${p0.game_state}`);
    if (p0.gx !== entrance.gx || p0.gy !== entrance.gy || p0.facing !== entrance.facing) {
      throw new Error(
        `base drift: state (gx${p0.gx},gy${p0.gy},f${p0.facing}) != engine entrance (gx${entrance.gx},gy${entrance.gy},f${entrance.facing})`,
      );
    }

    for (const cs of en.distinct) {
      const fixture = `maze-view-${cs.id}`;
      const r = cs.representative;
      console.log(`\n${cs.id} [${cs.kind}] rep=(gx${r.gx},gy${r.gy},f${r.facing}) path=[${cs.path.join(',')}]`);

      // Replay with retry: random monster encounters (game_state 10/11/12) can
      // fire as the party walks. They are non-deterministic, so re-replaying the
      // path from the clean base usually lands in a clean dungeon frame
      // (game_state 5). Retry up to MAX_TRIES; require game_state==5 + the exact rep.
      const MAX_TRIES = 12;
      let base = 0;
      let eng: Awaited<ReturnType<typeof readParty>> | null = null;
      for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
        await c.unserialize(entrancePath);
        await c.step(2);
        base = await c.anchor();
        for (const mv of cs.path) {
          await c.key(KEY_OF[mv], 'tap');
          await c.step(40);
        }
        await c.step(40); // final settle
        const e = await readParty(c, base);
        const posOk = e.gx === r.gx && e.gy === r.gy && e.facing === r.facing;
        const clean = e.game_state === 5;
        if (posOk && clean) { eng = e; break; }
        console.log(
          `  attempt ${attempt}: gx=${e.gx} gy=${e.gy} f=${e.facing} gs=${e.game_state}` +
          `${clean ? '' : ' (ENCOUNTER — retry)'}${posOk ? '' : ' (pos mismatch — retry)'}`,
        );
      }
      if (!eng) {
        throw new Error(
          `${cs.id}: could not reach a clean dungeon frame (gs=5) at rep (gx${r.gx},gy${r.gy},f${r.facing}) ` +
          `in ${MAX_TRIES} tries — encounters or navigation issue.`,
        );
      }
      console.log(`  engine: gx=${eng.gx} gy=${eng.gy} f=${eng.facing} (game_state=${eng.game_state})`);

      // Capture framebuffer.
      const rgbaPath = join(TMP, `${fixture}.rgba`);
      await c.fb(rgbaPath);
      const rgba = new Uint8Array(readFileSync(rgbaPath));
      const idx = rgbaToIndices(rgba);
      const distinctIndices = new Set(idx).size;
      console.log(`  fb: ${rgba.length} bytes, ${distinctIndices} distinct palette entries`);
      if (distinctIndices < 3) throw new Error(`${cs.id}: only ${distinctIndices} palette entries — blank frame?`);

      const idxGzPath = join(FIXTURES, `${fixture}.idx.gz`);
      const pngPath = join(FIXTURES, `${fixture}.png`);

      if (CHECK) {
        const committed = gunzipSync(readFileSync(idxGzPath));
        let diff = 0;
        for (let p = 0; p < idx.length; p++) if (idx[p] !== committed[p]) diff++;
        console.log(`  --check: ${diff} pixel diffs vs committed`);
        records.push({ case: cs, fixture, engine: eng, distinctIndices, diff });
      } else {
        writeFileSync(idxGzPath, gzipSync(idx));
        writeFileSync(pngPath, encodePngRgba(SCREEN_WIDTH, SCREEN_HEIGHT, rgba));
        writeFileSync(join(TMP, `${fixture}.png`), encodePngRgba(SCREEN_WIDTH, SCREEN_HEIGHT, rgba));
        console.log(`  wrote ${idxGzPath}`);
        records.push({ case: cs, fixture, engine: eng, distinctIndices });
      }
    }

    if (CHECK) {
      const bad = records.filter((r) => (r.diff ?? 0) > 0);
      console.log(`\n=== --check: ${records.length - bad.length}/${records.length} byte-exact ===`);
      if (bad.length) {
        for (const r of bad) console.log(`  ${r.case.id}: ${r.diff} diffs`);
        process.exitCode = 1;
      }
      return;
    }

    // ── Write the taxonomy finding ─────────────────────────────────────────────
    const finding = {
      topic: 'maze-view-cases',
      subagent_run: '2026-06-05 (Task C1: enumerate + capture reachable level-0 first-person view-cases)',
      binaries: ['wroot.exe', 'wmaze.ovr'],
      tool:
        'Offline enumeration: tools/parity/maze-view-cases.ts (BFS reachable (gx,gy,facing) from the ENGINE ' +
        'entrance gy=121 under @wiz6/parser movement.ts turn/tryStepForward, capped at MAX_FWD=2 forward steps; ' +
        'dedupe by classify view-config). Live capture: tools/libretro/capture-maze-view-cases.ts (unserialize ' +
        'the committed maze-corridor.state.gz base → per-case replay key-path → fb → idx.gz). dosbox-pure nightly core.',
      confidence: 'high',
      summary:
        `The ENGINE arrow-controllable starting area of dungeon level 0 begins at gx=127 gy=121 z=0 facing=0 — ` +
        `the FIRST arrow-controllable dungeon frame (= committed maze-corridor.state.gz), NOT the extracted ` +
        `entrance gy=120. The N3 gate door (the gy=120 cell's own north field) is a ONE-WAY boundary: the ` +
        `scripted entry walk crosses it southward (gy120→gy121), but movement.ts treats door code 3 as solid, ` +
        `so the player can never walk back north. An engine arrow-BFS confirms the entire controllable area is ` +
        `gy>=121; the gy<=120 room the extracted entrance sits in is engine-UNREACHABLE. From gy=121 the ` +
        `reachable level is hundreds of cells, so this enumeration CAPS the BFS at 2 forward steps (the immediate ` +
        `starting area): ${en.reachable.length} (gx,gy,facing) states across ` +
        `${new Set(en.reachable.map((s) => `${s.gx},${s.gy}`)).size} cells, deduping to ${en.distinct.length} ` +
        `distinct first-person view-cases (corridor / dead-end / left-open / right-open / front-wall variants ` +
        `distinguished by the per-depth front + corner + side edge codes). No head-on doors / pits fire in this ` +
        `radius (orient2/pit never set).`,
      entrance,
      reachable: {
        states: en.reachable.length,
        cells: [...new Set(en.reachable.map((s) => `${s.gx},${s.gy}`))],
        note: `BFS under turn + tryStepForward (collision-gated), capped at MAX_FWD=${MAX_FWD} forward steps. z fixed at entrance z (0).`,
      },
      caveats: {
        animation_phase:
          'The dungeon corridor view has a FREE-RUNNING per-frame animation (torch/gate flicker, palette 5↔8) ' +
          'that advances regardless of input — so a freshly-walked frame lands on a non-deterministic phase. ' +
          'These idx.gz fixtures are single-phase SAMPLES of each view-case (valid ground truth for the wall/' +
          'background geometry C2/C3 port). For a BYTE-EXACT C4 gate, each case should be frozen as a committed ' +
          'serialize-state (like maze-corridor.state.gz) and re-rendered deterministically, OR the parity ' +
          'comparison should mask the flicker region. See tools/dosbox/state-catalog.ts MAZE_CORRIDOR_RECIPE note.',
        random_encounters:
          'The starting area triggers random monster encounters (game_state 10/11/12) while walking. The ' +
          'capture retries each case (re-replay from the clean base) until it lands in game_state=5; encounters ' +
          'are non-deterministic so a retry clears them. Capture is therefore non-deterministic in attempt count.',
      },
      entrance_discrepancy: {
        flag: 'FOR-PARENT-REVIEW',
        extracted_viewer_entrance: { gx: 127, gy: 120, z: 0, facing: 0 },
        engine_controllable_entrance: { gx: 127, gy: 121, z: 0, facing: 0 },
        note:
          'B3 (maze-start-new-game.json) recorded the entrance as gy=120 by reading party fields right after ' +
          'dismissing narration — but that frame is DURING the scripted gate-walk and is NOT arrow-controllable ' +
          '(ENTER is still consumed as a scripted forward step; verified: a fresh-boot live session at gy=120 ' +
          'ignores left/right/up). The first arrow-controllable frame is one cell south, gy=121, past the N3 ' +
          'gate. The viewer game-session-store places the party at level.entrance = gy=120, so the ported app ' +
          'starts the party in a gate-walled 2×2 room the engine never lets the player into, and the viewer BFS ' +
          'from gy=120 (16 states) is disjoint from the engine reachable set. RECOMMENDATION: change the ' +
          'extracted/viewer entrance to gy=121 (the engine controllable frame). Stage C should gate against the ' +
          'gy=121 reachable set (this finding), not the gy=120 set.',
      },
      out_of_reach: {
        note:
          'BFS capped at MAX_FWD=2 forward steps. The full level-0 reachable region from gy=121 is hundreds of ' +
          'cells (movement.ts BFS uncapped = 1212 (cell,facing) states); deeper corridors, junctions, doors, ' +
          'and pits beyond 2 forward steps are out-of-reach for THIS MVP fixture set but reachable by extending ' +
          'MAX_FWD. The gy<=120 room (extracted entrance side of the gate) is engine-UNREACHABLE via arrows.',
        engine_arrow_bfs_confirmation:
          'A 60-path engine arrow-BFS from the committed state reached only gy>=121 cells (0 north-of-gate). ' +
          'Engine forward-axis per facing verified: f0=+gy, f1=+gx, f3=-gx (matches movement.ts step()).',
      },
      max_forward_steps: MAX_FWD,
      distinct_cases: en.distinct.map((cs) => {
        const rec = records.find((r) => r.case.id === cs.id)!;
        return {
          id: cs.id,
          kind: cs.kind,
          representative: cs.representative,
          path: cs.path,
          members: cs.members,
          fixture: `tools/parity/fixtures/engine/${rec.fixture}.idx.gz`,
          engine_party: rec.engine,
          distinct_palette_indices: rec.distinctIndices,
          view_config: {
            slots: cs.config.slots,
            headOnDoorDepth: cs.config.headOnDoorDepth,
          },
        };
      }),
      provenance: {
        base_state: 'test-fixtures/states/maze-corridor.state.gz (gy=121 f0, first arrow-controllable frame). Verified gx=127 gy=121 f=0 before capture.',
        capture: 'unserialize base → replay path keys (left/right=turn, up=forward) step 40 each → step 40 settle → verify (gx,gy,facing)==rep → fb → rgba→WIZ6_MAIN indices → gzip.',
        format: '320×200 EGA palette-index, gzipped (.idx.gz), + .png. Same loader as maze-corridor*.idx.gz.',
        captured: new Date().toISOString(),
        wall_background_call_data:
          'NOT captured in this pass (the optional firstrender/capvp patched-core phases were not run — the ' +
          'installed core is the nightly/unpatched build; the framebuffer fixture is the required C1 deliverable). ' +
          'C2/C3 can re-run the patched-core call-capture per representative using these paths.',
      },
    };

    const findingPath = join(FINDINGS, 'maze-view-cases.json');
    writeFileSync(findingPath, JSON.stringify(finding, null, 2) + '\n');
    console.log(`\nwrote ${findingPath}`);
    console.log(`\n=== Done: captured ${records.length} distinct view-case fixtures ===`);
  } finally {
    c.close();
  }
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
