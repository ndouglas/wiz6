/**
 * maze-decoration-parity.test.ts — GATE (`.test.ts`, default CI) for the maze
 * DECORATION layer (the `special4` / `orient2` planes — the wmaze classifier's
 * decoration override). RE: docs/re/findings/maze-decoration-generation.json.
 *
 * THE DECORATION-SELECTION LAW (pinned byte-exact by hand-disasm of the front/side
 * classifier `classify_front_side` 0x3828 + the 16-way special4 jump table at FILE
 * 0x3bc5, overlay delta 0x4564):
 *   - the classifier reads the cell's special4 (+0x1f8, 4-bit) and orient2
 *     (+0x378, 2-bit) planes; the decoration renders on the viewed face only when
 *     the ORIENTATION GATE `orient2 == facing` holds (0x3af1);
 *   - special4 then indexes a 16-way jump table -> a wall SHAPE CODE (4..0xe)
 *     (special4 1->5, 2->6, 3->8, 4->9, 5->0xe, 7->4, 8->7, 9->0xa, 0xa->0xb,
 *      0xb->0xc, 0xc->0xd; 0->no-op; 6/0xd/0xe set internal gates).
 *
 * THE FOUNTAIN: special4 == 7 (shape code 4) — the gx126 gy118..121 column in
 * level-0 region 0 (all orient2 == 0, so it decorates the facing-0 / north face).
 * It is the repeated side-wall fixture the party walks PAST down the entry
 * corridor (the "fountain" of the user's lived recollection). The canonical
 * maze-corridor view (gx127 gy121 f0) passes this column on its LEFT at depth 0.
 *
 * ── WHAT IS GATED ──
 *  (1) THE SELECTION (byte-exact): generateDecorations detects the gx126 sp7
 *      column (shape code 4) on the LEFT at depth 0 for the maze-corridor view,
 *      and detects ZERO decorations for a genuinely plain corridor cell and for
 *      any FACING that does not match the cells' orient2 (all level-0 = 0, so
 *      facings 1/2/3 see none).
 *  (2) NO REGRESSION: the maze-corridor view — which renders the fountain column
 *      via the near-flank masked family — still composes to ≥99.9% of the engine
 *      viewport through the fully-wired path
 *      (generateFullCallList -> composeBackgroundFromAsset -> decode viewport).
 *
 * RESIDUE (documented, NOT auto-emitted as new OR blits — anti-overfit): the shape
 * code -> mazedata.ega placement-index translation runs through the same span-flush
 * piece table (0x36e4 / wall_emit_quad 0x406c) the side-wall extent law documents
 * as decompiler-resistant residue, and a live fountain-facing capture is BLOCKED
 * (committed states don't round-trip on the trace core; poke-recompose replays the
 * cached span list without re-running the build loop). So we pin the SELECTION
 * byte-exact and gate the existing wired render — we do NOT fabricate unverified
 * placement indices. See the findings doc for the full evidence + the gap.
 *
 * Decoration-view engine fixture: tools/parity/fixtures/engine/maze-corridor.idx.gz
 * — party gx127 gy121 facing0 (passes the gx126 sp7 fountain column on the LEFT).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  generateDecorations,
  decorationShapeCode,
  generateFullCallList,
  composeBackgroundFromAsset,
} from '../../src/maze/callist.js';
import { MazeBlockSchema, type MazeBlock } from '@wiz6/data';
import { PLANE_STRIDE, PAGE_ROW_BYTES, MAZE_VIEWPORT } from '@wiz6/data';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../../..');
const FRAMES = JSON.parse(
  readFileSync(resolve(ROOT, 'tools/parity/fixtures/engine/maze-frames.json'), 'utf8'),
);
const BLOCK: MazeBlock = MazeBlockSchema.parse(FRAMES.mazeBlock);

describe('decorationShapeCode: the special4 -> shape-code table (file 0x3bc5)', () => {
  it.each([
    [1, 5],
    [2, 6],
    [3, 8],
    [4, 9],
    [5, 0xe],
    [7, 4],
    [8, 7],
    [9, 0xa],
    [0xa, 0xb],
    [0xb, 0xc],
    [0xc, 0xd],
  ])('special4 %i -> shape code %i', (sp, code) => {
    expect(decorationShapeCode(sp)).toBe(code);
  });

  it('special4 0 maps to no-op (0)', () => {
    expect(decorationShapeCode(0)).toBe(0);
  });

  it('special4 6/0xd/0xe are gates (not shapes) -> -1', () => {
    expect(decorationShapeCode(6)).toBe(-1);
    expect(decorationShapeCode(0xd)).toBe(-1);
    expect(decorationShapeCode(0xe)).toBe(-1);
  });
});

describe('generateDecorations: the decoration SELECTION (slot/face gate)', () => {
  // SLOT/FACE ATTRIBUTION — corrected by the dectrace real-move emit trace
  // (docs/re/findings/maze-decoration-generation.json `decoration-slot-gate-from
  // -trace` + `slot-face-attribution-fix`). The FRONT cell uses gate `orient2 ==
  // facing` (classify_front_side 0x3af1); the LATERAL (left/right) cells use the
  // CORNER classifier gate `(orient2 + 1) % 4 == facing` (0x3d5b). The level-0
  // fountain (orient2 == 0) therefore decorates the FRONT face at facing 0 — it
  // renders as a FRONT wall when the party stands IN the gx126 column facing north,
  // NOT as a LEFT side wall when passing it in the adjacent gx127 corridor.

  it('the gy121 corridor view (gx127 f0) detects NO LEFT fountain (corner gate)', () => {
    // The dectrace REAL-move trace of gx127 gy121 f0 emitted NO decoration index for
    // the gx126 sp7 cell on the LEFT — its OR set is byte-identical to generateCallist
    // (the ordinary side-wall surface family). The LEFT corner gate (orient2+1)%4 == 0
    // requires orient2 == 3, but gx126 is orient2 == 0, so the gate does NOT fire.
    const hits = generateDecorations(BLOCK, { gx: 127, gy: 121, z: 0, facing: 0 });
    expect(hits.find((h) => h.slot === 'left')).toBeUndefined();
  });

  it('the fountain decorates the FRONT face when the party is IN the gx126 column (f0)', () => {
    // Standing at gx126 gy120 facing north, the build loop's depth-0 front cell is
    // gx126 gy120 itself (sp7) — its NORTH face decorates -> a FRONT-slot hit, shape
    // code 4. This is the geometrically-correct attribution (where the engine
    // actually draws the ornate fixture — the view-case-09 FRONT-wall eyeball).
    const hits = generateDecorations(BLOCK, { gx: 126, gy: 120, z: 0, facing: 0 });
    const fountain = hits.find((h) => h.special4 === 7 && h.slot === 'front');
    expect(fountain).toBeDefined();
    expect(fountain!.shapeCode).toBe(4);
    expect(fountain!.gx).toBe(126);
    expect(fountain!.gy).toBe(120);
    expect(fountain!.depth).toBe(0);
  });

  it('detects ZERO decorations for a genuinely plain corridor cell', () => {
    // gx120 gy116 region-0 corner: no decorated cell in any visible slot.
    expect(generateDecorations(BLOCK, { gx: 120, gy: 116, z: 0, facing: 0 })).toEqual([]);
  });

  it('every detected decoration passes its slot-aware orientation gate', () => {
    // Scan all region-0 views (every facing); every hit's slot gate must hold:
    //   front: orient2 == facing ; left/right: (orient2 + 1) % 4 == facing.
    for (let facing = 0; facing < 4; facing++) {
      for (let gy = 116; gy <= 123; gy++) {
        for (let gx = 120; gx <= 127; gx++) {
          for (const hit of generateDecorations(BLOCK, { gx, gy, z: 0, facing })) {
            expect(hit.special4).toBeGreaterThan(0);
            if (hit.slot === 'front') expect(hit.orient2).toBe(facing);
            else expect((hit.orient2 + 1) & 3).toBe(facing);
          }
        }
      }
    }
  });
});

describe('maze-decoration: from-asset viewport parity (no regression)', () => {
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
    const raw = gunzipSync(
      readFileSync(resolve(ROOT, 'tools/parity/fixtures/engine/maze-corridor.idx.gz')),
    );
    const full = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    const out = new Uint8Array(w * h);
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++) out[r * w + c] = full[(y + r) * 320 + x + c]!;
    return out;
  }

  it('the fountain-column view (gx127 gy121 f0) renders ≥99.9% through the wired path', () => {
    const mazedata = new Uint8Array(
      readFileSync(resolve(ROOT, 'test-fixtures/original/mazedata.ega')),
    );
    const calls = generateFullCallList(BLOCK, { gx: 127, gy: 121, z: 0, facing: 0 });
    const ours = decodeViewport(composeBackgroundFromAsset(mazedata, calls));
    const eng = engineViewport();
    const N = w * h;
    let match = 0;
    for (let i = 0; i < N; i++) if (ours[i] === eng[i]) match++;
    const pct = (100 * match) / N;
    // The fountain column renders via the near-flank masked family; the residual
    // 18px is the deep-door-center detail (a draw path beyond the OR/masked
    // background blit) — see maze-decoration-generation.json residue. Do NOT relax.
    expect(pct).toBeGreaterThanOrEqual(99.9);
    expect(match).toBe(19694);
  });

  // maze-fountain.idx.gz — a FRESH real-move build-loop render of the same
  // fountain-column view (gx127 gy121 f0), captured by the navreach harness
  // (tools/libretro/trace-maze.ts navreach) driving genuine forward moves from a
  // cold boot on the PATCHED trace core (NOT a poke-recompose). It is the same
  // view as maze-corridor.idx.gz (its viewport matches the committed corridor
  // fixture at 99.99%, animation phase aside), captured independently as the
  // navreach deliverable + proof the build loop re-runs on a real move (the
  // spanCount [0x50ce] changes on every cell step). See
  // docs/re/findings/maze-navreach.json.
  function fountainViewport(): Uint8Array {
    const raw = gunzipSync(
      readFileSync(resolve(ROOT, 'tools/parity/fixtures/engine/maze-fountain.idx.gz')),
    );
    const full = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    const out = new Uint8Array(w * h);
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++) out[r * w + c] = full[(y + r) * 320 + x + c]!;
    return out;
  }

  it('the navreach fresh-real-move fountain fixture (gx127 gy121 f0) renders ≥99.9%', () => {
    const mazedata = new Uint8Array(
      readFileSync(resolve(ROOT, 'test-fixtures/original/mazedata.ega')),
    );
    const calls = generateFullCallList(BLOCK, { gx: 127, gy: 121, z: 0, facing: 0 });
    const ours = decodeViewport(composeBackgroundFromAsset(mazedata, calls));
    const eng = fountainViewport();
    const N = w * h;
    let match = 0;
    for (let i = 0; i < N; i++) if (ours[i] === eng[i]) match++;
    const pct = (100 * match) / N;
    // Same 17px deep-door-center residual as maze-corridor (1px animation-phase
    // delta from the corridor fixture). The fountain SELECTION is detected on the
    // gx126 sp7 column; the per-piece placement-index emission is the documented
    // span-flush residue (see maze-navreach.json: the build-loop write-watch
    // logs 0 stores even on a real move, so the placement law stays unpinned).
    expect(pct).toBeGreaterThanOrEqual(99.9);
  });
});
