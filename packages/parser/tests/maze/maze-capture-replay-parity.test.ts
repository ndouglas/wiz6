/**
 * maze-capture-replay-parity.test.ts — GATE for the CAPTURE-REPLAY faithful-level-0 path.
 *
 * The generation path renders the entrance cluster byte-exact but degrades to 32-70%
 * off-axis (the un-cracked general generation law, #077/#086). Capture-replay commits
 * the engine's actual viewport for every ENGINE-REACHABLE level-0 position (the 293 from
 * the complete collmap BFS) and `renderMazeViewport` returns it verbatim when the
 * (gx,gy,facing) position matches (the `capturedViewports` override).
 *
 * This gate asserts: every committed position renders BYTE-EXACT through the wired path
 * (renderMazeViewport with the oracle map) — i.e. the capture-replay override + the
 * position-key wiring are correct, so the viewer (which passes the same map) shows the
 * faithful engine view for all 293 reachable positions. This is RECONSTRUCTION (committed
 * engine frames, the #076 framebuffer-oracle precedent), not generation.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { renderMazeViewport } from '../../src/maze/render.js';
import { loadMazeAssets } from '../../src/maze/assets.js';
import { MazeBlockSchema, type MazeBlock, type MazeParty, MAZE_VIEWPORT } from '@wiz6/data';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../../..');
const FIX = resolve(ROOT, 'tools/parity/fixtures/engine');
const N = MAZE_VIEWPORT.w * MAZE_VIEWPORT.h;

const FRAMES = JSON.parse(readFileSync(resolve(FIX, 'maze-frames.json'), 'utf8'));
const BLOCK: MazeBlock = MazeBlockSchema.parse(FRAMES.mazeBlock);

interface OracleCase {
  posKey: string;
  gx: number;
  gy: number;
  facing: number;
  viewportB64: string;
}
const ORACLES = JSON.parse(readFileSync(resolve(FIX, 'maze-viewport-oracles.json'), 'utf8')) as {
  cases: OracleCase[];
};
const REACH = JSON.parse(readFileSync(resolve(FIX, 'maze-reachability.json'), 'utf8')) as {
  reachable: Array<{ gx: number; gy: number; facing: number }>;
};

/** Decode the committed oracle table into the runtime map the renderer/viewer use. */
function buildOracleMap(): Map<string, Uint8Array> {
  const m = new Map<string, Uint8Array>();
  for (const c of ORACLES.cases) {
    m.set(`${c.gx},${c.gy},${c.facing}`, new Uint8Array(gunzipSync(Buffer.from(c.viewportB64, 'base64'))));
  }
  return m;
}

describe('maze capture-replay parity (GATE — faithful level-0 via committed engine viewports)', () => {
  const assets = loadMazeAssets();
  const oracleMap = buildOracleMap();

  it('committed one oracle per engine-reachable level-0 view (the complete BFS)', () => {
    expect(ORACLES.cases.length).toBe(293);
    expect(oracleMap.size).toBe(293);
  });

  it('covers exactly the engine-reachable set — one oracle per (gx,gy,facing), no gaps, no dupes', () => {
    const oracleKeys = new Set(ORACLES.cases.map((c) => `${c.gx},${c.gy},${c.facing}`));
    expect(oracleKeys.size, 'no duplicate posKeys').toBe(ORACLES.cases.length);
    const reachKeys = new Set(REACH.reachable.map((r) => `${r.gx},${r.gy},${r.facing}`));
    for (const k of reachKeys) expect(oracleKeys.has(k), `missing oracle for reachable view ${k}`).toBe(true);
    for (const k of oracleKeys) expect(reachKeys.has(k), `oracle for non-reachable view ${k}`).toBe(true);
  });

  it('previously-aliased decoration neighbours now render DISTINCT frames', () => {
    // The chest<->candlestick pairs: same wall geometry, different decorations. Before the
    // position-key fix these shared one oracle; now each has its own engine frame.
    const pairs: Array<[[number, number, number], [number, number, number]]> = [
      [[127, 124, 1], [127, 132, 1]], // group 2: special4=9 ahead vs special4=1 ahead
      [[126, 133, 0], [128, 133, 0]], // group 3: the symmetric "either side" chests
    ];
    for (const [a, b] of pairs) {
      const va = oracleMap.get(`${a[0]},${a[1]},${a[2]}`);
      const vb = oracleMap.get(`${b[0]},${b[1]},${b[2]}`);
      expect(va, `oracle ${a}`).toBeDefined();
      expect(vb, `oracle ${b}`).toBeDefined();
      const identical = va!.length === vb!.length && va!.every((x, i) => x === vb![i]);
      expect(identical, `${a} and ${b} must render different frames (different decorations)`).toBe(false);
    }
  });

  it.each(ORACLES.cases.map((c) => ({ ...c, name: `gx${c.gx}-gy${c.gy}-f${c.facing}` })))(
    'renders $name byte-exact via capture-replay',
    (c) => {
      const party: MazeParty = { gx: c.gx, gy: c.gy, z: 0, facing: c.facing };
      const ours = renderMazeViewport(BLOCK, party, assets, { capturedViewports: oracleMap });
      const eng = new Uint8Array(gunzipSync(Buffer.from(c.viewportB64, 'base64')));
      expect(ours.length).toBe(N);
      expect(eng.length).toBe(N);
      let match = 0;
      for (let i = 0; i < N; i++) if (ours[i] === eng[i]) match++;
      expect(match, `${c.name}: capture-replay must return the committed engine viewport`).toBe(N);
    },
  );
});
