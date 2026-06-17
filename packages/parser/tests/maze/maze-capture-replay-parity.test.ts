/**
 * maze-capture-replay-parity.test.ts — wiring gate for the CAPTURE-REPLAY faithful-
 * level-0 path (POSITION-KEYED).
 *
 * The generation path renders the entrance cluster byte-exact but degrades off-axis
 * (the un-cracked general generation law, #077/#086). Capture-replay commits the
 * engine's actual viewport for every WALKABLE level-0 view (the entrance-normal-
 * connected component, captured via `engcap` engine-truth navigation) and
 * `renderMazeViewport` returns it verbatim when the (gx,gy,facing) matches.
 *
 * SCOPE / IMPORTANT: this gate verifies the position-key LOOKUP WIRING + coverage —
 * it asserts `renderMazeViewport` returns the stored oracle for each committed
 * position. It is therefore TAUTOLOGICAL for oracle *content* (the renderer returns
 * the same bytes it's handed): it can prove the lookup key is wired right and the set
 * is complete, but it CANNOT detect a *wrong* stored frame. That blind spot shipped a
 * regression once (TODO #086). The real anti-regression check is the e2e walking gate
 * `packages/viewer/e2e/maze-walk-gate-square.spec.ts`, which drives the real app and
 * pixel-asserts the maze viewport against engine frames captured INDEPENDENTLY — so a
 * wrong oracle or a coordinate/wiring drift fails there.
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

/** Decode the committed oracle table into the runtime (gx,gy,facing) map. */
function buildOracleMap(): Map<string, Uint8Array> {
  const m = new Map<string, Uint8Array>();
  for (const c of ORACLES.cases) {
    m.set(`${c.gx},${c.gy},${c.facing}`, new Uint8Array(gunzipSync(Buffer.from(c.viewportB64, 'base64'))));
  }
  return m;
}

describe('maze capture-replay parity (position-keyed wiring + coverage)', () => {
  const assets = loadMazeAssets();
  const oracleMap = buildOracleMap();

  it('one oracle per walkable level-0 view (no duplicate posKeys; entrance + interior coverage)', () => {
    // Asset is ground truth — derive the count instead of a literal (avoids a
    // maintenance trap as the captured interior grows; #091 Piece B full level-0
    // interior = 716 cases: 204 entrance + 512 interior past the openable doors).
    expect(oracleMap.size).toBe(ORACLES.cases.length); // no duplicate posKeys
    expect(oracleMap.has('127,121,0')).toBe(true); // entrance captured
    expect(oracleMap.has('124,120,2')).toBe(true); // interior captured (#091 Piece B)
  });

  it.each(ORACLES.cases.map((c) => ({ ...c, name: `gx${c.gx}-gy${c.gy}-f${c.facing}` })))(
    'returns the committed engine viewport for $name (position-key lookup)',
    (c) => {
      const party: MazeParty = { gx: c.gx, gy: c.gy, z: 0, facing: c.facing };
      const ours = renderMazeViewport(BLOCK, party, assets, { capturedViewports: oracleMap });
      const eng = new Uint8Array(gunzipSync(Buffer.from(c.viewportB64, 'base64')));
      expect(ours.length).toBe(N);
      expect(eng.length).toBe(N);
      let match = 0;
      for (let i = 0; i < N; i++) if (ours[i] === eng[i]) match++;
      expect(match, `${c.name}: position-key lookup must return the committed engine viewport`).toBe(N);
    },
  );
});
