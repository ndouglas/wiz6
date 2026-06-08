/**
 * gen-callist-parity.test.ts — GATE (`.test.ts`, default CI) for the GENERATED
 * full background call list (OR forward-blits + the near-wall flank MASKED-mirror
 * calls), derived from the maze block + party with NO captured frame.
 *
 * The OR families (skeleton + side walls + far-closed wall) were pinned byte-exact
 * earlier (maze-index-arithmetic / gate-seeding / wall-family-seeding findings) and
 * gated in index-arithmetic.test.ts. This file gates the LAST background piece —
 * the few MASKED-mirror calls the engine emits per frame for the NEAR-WALL VERTICAL
 * FLANK strips (the close corridor walls at the party's immediate sides, placement
 * family imgIdx=1, h=51). Those strips are never drawn by a forward OR-blit; the
 * engine draws each side's flank as a HORIZONTAL MIRROR of the opposite twin
 * (ega.drv FUN_0a93 masked branch, file 0xbc6; mirror law
 * `src.destX + dst.destX + dst.w == 40`). RE: docs/re/findings/maze-masked-generation.json.
 *
 * ── WHAT IS GATED ──
 *   (1) BYTE-EXACT masked set for the canonical maze-corridor (gx127 gy121 f0):
 *       generateNearFlankMasked emits exactly {13→4, 10→7, 7→10, 4→13} (all
 *       OR-merge) — the captured gy121 masked calls (reproducible byte-exact
 *       across 3 fresh pokeview captures).
 *   (2) NO MASKED for the stone-corner / closed-front views (v6/v7/v9/v10): the
 *       near wall is then drawn by the OR side-wall family, and the captures show
 *       zero near-flank masked calls. The gate must not over-emit there.
 *   (3) THE MIRROR LAW: every generated masked call satisfies
 *       src.destX + dst.destX + dst.w == 40 (mirror about page col 20).
 *   (4) FROM-ASSET VIEWPORT ≥ 99.9%: the full GENERATED call list, composed
 *       entirely from mazedata.ega, reaches 99.909% of the maze-corridor engine
 *       viewport — the same 19694/19712 the captured-fixture diagnostic reaches,
 *       now fully generated. (The 18px residual is the deep-door-center detail, a
 *       draw path beyond the OR/masked background blit — see the diagnostic test.)
 *
 * The flank SUBSET that fires for OTHER open-passage views oscillates run-to-run
 * (the documented ray-march residue) so those are NOT byte-exact targets here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  generateNearFlankMasked,
  generateFullCallList,
  composeBackgroundFromAsset,
} from '../../src/maze/callist.js';
import { expandMazeData } from '../../src/maze/maze-data.js';
import { MazeBlockSchema, type MazeBlock, type MazeParty } from '@wiz6/data';
import { PLANE_STRIDE, PAGE_ROW_BYTES, MAZE_VIEWPORT } from '@wiz6/data';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../../..');
const FRAMES = JSON.parse(
  readFileSync(resolve(ROOT, 'tools/parity/fixtures/engine/maze-frames.json'), 'utf8'),
);
const BLOCK: MazeBlock = MazeBlockSchema.parse(FRAMES.mazeBlock);

function maskedPairs(party: MazeParty): Array<{ src: number; dst: number }> {
  return generateNearFlankMasked(BLOCK, party)
    .filter((c): c is { kind: 'masked'; src: number; dst: number; mode: 'or' | 'replace' } => c.kind === 'masked')
    .map((c) => ({ src: c.src, dst: c.dst }))
    .sort((a, b) => a.src - b.src);
}

describe('generateNearFlankMasked: the near-wall flank masked-mirror set', () => {
  it('byte-exact for the canonical maze-corridor (gx127 gy121 f0)', () => {
    const got = maskedPairs({ gx: 127, gy: 121, z: 0, facing: 0 });
    // The captured gy121 masked calls (maze-corridor-callist-gy121.json), as a set.
    const expected = [
      { src: 4, dst: 13 },
      { src: 7, dst: 10 },
      { src: 10, dst: 7 },
      { src: 13, dst: 4 },
    ];
    expect(got).toEqual(expected);
  });

  it('all generated masked calls are OR-merge', () => {
    for (const c of generateNearFlankMasked(BLOCK, { gx: 127, gy: 121, z: 0, facing: 0 })) {
      expect(c.kind).toBe('masked');
      if (c.kind === 'masked') expect(c.mode).toBe('or');
    }
  });

  // Stone-corner / closed-front views: the near wall is an OR side-wall family,
  // NOT a flank mirror — the captures show zero near-flank masked calls.
  const NO_FLANK: Array<{ view: string; party: MazeParty }> = [
    { view: 'v6-gy123f0 (closed front d0)', party: { gx: 127, gy: 123, z: 0, facing: 0 } },
    { view: 'v7-gx121gy119f0 (cR stone)', party: { gx: 121, gy: 119, z: 0, facing: 0 } },
    { view: 'v9-gx123gy121f0 (cL stone)', party: { gx: 123, gy: 121, z: 0, facing: 0 } },
    { view: 'v10-gx124gy121f1 (cR stone)', party: { gx: 124, gy: 121, z: 0, facing: 1 } },
  ];
  it.each(NO_FLANK)('emits no near-flank masked when a flank is stone ($view)', ({ party }) => {
    expect(generateNearFlankMasked(BLOCK, party)).toEqual([]);
  });

  // The horizontal-mirror law: src.destX + dst.destX + dst.w == 40 (about page
  // col 20). Holds for every generated masked call across the open-passage views.
  const OPEN_PASSAGE: MazeParty[] = [
    { gx: 127, gy: 121, z: 0, facing: 0 },
    { gx: 125, gy: 121, z: 0, facing: 0 },
    { gx: 123, gy: 122, z: 0, facing: 1 },
  ];
  it.each(OPEN_PASSAGE)('every masked call satisfies the mirror law (gx$gx gy$gy f$facing)', (party) => {
    const wb = expandMazeData(new Uint8Array(readFileSync(resolve(ROOT, 'test-fixtures/original/mazedata.ega'))));
    const calls = generateNearFlankMasked(BLOCK, party);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      if (c.kind !== 'masked') continue;
      // mirror about page col 20: src.destX (the source placement's screen X) +
      // dst.destX + dst image width == 40 (the page-row byte count).
      const src = wb.placements[c.src]!;
      const dst = wb.placements[c.dst]!;
      const dstW = wb.descs[dst.imgIdx]!.w;
      expect(src.destX + dst.destX + dstW).toBe(40);
    }
  });
});

describe('generateFullCallList: from-asset viewport parity (maze-corridor)', () => {
  const { x, y, w, h } = MAZE_VIEWPORT;

  function decodeViewport(page: Uint8Array): Uint8Array {
    const out = new Uint8Array(w * h);
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++) {
        const px = x + c, py = y + r;
        const off = py * PAGE_ROW_BYTES + (px >> 3);
        const bit = 7 - (px & 7);
        let v = 0;
        for (let p = 0; p < 4; p++) v |= ((page[off + p * PLANE_STRIDE]! >> bit) & 1) << p;
        out[r * w + c] = v;
      }
    return out;
  }

  function engineViewport(): Uint8Array {
    const raw = gunzipSync(readFileSync(resolve(ROOT, 'tools/parity/fixtures/engine/maze-corridor.idx.gz')));
    const full = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    const out = new Uint8Array(w * h);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out[r * w + c] = full[(y + r) * 320 + x + c]!;
    return out;
  }

  it('the GENERATED full call list composes to ≥99.9% of the gy121 oracle viewport', () => {
    const mazedata = new Uint8Array(readFileSync(resolve(ROOT, 'test-fixtures/original/mazedata.ega')));
    const calls = generateFullCallList(BLOCK, { gx: 127, gy: 121, z: 0, facing: 0 });
    const ours = decodeViewport(composeBackgroundFromAsset(mazedata, calls));
    const eng = engineViewport();
    const N = w * h;
    let match = 0;
    for (let i = 0; i < N; i++) if (ours[i] === eng[i]) match++;
    const pct = (100 * match) / N;
    // The fully GENERATED (no captured frame) call list reaches the same 99.909%
    // the captured-fixture diagnostic reaches — the OR set + the 4 near-flank
    // masked calls are byte-exact; the residual 18px is the deep-door-center
    // detail (a draw path beyond the OR/masked background blit). Do NOT relax.
    expect(pct).toBeGreaterThanOrEqual(99.9);
    expect(match).toBe(19694);
  });
});
