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
import { MazeBlockSchema, type MazeBlock, type MazeParty } from '@wiz6/data';
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

describe('generateDecorations: the decoration SELECTION', () => {
  it('detects the gx126 sp7 FOUNTAIN column on the LEFT for the maze-corridor view', () => {
    const hits = generateDecorations(BLOCK, { gx: 127, gy: 121, z: 0, facing: 0 });
    // The fountain column (special4 == 7 -> shape code 4) at gx126 gy121, depth 0,
    // on the LEFT slot — the cell immediately to the party's left as they enter.
    const fountain = hits.find((h) => h.special4 === 7);
    expect(fountain).toBeDefined();
    expect(fountain!.shapeCode).toBe(4);
    expect(fountain!.slot).toBe('left');
    expect(fountain!.depth).toBe(0);
    expect(fountain!.gx).toBe(126);
    expect(fountain!.gy).toBe(121);
  });

  it('detects ZERO decorations for a genuinely plain corridor cell', () => {
    // gx120 gy116 region-0 corner: no decorated cell in any visible slot.
    expect(generateDecorations(BLOCK, { gx: 120, gy: 116, z: 0, facing: 0 })).toEqual([]);
  });

  // All level-0 decoration cells have orient2 == 0, so the orientation gate only
  // matches facing 0 (north). Facing west/south/east sees NO decorations from the
  // same cells — the user's "fountains at the WRONG ANGLE" is exactly this gate.
  const NON_NORTH: MazeParty[] = [
    { gx: 127, gy: 121, z: 0, facing: 1 },
    { gx: 127, gy: 121, z: 0, facing: 2 },
    { gx: 127, gy: 121, z: 0, facing: 3 },
  ];
  it.each(NON_NORTH)(
    'no decoration fires when facing ($facing) != the cells orient2 (all 0)',
    (party) => {
      expect(generateDecorations(BLOCK, party)).toEqual([]);
    },
  );

  it('every detected decoration sits on a visible, actually-decorated cell', () => {
    // Scan all region-0 facing-0 views; every hit must reference a cell with a
    // non-zero special4 plane value (never a plain cell).
    for (let gy = 116; gy <= 123; gy++) {
      for (let gx = 120; gx <= 127; gx++) {
        for (const hit of generateDecorations(BLOCK, { gx, gy, z: 0, facing: 0 })) {
          expect(hit.special4).toBeGreaterThan(0);
          expect(hit.orient2).toBe(0); // the matched orientation == facing 0
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
});
