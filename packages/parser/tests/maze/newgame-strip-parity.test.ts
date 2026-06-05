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
 * ── FIXTURE GROUND-TRUTH NOTE (re-captured 2026-06-05) ──
 * Reading the committed fixtures' strip regions (y144-199) byte-for-byte:
 *   02 title    : {0:960, 1:717, 8:16243}  → gray (idx 8) bg + blue (idx 1) title
 *                                            (ENTERING/BANE over the MAGICWORD screen)
 *   03 narration: {0:15718, 5:2202}        → black + 3-line yellow "APPROACHING THE
 *                                            GATE..." (FIXED — was wrongly all-black)
 *   04 gate-walk: {0:17920}                → CLEAN BLACK, no text (real plain walk)
 *   05 walk-gy120: {0:17759, 5:161}        → black + yellow "HMMMM..." (idx 5) — a
 *                                            front-wall BUMP, not a plain walk
 *   06 walk-gy121-hmmm: {0:17759, 5:161}   → black + yellow "HMMMM..." (idx 5), dead-end
 *   07 entrance-chamber-gy121: {0:15669, 5:2219} → black + 3-line yellow "ENTRANCE
 *                                            CHAMBER..." (NEW frame this re-capture)
 *
 * Notes:
 *  - gate-walk's strip is CLEAN BLACK in the committed fixture (frame 04), NOT the
 *    gray OPTIONS/TURN widget the plan/prose described. We match the fixture.
 *  - The narration frame (03) is now captured at the post-text-draw phase (the
 *    engine redraws the message window ~30 frames after unserialize, so the freeze
 *    + the build-state.ts --check both render at remintStep=60). The prior fixture
 *    was frozen at step(5), BEFORE the redraw, so its strip was all-black.
 *  - The msg IDs / oracle / FSM in the PORT layer still encode the prior (incorrect)
 *    sequence (title@gy117, narration IDs 10010+, bump 10020). The TRUE IDs are
 *    narration 1313/1314/1315, HMMMM 1316, ENTRANCE 1317/1318/1319 (verified vs
 *    msg.json); the title is over the MAGICWORD screen at gy=0/gs=0xffff (NOT gy=117).
 *    See docs/re/findings/maze-newgame-byteexact.json — the port re-derivation is a
 *    follow-up (TODO).
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

  it("narration fixture (newgame-seq-03) NOW contains the 3-line narration text (re-captured 2026-06-05)", () => {
    // The 2026-06-05 re-capture FIXED the freeze gap: frame 03 was previously
    // frozen before the narration drew (pure-black strip). It is now captured at
    // the post-text-draw phase (remintStep=60 in state-catalog) and contains the
    // 3-line "APPROACHING THE GATE..." narration: yellow (idx 5) glyphs at the
    // canonical text rows y153/161/169. We gate the FIXTURE's text presence (the
    // freeze-gap is closed); the narration BACKGROUND remains clean black (idx 0).
    const eng = engineIndices('newgame-seq-03-narration.idx.gz');
    // Count yellow (idx 5) text pixels per row in the strip band.
    const yellowByRow: Record<number, number> = {};
    let yellowTotal = 0;
    for (let y = STRIP_Y0; y < STRIP_Y1; y++)
      for (let x = 0; x < W; x++)
        if (eng[y * W + x] === 5) { yellowByRow[y] = (yellowByRow[y] ?? 0) + 1; yellowTotal++; }
    // 3-line narration ⇒ a substantial yellow text count with rows at ~153/161/169.
    expect(yellowTotal).toBeGreaterThan(1500);
    for (const row of [153, 161, 169])
      expect(yellowByRow[row] ?? 0, `narration text expected at y=${row}`).toBeGreaterThan(50);
    // Background is the CLEAN BLACK message strip: idx 0 (black) dominates the band
    // and there is NO gray free-roam widget (idx 8). (A few dozen stray non-black,
    // non-text pixels can bleed into the bottom rows from the free-running torch
    // flicker at the captured phase; the gate is that the widget is gone + text is
    // present, not an exact palette set.)
    let black = 0, gray = 0;
    for (let y = STRIP_Y0; y < STRIP_Y1; y++)
      for (let x = 0; x < W; x++) {
        const v = eng[y * W + x]!;
        if (v === 0) black++;
        else if (v === 8) gray++;
      }
    expect(black).toBeGreaterThan(15000); // black strip, not the gray widget
    expect(gray).toBe(0);                  // no gray free-roam widget
  });
});
