/**
 * newgame-strip-parity.test.ts — PIXEL-PARITY GATE (gate-tier `.test.ts`,
 * runs in default CI; tolerance 0) for the START-NEW-GAME entry BOTTOM STRIP,
 * per `entryMode`, byte-exact vs the committed engine fixtures.
 *
 * ── WHAT IS GATED ──
 * The bottom strip region (y=144..199, full width x=0..319) the port composes for
 * each entry sub-mode (title / narration / gate-walk / bump), compared in the
 * PALETTE-INDEX domain (tolerance 0 = 100%) against the committed engine
 * framebuffer fixtures `tools/parity/fixtures/engine/newgame-seq-0N.idx.gz`.
 *
 * drawEntryStrip is the SAME pure helper MazeView's compose path calls, so the
 * gate can't drift from the live render. (Task 5 gates the FULL 320x200 frame;
 * this gates just the strip region per sub-mode.)
 *
 * ── FIXTURE GROUND-TRUTH NOTE (important) ──
 * Reading the committed fixtures' strip regions (y144-199) byte-for-byte:
 *   02 title    : {0:960, 1:717, 8:16243}  → gray (idx 8) bg + blue (idx 1) title
 *   03 narration: {0:17920}                → CLEAN BLACK, NO TEXT (see below)
 *   04 gate-walk: {0:17920}                → CLEAN BLACK, no text
 *   05 walk     : {0:17759, 5:161}         → black + yellow "HMMMM..." (idx 5)
 *   06 walk/hmmm: {0:17759, 5:161}         → black + yellow "HMMMM..." (idx 5)
 *
 * Two consequences:
 *  - gate-walk's strip is CLEAN BLACK in the committed fixture (frame 04), NOT the
 *    gray OPTIONS/TURN widget the plan/prose described. We match the fixture.
 *  - The narration-text frame (03) was FROZEN before the 3-line narration drew
 *    (its strip is pure black). So these fixtures CANNOT gate the narration TEXT —
 *    only its black BACKGROUND. The narration TEXT is gated separately, byte-exact,
 *    against the older `maze-entry-narration.idx.gz` fixture (which DOES contain
 *    the 3 lines) in maze-entry-narration-parity.test.ts. The HMMMM bump shows at
 *    frames 05/06 (the freeze caught it there, not at 06 alone).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  decodeNarrationLines,
  drawEntryStrip,
  type EntryMode,
  type EntryStripText,
} from '../../src/index.js';
import {
  FontSchema,
  MessageDbSchema,
  type Font,
  type MessageDb,
  type Palette,
} from '@wiz6/data';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../../..');
const FIX = resolve(ROOT, 'tools/parity/fixtures/engine');

const W = 320;
const H = 200;
const STRIP_Y0 = 144;
const STRIP_Y1 = 200; // exclusive

const COMPOSED_PALETTE: readonly [number, number, number][] = [
  [0, 0, 0], [255, 255, 255], [85, 85, 255], [255, 85, 255],
  [255, 85, 85], [255, 255, 85], [85, 255, 85], [85, 255, 255],
  [85, 85, 85], [170, 170, 170], [0, 0, 170], [170, 0, 170],
  [170, 0, 0], [170, 85, 0], [0, 170, 0], [0, 170, 170],
];

const PALETTE: Palette = {
  name: 'composed-ega',
  provenance: 'MazeView COMPOSED_PALETTE',
  colors: COMPOSED_PALETTE.map((c) => [...c]) as Palette['colors'],
};

function rgbToIndex(r: number, g: number, b: number): number {
  for (let i = 0; i < COMPOSED_PALETTE.length; i++) {
    const c = COMPOSED_PALETTE[i]!;
    if (c[0] === r && c[1] === g && c[2] === b) return i;
  }
  return -1;
}

function loadFont(): Font {
  return FontSchema.parse(
    JSON.parse(readFileSync(resolve(ROOT, 'extracted/fonts/wfont0.json'), 'utf8')),
  );
}
function loadMessageDb(): MessageDb {
  return MessageDbSchema.parse(
    JSON.parse(readFileSync(resolve(ROOT, 'extracted/messages/msg.json'), 'utf8')),
  );
}

/** A committed engine fixture as a 320×200 palette-index buffer. */
function engineIndices(name: string): Uint8Array {
  const raw = gunzipSync(readFileSync(resolve(FIX, name)));
  return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
}

/**
 * Build OUR strip for `mode` on a black canvas via drawEntryStrip (the SAME helper
 * the live compose path uses) and convert to a 320×200 palette-index buffer.
 */
function ourStripIndices(mode: EntryMode, text: EntryStripText, font: Font): Uint8Array {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let p = 3; p < rgba.length; p += 4) rgba[p] = 0xff; // opaque black
  drawEntryStrip(rgba, W, H, mode, text, font, PALETTE);
  const out = new Uint8Array(W * H);
  for (let i = 0; i < out.length; i++) {
    const o = i * 4;
    out[i] = rgbToIndex(rgba[o]!, rgba[o + 1]!, rgba[o + 2]!);
  }
  return out;
}

/** Compare two index buffers over the strip band; return [match, total, diffs]. */
function compareStrip(ours: Uint8Array, eng: Uint8Array): [number, number, string[]] {
  let total = 0;
  let match = 0;
  const diffs: string[] = [];
  for (let y = STRIP_Y0; y < STRIP_Y1; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      total++;
      if (ours[i] === eng[i]) match++;
      else if (diffs.length < 20) diffs.push(`(${x},${y}) got=${ours[i]} want=${eng[i]}`);
    }
  }
  return [match, total, diffs];
}

describe('newgame entry bottom-strip parity (GATE — strip region y144-199, tolerance 0)', () => {
  const font = loadFont();
  const msgDb = loadMessageDb();
  const text: EntryStripText = {
    title: decodeNarrationLines(msgDb, [1212, 1213]),
    narration: decodeNarrationLines(msgDb, [10010, 10011, 10012]),
    bump: decodeNarrationLines(msgDb, [10020])[0] ?? '',
  };

  it('decodes the expected title/narration/bump strings', () => {
    expect(text.title).toEqual(['ENTERING', 'BANE OF THE COSMIC FORGE']);
    expect(text.narration).toEqual([
      'APPROACHING THE GATE WITH CONFIDENCE,',
      'YOU KNOW IF THINGS GET TOO HAIRY YOU ',
      'CAN ALWAYS TURN AND RUN BACK OUT...',
    ]);
    expect(text.bump).toBe('HMMMM...');
  });

  it("title strip is INDEX-EXACT vs newgame-seq-02 (gray widget + blue centered title)", () => {
    const ours = ourStripIndices('title', text, font);
    const eng = engineIndices('newgame-seq-02-entering-title.idx.gz');
    const [match, total, diffs] = compareStrip(ours, eng);
    if (match < total) console.error(`title strip ${match}/${total}: ${diffs.join('  ')}`);
    expect(match).toBe(total);
  });

  it("gate-walk strip is INDEX-EXACT vs newgame-seq-04 (clean black, no text)", () => {
    const ours = ourStripIndices('gate-walk', text, font);
    const eng = engineIndices('newgame-seq-04-walk-gy119.idx.gz');
    const [match, total, diffs] = compareStrip(ours, eng);
    if (match < total) console.error(`gate-walk strip ${match}/${total}: ${diffs.join('  ')}`);
    expect(match).toBe(total);
  });

  it("bump strip is INDEX-EXACT vs newgame-seq-06 (clean black + yellow centered HMMMM...)", () => {
    const ours = ourStripIndices('bump', text, font);
    const eng = engineIndices('newgame-seq-06-walk-gy121-hmmm.idx.gz');
    const [match, total, diffs] = compareStrip(ours, eng);
    if (match < total) console.error(`bump strip ${match}/${total}: ${diffs.join('  ')}`);
    expect(match).toBe(total);
  });

  it("bump strip is also INDEX-EXACT vs newgame-seq-05 (same HMMMM frame)", () => {
    const ours = ourStripIndices('bump', text, font);
    const eng = engineIndices('newgame-seq-05-walk-gy120.idx.gz');
    const [match, total] = compareStrip(ours, eng);
    expect(match).toBe(total);
  });

  it("narration strip BACKGROUND is INDEX-EXACT vs newgame-seq-03 (clean black; the fixture has no text — text gated in maze-entry-narration-parity)", () => {
    // Frame 03 was frozen before the narration text drew, so its strip is pure
    // black. We gate that our narration mode at least produces the clean black
    // strip (the bug fix). The narration TEXT byte-parity lives in
    // maze-entry-narration-parity.test.ts (against maze-entry-narration.idx.gz).
    const eng = engineIndices('newgame-seq-03-narration.idx.gz');
    // Assert the fixture strip is indeed all-black (documents the freeze gap).
    let allBlack = true;
    for (let y = STRIP_Y0; y < STRIP_Y1 && allBlack; y++)
      for (let x = 0; x < W; x++) if (eng[y * W + x] !== 0) { allBlack = false; break; }
    expect(allBlack).toBe(true);
    // Our narration BACKGROUND (the band minus the text rows y153-174) must be
    // clean black too — i.e. drawEntryStrip blanks the whole band.
    const ours = ourStripIndices('narration', text, font);
    let bgMatch = true;
    for (let y = STRIP_Y0; y < STRIP_Y1; y++) {
      if (y >= 153 && y <= 174) continue; // text rows differ (we draw text, fixture doesn't)
      for (let x = 0; x < W; x++) if (ours[y * W + x] !== 0) { bgMatch = false; break; }
    }
    expect(bgMatch).toBe(true);
  });
});
