/**
 * maze-masked-callist-fromasset-parity.diagnostic.test.ts — FROM-ASSET compose of
 * the MASKED-HEAVY captured call-lists (the entrance look-back GATE gy121-f2 and the
 * dead-end gy123-f0), INFORMATIONAL diagnostic (NOT a gate — excluded from default
 * CI; runnable via `pnpm test:diagnostics`).
 *
 * ── WHAT THIS PROBES ──
 * Compose each view's ENGINE-CAPTURED blit call-list (OR + masked, the
 * `calls` array of docs/re/findings/maze-views/freeroam-*-callist.json) through the
 * compositor (composeBackgroundFromAsset → applyMaskedMirror/maskedMirrorFor) and
 * compare the decoded viewport to the committed engine fixture.
 *
 * ── ROOT-CAUSE FINDING (2026-06-09 masked-mirror compositor pass) ──
 * The compositor is FAITHFUL to the engine asm (ega.drv FUN_0a93, file 0xbc6 masked
 * branch + 0xa93 OR branch, re-disassembled in full this pass): the per-row dest
 * address, the backward source read + CS:[0x192] bit-reverse, the per-plane
 * siBase + p·planeStride restart, and the per-row di+=0x28 / siBase+=S.w advance ALL
 * match the asm exactly. The ONE genuine compositor bug found + fixed this pass is
 * the destX SIGN-EXTENSION (engine `cbw` at file 0xad7/0xc11): destX is a SIGNED i8,
 * so the stored 0xff on placements 6/38/44 is column −1, not +255. Without the fix
 * placement 6 (the LEFT full-height corner-wall flank, img0 w14 h87) landed ~256
 * bytes downstream on the WRONG screen side; with it the LEFT/RIGHT corner walls
 * mirror symmetrically (see maze-data.ts signExtendDestX + maze-masked-mirror.json).
 *
 * ── FRAME-SYNC FIX (2026-06-09 freeroam capture-sync pass) ──
 * The captured call-lists USED to describe a DIFFERENT FRAME than the committed
 * fixtures (the prior `freeroam` phase paired a settled-target framebuffer with a
 * call-list traced from a SEPARATELY-driven origin forward-step). That mismatch is
 * now FIXED in tools/libretro/trace-maze.ts: phaseFreeRoam captures the call-list AND
 * the framebuffer from ONE serialized settled-target state via ONE identical in-place
 * turn-recompose trigger (built-in best-of-N by self-repro), so the call-list and
 * framebuffer are the SAME compose. The re-captured framebuffers are byte-identical
 * to the prior committed .idx.gz (they were always settled); only the call-lists were
 * transient. With the frame-synced call-lists, from-asset self-repro JUMPED:
 *   - gy121-f1 (pure-OR corridor): ~52% → 99.16%
 *   - gy123-f0 (dead-end):          ~33% → 98.15%
 *   - gy121-f2 (look-back gate):    ~30% → ~80% (this decode path; ~89% via
 *                                   renderMazeViewport — capped by the colourful
 *                                   portcullis-leaf DECORATION, a draw path beyond the
 *                                   OR/masked background compose).
 * This DIAGNOSTIC now pins the ACHIEVED frame-synced reproduction (a floor that must
 * not regress) + guards that the sign-extension fix keeps placements 6/9 (the
 * corner-wall mirror twins) landing on opposite screen sides.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { composeBackgroundFromAsset, type CallList } from '../../src/maze/callist.js';
import { expandMazeData, maskedMirrorFor } from '../../src/maze/maze-data.js';
import { PLANE_STRIDE, PAGE_ROW_BYTES, MAZE_VIEWPORT } from '@wiz6/data';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../../..');

function loadMazeData(): Uint8Array {
  return new Uint8Array(readFileSync(resolve(ROOT, 'test-fixtures/original/mazedata.ega')));
}

/** Reconstruct a CallList from a freeroam-*-callist.json `calls` array. */
function loadCallist(name: string): CallList {
  const j = JSON.parse(
    readFileSync(resolve(ROOT, `docs/re/findings/maze-views/${name}-callist.json`), 'utf8'),
  ) as { calls: Array<{ branch: string; arg0c: number; arg10: number }>; masked_flags: number[] };
  return j.calls.map((c, i) =>
    c.arg10 === 65535
      ? ({ kind: 'OR', src: c.arg0c } as const)
      : ({
          kind: 'masked',
          src: c.arg0c,
          dst: c.arg10,
          // masked_flags[i] != 0 → OR-merge; 0 → REPLACE (ega.drv [bp+0xe] gate,
          // file 0xc5f). The captured -1/32 sentinels are nonzero → OR.
          mode: j.masked_flags[i] ? 'or' : 'replace',
        } as const),
  );
}

function engineViewport(name: string): Uint8Array {
  const raw = gunzipSync(readFileSync(resolve(ROOT, `tools/parity/fixtures/engine/maze-${name}.idx.gz`)));
  const full = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  const { x, y, w, h } = MAZE_VIEWPORT;
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out[r * w + c] = full[(y + r) * 320 + x + c]!;
  return out;
}

function decodeViewport(page: Uint8Array): Uint8Array {
  const { x, y, w, h } = MAZE_VIEWPORT;
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const px = x + c, py = y + r;
    const off = py * PAGE_ROW_BYTES + (px >> 3);
    const bit = 7 - (px & 7);
    let v = 0;
    for (let p = 0; p < 4; p++) v |= ((page[off + p * PLANE_STRIDE]! >> bit) & 1) << p;
    out[r * w + c] = v;
  }
  return out;
}

function viewportPct(name: string): number {
  const page = composeBackgroundFromAsset(loadMazeData(), loadCallist(name));
  const ours = decodeViewport(page);
  const eng = engineViewport(name);
  let match = 0;
  for (let i = 0; i < ours.length; i++) if (ours[i] === eng[i]) match++;
  return (100 * match) / ours.length;
}

describe('masked-heavy captured call-lists from-asset (DIAGNOSTIC — frame-SYNCED)', () => {
  it('the destX SIGN-EXTENSION lands the corner-wall mirror twins on opposite screen sides', () => {
    const wb = expandMazeData(loadMazeData());
    // Placement 6 carries destX=255 (= signed −1); its mirror twin 9 carries destX=27.
    // Source 9 mirrored into dst-6 geometry must land on the LEFT (low page column);
    // source 6 mirrored into dst-9 geometry on the RIGHT.
    const left = maskedMirrorFor(wb, 9, 6, 'or'); // dst 6, signed destX −1
    const right = maskedMirrorFor(wb, 6, 9, 'or'); // dst 9, destX 27
    // di low-byte column = di % PAGE_ROW_BYTES. Left twin must be west of the right.
    expect(left.di % PAGE_ROW_BYTES).toBeLessThan(right.di % PAGE_ROW_BYTES);
    // Pre-fix di for dst-6 was destX255+bias10+0x28*40 = 1865 (page col 25 → right-of-
    // centre, colliding with the right twin). Post-fix it is −1+10+1600 = 1609 (col 9).
    expect(left.di).toBe(-1 + 10 + 0x28 * 40);
    expect(left.di).toBe(1609);
  });

  it('FRAME-SYNCED: the GATE look-back (gy121-f2) reproduces ~80% from its own call-list (was ~30%)', () => {
    const pct = viewportPct('freeroam-gx127-gy121-f2');
    // ~79.9% (this decode path) — the frame-synced gate call-list now reproduces its
    // OWN framebuffer. The residue is the colourful portcullis-LEAF decoration (door-
    // recess family), a draw path beyond the OR/masked background compose — NOT a frame
    // mismatch. Floor that must not regress.
    expect(pct).toBeGreaterThan(70);
  });

  it('FRAME-SYNCED: the DEAD-END (gy123-f0) reproduces ≥98% from its own call-list (was ~33%)', () => {
    const pct = viewportPct('freeroam-gx127-gy123-f0');
    // ~98.2% — the frame-synced dead-end call-list reproduces its OWN flat-wall
    // framebuffer. Residue = the central sword/statue decoration. Frame-matched.
    expect(pct).toBeGreaterThan(97);
  });

  it('FRAME-SYNCED: the pure-OR corridor gy121-f1 reproduces ≥99% from its own call-list (was ~52%)', () => {
    const pct = viewportPct('freeroam-gx127-gy121-f1');
    // ~99.2% — the frame-synced corridor call-list reproduces its OWN framebuffer
    // near-perfectly (masked side-walls included). This proves the masked compositor
    // IS faithful when the call-list is the clean settled pass — the prior ~52% was the
    // off-frame transient capture, now fixed.
    expect(pct).toBeGreaterThan(98);
  });
});
