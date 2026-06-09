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
 * WHY THESE STILL ONLY REACH ~30-33%: the captured call-lists describe a DIFFERENT
 * FRAME than the committed fixtures — the well-documented gy=118-vs-gy=121
 * transient-frame mismatch (maze-masked-mirror.json fromasset-gate-blocked-by-frame
 * -mismatch). DECISIVE EVIDENCE captured this pass: the PURE-OR view gx127-gy121-f1
 * (37 OR calls, ZERO masked) ALSO reproduces only ~52% of its fixture, and its diff
 * is salt-and-pepper dither-phase noise over a structurally-correct corridor — i.e.
 * the OR compositor (byte-exact-gated at 99.909% for the entrance gy121-f0, where the
 * call-list MATCHES the fixture frame) cannot reach its fixture either when the
 * captured list is off-frame. The gy123-f0 call-list is a receding-corridor list
 * while its fixture is a flat dead-end wall — they are simply different frames. The
 * compositor renders the call-list it is given faithfully; it cannot turn a corridor
 * call-list into a dead-end. So ≥99% here is NOT reachable from these call-lists; it
 * needs a frame-matched capture (the blocked DBPSerialize_CPU bridge) or a GENERATED
 * call-list (the per-view selection law — maze-callist-generation.json residue).
 *
 * This test pins the ACHIEVED reproduction so a future frame-matched capture (or the
 * generator) can be measured against it, and guards that the sign-extension fix keeps
 * placements 6/9 (the corner-wall mirror twins) landing on opposite screen sides.
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

describe('masked-heavy captured call-lists from-asset (DIAGNOSTIC — frame-mismatch)', () => {
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

  it('documents the ACHIEVED from-asset reproduction of the GATE look-back (gy121-f2)', () => {
    const pct = viewportPct('freeroam-gx127-gy121-f2');
    // ~30.2% — the captured corridor call-list vs the committed gate fixture (frame
    // mismatch). The compositor is faithful; this is NOT a compositor defect.
    expect(pct).toBeGreaterThan(28);
    expect(pct).toBeLessThan(40);
  });

  it('documents the ACHIEVED from-asset reproduction of the DEAD-END (gy123-f0)', () => {
    const pct = viewportPct('freeroam-gx127-gy123-f0');
    // ~33.4% — captured receding-corridor call-list vs the committed flat-dead-end
    // fixture (different frames). Frame mismatch, not a compositor defect.
    expect(pct).toBeGreaterThan(30);
    expect(pct).toBeLessThan(40);
  });

  it('CONTROL: the pure-OR gy121-f1 (zero masked calls) ALSO only ~52% — proves frame mismatch, not the masked compositor', () => {
    const pct = viewportPct('freeroam-gx127-gy121-f1');
    expect(pct).toBeGreaterThan(45);
    expect(pct).toBeLessThan(60);
  });
});
