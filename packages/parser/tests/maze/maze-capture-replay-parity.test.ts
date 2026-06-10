/**
 * maze-capture-replay-parity.test.ts — GATE for the CAPTURE-REPLAY faithful-level-0 path.
 *
 * The generation path renders the entrance cluster byte-exact but degrades to 32-70%
 * off-axis (the un-cracked general generation law, #077/#086). Capture-replay commits
 * the engine's actual viewport for every ENGINE-REACHABLE level-0 config (the 266 from
 * the complete collmap BFS) and `renderMazeViewport` returns it verbatim when the
 * view-config matches (the `capturedViewports` override).
 *
 * This gate asserts: every committed config renders BYTE-EXACT through the wired path
 * (renderMazeViewport with the oracle map) — i.e. the capture-replay override + the
 * configKey wiring are correct, so the viewer (which passes the same map) shows the
 * faithful engine view for all 266 reachable configs. This is RECONSTRUCTION (committed
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
  configKey: string;
  gx: number;
  gy: number;
  facing: number;
  viewportB64: string;
}
const ORACLES = JSON.parse(readFileSync(resolve(FIX, 'maze-viewport-oracles.json'), 'utf8')) as {
  cases: OracleCase[];
};

/** Decode the committed oracle table into the runtime map the renderer/viewer use. */
function buildOracleMap(): Map<string, Uint8Array> {
  const m = new Map<string, Uint8Array>();
  for (const c of ORACLES.cases) {
    m.set(c.configKey, new Uint8Array(gunzipSync(Buffer.from(c.viewportB64, 'base64'))));
  }
  return m;
}

describe('maze capture-replay parity (GATE — faithful level-0 via committed engine viewports)', () => {
  const assets = loadMazeAssets();
  const oracleMap = buildOracleMap();

  it('committed all engine-reachable level-0 configs (the complete BFS)', () => {
    expect(ORACLES.cases.length).toBe(266);
    expect(oracleMap.size).toBe(266);
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
